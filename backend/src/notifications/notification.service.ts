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
  /** Who triggered the action. Never receives their own notification. */
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
 * Creates the rows and emits in a single call. The do-not-notify-yourself rule
 * lives here and nowhere else, so a call site cannot forget it.
 */
export async function notify(input: NotifyInput) {
  const recipients = [...new Set(input.recipientIds)].filter((id) => id !== input.actorId);
  if (recipients.length === 0) return;

  // createMany does not return the rows and the socket payload needs the id.
  // With few recipients, N creates inside one transaction is the simplest thing.
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
 * New-message notification, with collapsing: if the recipient already has an
 * unread notification for that same task, it is updated instead of creating
 * another. Without this, thirty messages in a row are thirty rows in the bell.
 *
 * The GENERAL channel deliberately does not notify: it would spam the whole
 * team on every message, and the chat's own unread counter already covers it.
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

  const title = conversation.title ?? "Task";
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
