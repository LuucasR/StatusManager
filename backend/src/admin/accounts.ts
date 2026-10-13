import prisma from "../prisma/client";
import { notify } from "../notifications/notification.service";
import { emitAccountsChanged } from "../realtime";

export type AccountStatus = "PENDING" | "ACTIVE" | "DEACTIVATED";

/**
 * `active=false` used to mean only "sign-up waiting for approval". A
 * deactivated account shares that flag (so every `active: true` filter keeps
 * locking it out) and is told apart by `deactivatedAt`.
 */
export function accountStatus(employee: { active: boolean; deactivatedAt: Date | null }): AccountStatus {
  if (employee.active) return "ACTIVE";
  return employee.deactivatedAt ? "DEACTIVATED" : "PENDING";
}

/** Active admins: the ones who resolve account requests. */
export async function activeAdminIds() {
  const admins = await prisma.employee.findMany({
    where: { role: "ADMIN", active: true },
    select: { id: true },
  });
  return admins.map((admin) => admin.id);
}

/**
 * Both requests come from unauthenticated endpoints, so the requester is the
 * actor. Failures are swallowed by the caller: the request itself is already
 * stored and shows up in the Accounts tab regardless.
 */
export async function notifyAccountRequest(employee: { id: number; name: string; email: string }) {
  await notify({
    recipientIds: await activeAdminIds(),
    actorId: employee.id,
    type: "ACCOUNT_REQUEST",
    title: employee.name,
    body: `${employee.name} (${employee.email}) requested an account and needs your approval`,
  });
  emitAccountsChanged();
}

export async function notifyPasswordResetRequest(employee: { id: number; name: string }) {
  await notify({
    recipientIds: await activeAdminIds(),
    actorId: employee.id,
    type: "PASSWORD_RESET_REQUEST",
    title: employee.name,
    body: `${employee.name} forgot their password and asked for a reset`,
  });
  emitAccountsChanged();
}
