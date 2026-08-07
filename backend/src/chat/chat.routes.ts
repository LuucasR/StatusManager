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

/** Carga la conversacion y resuelve permisos, o responde y devuelve null. */
async function loadForAccess(req: any, res: any, mode: "read" | "write") {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ message: "Identificador inválido" });
    return null;
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id },
    select: CONVERSATION_ACL_SELECT,
  });
  if (!conversation) {
    res.status(404).json({ message: "Conversación no encontrada" });
    return null;
  }

  const access = await conversationAccess(req.auth!, conversation);
  if (!access.canRead) {
    res.status(403).json({ message: "No tenés acceso a esta conversación" });
    return null;
  }
  if (mode === "write" && !access.canWrite) {
    res.status(409).json({
      message: conversation.taskId
        ? "El chat está cerrado porque la tarea está terminada"
        : "La tarea fue eliminada. El historial queda como solo lectura",
    });
    return null;
  }

  return { conversation, access };
}

router.get("/conversations", async (req, res) => {
  const employeeId = req.auth!.employeeId;

  // El canal general se materializa al pedir la lista para que siempre aparezca.
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
        // El DM se titula con la otra persona; el resto usa el snapshot.
        title: peer ? peer.name : conversation.title ?? "Conversación",
        closed: conversation.closed,
        taskId: conversation.taskId,
        // taskId en null en una TASK es la unica definicion de "tarea eliminada".
        taskDeleted: conversation.kind === "TASK" && conversation.taskId === null,
        taskState: conversation.task?.state ?? null,
        peer,
        memberCount: conversation.members.length,
        lastMessageAt: conversation.lastMessageAt,
        lastMessage: last ? { body: last.body, authorName: last.authorName, createdAt: last.createdAt } : null,
        // Booleano barato: no toca Message, sale del mismo findMany.
        unread: Boolean(
          conversation.lastMessageAt &&
            me?.lastReadAt &&
            conversation.lastMessageAt > me.lastReadAt
        ),
      };
    })
  );
});

/** Contador exacto por conversacion, para los badges. */
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

/** Get-or-create del mensaje directo. Idempotente: siempre 200. */
router.post("/direct", async (req, res) => {
  const parsed = createDirectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Empleado inválido" });
  }

  const me = req.auth!.employeeId;
  const other = parsed.data.employeeId;
  if (me === other) {
    return res.status(400).json({ message: "No podés abrir un chat con vos mismo" });
  }

  const employee = await prisma.employee.findFirst({
    where: { id: other, active: true },
    select: { id: true, employeeNumber: true, name: true },
  });
  if (!employee) {
    return res.status(400).json({ message: "El empleado no existe o está inactivo" });
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
    return res.status(400).json({ message: "Parámetros de paginación inválidos" });
  }
  const { before, limit } = parsed.data;
  const conversationId = loaded.conversation.id;

  // Cursor por id (no por createdAt): es unico, monotono y no empata.
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
      message: parsed.error.issues[0]?.message ?? "No se pudo validar el mensaje",
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

  // A la propia room, para que las otras pestañas bajen el badge.
  emitToEmployees([employeeId], "chat:read", { conversationId: loaded.conversation.id });

  res.json({ success: true });
});

router.delete("/conversations/:id/messages/:messageId", async (req, res) => {
  const loaded = await loadForAccess(req, res, "read");
  if (!loaded) return;

  const messageId = parseId(req.params.messageId);
  if (!messageId) return res.status(400).json({ message: "Identificador inválido" });

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { id: true, conversationId: true, authorId: true },
  });
  if (!message || message.conversationId !== loaded.conversation.id) {
    return res.status(404).json({ message: "Mensaje no encontrado" });
  }

  if (message.authorId !== req.auth!.employeeId && !isStaff(req.auth!.role)) {
    return res
      .status(403)
      .json({ message: "Solo el autor o un administrador pueden borrar el mensaje" });
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
