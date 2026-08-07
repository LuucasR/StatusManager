import { Prisma, TaskState } from "@prisma/client";
import prisma from "../prisma/client";
import { emitToEmployees } from "../realtime";
import { notifyNewMessage } from "../notifications/notification.service";
import { GENERAL_KEY, taskKey } from "./chat.keys";
import { MESSAGE_SELECT, toMessageDto } from "./chat.dto";

type Tx = Prisma.TransactionClient;

/** Ids de todos los miembros de una conversacion. Es a quien se le emite. */
export async function conversationMemberIds(conversationId: number) {
  const members = await prisma.conversationMember.findMany({
    where: { conversationId },
    select: { employeeId: true },
  });
  return members.map((m) => m.employeeId);
}

/**
 * El canal general se crea al vuelo si no existe, y la fila de miembro tambien:
 * asi un empleado nuevo no arrastra como no leido todo el historial previo
 * (lastReadAt arranca en now()).
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
 * Idempotente por `key`. Se llama al crear la tarea y, por las dudas, desde los
 * caminos que necesitan la conversacion (tareas creadas por codigo viejo).
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
 * `closed` se ASIGNA, no se togglea: volver la tarea a Pendiente o En curso la
 * reabre sola. Es la misma funcion en los dos lugares donde puede cambiar el
 * estado (PATCH /tasks/:id y PATCH /tasks/:id/state) para que no diverjan.
 */
export async function syncTaskConversationState(tx: Tx, taskId: number, state: TaskState) {
  await tx.conversation.updateMany({
    where: { taskId },
    data: { closed: state === TaskState.DONE },
  });
}

/** El snapshot del titulo tiene que estar fresco ANTES de que borren la tarea. */
export async function syncTaskConversationTitle(tx: Tx, taskId: number, title: string) {
  await tx.conversation.updateMany({ where: { taskId }, data: { title } });
}

/** Espeja el alta y baja de participantes sobre el roster del chat. */
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
 * Crea el mensaje, actualiza el orden de la lista, marca leido para el autor y
 * avisa por socket. Unico camino de escritura de mensajes: lo usa tanto
 * POST /chat/... como el alias POST /tasks/:id/comments.
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

  // Una notificacion fallida no puede tumbar un mensaje ya guardado.
  try {
    await notifyNewMessage({
      conversation,
      recipientIds: memberIds,
      actorId: authorId,
      actorName: authorName,
      preview: body,
    });
  } catch (error) {
    console.error("No se pudo notificar el mensaje", error);
  }

  return dto;
}
