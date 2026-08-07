import type { ActivityStatus, TaskState } from "@prisma/client";

type Participant = { id: number; employeeNumber: number; name: string };

/** Forma minima que necesita la agregacion. Sin Prisma, para poder testearla. */
export type SummaryRow = {
  status: ActivityStatus;
  detail: string;
  startedAt: Date;
  endedAt: Date | null;
  taskId: number | null;
  taskTitle: string | null;
  task: {
    id: number;
    title: string;
    state: TaskState;
    startsAt: Date;
    endsAt: Date;
    description: string;
    createdBy: Participant | null;
    participants: { employee: Participant }[];
  } | null;
};

export type StatusBucket = {
  status: ActivityStatus;
  totalMs: number;
  segments: number;
};

export type TaskBucket = {
  /** Estable dentro del periodo: sirve de key en React. */
  key: string;
  taskId: number | null;
  title: string | null;
  /** El tramo apunta a una tarea que ya no existe: solo queda el snapshot. */
  deleted: boolean;
  totalMs: number;
  segments: number;
  /** Ultimo tramo del periodo sobre esta tarea, para fechar los integrantes. */
  lastWorkedAt: Date;
  task: {
    description: string;
    state: TaskState;
    startsAt: Date;
    endsAt: Date;
    participants: Participant[];
    createdBy: Participant | null;
  } | null;
};

/**
 * Duracion del tramo DENTRO del rango.
 *
 * `endedAt ?? now` a secas cuenta de mas cuando `to` esta en el pasado: un
 * tramo abierto desde anteayer sumaria hasta ahora y no hasta el fin del rango
 * pedido. Y recortar el inicio contra `from` es lo que hace que el tramo que
 * viene de antes del rango aporte solo su parte.
 */
export function segmentMs(
  row: Pick<SummaryRow, "startedAt" | "endedAt">,
  from: Date | undefined,
  to: Date | undefined,
  now: Date
) {
  const start = Math.max(row.startedAt.getTime(), from ? from.getTime() : -Infinity);
  const rawEnd = row.endedAt ? row.endedAt.getTime() : now.getTime();
  const end = Math.min(rawEnd, to ? to.getTime() : Infinity);
  return Math.max(0, end - start);
}

export type ActivitySummary = {
  totalMs: number;
  byStatus: StatusBucket[];
  byTask: TaskBucket[];
};

export function summarize(
  rows: SummaryRow[],
  from: Date | undefined,
  to: Date | undefined,
  now: Date = new Date()
): ActivitySummary {
  const statuses = new Map<ActivityStatus, StatusBucket>();
  const tasks = new Map<string, TaskBucket>();
  let totalMs = 0;

  for (const row of rows) {
    const ms = segmentMs(row, from, to, now);
    // Un tramo de 0 ms (o fuera del rango pese al filtro de solape) no aporta
    // tiempo, pero tampoco tiene por que inflar el contador de tramos.
    if (ms <= 0) continue;
    totalMs += ms;

    const status = statuses.get(row.status) ?? { status: row.status, totalMs: 0, segments: 0 };
    status.totalMs += ms;
    status.segments += 1;
    statuses.set(row.status, status);

    // Solo se agrupa por tarea lo que efectivamente declaro una. El resto del
    // tiempo ya esta contado en byStatus y no genera bucket "sin tarea": el
    // resumen de tareas responde "en que tareas trabaje", no "en que no".
    if (row.taskId == null && !row.taskTitle) continue;

    // Si la tarea fue borrada, el FK quedo en null y solo sobrevive el
    // snapshot del titulo: se agrupa por titulo para no colapsar todas las
    // tareas eliminadas del periodo en un mismo bucket.
    const key = row.taskId != null ? `id:${row.taskId}` : `title:${row.taskTitle}`;
    const bucket =
      tasks.get(key) ??
      ({
        key,
        taskId: row.taskId,
        title: row.task?.title ?? row.taskTitle,
        deleted: row.taskId == null,
        totalMs: 0,
        segments: 0,
        lastWorkedAt: row.startedAt,
        task: row.task
          ? {
              description: row.task.description,
              state: row.task.state,
              startsAt: row.task.startsAt,
              endsAt: row.task.endsAt,
              participants: row.task.participants.map((link) => link.employee),
              createdBy: row.task.createdBy,
            }
          : null,
      } satisfies TaskBucket);

    bucket.totalMs += ms;
    bucket.segments += 1;
    if (row.startedAt > bucket.lastWorkedAt) bucket.lastWorkedAt = row.startedAt;
    tasks.set(key, bucket);
  }

  return {
    totalMs,
    byStatus: [...statuses.values()].sort((a, b) => b.totalMs - a.totalMs),
    byTask: [...tasks.values()].sort((a, b) => b.totalMs - a.totalMs),
  };
}
