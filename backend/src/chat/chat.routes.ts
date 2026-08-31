import { Router } from "express";
import prisma from "../prisma/client";
import { requireAuth } from "../auth/auth.middleware";
import { isStaff } from "../auth/roles";
import { emitToEmployees } from "../realtime";
import { CONVERSATION_ACL_SELECT, conversationAccess } from "./chat.access";
import { MESSAGE_SELECT, toMessageDto } from "./chat.dto";
import { directKey } from "./chat.keys";
import {
  conversationMemberIds,
  ensureGeneralConversation,
  postMessage,
} from "./chat.service";
import {
  createDirectSchema,
  messagesQuerySchema,
  sendMessageSchema,
} from "./chat-validation";

const router = Router();
router.use(requireAuth);

function parseId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const EMPLOYEE_SUMMARY = { select: { id: true, employeeNumber: true, name: true } };

/** Loads the conversation and resolves permissions, or answers and returns null. */
async function loadForAccess(req: any, res: any, mode: "read" | "write") {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ code: "INVALID_ID", message: "Invalid identifier" });
    return null;
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id },
    select: CONVERSATION_ACL_SELECT,
  });
  if (!conversation) {
    res.status(404).json({ code: "CONVERSATION_NOT_FOUND", message: "Conversation not found" });
    return null;
  }

  const access = await conversationAccess(req.auth!, conversation);
  if (!access.canRead) {
    res.status(403).json({ code: "CONVERSATION_FORBIDDEN", message: "You do not have access to this conversation" });
    return null;
  }
  if (mode === "write" && !access.canWrite) {
    // Two different reasons, two different codes: a task that is merely done can
    // be reopened by moving it back, a deleted one cannot. The client has to be
    // able to tell them apart without reading the sentence.
    const closedByDeletion = conversation.taskId === null;
    res.status(409).json({
      code: closedByDeletion ? "CHAT_CLOSED_DELETED" : "CHAT_CLOSED_DONE",
      message: closedByDeletion
        ? "The task was deleted. The history stays read only"
        : "The chat is closed because the task is done",
    });
    return null;
  }

  return { conversation, access };
}

router.get("/conversations", async (req, res) => {
  const employeeId = req.auth!.employeeId;

  // The general channel is materialised when the list is requested so it always shows up.
  await ensureGeneralConversation(employeeId);

  const conversations = await prisma.conversation.findMany({
    where: { members: { some: { employeeId } } },
    select: {
      id: true,
      kind: true,
      title: true,
      closed: true,
      taskId: true,
      lastMessageAt: true,
      members: { select: { employeeId: true, lastReadAt: true, employee: EMPLOYEE_SUMMARY } },
      messages: {
        orderBy: { id: "desc" },
        take: 1,
        select: { body: true, authorName: true, createdAt: true },
      },
      task: { select: { state: true } },
    },
    orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
  });

  res.json(
    conversations.map((conversation) => {
      const me = conversation.members.find((m) => m.employeeId === employeeId);
      const peer =
        conversation.kind === "DIRECT"
          ? conversation.members.find((m) => m.employeeId !== employeeId)?.employee ?? null
          : null;
      const last = conversation.messages[0] ?? null;

      return {
        id: conversation.id,
        kind: conversation.kind,
        // A DM is titled after the other person; everything else uses the snapshot.
        title: peer ? peer.name : conversation.title ?? "Conversation",
        closed: conversation.closed,
        taskId: conversation.taskId,
        // A null taskId on a TASK is the only definition of "task deleted".
        taskDeleted: conversation.kind === "TASK" && conversation.taskId === null,
        taskState: conversation.task?.state ?? null,
        peer,
        memberCount: conversation.members.length,
        lastMessageAt: conversation.lastMessageAt,
        lastMessage: last ? { body: last.body, authorName: last.authorName, createdAt: last.createdAt } : null,
        // Cheap boolean: never touches Message, comes out of the same findMany.
        unread: Boolean(
          conversation.lastMessageAt &&
            me?.lastReadAt &&
            conversation.lastMessageAt > me.lastReadAt
        ),
      };
    })
  );
});

/** Exact per-conversation count, for the badges. */
router.get("/unread-count", async (req, res) => {
  const employeeId = req.auth!.employeeId;

  const rows = await prisma.$queryRaw<{ conversationId: number; unread: number }[]>`
    SELECT m."conversationId", COUNT(*)::int AS unread
    FROM "Message" m
    JOIN "ConversationMember" cm ON cm."conversationId" = m."conversationId"
    WHERE cm."employeeId" = ${employeeId}
      AND (cm."lastReadAt" IS NULL OR m."createdAt" > cm."lastReadAt")
      AND (m."authorId" IS NULL OR m."authorId" <> ${employeeId})
    GROUP BY m."conversationId"
  `;

  const byConversation: Record<number, number> = {};
  let total = 0;
  for (const row of rows) {
    byConversation[row.conversationId] = row.unread;
    total += row.unread;
  }

  res.json({ total, byConversation });
});

