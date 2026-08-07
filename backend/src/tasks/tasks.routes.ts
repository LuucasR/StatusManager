import { Router } from "express";
import { Prisma, TaskState } from "@prisma/client";
import PDFDocument from "pdfkit";
import prisma from "../prisma/client";
import { renderTaskReport } from "../reports/task-report";
import { requireAdmin, requireAuth } from "../auth/auth.middleware";
import type { AuthPayload } from "../auth/auth.token";
import { emitTaskChanged } from "../realtime";
import { TASK_DETAIL_INCLUDE, TASK_INCLUDE, toTaskDto } from "./task.dto";
import {
  changeTaskPinSchema,
  changeTaskStateSchema,
  createCommentSchema,
  createTaskSchema,
  updateTaskSchema,
} from "./task-validation";
import { TASK_STATE_META, taskArchiveCutoff, visibleTasksWhere } from "./task-state";
import {
  ensureTaskConversation,
  postMessage,
  syncTaskConversationMembers,
  syncTaskConversationState,
  syncTaskConversationTitle,
} from "../chat/chat.service";
import { notify } from "../notifications/notification.service";

const router = Router();
router.use(requireAuth);

function parseId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * El admin puede todo; un empleado solo si participa de la tarea. No se puede
 * resolver con requireAdmin a nivel router porque la regla depende de la fila.
 */
async function isTaskMember(auth: AuthPayload, taskId: number) {
  if (auth.role === "ADMIN") return true;
  const link = await prisma.taskParticipant.findUnique({
    where: { taskId_employeeId: { taskId, employeeId: auth.employeeId } },
    select: { taskId: true },
  });
  return Boolean(link);
}

/** Evita que un id inexistente llegue a Prisma y salga como 500 (P2003). */
async function assertParticipantsExist(ids: number[]) {
  const unique = [...new Set(ids)];
  const found = await prisma.employee.count({
    where: { id: { in: unique }, active: true },
  });
  return found === unique.length;
}

router.get("/", async (req, res) => {
  const state = req.query.state ? String(req.query.state) : undefined;
  const participantId = parseId(req.query.participantId);

  const tasks = await prisma.task.findMany({
    // OJO: visibleTasksWhere aporta un `OR`. Los otros dos fragmentos son
    // claves planas, asi que Prisma los ANDea sin conflicto. Si algun filtro
    // futuro trae su propio `OR`, hay que envolver todo en `AND: [...]` o uno
    // pisa al otro en silencio.
    where: {
      ...(state && state in TaskState ? { state: state as TaskState } : {}),
      ...(participantId ? { participants: { some: { employeeId: participantId } } } : {}),
      ...visibleTasksWhere(),
    },
    include: TASK_INCLUDE,
    orderBy: [{ pinned: "desc" }, { startsAt: "asc" }, { id: "asc" }],
    take: 500,
  });

  res.json(tasks.map(toTaskDto));
});

/**
 * IMPORTANTE: esta ruta va ANTES de "/:id". Express matchea en orden de
 * registro y "/:id" capturaria "report.pdf" -> parseId -> null -> 400.
 *
 * Sin requireAdmin: GET /tasks ya devuelve todas las tareas a cualquier
 * autenticado, asi que el PDF son los mismos datos con otro Content-Type.
 */
