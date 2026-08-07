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

  const task = await prisma.task.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description,
      state: parsed.data.state,
      startsAt: parsed.data.startsAt,
      endsAt: parsed.data.endsAt,
      createdById: req.auth!.employeeId,
      participants: {
        create: [...new Set(parsed.data.participantIds)].map((employeeId) => ({
          employeeId,
        })),
      },
    },
    include: TASK_INCLUDE,
  });

  emitTaskChanged({ type: "created", taskId: task.id });
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
    select: { startsAt: true, endsAt: true },
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

    if (parsed.data.participantIds) {
      await tx.taskParticipant.deleteMany({ where: { taskId: id } });
      await tx.taskParticipant.createMany({
        data: [...new Set(parsed.data.participantIds)].map((employeeId) => ({
          taskId: id,
          employeeId,
        })),
        skipDuplicates: true,
      });
    }

    return tx.task.findUniqueOrThrow({ where: { id }, include: TASK_INCLUDE });
  });

  emitTaskChanged({ type: "updated", taskId: id });
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

  const task = await prisma.task.update({
    where: { id },
    data: { state: parsed.data.state },
    include: TASK_INCLUDE,
  });

  emitTaskChanged({ type: "moved", taskId: id, state: task.state });
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

  await prisma.task.delete({ where: { id } });

  emitTaskChanged({ type: "deleted", taskId: id });
  res.json({ success: true });
});

router.post("/:id/comments", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: "Identificador inválido" });

  const parsed = createCommentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      message: parsed.error.issues[0]?.message ?? "No se pudo validar el comentario",
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
      .json({ message: "Solo los participantes pueden comentar esta tarea" });
  }

  const comment = await prisma.taskComment.create({
    data: { taskId: id, authorId: req.auth!.employeeId, body: parsed.data.body },
    select: {
      id: true,
      body: true,
      createdAt: true,
      author: { select: { id: true, employeeNumber: true, name: true } },
    },
  });

  emitTaskChanged({ type: "commented", taskId: id });
  res.status(201).json(comment);
});

router.delete("/:id/comments/:commentId", async (req, res) => {
  const id = parseId(req.params.id);
  const commentId = parseId(req.params.commentId);
  if (!id || !commentId) {
    return res.status(400).json({ message: "Identificador inválido" });
  }

  const comment = await prisma.taskComment.findUnique({
    where: { id: commentId },
    select: { id: true, taskId: true, authorId: true },
  });
  if (!comment || comment.taskId !== id) {
    return res.status(404).json({ message: "Comentario no encontrado" });
  }

  const isAuthor = comment.authorId === req.auth!.employeeId;
  if (!isAuthor && req.auth!.role !== "ADMIN") {
    return res
      .status(403)
      .json({ message: "Solo el autor o un administrador pueden borrar el comentario" });
  }

  await prisma.taskComment.delete({ where: { id: commentId } });

  emitTaskChanged({ type: "commented", taskId: id });
  res.json({ success: true });
});

export default router;
