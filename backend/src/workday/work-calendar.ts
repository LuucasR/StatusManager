import prisma from "../prisma/client";
import { weekdayOf } from "../attendance/attendance";
import { addDays, zonedMidnight } from "../patch-notes/patch-week";
import {
  getWorkdayConfig,
  resolveWorkday,
  zonedNow,
  type WorkdayConfig,
  type WorkdayExceptionInput,
} from "../scheduler/workday";

/**
 * The working hours as instants, so a stretch of time can be measured against
 * them.
 *
 * Every hour count (the summary, the activity report, the patch notes' team
 * times, a task's real time) used to be the raw wall-clock length of the
 * segment. A segment stays open until somebody changes status, so anyone left
 * "Working" overnight or over a weekend - the check failed to reach them, the
 * server was asleep, they answered it from bed - booked every hour of it, and a
 * task left In progress did the same. Weeks of 37 scheduled hours came out with
 * tasks at 244. Measuring only the part of each segment that falls inside the
 * calendar's hours (per weekday, with the dated exceptions) puts a hard ceiling
 * on it: nobody can book more than the schedule.
 *
 * Pure apart from `loadWorkCalendar`, so the rules can be tested directly.
 */
export type WorkCalendar = {
  /** Parts of [start, end) inside working hours, per local day, oldest first. */
  pieces(start: number, end: number): { day: string; ms: number }[];
  /** How much of [start, end) falls inside working hours. */
  overlapMs(start: number, end: number): number;
  /** Whether `at` is inside working hours. */
  isWorkingAt(at: number): boolean;
};

type DayWindow = {
  /** Local midnight that opens the day, and the one that opens the next. */
  dayStart: number;
  dayEnd: number;
  /** Working hours of the day; start === end on a closed day. */
  start: number;
  end: number;
};

/** A month of days is ~30 iterations; this only guards a corrupt input. */
const MAX_DAYS = 20_000;

export function createWorkCalendar(
  config: Pick<WorkdayConfig, "workingWeekdays" | "startTime" | "endTime" | "weekdaySchedule" | "timezone">,
  exceptions: ReadonlyMap<string, WorkdayExceptionInput>
): WorkCalendar {
  const timeZone = config.timezone;
  // Every segment of a period lands on the same handful of days.
  const cache = new Map<string, DayWindow>();

  const windowOf = (day: string): DayWindow => {
    const cached = cache.get(day);
    if (cached) return cached;

    const dayStart = zonedMidnight(day, timeZone).getTime();
    const dayEnd = zonedMidnight(addDays(day, 1), timeZone).getTime();
    const resolved = resolveWorkday(config as WorkdayConfig, weekdayOf(day), exceptions.get(day) ?? null);

    let start = dayStart;
    let end = dayStart;
    if (
      resolved.working &&
      resolved.startMinutes !== null &&
      resolved.endMinutes !== null &&
      resolved.endMinutes > resolved.startMinutes
    ) {
      start = dayStart + resolved.startMinutes * 60_000;
      end = Math.min(dayEnd, dayStart + resolved.endMinutes * 60_000);
    }

    const window = { dayStart, dayEnd, start, end };
    cache.set(day, window);
    return window;
  };

  const pieces = (start: number, end: number) => {
    const out: { day: string; ms: number }[] = [];
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return out;

    let day = zonedNow(timeZone, new Date(start)).day;
    for (let guard = 0; guard < MAX_DAYS; guard += 1) {
      const window = windowOf(day);
      if (window.dayStart >= end) break;
      const ms = Math.min(end, window.end) - Math.max(start, window.start);
      if (ms > 0) out.push({ day, ms });
      day = addDays(day, 1);
    }
    return out;
  };

  return {
    pieces,
    overlapMs: (start, end) => pieces(start, end).reduce((total, piece) => total + piece.ms, 0),
    isWorkingAt: (at) => {
      const window = windowOf(zonedNow(timeZone, new Date(at)).day);
      return at >= window.start && at < window.end;
    },
  };
}

/** The configured calendar: settings plus every dated exception (a small table). */
export async function loadWorkCalendar(): Promise<WorkCalendar> {
  const [config, rows] = await Promise.all([
    getWorkdayConfig(),
    prisma.workdayException.findMany({
      select: { date: true, working: true, startTime: true, endTime: true },
    }),
  ]);
  return createWorkCalendar(config, new Map(rows.map(({ date, ...exception }) => [date, exception])));
}