router.get("/report.pdf", async (req, res) => {
  const participantId = parseId(req.query.participantId);
  const stateParam = req.query.state ? String(req.query.state) : undefined;
  const state = stateParam && stateParam in TaskState ? (stateParam as TaskState) : undefined;

  const period = req.query.period ? String(req.query.period) : "all";
  const from = req.query.from ? String(req.query.from) : undefined;
  const to = req.query.to ? String(req.query.to) : undefined;

  // NO se spreadea visibleTasksWhere(): el reporte incluye las archivadas a
  // proposito, es el unico lugar donde se pueden ver. Si alguien lo agregara
  // por error, el KPI ARCHIVADAS daria 0 y se notaria.
  const where: Prisma.TaskWhereInput = {
    ...(state ? { state } : {}),
    ...(participantId ? { participants: { some: { employeeId: participantId } } } : {}),
  };

  if (period === "last30" || period === "last90") {
    const start = new Date();
    start.setDate(start.getDate() - (period === "last30" ? 30 : 90));
    where.startsAt = { gte: start };
  }
  if (period === "custom" && from && to) {
    const start = new Date(from);
    start.setHours(0, 0, 0, 0);
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    where.startsAt = { gte: start, lte: end };
  }

  const tasks = await prisma.task.findMany({
    where,
    include: TASK_INCLUDE,
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    take: 1000,
  });

  let periodLabel = "Historial completo";
  if (period === "last30") periodLabel = "Ultimos 30 dias";
  if (period === "last90") periodLabel = "Ultimos 90 dias";
  if (period === "custom" && from && to) {
    periodLabel = `${new Date(from).toLocaleDateString("es-AR")} al ${new Date(to).toLocaleDateString("es-AR")}`;
  }

  // Se busca aparte y no en tasks[0]: si el filtro no matchea nada, la lista
  // queda vacia y el subtitulo mentiria (mismo motivo que en admin.routes.ts).
  const participant = participantId
    ? await prisma.employee.findUnique({
        where: { id: participantId },
        select: { employeeNumber: true, name: true },
      })
    : null;

  let subtitle = participant
    ? `Participante #${participant.employeeNumber} - ${participant.name}`
    : "Todas las tareas del equipo";
  if (state) subtitle += ` - ${TASK_STATE_META[state].label}`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `inline; filename="reporte-tareas-${new Date().toISOString().slice(0, 10)}.pdf"`
  );

  const doc = new PDFDocument({ margin: 0, size: "A4" });
  doc.pipe(res);

  renderTaskReport(doc, {
    title: "Reporte de tareas",
    subtitle,
    periodLabel,
    rows: tasks.map(toTaskDto),
    archiveCutoff: taskArchiveCutoff(),
  });
});

// Sin filtro de archivado a proposito: es el camino de recuperacion. Desde el
// reporte se saca el #id de una tarea archivada y se abre con /tareas?task=id.
router.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: "Identificador inválido" });

  const task = await prisma.task.findUnique({
    where: { id },
    include: TASK_DETAIL_INCLUDE,
  });
  if (!task) return res.status(404).json({ message: "Tarea no encontrada" });

  res.json(toTaskDto(task));
});

router.post("/", requireAdmin, async (req, res) => {
  const parsed = createTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      message: parsed.error.issues[0]?.message ?? "No se pudo validar la tarea",
    });
  }

  if (!(await assertParticipantsExist(parsed.data.participantIds))) {
    return res
      .status(400)
      .json({ message: "Algún participante no existe o está inactivo" });
  }

  const participantIds = [...new Set(parsed.data.participantIds)];

  // Transaccion porque la conversacion necesita el id de la tarea para su key.
  const task = await prisma.$transaction(async (tx) => {
    const created = await tx.task.create({
      data: {
        title: parsed.data.title,
        description: parsed.data.description,
        state: parsed.data.state,
        startsAt: parsed.data.startsAt,
        endsAt: parsed.data.endsAt,
        createdById: req.auth!.employeeId,
        participants: {
          create: participantIds.map((employeeId) => ({ employeeId })),
        },
      },
      select: { id: true, title: true, state: true },
    });

    await ensureTaskConversation(tx, created, participantIds);

    return tx.task.findUniqueOrThrow({ where: { id: created.id }, include: TASK_INCLUDE });
  });

  emitTaskChanged({ type: "created", taskId: task.id });
  await notify({
    recipientIds: participantIds,
    actorId: req.auth!.employeeId,
    type: "TASK_ADDED",
    title: task.title,
    body: `Te agregaron a la tarea "${task.title}"`,
    taskId: task.id,
  });

  res.status(201).json(toTaskDto(task));
});

