import type { ActivityStatus, TaskState } from "@prisma/client";

type Participant = { id: number; employeeNumber: number; name: string };

/** Minimum shape the aggregation needs. Prisma-free, so it can be tested. */
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
  /** Stable within the period: usable as a React key. */
  key: string;
  taskId: number | null;
  title: string | null;
  /** The segment points at a task that no longer exists: only the snapshot is left. */
  deleted: boolean;
  totalMs: number;
  segments: number;
  /** Last segment of the period on this task, used to date the participants. */
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
 * Duration of the segment INSIDE the range.
 *
 * A bare `endedAt ?? now` overcounts when `to` is in the past: a segment left
 * open since the day before yesterday would add up to now instead of to the end
 * of the requested range. And clipping the start against `from` is what makes a
 * segment coming from before the range contribute only its share.
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
    // A 0 ms segment (or one outside the range despite the overlap filter) adds
    // no time, and should not inflate the segment counter either.
    if (ms <= 0) continue;
    totalMs += ms;

    const status = statuses.get(row.status) ?? { status: row.status, totalMs: 0, segments: 0 };
    status.totalMs += ms;
    status.segments += 1;
    statuses.set(row.status, status);

    // Only work that actually declared a task is grouped by task. The rest of
    // the time is already counted in byStatus and gets no "no task" bucket: the
    // task summary answers "which tasks did I work on", not "which did I not".
    if (row.taskId == null && !row.taskTitle) continue;

    // If the task was deleted the FK went null and only the title snapshot
    // survives: grouping by title avoids collapsing every deleted task in the
    // period into a single bucket.
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
