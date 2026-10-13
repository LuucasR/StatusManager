import { Prisma, TaskState } from "@prisma/client";

/**
 * Days a task stays on the board after its end date. Past the cutoff it is
 * "archived": it stops being listed by GET /tasks, but it still exists, is
 * still reachable through GET /tasks/:id and still appears in the report.
 * Pinning a task exempts it forever.
 */
export const TASK_ARCHIVE_AFTER_DAYS = 14;

const DAY_MS = 86_400_000;

/** Instant from which an unpinned task stops being visible. */
export function taskArchiveCutoff(now: Date = new Date()) {
  return new Date(now.getTime() - TASK_ARCHIVE_AFTER_DAYS * DAY_MS);
}

/**
 * Exact instant this task will be archived, if nobody pins it: the explicit
 * `archiveAt` (an admin's date, or a restore from the archive) or else 14 days
 * after its end.
 */
export function taskArchivesAt(task: { endsAt: Date; archiveAt: Date | null }) {
  return task.archiveAt ?? new Date(task.endsAt.getTime() + TASK_ARCHIVE_AFTER_DAYS * DAY_MS);
}

/** `archiveAt` a task restored from the archive gets: another 14 days on the board. */
export function restoredArchiveAt(now: Date = new Date()) {
  return new Date(now.getTime() + TASK_ARCHIVE_AFTER_DAYS * DAY_MS);
}

/**
 * `where` fragment for the board. It is a FUNCTION and not a const like
 * `visibleHistoryWhere`: the cutoff depends on `now`, and a const evaluated at
 * import time would freeze the cutoff at process start.
 *
 * A 14x24h sliding window, not normalised to midnight, so that the backend
 * predicate and the frontend's "archived in N days" chip are exactly the same:
 * visible <=> taskArchivesAt(task) >= now. Kept to a single `OR` so callers can
 * spread it next to flat keys.
 *
 * CAREFUL: do not use in GET /tasks/report.pdf. The report includes archived
 * tasks on purpose.
 */
export function visibleTasksWhere(now: Date = new Date()) {
  return {
    OR: [
      { archiveAt: null, endsAt: { gte: taskArchiveCutoff(now) } },
      { archiveAt: { gte: now } },
      { pinned: true },
    ],
  } satisfies Prisma.TaskWhereInput;
}

/** Exact complement of visibleTasksWhere: what the admin's archive lists. */
export function archivedTasksWhere(now: Date = new Date()) {
  return {
    pinned: false,
    OR: [
      { archiveAt: null, endsAt: { lt: taskArchiveCutoff(now) } },
      { archiveAt: { lt: now } },
    ],
  } satisfies Prisma.TaskWhereInput;
}

/**
 * Labels and colours per state for the PDF. Typed Record<TaskState, ...> so
 * that adding a state to the enum breaks compilation instead of failing at
 * runtime halfway through the stream. The hexes are the same as STATUS_META
 * (activities/activity-status.ts) so both reports read as the same system.
 */
export const TASK_STATE_META: Record<
  TaskState,
  { label: string; color: string; pale: string }
> = {
  PENDING: { label: "Pending", color: "#666A7D", pale: "#ECEEF2" },
  IN_PROGRESS: { label: "In progress", color: "#4C4DC9", pale: "#ECECFF" },
  DONE: { label: "Done", color: "#208454", pale: "#E5F6ED" },
};
