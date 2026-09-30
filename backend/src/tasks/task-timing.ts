import type { Prisma, TaskState } from "@prisma/client";

/**
 * Real time a task spent in IN_PROGRESS.
 *
 * startsAt/endsAt on a task are the planned window - how long there is to do
 * it - and say nothing about how long it actually took. That comes from
 * TaskProgressSegment: a segment is opened every time the task enters
 * IN_PROGRESS (dragged there, resumed in the morning...) and closed when it
 * leaves it (paused, back to pending, done), so time outside the column never
 * counts.
 */

export type ProgressSegment = { startedAt: Date; endedAt: Date | null };

/** Sum of the segments; the open one counts up to `now`. */
export function progressMs(segments: ProgressSegment[], now: Date = new Date()) {
  return segments.reduce(
    (total, segment) =>
      total + Math.max(0, (segment.endedAt ?? now).getTime() - segment.startedAt.getTime()),
    0
  );
}

/** Start of the open segment, or null when the task is not in progress. */
export function inProgressSince(segments: ProgressSegment[]) {
  return segments.find((segment) => segment.endedAt == null)?.startedAt ?? null;
}

/**
 * Opens or closes the task's progress segment for a state change. Call it in
 * the SAME transaction as the state update, on every path that changes a
 * task's state. A no-op when the change does not cross IN_PROGRESS.
 */
export async function syncTaskProgress(
  tx: Prisma.TransactionClient,
  taskId: number,
  from: TaskState | null,
  to: TaskState,
  now: Date = new Date()
) {
  if (from === to) return;
  if (from === "IN_PROGRESS") {
    await tx.taskProgressSegment.updateMany({
      where: { taskId, endedAt: null },
      data: { endedAt: now },
    });
  }
  if (to === "IN_PROGRESS") {
    // Defensive: never leave two open segments for one task.
    await tx.taskProgressSegment.updateMany({
      where: { taskId, endedAt: null },
      data: { endedAt: now },
    });
    await tx.taskProgressSegment.create({ data: { taskId, startedAt: now } });
  }
}

/**
 * Bulk variants for the scheduler, which moves many tasks with updateMany.
 * Callers pass the ids they actually moved.
 */
export async function closeProgress(tx: Prisma.TransactionClient, taskIds: number[], now: Date) {
  if (taskIds.length === 0) return;
  await tx.taskProgressSegment.updateMany({
    where: { taskId: { in: taskIds }, endedAt: null },
    data: { endedAt: now },
  });
}

export async function openProgress(tx: Prisma.TransactionClient, taskIds: number[], now: Date) {
  if (taskIds.length === 0) return;
  await closeProgress(tx, taskIds, now);
  await tx.taskProgressSegment.createMany({
    data: taskIds.map((taskId) => ({ taskId, startedAt: now })),
  });
}

/** Include fragment that loads the segments `progressMs` needs. */
export const PROGRESS_SEGMENTS_SELECT = {
  select: { startedAt: true, endedAt: true },
  orderBy: { startedAt: "asc" },
} satisfies Prisma.Task$progressSegmentsArgs;
