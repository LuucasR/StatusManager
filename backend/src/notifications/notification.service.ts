import type { ConversationKind, NotificationType } from "@prisma/client";
import prisma from "../prisma/client";
import { emitToEmployees } from "../realtime";

export const NOTIFICATION_SELECT = {
  id: true,
  type: true,
  title: true,
  body: true,
  taskId: true,
  readAt: true,
  createdAt: true,
} as const;

type NotifyInput = {
  recipientIds: number[];
  /** Quien dispara la accion. Nunca recibe su propia notificacion. */
  actorId: number;
  type: NotificationType;
  title: string;
  body: string;
  taskId?: number;
};

async function unreadCountFor(employeeId: number) {
  return prisma.notification.count({ where: { employeeId, readAt: null } });
}

async function emitNew(row: { employeeId: number } & Record<string, unknown>) {
  const unreadCount = await unreadCountFor(row.employeeId);
  emitToEmployees([row.employeeId], "notification:new", {
    notification: {
      id: row.id,
      type: row.type,
      title: row.title,
      body: row.body,
      taskId: row.taskId,
      readAt: row.readAt,
      createdAt: row.createdAt,
    },
    unreadCount,
  });
}

/**
 * Crea las filas y emite en una sola llamada. La regla de no auto-notificarse
 * vive aca y en ningun otro lado, para que no se olvide en un call site.
 */
export async function notify(input: NotifyInput) {
  const recipients = [...new Set(input.recipientIds)].filter((id) => id !== input.actorId);
  if (recipients.length === 0) return;

  // createMany no devuelve las filas y el payload del socket necesita el id.
  // Con pocos destinatarios, N creates en una transaccion es lo mas simple.
  const rows = await prisma.$transaction(
    recipients.map((employeeId) =>
      prisma.notification.create({
        data: {
          employeeId,
          type: input.type,
          title: input.title,
          body: input.body,
          taskId: input.taskId,
        },
        select: { ...NOTIFICATION_SELECT, employeeId: true },
      })
    )
  );

  for (const row of rows) {
    await emitNew(row as never);
  }
}

/**
 * Notificacion de mensaje nuevo, con colapso: si el destinatario ya tiene una
 * notificacion sin leer de esa misma tarea, se actualiza en vez de crear otra.
 * Sin esto, treinta mensajes seguidos son treinta filas en la campana.
 *
 * El canal GENERAL no notifica a proposito: spamearia a todo el equipo en cada
 * mensaje, y para eso ya esta el contador de no leidos del chat.
 */
export async function notifyNewMessage(options: {
  conversation: { id: number; kind: ConversationKind; taskId: number | null; title: string | null };
  recipientIds: number[];
  actorId: number;
  actorName: string;
  preview: string;
}) {
  const { conversation, actorId, actorName, preview } = options;

  if (conversation.kind !== "TASK" || !conversation.taskId) return;

  const recipients = [...new Set(options.recipientIds)].filter((id) => id !== actorId);
  if (recipients.length === 0) return;

  const title = conversation.title ?? "Tarea";
  const body = `${actorName}: ${preview.slice(0, 120)}`;

  for (const employeeId of recipients) {
    const existing = await prisma.notification.findFirst({
      where: {
        employeeId,
        type: "TASK_MESSAGE",
        taskId: conversation.taskId,
        readAt: null,
      },
      select: { id: true },
    });

    const row = existing
      ? await prisma.notification.update({
          where: { id: existing.id },
          data: { title, body, createdAt: new Date() },
          select: { ...NOTIFICATION_SELECT, employeeId: true },
        })
      : await prisma.notification.create({
          data: {
            employeeId,
            type: "TASK_MESSAGE",
            title,
            body,
            taskId: conversation.taskId,
          },
          select: { ...NOTIFICATION_SELECT, employeeId: true },
        });

    await emitNew(row as never);
  }
}
