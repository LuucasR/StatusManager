import { Prisma, type WarningStatus } from "@prisma/client";
import prisma from "../prisma/client";
import { logger } from "../logger";
import { notify } from "../notifications/notification.service";
import { emitToEmployees } from "../realtime";
import { getWorkdayConfig, zonedNow } from "../scheduler/workday";
import { halfOf, halvesOf, summarize, type Half } from "../attendance/attendance";

/**
 * The automatic warning for going over a half-month's late allowance.
 *
 * At most one per employee per half (the unique key on month + half). It
 * follows the half both ways: an admin correcting an arrival can bring the half
 * back within the allowance, which revokes the warning on its own, and a later
 * save that goes over again brings that same warning back - but only if the
 * system revoked it. One an admin revoked by hand stays revoked.
 *
 * It is not given on its own: going over creates it PENDING and asks the
 * admins, who grant it (ACTIVE, the employee is told) or reject it. A rejected
 * one is asked about again only if the half keeps getting worse after the
 * rejection.
 */

export type ExistingLateWarning = {
  status: WarningStatus;
  revokedAt: Date | null;
  revokedBySystem: boolean;
  reviewedLateMinutes: number | null;
} | null;

export type LateWarningAction =
  | "create"
  | "reactivate"
  | "autoRevoke"
  | "update"
  | "updatePending"
  | "dropPending"
  | "reask"
  | "none";

/** Pure, so every transition can be tested without a database. */
export function decideLateWarning(
  exceeded: boolean,
  existing: ExistingLateWarning,
  lateMinutes = 0
): LateWarningAction {
  if (!existing) return exceeded ? "create" : "none";

  if (existing.status === "PENDING") return exceeded ? "updatePending" : "dropPending";
  if (existing.status === "REJECTED") {
    return exceeded && lateMinutes > (existing.reviewedLateMinutes ?? 0) ? "reask" : "none";
  }

  const active = existing.revokedAt === null;
  if (exceeded) {
    if (active) return "update";
    return existing.revokedBySystem ? "reactivate" : "none";
  }
  return active ? "autoRevoke" : "none";
}

export function lateWarningReason(
  month: string,
  half: Half,
  lateMinutes: number,
  tolerance: number
) {
  const range = half === 1 ? "1-15" : "16-end";
  return `${lateMinutes} late minutes in ${month} (${range}), over the ${tolerance}-minute allowance`;
}

/** Active administrators, who follow every warning on the Warnings page. */
export async function adminIds() {
  const admins = await prisma.employee.findMany({
    where: { role: "ADMIN", active: true },
    select: { id: true },
  });
  return admins.map((admin) => admin.id);
}

/** The employee's own page and every admin's refresh live. */
export async function emitWarningsChanged(employeeId: number) {
  emitToEmployees([employeeId, ...(await adminIds())], "warnings:changed", { employeeId });
}

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * Brings one half's automatic warning in line with the arrivals it has now.
 *
 * `actorId` is whoever caused the change (the admin who saved an arrival), and
 * is passed to notify() as usual; 0 means the system, so everyone is told.
 */
