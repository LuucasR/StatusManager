import { parseTimeOfDay, type WorkdayConfig } from "../scheduler/workday";

/**
 * Arrival-time arithmetic.
 *
 * Pure on purpose, like scheduler/workday.ts: dates here are "YYYY-MM-DD"
 * calendar days and times are "HH:MM", so nothing depends on the server's
 * timezone and every rule can be tested directly.
 *
 * The month is split in two halves - the 1st to the 15th and the 16th to the
 * last day - and each half has a TOTAL allowance of late minutes. It is a budget,
 * not a daily grace: two days ten and twenty minutes late spend thirty.
 */

export type Half = 1 | 2;

type Tolerances = Pick<
  WorkdayConfig,
  "lateToleranceFirstHalfMinutes" | "lateToleranceSecondHalfMinutes"
>;

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** "YYYY-MM" with a real month. */
export function isMonth(value: string) {
  return MONTH_PATTERN.test(value);
}

function lastDayOfMonth(year: number, month: number) {
  // Day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The two halves of a "YYYY-MM" month, as inclusive day ranges. */
export function halvesOf(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const last = String(lastDayOfMonth(year, monthNumber)).padStart(2, "0");
  return {
    first: { from: `${month}-01`, to: `${month}-15` },
    second: { from: `${month}-16`, to: `${month}-${last}` },
  };
}

/** Which half of its month a "YYYY-MM-DD" day falls in. */
export function halfOf(date: string): Half {
  return Number(date.slice(8, 10)) <= 15 ? 1 : 2;
}

/**
 * 0 = Sunday .. 6 = Saturday for a calendar day.
 *
 * Read at noon UTC so no offset can push it onto the neighbouring day.
 */
export function weekdayOf(date: string) {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

/** Minutes since midnight -> "HH:MM". */
export function formatTimeOfDay(minutes: number) {
  const hours = String(Math.floor(minutes / 60)).padStart(2, "0");
  return `${hours}:${String(minutes % 60).padStart(2, "0")}`;
}

/** Minutes after the day's start; arriving early or on time is 0. */
export function lateMinutes(arrivedAt: string, startMinutes: number | null) {
  const arrived = parseTimeOfDay(arrivedAt);
  if (arrived === null || startMinutes === null) return 0;
  return Math.max(0, arrived - startMinutes);
}

export function toleranceFor(half: Half, config: Tolerances) {
  return half === 1
    ? config.lateToleranceFirstHalfMinutes
    : config.lateToleranceSecondHalfMinutes;
}

export type HalfSummary = {
  lateMinutes: number;
  /** Days with at least one late minute. */
  lateDays: number;
  tolerance: number;
  /** Over the allowance. Spending it exactly is still within it. */
  exceeded: boolean;
};

/** Late minutes per employee per half, judged against the current tolerances. */
export function summarize(
  entries: { employeeId: number; date: string; lateMinutes: number }[],
  employeeIds: number[],
  config: Tolerances
) {
  const empty = (half: Half): HalfSummary => ({
    lateMinutes: 0,
    lateDays: 0,
    tolerance: toleranceFor(half, config),
    exceeded: false,
  });

  const byEmployee = new Map<number, { first: HalfSummary; second: HalfSummary }>();
  for (const id of employeeIds) byEmployee.set(id, { first: empty(1), second: empty(2) });

  for (const entry of entries) {
    const summary = byEmployee.get(entry.employeeId);
    if (!summary) continue;
    const half = halfOf(entry.date) === 1 ? summary.first : summary.second;
    half.lateMinutes += entry.lateMinutes;
    if (entry.lateMinutes > 0) half.lateDays += 1;
  }

  for (const summary of byEmployee.values()) {
    summary.first.exceeded = summary.first.lateMinutes > summary.first.tolerance;
    summary.second.exceeded = summary.second.lateMinutes > summary.second.tolerance;
  }

  return byEmployee;
}
