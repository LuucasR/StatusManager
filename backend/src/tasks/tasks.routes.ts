import { Router } from "express";
import { Prisma, TaskState } from "@prisma/client";
import PDFDocument from "pdfkit";
import prisma from "../prisma/client";
import { renderTaskReport } from "../reports/task-report";
import { requireAuth, requireTaskManagement } from "../auth/auth.middleware";
import { canManageTasks, isStaff } from "../auth/roles";
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
import { LOCALE } from "../locale";

const router = Router();
router.use(requireAuth);

function parseId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function isParticipant(employeeId: number, taskId: number) {
  const link = await prisma.taskParticipant.findUnique({
    where: { taskId_employeeId: { taskId, employeeId } },
    select: { taskId: true },
  });
  return Boolean(link);
}

/**
 * Move and pin: whoever manages the board, or whoever takes part in the task.
 * Cannot be handled by router-level middleware because the rule depends on the
 * row.
 */
async function canMoveTask(auth: AuthPayload, taskId: number) {
  if (canManageTasks(auth.role)) return true;
  return isParticipant(auth.employeeId, taskId);
}

/**
 * Writing in the thread. Deliberately does NOT use canManageTasks: the read ACL
 * (chat/chat.access.ts) denies the thread to a TASK_MANAGER who is not a
 * participant, and letting them write into something they cannot read would be
 * incoherent - postMessage would not even echo their own message back over the
 * socket, since they are not a ConversationMember. Writing follows the chat
 * rule, not the board rule.
 */
async function canCommentOnTask(auth: AuthPayload, taskId: number) {
  if (isStaff(auth.role)) return true;
  return isParticipant(auth.employeeId, taskId);
}

/** Stops a non-existent id reaching Prisma and surfacing as a 500 (P2003). */
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
    // CAREFUL: visibleTasksWhere contributes an `OR`. The other two fragments
    // are flat keys, so Prisma ANDs them without conflict. If some future filter
    // brings its own `OR`, everything has to be wrapped in `AND: [...]` or one
    // silently overwrites the other.
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
 * IMPORTANT: this route goes BEFORE "/:id". Express matches in registration
 * order and "/:id" would capture "report.pdf" -> parseId -> null -> 400.
 *
 * No requireAdmin: GET /tasks already returns every task to any authenticated
 * user, so the PDF is the same data with a different Content-Type.
 */
router.get("/report.pdf", async (req, res) => {
  const participantId = parseId(req.query.participantId);
  const stateParam = req.query.state ? String(req.query.state) : undefined;
  const state = stateParam && stateParam in TaskState ? (stateParam as TaskState) : undefined;

  const period = req.query.period ? String(req.query.period) : "all";
  const from = req.query.from ? String(req.query.from) : undefined;
  const to = req.query.to ? String(req.query.to) : undefined;

  // visibleTasksWhere() is deliberately NOT spread in: the report includes
  // archived tasks on purpose, it is the only place they can be seen. If someone
  // added it by mistake, the ARCHIVED KPI would read 0 and give it away.
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
    periodLabel = `${new Date(from).toLocaleDateString(LOCALE)} to ${new Date(to).toLocaleDateString(LOCALE)}`;
  }

  // Looked up separately rather than from tasks[0]: if the filter matches
  // nothing the list is empty and the subtitle would lie (same reason as in
  // admin.routes.ts).
  const participant = participantId
    ? await prisma.employee.findUnique({
        where: { id: participantId },
        select: { employeeNumber: true, name: true },
      })
    : null;

  let subtitle = participant
    ? `Participante #${participant.employeeNumber} - ${participant.name}`
    : "All team tasks";
  if (state) subtitle += ` - ${TASK_STATE_META[state].label}`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `inline; filename="task-report-${new Date().toISOString().slice(0, 10)}.pdf"`
  );

  const doc = new PDFDocument({ margin: 0, size: "A4" });
  doc.pipe(res);

  renderTaskReport(doc, {
    title: "Task report",
    subtitle,
    periodLabel,
    rows: tasks.map(toTaskDto),
    archiveCutoff: taskArchiveCutoff(),
  });
});

