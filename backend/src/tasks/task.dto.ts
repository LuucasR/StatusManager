import { Prisma } from "@prisma/client";
import { taskArchivesAt } from "./task-state";

const EMPLOYEE_SUMMARY = {
  select: { id: true, employeeNumber: true, name: true },
} satisfies Prisma.EmployeeDefaultArgs;

/**
 * Forma que devuelve el listado del tablero. El hilo de la tarea vive en
 * Conversation/Message desde la fusion con el chat, pero el DTO sigue
 * exponiendo `commentsCount` y `comments` con la misma forma de antes para no
 * romper al frontend.
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

/** Forma del detalle: agrega el hilo de mensajes. */
export const TASK_DETAIL_INCLUDE = {
  ...TASK_INCLUDE,
  conversation: {
    select: {
      id: true,
      closed: true,
      _count: { select: { messages: true } },
      messages: {
        // Se corta a 100: lo anterior se pagina desde la ventana de chat, y
        // commentsCount sigue mostrando el total real.
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

/** Aplana participants para que el frontend no navegue `p.employee.name`. */
export function toTaskDto(task: TaskWithInclude | TaskWithDetail) {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    state: task.state,
    startsAt: task.startsAt,
    endsAt: task.endsAt,
    pinned: task.pinned,
    // Siempre calculado, incluso si esta fijada: el frontend lo necesita para
    // distinguir "fijada y vigente" de "fijada y ya pasada del corte", y para
    // que la constante de 14 dias viva en un solo lugar.
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
            // El autor puede haber sido eliminado (authorId es SetNull); el
            // nombre sale del snapshot para que el historial siga siendo legible.
            author: message.author ?? {
              id: 0,
              employeeNumber: 0,
              name: message.authorName,
            },
          }))
        : undefined,
  };
}
