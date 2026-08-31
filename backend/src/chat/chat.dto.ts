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
 * The author may have been deleted (authorId is SetNull), which is why the
 * `authorName` snapshot is the source of the name and `author` only supplies
 * the employee number while the account is still alive.
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