// No archive filter on purpose: this is the recovery path. The report gives you
// the #id of an archived task, which you then open with /tasks?task=id.
router.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: "INVALID_ID", message: "Invalid identifier" });

  const task = await prisma.task.findUnique({
    where: { id },
    include: TASK_DETAIL_INCLUDE,
  });
  if (!task) return res.status(404).json({ code: "TASK_NOT_FOUND", message: "Task not found" });

  res.json(toTaskDto(task));
});

router.post("/", requireTaskManagement, async (req, res) => {
  const parsed = createTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      code: "INVALID_TASK",
      message: parsed.error.issues[0]?.message ?? "The task could not be validated",
    });
  }

  if (!(await assertParticipantsExist(parsed.data.participantIds))) {
    return res
      .status(400)
      .json({ code: "INVALID_PARTICIPANT", message: "One of the participants does not exist or is inactive" });
  }

  const participantIds = [...new Set(parsed.data.participantIds)];

  // A transaction because the conversation needs the task id for its key.
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
    body: `You were added to task "${task.title}"`,
    taskId: task.id,
  });

  res.status(201).json(toTaskDto(task));
});

router.patch("/:id", requireTaskManagement, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: "INVALID_ID", message: "Invalid identifier" });

  const parsed = updateTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      code: "INVALID_TASK",
      message: parsed.error.issues[0]?.message ?? "The task could not be validated",
    });
  }

  const current = await prisma.task.findUnique({
    where: { id },
    select: {
      title: true,
      state: true,
      startsAt: true,
      endsAt: true,
      // The previous set, so additions and removals can be computed instead of
      // blindly replacing.
      participants: { select: { employeeId: true } },
    },
  });
  if (!current) return res.status(404).json({ code: "TASK_NOT_FOUND", message: "Task not found" });

  const startsAt = parsed.data.startsAt ?? current.startsAt;
  const endsAt = parsed.data.endsAt ?? current.endsAt;
  if (endsAt <= startsAt) {
    return res
      .status(400)
      .json({ code: "INVALID_DATE_ORDER", message: "The end date must be after the start date" });
  }

  if (
    parsed.data.participantIds &&
    !(await assertParticipantsExist(parsed.data.participantIds))
  ) {
    return res
      .status(400)
      .json({ code: "INVALID_PARTICIPANT", message: "One of the participants does not exist or is inactive" });
  }

  // Participant diff. Besides allowing only the changed people to be notified,
  // it fixes a visible bug: the blind deleteMany+createMany rewrote everyone's
  // addedAt, and TASK_INCLUDE orders by addedAt, so the avatars on the card
  // reshuffled themselves every time an admin edited the title.
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

    // The title is snapshotted before the task can be deleted.
    if (parsed.data.title && parsed.data.title !== current.title) {
      await syncTaskConversationTitle(tx, id, parsed.data.title);
    }
    // This route can change the state too, not only PATCH /:id/state.
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
    body: `You were added to task "${task.title}"`,
    taskId: id,
  });
  await notify({
    recipientIds: removed,
    actorId,
    type: "TASK_REMOVED",
    title: task.title,
    body: `You were removed from task "${task.title}"`,
    taskId: id,
  });
  if (stateChanged) {
    await notify({
      recipientIds: task.participants.map((link) => link.employee.id),
      actorId,
      type: "TASK_STATE",
      title: task.title,
      body: `"${task.title}" moved to ${TASK_STATE_META[task.state].label}`,
      taskId: id,
    });
  }

  res.json(toTaskDto(task));
});

router.patch("/:id/state", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: "INVALID_ID", message: "Invalid identifier" });

  const parsed = changeTaskStateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      code: "INVALID_STATE",
      message: parsed.error.issues[0]?.message ?? "Invalid state",
    });
  }

  const exists = await prisma.task.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!exists) return res.status(404).json({ code: "TASK_NOT_FOUND", message: "Task not found" });

  if (!(await canMoveTask(req.auth!, id))) {
    return res
      .status(403)
      .json({ code: "MOVE_NOT_ALLOWED", message: "Only participants can move this task" });
  }

  const task = await prisma.$transaction(async (tx) => {
    await tx.task.update({ where: { id }, data: { state: parsed.data.state } });
    // The task chat closes on DONE and reopens when moved back.
    await syncTaskConversationState(tx, id, parsed.data.state);
    // Re-read AFTER the sync: otherwise the DTO returns the stale chatClosed.
    return tx.task.findUniqueOrThrow({ where: { id }, include: TASK_INCLUDE });
  });

  emitTaskChanged({ type: "moved", taskId: id, state: task.state });
  await notify({
    recipientIds: task.participants.map((link) => link.employee.id),
    actorId: req.auth!.employeeId,
    type: "TASK_STATE",
    title: task.title,
    body: `"${task.title}" moved to ${TASK_STATE_META[task.state].label}`,
    taskId: id,
  });

  res.json(toTaskDto(task));
});

