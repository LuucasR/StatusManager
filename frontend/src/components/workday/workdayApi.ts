import { api } from "../../api";

/** Hours of one weekday, keyed "0" (Sunday) .. "6". */
export type WeekdaySchedule = Partial<Record<string, { start: string; end: string }>>;

export type WorkdaySettings = {
  workingWeekdays: number[];
  /** Global hours, used by any weekday without its own entry. */
  startTime: string;
  endTime: string;
  /** Per-weekday hours. Optional: older backends do not send it. */
  weekdaySchedule?: WeekdaySchedule | null;
  timezone: string;
  /*
   * The activity check's timing. Optional because GET /workday/settings only
   * sends these three to an admin.
   */
  confirmationDelayMinutes?: number;
  confirmationTimeoutSeconds?: number;
  /** Minutes between checks while someone is still working out of hours. */
  recheckIntervalMinutes?: number;
  enabled: boolean;
  /** Total late minutes allowed from the 1st to the 15th. */
  lateToleranceFirstHalfMinutes: number;
  /** Total late minutes allowed from the 16th to the end of the month. */
  lateToleranceSecondHalfMinutes: number;
};

export type WorkdayException = {
  /** "YYYY-MM-DD" as read in the configured timezone. */
  date: string;
  working: boolean;
  startTime: string | null;
  endTime: string | null;
  label: string | null;
};

/** The hours a weekday runs by: its own entry, else the global ones. */
export function hoursFor(settings: WorkdaySettings, weekday: number) {
  const own = settings.weekdaySchedule?.[String(weekday)];
  return { start: own?.start ?? settings.startTime, end: own?.end ?? settings.endTime };
}

/** "HH:MM" -> minutes since midnight, or null. */
export function minutesOf(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function getSettings() {
  return api<WorkdaySettings>("/workday/settings");
}

export function saveSettings(patch: Partial<WorkdaySettings>) {
  return api<WorkdaySettings>("/admin/workday-settings", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function listExceptions(from: string, to: string) {
  return api<WorkdayException[]>(`/workday/exceptions?from=${from}&to=${to}`);
}

export function saveException(
  date: string,
  entry: Omit<WorkdayException, "date">
) {
  return api<WorkdayException>(`/admin/workday-exceptions/${date}`, {
    method: "PUT",
    body: JSON.stringify(entry),
  });
}

export function clearException(date: string) {
  return api<{ success: true }>(`/admin/workday-exceptions/${date}`, {
    method: "DELETE",
  });
}

/**
 * Local calendar helpers.
 *
 * Every date here is a LOCAL day formatted by hand, never `toISOString()`.
 * toISOString converts to UTC first, so for anyone west of Greenwich it reports
 * the previous day for most of the evening - which would silently mark the wrong
 * date as a holiday.
 */
export function toDayKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Every cell of a month grid, padded to whole weeks starting on Sunday. */
export function monthGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  const cells: { date: Date; key: string; inMonth: boolean }[] = [];

  // Six rows always: a month can span six weeks, and a grid that changes height
  // as you page through the year is worse than one empty row.
  for (let i = 0; i < 42; i += 1) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    cells.push({ date, key: toDayKey(date), inMonth: date.getMonth() === month });
  }
  return cells;
}
