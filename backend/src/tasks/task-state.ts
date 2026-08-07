import { Prisma, TaskState } from "@prisma/client";

/**
 * Dias que una tarea sigue en la pizarra despues de su fecha de fin. Pasado el
 * corte se "archiva": deja de listarse en GET /tasks, pero sigue existiendo,
 * sigue siendo accesible por GET /tasks/:id y sigue apareciendo en el reporte.
 * Fijar la tarea (pinned) la exceptua para siempre.
 */
export const TASK_ARCHIVE_AFTER_DAYS = 14;

const DAY_MS = 86_400_000;

/** Momento a partir del cual una tarea sin fijar deja de verse. */
export function taskArchiveCutoff(now: Date = new Date()) {
  return new Date(now.getTime() - TASK_ARCHIVE_AFTER_DAYS * DAY_MS);
}

/** Momento exacto en que esta tarea se archivara, si no la fijan. */
export function taskArchivesAt(endsAt: Date) {
  return new Date(endsAt.getTime() + TASK_ARCHIVE_AFTER_DAYS * DAY_MS);
}

/**
 * Fragmento de `where` para la pizarra. Es una FUNCION y no una const como
 * `visibleHistoryWhere`: el corte depende de `now`, y una const evaluada al
 * importar el modulo congelaria el corte al arranque del proceso.
 *
 * Ventana deslizante de 14x24h, sin normalizar a medianoche, para que el
 * predicado del backend y el chip "se archiva en N dias" del frontend sean
 * exactamente el mismo: visible <=> endsAt >= now - 14d <=> archivesAt >= now.
 *
 * OJO: no usar en GET /tasks/report.pdf. El reporte incluye las archivadas a
 * proposito; es el unico lugar donde se pueden ver.
 */
export function visibleTasksWhere(now: Date = new Date()) {
  return {
    OR: [{ endsAt: { gte: taskArchiveCutoff(now) } }, { pinned: true }],
  } satisfies Prisma.TaskWhereInput;
}

/**
 * Etiquetas y colores por estado para el PDF. Tipado Record<TaskState, ...>
 * para que agregar un estado al enum rompa la compilacion en vez de fallar en
 * runtime a mitad del stream. Los hex son los mismos de STATUS_META
 * (activities/activity-status.ts) para que los dos reportes se lean como el
 * mismo sistema.
 */
export const TASK_STATE_META: Record<
  TaskState,
  { label: string; color: string; pale: string }
> = {
  PENDING: { label: "Pendiente", color: "#666A7D", pale: "#ECEEF2" },
  IN_PROGRESS: { label: "En curso", color: "#4C4DC9", pale: "#ECECFF" },
  DONE: { label: "Terminada", color: "#208454", pale: "#E5F6ED" },
};
