import { api } from "../../api";

export type WarningSource = "AUTO_LATE" | "MANUAL";

export type WarningEmployee = {
  id: number;
  employeeNumber: number;
  name: string;
};

export type Warning = {
  id: number;
  employeeId: number;
  source: WarningSource;
  reason: string;
  /** "YYYY-MM" and 1 | 2, only on automatic ones. */
  month: string | null;
  half: number | null;
  lateMinutes: number | null;
  tolerance: number | null;
  createdByName: string | null;
  createdAt: string;
  revokedAt: string | null;
  revokedByName: string | null;
  revokeReason: string | null;
  revokedBySystem: boolean;
};

export type TeamWarnings = {
  rows: (Warning & { employee: WarningEmployee })[];
  truncated: boolean;
};

/** The signed-in employee's own warnings. Open to every role. */
export function getMyWarnings() {
  return api<Warning[]>("/warnings/me");
}

export function getTeamWarnings(employeeId?: number) {
  return api<TeamWarnings>(`/warnings${employeeId ? `?employeeId=${employeeId}` : ""}`);
}

export function grantWarning(employeeId: number, reason: string) {
  return api<Warning>("/warnings", {
    method: "POST",
    body: JSON.stringify({ employeeId, reason }),
  });
}

export function revokeWarning(id: number, reason: string) {
  return api<Warning>(`/warnings/${id}/revoke`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

/** Active employees, for the grant dialog. */
export async function listEmployees() {
  const employees = await api<(WarningEmployee & { active: boolean })[]>("/admin/employees");
  return employees
    .filter((employee) => employee.active)
    .map(({ id, employeeNumber, name }) => ({ id, employeeNumber, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