router.patch("/:id", requireAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: "Identificador inválido" });

  const parsed = updateTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      message: parsed.error.issues[0]?.message ?? "No se pudo validar la tarea",
    });
  }

  const current = await prisma.task.findUnique({
    where: { id },
    select: {
      title: true,
      state: true,
      startsAt: true,
      endsAt: true,
      // El set previo, para poder calcular altas y bajas en vez de reemplazar
      // a ciegas.
      participants: { select: { employeeId: true } },
    },
  });
  if (!current) return res.status(404).json({ message: "Tarea no encontrada" });

  const startsAt = parsed.data.startsAt ?? current.startsAt;
  const endsAt = parsed.data.endsAt ?? current.endsAt;
  if (endsAt <= startsAt) {
    return res
      .status(400)
      .json({ message: "La fecha de fin debe ser posterior a la de inicio" });
  }

  if (
    parsed.data.participantIds &&
    !(await assertParticipantsExist(parsed.data.participantIds))
  ) {
    return res
      .status(400)
      .json({ message: "Algún participante no existe o está inactivo" });
  }

  // Diff de participantes. Ademas de permitir notificar solo a los que
  // cambiaron, arregla un bug visible: el deleteMany+createMany ciego reescribia
  // el addedAt de todos, y TASK_INCLUDE ordena por addedAt, asi que los avatares
  // de la tarjeta se reordenaban solos cada vez que el admin tocaba el titulo.
  const previous = new Set(current.participants.map((p) => p.employeeId));
  const next = parsed.data.participantIds
    ? new Set([...new Set(parsed.data.participantIds)])
    : null;
  const added = next ? [...next].filter((employeeId) => !previous.has(employeeId)) : [];
  const removed = next ? [...previous].filter((employeeId) => !next.has(employeeId)) : [];
  const stateChanged = Boolean(parsed.data.state && parsed.data.state !== current.state);

  const task = await prisma.$transaction(async (tx) => {
    await tx.task.update({
      where: { id },
      data: {
        title: parsed.data.title,
        description: parsed.data.description,
        state: parsed.data.state,
        startsAt: parsed.data.startsAt,
        endsAt: parsed.data.endsAt,
      },
    });

    if (removed.length) {
      await tx.taskParticipant.deleteMany({
        where: { taskId: id, employeeId: { in: removed } },
      });
    }
    if (added.length) {
      await tx.taskParticipant.createMany({
        data: added.map((employeeId) => ({ taskId: id, employeeId })),
        skipDuplicates: true,
      });
    }
    await syncTaskConversationMembers(tx, id, added, removed);

    // El titulo se snapshotea antes de que puedan borrar la tarea.
    if (parsed.data.title && parsed.data.title !== current.title) {
      await syncTaskConversationTitle(tx, id, parsed.data.title);
    }
    // Esta ruta tambien puede cambiar el estado, no solo PATCH /:id/state.
    if (parsed.data.state) {
      await syncTaskConversationState(tx, id, parsed.data.state);
    }

    return tx.task.findUniqueOrThrow({ where: { id }, include: TASK_INCLUDE });
  });

  emitTaskChanged({ type: "updated", taskId: id });

  const actorId = req.auth!.employeeId;
  await notify({
    recipientIds: added,
    actorId,
    type: "TASK_ADDED",
    title: task.title,
    body: `Te agregaron a la tarea "${task.title}"`,
    taskId: id,
  });
  await notify({
    recipientIds: removed,
    actorId,
    type: "TASK_REMOVED",
    title: task.title,
    body: `Te sacaron de la tarea "${task.title}"`,
    taskId: id,
  });
  if (stateChanged) {
    await notify({
      recipientIds: task.participants.map((link) => link.employee.id),
      actorId,
      type: "TASK_STATE",
      title: task.title,
      body: `"${task.title}" pasó a ${TASK_STATE_META[task.state].label}`,
      taskId: id,
    });
  }

  res.json(toTaskDto(task));
});

router.patch("/:id/state", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: "Identificador inválido" });

  const parsed = changeTaskStateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      message: parsed.error.issues[0]?.message ?? "Estado inválido",
    });
  }

  const exists = await prisma.task.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!exists) return res.status(404).json({ message: "Tarea no encontrada" });

  if (!(await isTaskMember(req.auth!, id))) {
    return res
      .status(403)
      .json({ message: "Solo los participantes pueden mover esta tarea" });
  }

  const task = await prisma.$transaction(async (tx) => {
    await tx.task.update({ where: { id }, data: { state: parsed.data.state } });
    // El chat de la tarea se cierra en DONE y se reabre al volver atras.
    await syncTaskConversationState(tx, id, parsed.data.state);
    // Se relee DESPUES del sync: si no, el DTO devuelve el chatClosed viejo.
    return tx.task.findUniqueOrThrow({ where: { id }, include: TASK_INCLUDE });
  });

  emitTaskChanged({ type: "moved", taskId: id, state: task.state });
  await notify({
    recipientIds: task.participants.map((link) => link.employee.id),
    actorId: req.auth!.employeeId,
    type: "TASK_STATE",
    title: task.title,
    body: `"${task.title}" pasó a ${TASK_STATE_META[task.state].label}`,
    taskId: id,
  });

  res.json(toTaskDto(task));
});

