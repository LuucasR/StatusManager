import { Prisma } from "@prisma/client";
import { taskArchivesAt } from "./task-state";

const EMPLOYEE_SUMMARY = {
  select: { id: true, employeeNumber: true, name: true },
} satisfies Prisma.EmployeeDefaultArgs;

/**
 * Shape returned by the board listing. The task thread has lived in
 * Conversation/Message since the merge with chat, but the DTO still exposes
 * `commentsCount` and `comments` in their previous shape so the frontend does
 * not break.
 */
export const TASK_INCLUDE = {
  createdBy: EMPLOYEE_SUMMARY,
  participants: {
    select: { employee: EMPLOYEE_SUMMARY },
    orderBy: { addedAt: "asc" },
  },
  conversation: {
    select: { id: true, closed: true, _count: { select: { messages: true } } },
  },
} satisfies Prisma.TaskInclude;

/** Detail shape: adds the message thread. */
export const TASK_DETAIL_INCLUDE = {
  ...TASK_INCLUDE,
  conversation: {
    select: {
      id: true,
      closed: true,
      _count: { select: { messages: true } },
      messages: {
        // Capped at 100: anything older is paged from the chat window, and
        // commentsCount still shows the real total.
        take: 100,
        orderBy: { id: "desc" },
        select: {
          id: true,
          body: true,
          createdAt: true,
          authorName: true,
          author: EMPLOYEE_SUMMARY,
        },
      },
    },
  },
} satisfies Prisma.TaskInclude;

type TaskWithInclude = Prisma.TaskGetPayload<{ include: typeof TASK_INCLUDE }>;
type TaskWithDetail = Prisma.TaskGetPayload<{ include: typeof TASK_DETAIL_INCLUDE }>;

/** Flattens participants so the frontend does not have to walk `p.employee.name`. */
export function toTaskDto(task: TaskWithInclude | TaskWithDetail) {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    state: task.state,
    startsAt: task.startsAt,
    endsAt: task.endsAt,
    pinned: task.pinned,
    // Always computed, even when pinned: the frontend needs it to tell
    // "pinned and current" from "pinned and already past the cutoff", and it
    // keeps the 14-day constant living in one place.
    archivesAt: taskArchivesAt(task.endsAt),
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    createdBy: task.createdBy,
    participants: task.participants.map((link) => link.employee),
    conversationId: task.conversation?.id ?? null,
    chatClosed: task.conversation?.closed ?? false,
    commentsCount: task.conversation?._count.messages ?? 0,
    comments:
      task.conversation && "messages" in task.conversation
        ? [...task.conversation.messages].reverse().map((message) => ({
            id: message.id,
            body: message.body,
            createdAt: message.createdAt,
            // The author may have been deleted (authorId is SetNull); the name
            // comes from the snapshot so the history stays readable.
            author: message.author ?? {
              id: 0,
              employeeNumber: 0,
              name: message.authorName,
            },
          }))
        : undefined,
  };
}
