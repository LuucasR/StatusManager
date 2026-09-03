import prisma from "../prisma/client";

/**
 * Working-day configuration and the timezone arithmetic the jobs run on.
 *
 * Everything here is computed in the CONFIGURED timezone, never in the server's.
 * Render runs in UTC, so a bare `new Date().getHours()` reports 20:30 when it is
 * 17:30 in Buenos Aires and the whole feature would fire three hours late.
 */

export type WorkdayConfig = {
  /** 0 = Sunday .. 6 = Saturday. */
  workingWeekdays: number[];
  startTime: string;
  endTime: string;
  timezone: string;
  confirmationDelayMinutes: number;
  confirmationTimeoutSeconds: number;
  /** Minutes between checks while someone is still WORKING out of hours. */
  recheckIntervalMinutes: number;
  enabled: boolean;
};

/** One dated deviation, as the resolver needs it. */
export type WorkdayExceptionInput = {
  working: boolean;
  startTime: string | null;
  endTime: string | null;
};

export const WORKDAY_SETTINGS_ID = 1;

const DEFAULTS: WorkdayConfig = {
  workingWeekdays: [1, 2, 3, 4, 5],
  startTime: "09:00",
  endTime: "17:30",
  timezone: "America/Argentina/Buenos_Aires",
  confirmationDelayMinutes: 0,
  confirmationTimeoutSeconds: 120,
  recheckIntervalMinutes: 30,
  enabled: true,
};

/**
 * Reads the single settings row.
 *
 * Read-only on purpose. The migration seeds the row, so a missing one only
 * happens on a database restored from before this feature; falling back to the
 * defaults keeps the scheduler tick from racing a second instance on a write
 * every single minute. The admin routes are what create it if it is ever gone.
 */
export async function getWorkdayConfig(): Promise<WorkdayConfig> {
  const row = await prisma.workdaySettings.findUnique({
    where: { id: WORKDAY_SETTINGS_ID },
  });

  if (!row) return { ...DEFAULTS };
  return {
    workingWeekdays: row.workingWeekdays,
    startTime: row.startTime,
    endTime: row.endTime,
    timezone: row.timezone,
    confirmationDelayMinutes: row.confirmationDelayMinutes,
    confirmationTimeoutSeconds: row.confirmationTimeoutSeconds,
    recheckIntervalMinutes: row.recheckIntervalMinutes,
    enabled: row.enabled,
  };
}

export const WORKDAY_DEFAULTS = DEFAULTS;

