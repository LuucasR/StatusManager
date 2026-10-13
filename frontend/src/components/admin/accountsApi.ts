import { api } from "../../api";
import type { Role } from "../roles";

/** PENDING is a sign-up waiting for approval; DEACTIVATED a reversible "baja". */
export type AccountStatus = "PENDING" | "ACTIVE" | "DEACTIVATED";

export type Account = {
  id: number;
  employeeNumber: number;
  name: string;
  email: string;
  role: Role;
  accountStatus: AccountStatus;
  createdAt: string;
  deactivatedAt: string | null;
};

export type PasswordRequest = {
  id: number;
  createdAt: string;
  employee: { id: number; employeeNumber: number; name: string; email: string };
};

export const listAccounts = () => api<Account[]>("/admin/employees");

export const listPasswordRequests = () =>
  api<PasswordRequest[]>("/admin/password-change-requests");

export const approveSignUp = (id: number) =>
  api(`/admin/employees/${id}/approve`, { method: "PATCH" });

export const rejectSignUp = (id: number) =>
  api(`/admin/employees/${id}/reject`, { method: "POST" });

export const deactivateAccount = (id: number) =>
  api(`/admin/employees/${id}/deactivate`, { method: "POST" });

export const reactivateAccount = (id: number) =>
  api(`/admin/employees/${id}/reactivate`, { method: "POST" });

export const deleteAccount = (id: number) =>
  api(`/admin/employees/${id}`, { method: "DELETE" });

/** On approval, the temporary password comes back once and is never stored. */
export const resolvePasswordRequest = (id: number, decision: "APPROVED" | "REJECTED") =>
  api<{ temporaryPassword?: string }>(`/admin/password-change-requests/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ decision }),
  });

/** What the sidebar badge counts: everything waiting on an admin. */
export async function pendingAccountRequests() {
  const [accounts, requests] = await Promise.all([listAccounts(), listPasswordRequests()]);
  return accounts.filter((account) => account.accountStatus === "PENDING").length + requests.length;
}
