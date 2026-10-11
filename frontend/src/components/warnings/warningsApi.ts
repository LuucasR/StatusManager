import { api } from "../../api";

export type WarningSource = "AUTO_LATE" | "MANUAL";

/** Automatic ones start PENDING until an admin grants (ACTIVE) or rejects them. */
export type WarningStatus = "ACTIVE" | "PENDING" | "REJECTED";

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
  /** Optional: older backends do not send it, and all theirs are ACTIVE. */
  status?: WarningStatus;
  /** Note the admin added when granting or rejecting. */
  adminComment?: string | null;
  reviewedByName?: string | null;
  reviewedAt?: string | null;
};

export const warningStatus = (warning: Warning): WarningStatus => warning.status ?? "ACTIVE";

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

/** Admin's decision on a pending automatic warning. The comment is optional. */
export function reviewWarning(id: number, decision: "approve" | "reject", comment: string) {
  return api<Warning>(`/warnings/${id}/${decision}`, {
    method: "POST",
    body: JSON.stringify(comment ? { comment } : {}),
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
