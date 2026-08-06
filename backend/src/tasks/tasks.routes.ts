import { Router } from "express";
import { TaskState } from "@prisma/client";
import prisma from "../prisma/client";
import { requireAdmin, requireAuth } from "../auth/auth.middleware";
import type { AuthPayload } from "../auth/auth.token";
import { emitTaskChanged } from "../realtime";
import { TASK_DETAIL_INCLUDE, TASK_INCLUDE, toTaskDto } from "./task.dto";
import {
  changeTaskStateSchema,
  createCommentSchema,
  createTaskSchema,
  updateTaskSchema,
} from "./task-validation";

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
    where: {
      ...(state && state in TaskState ? { state: state as TaskState } : {}),
      ...(participantId ? { participants: { some: { employeeId: participantId } } } : {}),
    },
    include: TASK_INCLUDE,
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    take: 500,
  });

  res.json(tasks.map(toTaskDto));
});

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