/**
 * Pinning a task exempts it from the 14-day archiving and sends it to the top
 * of its column. Same permission as moving (canMoveTask): it is a decision for
 * whoever works the task, and it avoids inventing a third permission rule.
 */
router.patch("/:id/pin", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: "INVALID_ID", message: "Invalid identifier" });

  const parsed = changeTaskPinSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ code: "INVALID_VALUE", message: "Invalid value" });
  }

  const exists = await prisma.task.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!exists) return res.status(404).json({ code: "TASK_NOT_FOUND", message: "Task not found" });

  if (!(await canMoveTask(req.auth!, id))) {
    return res
      .status(403)
      .json({ code: "PIN_NOT_ALLOWED", message: "Only participants can pin this task" });
  }

  const task = await prisma.task.update({
    where: { id },
    data: { pinned: parsed.data.pinned },
    include: TASK_INCLUDE,
  });

  emitTaskChanged({ type: "pinned", taskId: id, pinned: task.pinned });
  res.json(toTaskDto(task));
});

router.delete("/:id", requireTaskManagement, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: "INVALID_ID", message: "Invalid identifier" });

  const exists = await prisma.task.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!exists) return res.status(404).json({ code: "TASK_NOT_FOUND", message: "Task not found" });

  await prisma.$transaction(async (tx) => {
    // Close the conversation BEFORE deleting: the FK's SetNull handles taskId
    // but not closed, and an orphaned writable conversation would be a hole.
    // The title is already snapshotted.
    await tx.conversation.updateMany({ where: { taskId: id }, data: { closed: true } });
    await tx.task.delete({ where: { id } });
  });

  emitTaskChanged({ type: "deleted", taskId: id });
  res.json({ success: true });
});

/**
 * Historical alias: the task's comment thread IS the task's chat. The route and
 * the response shape ({id, body, createdAt, author}) are kept so the current
 * frontend keeps working unchanged while the chat window is built. Writes to
 * Message, exactly like POST /chat/.../messages.
 */
router.post("/:id/comments", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ code: "INVALID_ID", message: "Invalid identifier" });

  const parsed = createCommentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      code: "INVALID_COMMENT",
      message: parsed.error.issues[0]?.message ?? "The comment could not be validated",
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
  if (!task) return res.status(404).json({ code: "TASK_NOT_FOUND", message: "Task not found" });

  if (!(await canCommentOnTask(req.auth!, id))) {
    return res
      .status(403)
      .json({ code: "COMMENT_NOT_ALLOWED", message: "Only participants can comment on this task" });
  }

  // Tasks created before the migration or by older code: idempotent.
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
      .json({ code: "CHAT_CLOSED_DONE", message: "The chat is closed because the task is done" });
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
    return res.status(400).json({ code: "INVALID_ID", message: "Invalid identifier" });
  }

  const message = await prisma.message.findUnique({
    where: { id: commentId },
    select: { id: true, authorId: true, conversation: { select: { id: true, taskId: true } } },
  });
  if (!message || message.conversation.taskId !== id) {
    return res.status(404).json({ code: "COMMENT_NOT_FOUND", message: "Comment not found" });
  }

  const isAuthor = message.authorId === req.auth!.employeeId;
  if (!isAuthor && !isStaff(req.auth!.role)) {
    return res
      .status(403)
      .json({ code: "COMMENT_DELETE_NOT_ALLOWED", message: "Only the author or an administrator can delete the comment" });
  }

  await prisma.message.delete({ where: { id: commentId } });

  emitTaskChanged({ type: "commented", taskId: id });
  res.json({ success: true });
});

export default router;
