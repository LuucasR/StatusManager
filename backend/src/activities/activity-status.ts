import { ActivityStatus, Prisma } from "@prisma/client";

/**
 * Statuses that show up live but are NOT recorded in the history or the
 * reports. "Disconnected" means the person is not there and there is nothing to
 * report, unlike "Away" (OFFLINE), which is a justified absence and does get
 * audited.
 *
 * AUTO_DISCONNECTED is deliberately NOT in this list. It is the outcome of the
 * end-of-day check, so hiding it would file the result of a control into the
 * one place the reports do not look.
 */
export const HIDDEN_FROM_HISTORY: readonly ActivityStatus[] = [
  ActivityStatus.DISCONNECTED,
];

/**
 * `where` fragment to spread into any ActivityHistory query that feeds a
 * history or a report. Uses `notIn` so that adding a hidden status to
 * HIDDEN_FROM_HISTORY is enough, without touching the queries.
 */
export const visibleHistoryWhere = {
  status: { notIn: [...HIDDEN_FROM_HISTORY] },
} satisfies Prisma.ActivityHistoryWhereInput;

/**
 * Statuses that require a comment of at least 3 characters.
 *
 * WORKING left this list once the task could be declared: the board already
 * says what someone is working on, and typing it again by hand was noise. The
 * comment becomes mandatory for WORKING again only when working WITHOUT a task
 * (see activity-task.ts): there it is the only detail left.
 */
export const statusesRequiringDetail = new Set<ActivityStatus>([
  ActivityStatus.OFFLINE,
]);

/** Statuses where declaring a task makes sense. */
export const statusesAllowingTask = new Set<ActivityStatus>([
  ActivityStatus.WORKING,
]);

/**
 * Segments that OVERLAP the range, not the ones that START inside it.
 *
 * Filtering by `startedAt: { gte: from }` misses the most common case of all:
 * the segment left open from before the range. Querying "today" at 09:05 with
 * the status set at 08:55 returned nothing, and the summary total silently
 * undercounted. The duration is clipped later, in segmentMs (activity-summary).
 */
export function overlappingWhere(
  from?: Date,
  to?: Date
): Prisma.ActivityHistoryWhereInput {
  const conditions: Prisma.ActivityHistoryWhereInput[] = [];
  // `to` is exclusive: the frontend sends local midnight of the next day.
  if (to) conditions.push({ startedAt: { lt: to } });
  if (from) conditions.push({ OR: [{ endedAt: null }, { endedAt: { gt: from } }] });
  return conditions.length ? { AND: conditions } : {};
}

/**
 * Labels and colours per status. Typing it as Record<ActivityStatus, ...> makes
 * the compiler demand exhaustiveness: adding a status to the enum without
 * adding it here stops compiling, instead of failing at runtime while
 * generating the PDF.
 */
export const STATUS_META: Record<
  ActivityStatus,
  { label: string; color: string; pale: string }
> = {
  AVAILABLE: { label: "Available", color: "#208454", pale: "#E5F6ED" },
  WORKING: { label: "Working", color: "#4C4DC9", pale: "#ECECFF" },
  BREAK: { label: "Break", color: "#A66A00", pale: "#FFF2D8" },
  LUNCH: { label: "Lunch", color: "#8C4EA3", pale: "#F5E9FA" },
  MEETING: { label: "Meeting", color: "#16738B", pale: "#E2F5F8" },
  OFFLINE: { label: "Away", color: "#666A7D", pale: "#ECEEF2" },
  DISCONNECTED: { label: "Disconnected", color: "#B23C4A", pale: "#FBE7EA" },
  AUTO_DISCONNECTED: { label: "Auto-disconnected", color: "#C2410C", pale: "#FDEBE0" },
};