/**
 * Fijar una tarea la exceptua del archivado a los 14 dias y la manda al tope
 * de su columna. Mismo permiso que mover (isTaskMember): es decision de quien
 * trabaja la tarea, y evita inventar una tercera regla de permisos.
 */
router.patch("/:id/pin", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: "Identificador inválido" });

  const parsed = changeTaskPinSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Valor inválido" });
  }

  const exists = await prisma.task.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!exists) return res.status(404).json({ message: "Tarea no encontrada" });

  if (!(await isTaskMember(req.auth!, id))) {
    return res
      .status(403)
      .json({ message: "Solo los participantes pueden fijar esta tarea" });
  }

  const task = await prisma.task.update({
    where: { id },
    data: { pinned: parsed.data.pinned },
    include: TASK_INCLUDE,
  });

  emitTaskChanged({ type: "pinned", taskId: id, pinned: task.pinned });
  res.json(toTaskDto(task));
});

router.delete("/:id", requireAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: "Identificador inválido" });

  const exists = await prisma.task.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!exists) return res.status(404).json({ message: "Tarea no encontrada" });

  await prisma.$transaction(async (tx) => {
    // Cerrar la conversacion ANTES de borrar: el SetNull del FK se encarga del
    // taskId, pero no del closed, y una conversacion huerfana y escribible
    // seria un agujero. El titulo ya viene snapshoteado.
    await tx.conversation.updateMany({ where: { taskId: id }, data: { closed: true } });
    await tx.task.delete({ where: { id } });
  });

  emitTaskChanged({ type: "deleted", taskId: id });
  res.json({ success: true });
});

/**
 * Alias historico: el hilo de comentarios de la tarea ES el chat de la tarea.
 * Se conserva la ruta y la forma de la respuesta ({id, body, createdAt, author})
 * para que el frontend actual siga andando sin cambios mientras se construye la
 * ventana de chat. Escribe en Message, igual que POST /chat/.../messages.
 */
router.post("/:id/comments", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: "Identificador inválido" });

  const parsed = createCommentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      message: parsed.error.issues[0]?.message ?? "No se pudo validar el comentario",
    });
  }

  const task = await prisma.task.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      state: true,
      conversation: { select: { id: true, closed: true } },
      participants: { select: { employeeId: true } },
    },
  });
  if (!task) return res.status(404).json({ message: "Tarea no encontrada" });

  if (!(await isTaskMember(req.auth!, id))) {
    return res
      .status(403)
      .json({ message: "Solo los participantes pueden comentar esta tarea" });
  }

  // Tareas creadas antes de la migracion o por codigo viejo: idempotente.
  const conversation =
    task.conversation ??
    (await prisma.$transaction((tx) =>
      ensureTaskConversation(
        tx,
        task,
        task.participants.map((p) => p.employeeId)
      )
    ));

  if ("closed" in conversation && conversation.closed) {
    return res
      .status(409)
      .json({ message: "El chat está cerrado porque la tarea está terminada" });
  }

  const author = await prisma.employee.findUniqueOrThrow({
    where: { id: req.auth!.employeeId },
    select: { id: true, employeeNumber: true, name: true },
  });

  const message = await postMessage({
    conversationId: conversation.id,
    authorId: author.id,
    authorName: author.name,
    body: parsed.data.body,
  });

  emitTaskChanged({ type: "commented", taskId: id });
  res.status(201).json({
    id: message.id,
    body: message.body,
    createdAt: message.createdAt,
    author,
  });
});

router.delete("/:id/comments/:commentId", async (req, res) => {
  const id = parseId(req.params.id);
  const commentId = parseId(req.params.commentId);
  if (!id || !commentId) {
    return res.status(400).json({ message: "Identificador inválido" });
  }

  const message = await prisma.message.findUnique({
    where: { id: commentId },
    select: { id: true, authorId: true, conversation: { select: { id: true, taskId: true } } },
  });
  if (!message || message.conversation.taskId !== id) {
    return res.status(404).json({ message: "Comentario no encontrado" });
  }

  const isAuthor = message.authorId === req.auth!.employeeId;
  if (!isAuthor && req.auth!.role !== "ADMIN") {
    return res
      .status(403)
      .json({ message: "Solo el autor o un administrador pueden borrar el comentario" });
  }

  await prisma.message.delete({ where: { id: commentId } });

  emitTaskChanged({ type: "commented", taskId: id });
  res.json({ success: true });
});

export default router;