export async function syncLateWarningHalf(
  employeeId: number,
  month: string,
  half: Half,
  actorId: number
) {
  const halves = halvesOf(month);
  const range = half === 1 ? halves.first : halves.second;

  const [config, entries, existing] = await Promise.all([
    getWorkdayConfig(),
    prisma.attendanceEntry.findMany({
      where: { employeeId, date: { gte: range.from, lte: range.to } },
      select: { employeeId: true, date: true, lateMinutes: true },
    }),
    prisma.warning.findUnique({
      where: { employeeId_month_half: { employeeId, month, half } },
      select: {
        id: true,
        status: true,
        revokedAt: true,
        revokedBySystem: true,
        reviewedLateMinutes: true,
      },
    }),
  ]);

  const byHalf = summarize(entries, [employeeId], config).get(employeeId)!;
  const summary = half === 1 ? byHalf.first : byHalf.second;
  const action = decideLateWarning(summary.exceeded, existing, summary.lateMinutes);
  if (action === "none") return action;

  const snapshot = {
    reason: lateWarningReason(month, half, summary.lateMinutes, summary.tolerance),
    lateMinutes: summary.lateMinutes,
    tolerance: summary.tolerance,
  };

  switch (action) {
    case "create":
      try {
        await prisma.warning.create({
          data: { employeeId, source: "AUTO_LATE", status: "PENDING", month, half, ...snapshot },
        });
      } catch (error) {
        // Two saves racing for the same half: the other one created it.
        if (isUniqueViolation(error)) return "none";
        throw error;
      }
      await askAdmins(employeeId, snapshot.reason);
      await emitWarningsChanged(employeeId);
      return action;
    case "reask":
      // Rejected earlier, but the half has got worse since: back to the admins.
      await prisma.warning.update({
        where: { id: existing!.id },
        data: {
          ...snapshot,
          status: "PENDING",
          adminComment: null,
          reviewedAt: null,
          reviewedById: null,
          reviewedByName: null,
        },
      });
      await askAdmins(employeeId, snapshot.reason);
      await emitWarningsChanged(employeeId);
      return action;
    case "updatePending":
      await prisma.warning.update({ where: { id: existing!.id }, data: snapshot });
      await emitWarningsChanged(employeeId);
      return action;
    case "dropPending":
      // A correction brought the half back before anyone decided: there is
      // nothing left to decide, and the employee never knew about it.
      await prisma.warning.delete({ where: { id: existing!.id } });
      await emitWarningsChanged(employeeId);
      return action;
    case "reactivate":
      await prisma.warning.update({
        where: { id: existing!.id },
        data: {
          ...snapshot,
          revokedAt: null,
          revokedById: null,
          revokedByName: null,
          revokeReason: null,
          revokedBySystem: false,
        },
      });
      break;
    case "update":
      // Still over: only the numbers move, and nobody needs telling again.
      await prisma.warning.update({ where: { id: existing!.id }, data: snapshot });
      await emitWarningsChanged(employeeId);
      return action;
    case "autoRevoke":
      await prisma.warning.update({
        where: { id: existing!.id },
        data: {
          lateMinutes: summary.lateMinutes,
          tolerance: summary.tolerance,
          revokedAt: new Date(),
          revokedById: null,
          revokedByName: null,
          revokeReason: `Back within the allowance after a correction (${summary.lateMinutes}/${summary.tolerance} min)`,
          revokedBySystem: true,
        },
      });
      break;
  }

  await notify({
    recipientIds: [employeeId],
    actorId,
    ...(action === "autoRevoke"
      ? {
          type: "WARNING_REVOKED" as const,
          title: "Warning revoked",
          body: `Your late-arrival warning for ${month} was revoked: a correction brought you back within the allowance.`,
        }
      : {
          type: "LATE_WARNING" as const,
          title: "Late-arrival warning",
          body: `You received a warning: ${snapshot.reason}.`,
        }),
  });
  await emitWarningsChanged(employeeId);
  return action;
}

/**
 * Asks every admin whether the warning should be given. Sent as the system
 * (actor 0) so the admin who saved the arrival is asked too.
 */
async function askAdmins(employeeId: number, reason: string) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { name: true },
  });
  await notify({
    recipientIds: await adminIds(),
    actorId: 0,
    type: "LATE_WARNING_REVIEW",
    title: "Warning awaiting decision",
    body: `${employee?.name ?? "An employee"}: ${reason}. Grant it or reject it on the Warnings page.`,
  });
}

/**
 * Called after an arrival is saved or cleared. Never throws: the arrival is
 * already committed, and failing the request over the warning would make the
 * admin retry a save that worked.
 */
export async function syncLateWarning(employeeId: number, date: string, actorId: number) {
  try {
    await syncLateWarningHalf(employeeId, date.slice(0, 7), halfOf(date), actorId);
  } catch (error) {
    logger.error({ err: error, employeeId, date }, "Could not sync the late-arrival warning");
  }
}

/**
 * Re-evaluates both halves of a month for everyone who could have a warning in
 * it: anyone with arrivals there, plus anyone already holding one. Used when
 * the allowance changes (current month only) and by the backfill script.
 */
export async function syncLateWarningsForMonth(month: string, actorId: number) {
  const halves = halvesOf(month);
  const [entries, warnings] = await Promise.all([
    prisma.attendanceEntry.findMany({
      where: { date: { gte: halves.first.from, lte: halves.second.to } },
      select: { employeeId: true },
      distinct: ["employeeId"],
    }),
    prisma.warning.findMany({
      where: { source: "AUTO_LATE", month },
      select: { employeeId: true },
      distinct: ["employeeId"],
    }),
  ]);

  const employeeIds = new Set([...entries, ...warnings].map((row) => row.employeeId));
  for (const employeeId of employeeIds) {
    for (const half of [1, 2] as const) {
      try {
        await syncLateWarningHalf(employeeId, month, half, actorId);
      } catch (error) {
        logger.error({ err: error, employeeId, month, half }, "Could not sync the late-arrival warning");
      }
    }
  }
}

/** "YYYY-MM" today in the configured timezone. */
export async function currentMonth() {
  const config = await getWorkdayConfig();
  return zonedNow(config.timezone).day.slice(0, 7);
}
