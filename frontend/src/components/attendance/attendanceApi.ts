import { api } from "../../api";

export type AttendanceEmployee = {
  id: number;
  employeeNumber: number;
  name: string;
};

export type AttendanceEntry = {
  id: number;
  employeeId: number;
  /** "YYYY-MM-DD". */
  date: string;
  /** "HH:MM" as typed. */
  arrivedAt: string;
  /** "HH:MM" the calendar said the day started at when this was saved. */
  expectedStart: string;
  lateMinutes: number;
  note: string | null;
};

export type AttendanceDay = {
  date: string;
  working: boolean;
  expectedStart: string | null;
  label: string | null;
  rows: { employee: AttendanceEmployee; entry: AttendanceEntry | null }[];
};

export type HalfSummary = {
  lateMinutes: number;
  lateDays: number;
  tolerance: number;
  exceeded: boolean;
};

export type AttendanceSummary = {
  month: string;
  firstHalf: { from: string; to: string; tolerance: number };
  secondHalf: { from: string; to: string; tolerance: number };
  rows: { employee: AttendanceEmployee; first: HalfSummary; second: HalfSummary }[];
};

export type AttendanceHistory = {
  rows: (AttendanceEntry & { employee: AttendanceEmployee })[];
  truncated: boolean;
};

export type MyAttendance = {
  month: string;
  firstHalf: { from: string; to: string; tolerance: number };
  secondHalf: { from: string; to: string; tolerance: number };
  entries: AttendanceEntry[];
  first: HalfSummary;
  second: HalfSummary;
};

/** The signed-in employee's own month. Open to every role. */
export function getMine(month: string) {
  return api<MyAttendance>(`/attendance/me?month=${month}`);
}

export function getDay(date: string) {
  return api<AttendanceDay>(`/attendance/day/${date}`);
}

export function saveEntry(date: string, employeeId: number, arrivedAt: string) {
  return api<AttendanceEntry>(`/attendance/${date}/${employeeId}`, {
    method: "PUT",
    body: JSON.stringify({ arrivedAt }),
  });
}

export function clearEntry(date: string, employeeId: number) {
  return api<{ success: true }>(`/attendance/${date}/${employeeId}`, {
    method: "DELETE",
  });
}

export function getSummary(month: string) {
  return api<AttendanceSummary>(`/attendance/summary?month=${month}`);
}

export function getHistory(filter: { from?: string; to?: string; employeeId?: number }) {
  const params = new URLSearchParams();
  if (filter.from) params.set("from", filter.from);
  if (filter.to) params.set("to", filter.to);
  if (filter.employeeId !== undefined) params.set("employeeId", String(filter.employeeId));
  const query = params.toString();
  return api<AttendanceHistory>(`/attendance/history${query ? `?${query}` : ""}`);
}
