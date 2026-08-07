import { Prisma } from "@prisma/client";

export const MESSAGE_SELECT = {
  id: true,
  body: true,
  createdAt: true,
  authorId: true,
  authorName: true,
  author: { select: { id: true, employeeNumber: true, name: true } },
} satisfies Prisma.MessageSelect;

type MessageRow = Prisma.MessageGetPayload<{ select: typeof MESSAGE_SELECT }>;

/**
 * El autor puede haber sido eliminado (authorId es SetNull), por eso se usa el
 * snapshot `authorName` como fuente del nombre y `author` solo aporta el numero
 * de legajo cuando la cuenta sigue viva.
 */
export function toMessageDto(message: MessageRow, conversationId: number) {
  return {
    id: message.id,
    conversationId,
    body: message.body,
    createdAt: message.createdAt,
    author: {
      id: message.author?.id ?? null,
      employeeNumber: message.author?.employeeNumber ?? null,
      name: message.authorName,
      deleted: message.author === null,
    },
  };
}

export type MessageDto = ReturnType<typeof toMessageDto>;
