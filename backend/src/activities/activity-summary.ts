import type { ActivityStatus, TaskState } from "@prisma/client";
import { addDays, zonedMidnight } from "../patch-notes/patch-week";
import { zonedNow } from "../scheduler/workday";
import type { WorkCalendar } from "../workday/work-calendar";

type Participant = { id: number; employeeNumber: number; name: string };

/** Minimum shape the aggregation needs. Prisma-free, so it can be tested. */
export type SummaryRow = {
  status: ActivityStatus;
  detail: string;
  startedAt: Date;
  endedAt: Date | null;
  taskId: number | null;
  taskTitle: string | null;
  checklistItemId?: number | null;
  checklistItemText?: string | null;
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

/** Time on one checklist item of a task. */
export type ItemBucket = {
  /** "item:<id>", "text:<snapshot>" once the item is gone, or "none". */
  key: string;
  itemId: number | null;
  /** null = time on the task without an item declared. */
  text: string | null;
  /** The item was removed from the checklist: only the snapshot is left. */
  deleted: boolean;
  totalMs: number;
  segments: number;
};

type ItemRef = { checklistItemId?: number | null; checklistItemText?: string | null };

/** Same keying idea as tasks: by id, by snapshot once deleted, else "none". */
function itemKey(row: ItemRef) {
  if (row.checklistItemId != null) return `item:${row.checklistItemId}`;
  if (row.checklistItemText) return `text:${row.checklistItemText}`;
  return "none";
}

/** Most time first, with "no item" always last whatever its size. */
function byTimeNoneLast<T extends { key: string }>(time: (bucket: T) => number) {
  return (a: T, b: T) => {
    if (a.key === "none") return 1;
    if (b.key === "none") return -1;
    return time(b) - time(a);
  };
}

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
  /** The task's time split per checklist item; adds up to totalMs. */
  byItem: ItemBucket[];
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
 *
 * With a `calendar`, only the part inside working hours counts: a status left
 * open overnight or over a weekend must not book those hours (work-calendar.ts).
 */
export function segmentMs(
  row: Pick<SummaryRow, "startedAt" | "endedAt">,
  from: Date | undefined,
  to: Date | undefined,
  now: Date,
  calendar?: WorkCalendar
) {
  const [start, end] = clippedRange(row, from, to, now);
  if (end <= start) return 0;
  return calendar ? calendar.overlapMs(start, end) : end - start;
}

/** [start, end) of the segment once clipped to the range; open ones run to `now`. */
function clippedRange(
  row: Pick<SummaryRow, "startedAt" | "endedAt">,
  from: Date | undefined,
  to: Date | undefined,
  now: Date
): [number, number] {
  const start = Math.max(row.startedAt.getTime(), from ? from.getTime() : -Infinity);
  const rawEnd = row.endedAt ? row.endedAt.getTime() : now.getTime();
  const end = Math.min(rawEnd, to ? to.getTime() : Infinity);
  return [start, end];
}

/**
 * Hours actually worked: only WORKING segments count. Break, lunch, meetings,
 * away and the like are logged time, not worked time, so they stay out of the
 * total that answers "how many hours did this person work".
 */
export function workedMs(
  rows: Pick<SummaryRow, "status" | "startedAt" | "endedAt">[],
  from: Date | undefined,
  to: Date | undefined,
  now: Date = new Date(),
  calendar?: WorkCalendar
) {
  return rows.reduce(
    (total, row) => (row.status === "WORKING" ? total + segmentMs(row, from, to, now, calendar) : total),
    0
  );
}

/**
 * Worked time split per calendar day ("YYYY-MM-DD" in `timeZone`), oldest
 * first. A segment that crosses midnight is split between both days.
 */
export function workedByDay(
  rows: Pick<SummaryRow, "status" | "startedAt" | "endedAt">[],
  from: Date | undefined,
  to: Date | undefined,
  timeZone: string,
  now: Date = new Date(),
  calendar?: WorkCalendar
): { day: string; ms: number }[] {
  const days = new Map<string, number>();
  for (const row of rows) {
    if (row.status !== "WORKING") continue;
    const [start, end] = clippedRange(row, from, to, now);
    if (calendar) {
      for (const piece of calendar.pieces(start, end)) {
        days.set(piece.day, (days.get(piece.day) ?? 0) + piece.ms);
      }
      continue;
    }
    let cursor = start;
    while (cursor < end) {
      const day = zonedNow(timeZone, new Date(cursor)).day;
      const next = zonedMidnight(addDays(day, 1), timeZone).getTime();
      const pieceEnd = Math.min(end, next);
      days.set(day, (days.get(day) ?? 0) + (pieceEnd - cursor));
      cursor = pieceEnd;
    }
  }
  return [...days.entries()]
    .map(([day, ms]) => ({ day, ms }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

/**
 * Worked time split per task, most time first. WORKING time with no declared
 * task gets its own bucket (taskId and title null) so the per-task lines add up
 * to the worked total. A deleted task is keyed by its title snapshot, like
 * summarize does.
 */
export type WorkedItem = { key: string; itemId: number | null; text: string | null; ms: number };
export type WorkedTask = {
  key: string;
  taskId: number | null;
  title: string | null;
  ms: number;
  /** Split per checklist item, same order rule as the tasks. Empty for "no task". */
  items: WorkedItem[];
};

export function workedByTask(
  rows: (Pick<SummaryRow, "status" | "startedAt" | "endedAt"> & {
    taskId?: number | null;
    taskTitle?: string | null;
  } & ItemRef)[],
  from: Date | undefined,
  to: Date | undefined,
  now: Date = new Date(),
  calendar?: WorkCalendar
): WorkedTask[] {
  const tasks = new Map<string, WorkedTask & { itemMap: Map<string, WorkedItem> }>();
  for (const row of rows) {
    if (row.status !== "WORKING") continue;
    const ms = segmentMs(row, from, to, now, calendar);
    if (ms <= 0) continue;
    const taskId = row.taskId ?? null;
    const title = row.taskTitle ?? null;
    const key = taskId != null ? `id:${taskId}` : title ? `title:${title}` : "none";
    const bucket = tasks.get(key) ?? { key, taskId, title, ms: 0, items: [], itemMap: new Map() };
    bucket.ms += ms;
    if (key !== "none") {
      const ikey = itemKey(row);
      const item = bucket.itemMap.get(ikey) ?? {
        key: ikey,
        itemId: row.checklistItemId ?? null,
        text: row.checklistItemText ?? null,
        ms: 0,
      };
      item.ms += ms;
      bucket.itemMap.set(ikey, item);
    }
    tasks.set(key, bucket);
  }
  return [...tasks.values()]
    .map(({ itemMap, ...task }) => ({
      ...task,
      items: [...itemMap.values()].sort(byTimeNoneLast((item) => item.ms)),
    }))
    .sort(byTimeNoneLast((task) => task.ms));
}

export type ActivitySummary = {
  /** Only WORKING time: the hours worked in the period. */
  workedMs: number;
  /** Every visible status added up (worked plus breaks, lunch, away...). */
  totalMs: number;
  byStatus: StatusBucket[];
  byTask: TaskBucket[];
};

export function summarize(
  rows: SummaryRow[],
  from: Date | undefined,
  to: Date | undefined,
  now: Date = new Date(),
  calendar?: WorkCalendar
): ActivitySummary {
  const statuses = new Map<ActivityStatus, StatusBucket>();
  const tasks = new Map<string, TaskBucket>();
  let totalMs = 0;
  let worked = 0;

  for (const row of rows) {
    const ms = segmentMs(row, from, to, now, calendar);
    // A 0 ms segment (or one outside the range despite the overlap filter) adds
    // no time, and should not inflate the segment counter either.
    if (ms <= 0) continue;
    totalMs += ms;
    if (row.status === "WORKING") worked += ms;

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
        byItem: [],
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

    const ikey = itemKey(row);
    let item = bucket.byItem.find((candidate) => candidate.key === ikey);
    if (!item) {
      item = {
        key: ikey,
        itemId: row.checklistItemId ?? null,
        text: row.checklistItemText ?? null,
        deleted: row.checklistItemId == null && !!row.checklistItemText,
        totalMs: 0,
        segments: 0,
      };
      bucket.byItem.push(item);
    }
    item.totalMs += ms;
    item.segments += 1;
  }

  for (const bucket of tasks.values()) bucket.byItem.sort(byTimeNoneLast((item) => item.totalMs));

  return {
    workedMs: worked,
    totalMs,
    byStatus: [...statuses.values()].sort((a, b) => b.totalMs - a.totalMs),
    byTask: [...tasks.values()].sort((a, b) => b.totalMs - a.totalMs),
  };
}

/** Minimum shape teamTaskTimes needs. Prisma-free, like SummaryRow. */
export type TeamTimeRow = {
  employeeId: number;
  employee: { name: string };
  startedAt: Date;
  endedAt: Date | null;
  taskId: number | null;
  taskTitle: string | null;
  task: { title: string; state: TaskState } | null;
};

export type TeamTaskTime = {
  /** Same keying as TaskBucket.key: by id, or by title once the task is gone. */
  key: string;
  taskId: number | null;
  title: string;
  state: TaskState | null;
  totalMs: number;
  /** Who booked the time, most time first. */
  byEmployee: { id: number; name: string; ms: number }[];
};

/**
 * Time the whole team booked per task in the range, split by person.
 *
 * The rows are expected to be WORKING segments already: this answers "who
 * worked on what and for how long", so the caller filters the status. Unlike
 * `summarize` it is not scoped to one employee - route it behind requireStaff.
 */
export function teamTaskTimes(
  rows: TeamTimeRow[],
  from: Date | undefined,
  to: Date | undefined,
  now: Date = new Date(),
  calendar?: WorkCalendar
): TeamTaskTime[] {
  const tasks = new Map<string, TeamTaskTime & { people: Map<number, { id: number; name: string; ms: number }> }>();

  for (const row of rows) {
    if (row.taskId == null && !row.taskTitle) continue;
    const ms = segmentMs(row, from, to, now, calendar);
    if (ms <= 0) continue;

    const key = row.taskId != null ? `id:${row.taskId}` : `title:${row.taskTitle}`;
    const bucket =
      tasks.get(key) ?? {
        key,
        taskId: row.taskId,
        title: row.task?.title ?? row.taskTitle ?? "",
        state: row.task?.state ?? null,
        totalMs: 0,
        byEmployee: [],
        people: new Map(),
      };

    bucket.totalMs += ms;
    const person = bucket.people.get(row.employeeId) ?? { id: row.employeeId, name: row.employee.name, ms: 0 };
    person.ms += ms;
    bucket.people.set(row.employeeId, person);
    tasks.set(key, bucket);
  }

  return [...tasks.values()]
    .map(({ people, ...bucket }) => ({
      ...bucket,
      byEmployee: [...people.values()].sort((a, b) => b.ms - a.ms),
    }))
    .sort((a, b) => b.totalMs - a.totalMs);
}
