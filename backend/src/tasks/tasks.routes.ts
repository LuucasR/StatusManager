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
  setChecklistItemSchema,
  updateTaskSchema,
} from "./task-validation";
import { TASK_STATE_META, taskArchiveCutoff, visibleTasksWhere } from "./task-state";
import { applyChecklistAutoComplete, diffChecklist } from "./task-checklist";
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

/**
 * Same code and same wording from both routes that can be handed an item id that
 * is stale or belongs to another task. Shared rather than written twice: the
 * client translates on the code, and one code answering with two different
 * sentences is exactly what frontend/scripts/check-error-codes.cjs rejects.
 */
const CHECKLIST_ITEM_NOT_FOUND = {
  code: "CHECKLIST_ITEM_NOT_FOUND",
  message: "That checklist item no longer exists",
};

/**
 * Only somebody who takes part in the task can be put in charge of one of its
 * items: they would otherwise be handed work on a task whose thread they cannot
 * even read. No database constraint can say "exists in TaskParticipant for THIS
 * task", so both write routes check it.
 */
const INVALID_ASSIGNEE = {
  code: "INVALID_ASSIGNEE",
  message: "Whoever is in charge of an item has to take part in the task",
};

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

  if (
    parsed.data.checklist.some(
      (item) => item.assigneeId != null && !participantIds.includes(item.assigneeId)
    )
  ) {
    return res.status(400).json(INVALID_ASSIGNEE);
  }

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
        autoCompleteOnChecklist: parsed.data.autoCompleteOnChecklist,
        participants: {
          create: participantIds.map((employeeId) => ({ employeeId })),
        },
        // The array's index is the position: the order the author typed is the
        // order the list is read back in.
        checklist: {
          create: parsed.data.checklist.map((item, index) => ({
            text: item.text,
            position: index,
            assigneeId: item.assigneeId ?? null,
          })),
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
      autoCompleteOnChecklist: true,
      // Same reason as the participants above, and with more at stake: the
      // previous items are what lets `done` survive an edit of the title.
      checklist: { select: { id: true, text: true, position: true } },
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

  // Checklist diff, keyed by item id and for the same reason as the participant
  // one above - except a blind rewrite here would not merely reshuffle an order,
  // it would UNTICK every box each time somebody fixed a typo in the title. The
  // arithmetic itself lives in diffChecklist, where it is unit tested.
  const nextChecklist = parsed.data.checklist ?? null;
  const checklistDiff = nextChecklist ? diffChecklist(current.checklist, nextChecklist) : null;

  // Checked against the participants the task will have AFTER this request and
  // not the ones it has now: one save can add somebody and put them in charge of
  // an item at the same time.
  const finalParticipants = next ?? previous;
  if (checklistDiff?.assigneeIds.some((employeeId) => !finalParticipants.has(employeeId))) {
    return res.status(400).json(INVALID_ASSIGNEE);
  }

  if (checklistDiff?.unknownIds.length) {
    // An id from another task, or one deleted by somebody else while this form
    // was open. Refused rather than silently created as a new item: the caller
    // asked to edit a specific row and that row is not there.
    return res.status(400).json(CHECKLIST_ITEM_NOT_FOUND);
  }

  const { task, autoCompleted } = await prisma.$transaction(async (tx) => {
    await tx.task.update({
      where: { id },
      data: {
        title: parsed.data.title,
        description: parsed.data.description,
        state: parsed.data.state,
        startsAt: parsed.data.startsAt,
        endsAt: parsed.data.endsAt,
        autoCompleteOnChecklist: parsed.data.autoCompleteOnChecklist,
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
    // Somebody dropped from the task cannot stay in charge of its items. Runs on
    // every request that removes a participant, not only the ones that happen to
    // send a checklist too - otherwise editing only the participants would leave
    // an item assigned to somebody who is no longer on the task.
    if (removed.length) {
      await tx.taskChecklistItem.updateMany({
        where: { taskId: id, assigneeId: { in: removed } },
        data: { assigneeId: null },
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

    if (checklistDiff) {
      if (checklistDiff.deletedIds.length) {
        await tx.taskChecklistItem.deleteMany({
          where: { id: { in: checklistDiff.deletedIds } },
        });
      }
      // Sequential rather than a Promise.all: these run on the transaction's
      // single connection, and firing them in parallel only queues them anyway.
      // `done` is deliberately never in an update: that is the whole point.
      for (const item of checklistDiff.updates) {
        await tx.taskChecklistItem.update({
          where: { id: item.id },
          data: { text: item.text, position: item.position, assigneeId: item.assigneeId },
        });
      }
      for (const item of checklistDiff.creates) {
        await tx.taskChecklistItem.create({
          data: {
            taskId: id,
            text: item.text,
            position: item.position,
            assigneeId: item.assigneeId,
          },
        });
      }
    }

    // Editing the list can complete it too: deleting the only item that was
    // still open, or turning the switch on over one that was already ticked.
    //
    // Skipped entirely when the same request also set a state by hand. A manager
    // who drags a fully-ticked task back to In progress in the edit dialog means
    // it, and having the rule pull it straight back to Done would make that
    // control look broken.
    const autoCompleted =
      !parsed.data.state && (nextChecklist || parsed.data.autoCompleteOnChecklist !== undefined)
        ? await applyChecklistAutoComplete(tx, id)
        : false;

    // Re-read AFTER all of it: the DTO would otherwise return the stale state.
    return {
      task: await tx.task.findUniqueOrThrow({ where: { id }, include: TASK_INCLUDE }),
      autoCompleted,
    };
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
  if (stateChanged || autoCompleted) {
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

/**
 * Ticking one checklist item off. The only write on a task an ordinary employee
 * can make besides moving it, and it deliberately shares that permission
 * (canMoveTask): whoever is allowed to drag a task across the board is the same
 * person who is allowed to say which part of it is finished. Editing the LIST
 * itself stays with the board managers, on PATCH /:id.
 */
router.patch("/:id/checklist/:itemId", async (req, res) => {
  const id = parseId(req.params.id);
  const itemId = parseId(req.params.itemId);
  if (!id || !itemId) {
    return res.status(400).json({ code: "INVALID_ID", message: "Invalid identifier" });
  }

  const parsed = setChecklistItemSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ code: "INVALID_VALUE", message: "Invalid value" });
  }

  // Fetched with its taskId rather than by id alone: an item that exists but
  // belongs to another task must not be tickable through this task's URL, which
  // is the only place the permission was checked.
  const item = await prisma.taskChecklistItem.findUnique({
    where: { id: itemId },
    select: { id: true, taskId: true },
  });
  if (!item || item.taskId !== id) {
    return res.status(404).json(CHECKLIST_ITEM_NOT_FOUND);
  }

  if (!(await canMoveTask(req.auth!, id))) {
    return res
      .status(403)
      .json({ code: "CHECKLIST_NOT_ALLOWED", message: "Only participants can tick off this task's items" });
  }

  // Read for the name snapshot, which is what keeps "done by" readable once the
  // account is deleted (doneById is SetNull). Same pattern as a message author.
  const actor = await prisma.employee.findUniqueOrThrow({
    where: { id: req.auth!.employeeId },
    select: { id: true, name: true },
  });

  const { task, autoCompleted } = await prisma.$transaction(async (tx) => {
    await tx.taskChecklistItem.update({
      where: { id: itemId },
      // Unticking clears the whole record, not just the flag: the item is not
      // done any more, so there is nobody who finished it and no time it
      // happened. Leaving a stale name behind would read as a contradiction.
      data: parsed.data.done
        ? { done: true, doneAt: new Date(), doneById: actor.id, doneByName: actor.name }
        : { done: false, doneAt: null, doneById: null, doneByName: null },
    });

    const autoCompleted = await applyChecklistAutoComplete(tx, id);

    // Re-read AFTER the rule has run, or the DTO would answer with the state and
    // the chatClosed the task had a moment ago.
    return {
      task: await tx.task.findUniqueOrThrow({ where: { id }, include: TASK_INCLUDE }),
      autoCompleted,
    };
  });

  emitTaskChanged({ type: "checklist", taskId: id });

  if (autoCompleted) {
    // The same notification every other route into DONE sends: from the reader's
    // side nothing distinguishes a task somebody dragged there from one its own
    // last checkbox moved.
    await notify({
      recipientIds: task.participants.map((link) => link.employee.id),
      actorId: req.auth!.employeeId,
      type: "TASK_STATE",
      title: task.title,
      body: `"${task.title}" moved to ${TASK_STATE_META[task.state].label}`,
      taskId: id,
    });
  }

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
