import prisma from "../prisma/client";

/**
 * Working-day configuration and the timezone arithmetic the jobs run on.
 *
 * Everything here is computed in the CONFIGURED timezone, never in the server's.
 * Render runs in UTC, so a bare `new Date().getHours()` reports 20:30 when it is
 * 17:30 in Buenos Aires and the whole feature would fire three hours late.
 */

export type WorkdayConfig = {
  startTime: string;
  endTime: string;
  timezone: string;
  confirmationTimeoutSeconds: number;
  enabled: boolean;
};

export const WORKDAY_SETTINGS_ID = 1;

const DEFAULTS: WorkdayConfig = {
  startTime: "09:00",
  endTime: "17:30",
  timezone: "America/Argentina/Buenos_Aires",
  confirmationTimeoutSeconds: 120,
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
    startTime: row.startTime,
    endTime: row.endTime,
    timezone: row.timezone,
    confirmationTimeoutSeconds: row.confirmationTimeoutSeconds,
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

/** Monday to Friday. Weekends are skipped entirely, jobs included. */
export function isWorkingDay(weekday: number) {
  return weekday >= 1 && weekday <= 5;
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
