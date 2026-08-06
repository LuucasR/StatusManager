import { Prisma } from "@prisma/client";

const EMPLOYEE_SUMMARY = {
  select: { id: true, employeeNumber: true, name: true },
} satisfies Prisma.EmployeeDefaultArgs;

/** Forma que devuelve el listado del tablero: sin comentarios, solo el conteo. */
export const TASK_INCLUDE = {
  createdBy: EMPLOYEE_SUMMARY,
  participants: {
    select: { employee: EMPLOYEE_SUMMARY },
    orderBy: { addedAt: "asc" },
  },
  _count: { select: { comments: true } },
} satisfies Prisma.TaskInclude;

/** Forma del detalle: agrega el hilo completo de comentarios. */
export const TASK_DETAIL_INCLUDE = {
  ...TASK_INCLUDE,
  comments: {
    select: {
      id: true,
      body: true,
      createdAt: true,
      author: EMPLOYEE_SUMMARY,
    },
    orderBy: { createdAt: "asc" },
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
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    createdBy: task.createdBy,
    participants: task.participants.map((link) => link.employee),
    commentsCount: task._count.comments,
    comments:
      "comments" in task
        ? task.comments.map((comment) => ({
            id: comment.id,
            body: comment.body,
            createdAt: comment.createdAt,
            author: comment.author,
          }))
        : undefined,
  };
}