/** Get-or-create for a direct message. Idempotent: always 200. */
router.post("/direct", async (req, res) => {
  const parsed = createDirectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ code: "INVALID_EMPLOYEE", message: "Invalid employee" });
  }

  const me = req.auth!.employeeId;
  const other = parsed.data.employeeId;
  if (me === other) {
    return res.status(400).json({ code: "SELF_CHAT", message: "You cannot open a chat with yourself" });
  }

  const employee = await prisma.employee.findFirst({
    where: { id: other, active: true },
    select: { id: true, employeeNumber: true, name: true },
  });
  if (!employee) {
    return res.status(400).json({ code: "EMPLOYEE_INACTIVE", message: "That employee does not exist or is inactive" });
  }

  const key = directKey(me, other);
  const conversation = await prisma.conversation.upsert({
    where: { key },
    create: {
      kind: "DIRECT",
      key,
      members: { create: [{ employeeId: me }, { employeeId: other }] },
    },
    update: {},
    select: { id: true, kind: true, closed: true },
  });

  emitToEmployees([me, other], "chat:conversation", { conversationId: conversation.id });

  res.json({ ...conversation, title: employee.name, peer: employee, taskId: null, unread: false });
});

router.get("/conversations/:id/messages", async (req, res) => {
  const loaded = await loadForAccess(req, res, "read");
  if (!loaded) return;

  const parsed = messagesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ code: "INVALID_PAGINATION", message: "Invalid pagination parameters" });
  }
  const { before, limit } = parsed.data;
  const conversationId = loaded.conversation.id;

  // Cursor by id (not createdAt): unique, monotonic and never ties.
  const rows = await prisma.message.findMany({
    where: { conversationId, ...(before ? { id: { lt: before } } : {}) },
    orderBy: { id: "desc" },
    take: limit + 1,
    select: MESSAGE_SELECT,
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  res.json({
    items: page.map((m) => toMessageDto(m, conversationId)).reverse(),
    hasMore,
    nextBefore: page.length ? page[page.length - 1].id : null,
  });
});

router.post("/conversations/:id/messages", async (req, res) => {
  const loaded = await loadForAccess(req, res, "write");
  if (!loaded) return;

  const parsed = sendMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      code: "INVALID_MESSAGE",
      message: parsed.error.issues[0]?.message ?? "The message could not be validated",
    });
  }

  const author = await prisma.employee.findUniqueOrThrow({
    where: { id: req.auth!.employeeId },
    select: { id: true, name: true },
  });

  const message = await postMessage({
    conversationId: loaded.conversation.id,
    authorId: author.id,
    authorName: author.name,
    body: parsed.data.body,
  });

  res.status(201).json(message);
});

router.post("/conversations/:id/read", async (req, res) => {
  const loaded = await loadForAccess(req, res, "read");
  if (!loaded) return;

  const employeeId = req.auth!.employeeId;
  await prisma.conversationMember.upsert({
    where: {
      conversationId_employeeId: { conversationId: loaded.conversation.id, employeeId },
    },
    create: { conversationId: loaded.conversation.id, employeeId, lastReadAt: new Date() },
    update: { lastReadAt: new Date() },
  });

  // To the sender's own room, so their other tabs clear the badge too.
  emitToEmployees([employeeId], "chat:read", { conversationId: loaded.conversation.id });

  res.json({ success: true });
});

router.delete("/conversations/:id/messages/:messageId", async (req, res) => {
  const loaded = await loadForAccess(req, res, "read");
  if (!loaded) return;

  const messageId = parseId(req.params.messageId);
  if (!messageId) return res.status(400).json({ code: "INVALID_ID", message: "Invalid identifier" });

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { id: true, conversationId: true, authorId: true },
  });
  if (!message || message.conversationId !== loaded.conversation.id) {
    return res.status(404).json({ code: "MESSAGE_NOT_FOUND", message: "Message not found" });
  }

  if (message.authorId !== req.auth!.employeeId && !isStaff(req.auth!.role)) {
    return res
      .status(403)
      .json({ code: "MESSAGE_DELETE_NOT_ALLOWED", message: "Only the author or an administrator can delete the message" });
  }

  await prisma.message.delete({ where: { id: messageId } });

  const last = await prisma.message.findFirst({
    where: { conversationId: loaded.conversation.id },
    orderBy: { id: "desc" },
    select: { createdAt: true },
  });
  await prisma.conversation.update({
    where: { id: loaded.conversation.id },
    data: { lastMessageAt: last?.createdAt ?? null },
  });

  const memberIds = await conversationMemberIds(loaded.conversation.id);
  emitToEmployees(memberIds, "chat:message", {
    conversationId: loaded.conversation.id,
    deletedId: messageId,
  });

  res.json({ success: true });
});

export default router;
