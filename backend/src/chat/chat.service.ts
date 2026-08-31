import { Prisma, TaskState } from "@prisma/client";
import prisma from "../prisma/client";
import { emitToEmployees } from "../realtime";
import { notifyNewMessage } from "../notifications/notification.service";
import { GENERAL_KEY, taskKey } from "./chat.keys";
import { MESSAGE_SELECT, toMessageDto } from "./chat.dto";
import { logger } from "../logger";

type Tx = Prisma.TransactionClient;

/** Ids of every member of a conversation. This is who gets emitted to. */
export async function conversationMemberIds(conversationId: number) {
  const members = await prisma.conversationMember.findMany({
    where: { conversationId },
    select: { employeeId: true },
  });
  return members.map((m) => m.employeeId);
}

/**
 * The general channel is created on the fly if missing, and so is the member
 * row: that way a new employee does not inherit the entire previous history as
 * unread (lastReadAt starts at now()).
 */
export async function ensureGeneralConversation(employeeId: number) {
  const conversation = await prisma.conversation.upsert({
    where: { key: GENERAL_KEY },
    create: { kind: "GENERAL", key: GENERAL_KEY, title: "General" },
    update: {},
  });

  await prisma.conversationMember.upsert({
    where: {
      conversationId_employeeId: { conversationId: conversation.id, employeeId },
    },
    create: { conversationId: conversation.id, employeeId, lastReadAt: new Date() },
    update: {},
  });

  return conversation;
}

/**
 * Idempotent through `key`. Called when the task is created and, as a safety
 * net, from the paths that need the conversation (tasks created by older code).
 */
export async function ensureTaskConversation(
  tx: Tx,
  task: { id: number; title: string; state: TaskState },
  participantIds: number[]
) {
  const conversation = await tx.conversation.upsert({
    where: { key: taskKey(task.id) },
    create: {
      kind: "TASK",
      key: taskKey(task.id),
      title: task.title,
      taskId: task.id,
      closed: task.state === TaskState.DONE,
    },
    update: {},
    select: { id: true },
  });

  if (participantIds.length) {
    await tx.conversationMember.createMany({
      data: participantIds.map((employeeId) => ({
        conversationId: conversation.id,
        employeeId,
      })),
      skipDuplicates: true,
    });
  }

  return conversation;
}

/**
 * `closed` is ASSIGNED, not toggled: moving the task back to Pending or In
 * progress reopens it on its own. The same function is used in both places the
 * state can change (PATCH /tasks/:id and PATCH /tasks/:id/state) so they cannot
 * diverge.
 */
export async function syncTaskConversationState(tx: Tx, taskId: number, state: TaskState) {
  await tx.conversation.updateMany({
    where: { taskId },
    data: { closed: state === TaskState.DONE },
  });
}

/** The title snapshot has to be fresh BEFORE the task is deleted. */
export async function syncTaskConversationTitle(tx: Tx, taskId: number, title: string) {
  await tx.conversation.updateMany({ where: { taskId }, data: { title } });
}

/** Mirrors participants being added and removed onto the chat roster. */
export async function syncTaskConversationMembers(
  tx: Tx,
  taskId: number,
  added: number[],
  removed: number[]
) {
  if (!added.length && !removed.length) return;

  const conversation = await tx.conversation.findFirst({
    where: { taskId },
    select: { id: true },
  });
  if (!conversation) return;

  if (removed.length) {
    await tx.conversationMember.deleteMany({
      where: { conversationId: conversation.id, employeeId: { in: removed } },
    });
  }
  if (added.length) {
    await tx.conversationMember.createMany({
      data: added.map((employeeId) => ({ conversationId: conversation.id, employeeId })),
      skipDuplicates: true,
    });
  }
}

/**
 * Creates the message, updates the list ordering, marks it read for the author
 * and announces it over the socket. The only write path for messages: used by
 * both POST /chat/... and the POST /tasks/:id/comments alias.
 */
export async function postMessage(options: {
  conversationId: number;
  authorId: number;
  authorName: string;
  body: string;
}) {
  const { conversationId, authorId, authorName, body } = options;

  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.message.create({
      data: { conversationId, authorId, authorName, body },
      select: MESSAGE_SELECT,
    });

    await tx.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: created.createdAt },
    });

    await tx.conversationMember.updateMany({
      where: { conversationId, employeeId: authorId },
      data: { lastReadAt: created.createdAt },
    });

    return created;
  });

  const conversation = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversationId },
    select: { id: true, kind: true, taskId: true, title: true },
  });

  const memberIds = await conversationMemberIds(conversationId);
  const dto = toMessageDto(message, conversationId);

  emitToEmployees(memberIds, "chat:message", {
    conversationId,
    message: dto,
  });

  // A failed notification must not bring down a message that is already saved.
  try {
    await notifyNewMessage({
      conversation,
      recipientIds: memberIds,
      actorId: authorId,
      actorName: authorName,
      preview: body,
    });
  } catch (error) {
    logger.error({ err: error }, "could not notify new message");
  }

  return dto;
}