/** "HH:MM" -> minutes since local midnight, or null when malformed. */
export function parseTimeOfDay(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function isValidTimeOfDay(value: string) {
  return parseTimeOfDay(value) !== null;
}

/** Whether Intl actually knows the zone, so a typo cannot be saved. */
export function isValidTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

export type ZonedNow = {
  /** YYYY-MM-DD in the configured zone. Doubles as the job's per-day key. */
  day: string;
  /** 0 = Sunday .. 6 = Saturday, in the configured zone. */
  weekday: number;
  /** Minutes since local midnight. */
  minutes: number;
};

/**
 * Current wall-clock date, weekday and minute in `timeZone`.
 *
 * `hourCycle: "h23"` rather than `hour12: false`, which in some runtimes reports
 * midnight as hour 24 and would push the day's minute count to 1440.
 */
export function zonedNow(timeZone: string, now: Date = new Date()): ZonedNow {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(now);

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";

  return {
    day: `${get("year")}-${get("month")}-${get("day")}`,
    weekday: WEEKDAY_INDEX[get("weekday")] ?? 0,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

/** The exception for one day, or null. Indexed lookup on the primary key. */
export async function getWorkdayException(day: string) {
  return prisma.workdayException.findUnique({ where: { date: day } });
}

export type ResolvedDay = {
  working: boolean;
  /** Minutes since local midnight, or null when the stored time is malformed. */
  startMinutes: number | null;
  endMinutes: number | null;
};

/**
 * What a given day actually is: open or closed, and between which hours.
 *
 * Pure on purpose - no database, no clock - because this is the rule the whole
 * feature turns on and it has to be testable directly.
 *
 * A dated exception BEATS the weekly pattern in both directions: it closes a
 * Tuesday for a holiday, and it opens a Saturday for a crunch day. Its times
 * are optional, so one row covers a holiday, a half day and an extra working
 * day without three different shapes.
 */
export function resolveWorkday(
  config: WorkdayConfig,
  weekday: number,
  exception: WorkdayExceptionInput | null
): ResolvedDay {
  const working = exception
    ? exception.working
    : config.workingWeekdays.includes(weekday);

  return {
    working,
    startMinutes: parseTimeOfDay(exception?.startTime ?? config.startTime),
    endMinutes: parseTimeOfDay(exception?.endTime ?? config.endTime),
  };
}

/** Last minute of a day, used to clamp derived times. */
const LAST_MINUTE = 23 * 60 + 59;

/**
 * When the "are you still working?" prompt goes out: the end of the day plus
 * the configured grace period.
 *
 * Clamped to 23:59 rather than allowed past midnight. The scheduler fires a job
 * once its minute has PASSED within the same local day, so a derived time of
 * 24:10 would simply never arrive and the day would never close. Running a
 * minute before midnight is wrong by minutes; not running at all leaves every
 * task in progress and everyone still marked as working.
 */
export function promptMinutes(day: ResolvedDay, config: WorkdayConfig) {
  if (day.endMinutes === null) return null;
  return Math.min(day.endMinutes + config.confirmationDelayMinutes, LAST_MINUTE);
}

/** When the unanswered checks are resolved and the board is paused. */
export function closeMinutes(day: ResolvedDay, config: WorkdayConfig) {
  const prompt = promptMinutes(day, config);
  if (prompt === null) return null;
  const timeout = Math.ceil(config.confirmationTimeoutSeconds / 60);
  return Math.min(prompt + timeout, LAST_MINUTE);
}

/**
 * Whether `minutes` falls outside the working hours of `day`.
 *
 * This is the window in which someone still marked as WORKING gets asked
 * whether they really are. Three cases, and the middle one is the one that is
 * easy to miss:
 *
 *  - A closed day (weekend, holiday) is off-hours end to end.
 *  - On an open day, AFTER the prompt time - the end of the day plus its grace
 *    period - which is where the old once-a-day check used to fire.
 *  - On an open day, BEFORE it starts. That is what makes the check survive
 *    midnight: at 02:00 on a Tuesday the calendar says Tuesday is a working
 *    day, but nobody's hours have begun, so somebody who has been "working"
 *    since Monday evening is still out of hours and still gets asked.
 *
 * Malformed times return false rather than true. An unusable configuration must
 * not read as "out of hours for everyone", which would prompt the whole roster
 * at once and auto-disconnect anybody who missed it.
 */
export function isOffHours(day: ResolvedDay, config: WorkdayConfig, minutes: number) {
  if (!day.working) return true;

  const prompt = promptMinutes(day, config);
  if (prompt === null || day.startMinutes === null) return false;

  return minutes >= prompt || minutes < day.startMinutes;
}

/**
 * Whether it is time to ask this employee again.
 *
 * Measured from the PROMPT and not from the answer, so the cadence stays on a
 * fixed grid: answering thirty seconds after being asked does not push the next
 * question thirty seconds later, and a slow answer cannot walk the schedule
 * forward all night.
 *
 * Never asked reads as due, which is also what makes the first prompt of an
 * evening need no special case: `lastPromptedAt` is either null or from a
 * previous stretch, and either way it is older than the interval.
 */
export function checkDue(
  lastPromptedAt: Date | null,
  intervalMinutes: number,
  now: Date = new Date()
) {
  if (!lastPromptedAt) return true;
  return now.getTime() - lastPromptedAt.getTime() >= intervalMinutes * 60_000;
}

/**
 * Whether an unanswered check has run out of time.
 *
 * An answer counts only when it came after the question: comparing the two
 * timestamps is what stops yesterday's confirmation from clearing today's
 * check. This is the database-backed twin of the in-process timer in
 * realtime.ts, which a restart inside the answer window would otherwise drop -
 * leaving somebody prompted forever and never resolved.
 */
export function checkExpired(
  lastPromptedAt: Date | null,
  lastConfirmedAt: Date | null,
  timeoutSeconds: number,
  now: Date = new Date()
) {
  if (!lastPromptedAt) return false;
  if (lastConfirmedAt && lastConfirmedAt >= lastPromptedAt) return false;
  return now.getTime() - lastPromptedAt.getTime() >= timeoutSeconds * 1000;
}

/** Human "DD/MM/YYYY at HH:MM" in the configured zone, for notification text. */
export function formatZoned(timeZone: string, at: Date = new Date()) {
  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(at);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(at);
  return { date, time };
}
