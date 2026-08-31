import { api } from "../../api";

export type WorkdaySettings = {
  workingWeekdays: number[];
  startTime: string;
  endTime: string;
  timezone: string;
  confirmationDelayMinutes: number;
  confirmationTimeoutSeconds: number;
  enabled: boolean;
};

export type WorkdayException = {
  /** "YYYY-MM-DD" as read in the configured timezone. */
  date: string;
  working: boolean;
  startTime: string | null;
  endTime: string | null;
  label: string | null;
};

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
