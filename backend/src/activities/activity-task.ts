import { ActivityStatus, Prisma, TaskState } from "@prisma/client";
import prisma from "../prisma/client";
import { visibleTasksWhere } from "../tasks/task-state";
import { statusesAllowingTask } from "./activity-status";

/** Error de regla de negocio: la ruta lo traduce a 400 con este mensaje. */
export class WorkingTaskError extends Error {}

/**
 * Tareas sobre las que un empleado puede declarar trabajo: las suyas, no
 * terminadas y todavia en la pizarra.
 *
 * Es la MISMA definicion que usa el selector (GET /activities/assignable-tasks)
 * y la que valida el POST. Si divergen, la UI ofrece opciones que el backend
 * rechaza.
 */
export function assignableTasksWhere(
  employeeId: number,
  now: Date = new Date()
): Prisma.TaskWhereInput {
  return {
    participants: { some: { employeeId } },
    // Terminada no se puede EMPEZAR a trabajar. Un tramo ya abierto sobre una
    // tarea que despues pasa a DONE sigue vivo a proposito: cerrarlo por detras
    // le borraria tiempo real a alguien.
    state: { not: TaskState.DONE },
    // visibleTasksWhere aporta un `OR`; el resto son claves planas, asi que
    // Prisma las ANDea sin pisarse.
    ...visibleTasksWhere(now),
  };
}

export function listAssignableTasks(employeeId: number, now: Date = new Date()) {
  return prisma.task.findMany({
    where: assignableTasksWhere(employeeId, now),
    select: { id: true, title: true, state: true, startsAt: true, endsAt: true },
    orderBy: [{ pinned: "desc" }, { startsAt: "asc" }, { id: "asc" }],
    take: 200,
  });
}

type ResolveInput = {
  employeeId: number;
  status: ActivityStatus;
  detail: string;
  taskId?: number | null;
  /**
   * true solo en el self-service. El admin corrige estados ajenos y no tiene
   * por que quedar trabado por las tareas de otro.
   */
  enforce: boolean;
  now?: Date;
};

/**
 * Valida la tarea declarada y devuelve lo que se persiste en el tramo.
 *
 * `taskTitle` es un snapshot deliberado: el FK es SetNull, asi que borrar una
 * tarea no puede llevarse puesto el tiempo que alguien le imputo, pero sin el
 * titulo el resumen quedaria mostrando un hueco.
 */
export async function resolveWorkingTask({
  employeeId,
  status,
  detail,
  taskId,
  enforce,
  now = new Date(),
}: ResolveInput): Promise<{ taskId: number | null; taskTitle: string | null }> {
  if (!statusesAllowingTask.has(status)) return { taskId: null, taskTitle: null };

  if (taskId != null) {
    const task = await prisma.task.findFirst({
      where: { id: taskId, ...assignableTasksWhere(employeeId, now) },
      select: { id: true, title: true },
    });
    if (!task) {
      throw new WorkingTaskError(
        "Esa tarea no está entre las tuyas, ya está terminada o salió de la pizarra"
      );
    }
    return { taskId: task.id, taskTitle: task.title };
  }

  if (!enforce) return { taskId: null, taskTitle: null };

  // Sin tarea hace falta decir en que se trabaja. Se exige solo si hay algo
  // para elegir: si no, alguien sin tareas asignadas no podria ni marcar que
  // esta trabajando.
  if (detail.length >= 3) return { taskId: null, taskTitle: null };

  const assignable = await prisma.task.count({
    where: assignableTasksWhere(employeeId, now),
  });
  if (assignable > 0) {
    throw new WorkingTaskError(
      "Elegí la tarea en la que vas a trabajar, o escribí un comentario de al menos 3 caracteres si es otro trabajo"
    );
  }

  return { taskId: null, taskTitle: null };
}
