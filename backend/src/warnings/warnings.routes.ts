import { Router, type Response } from "express";
import { z } from "zod";
import prisma from "../prisma/client";
import { requireAdmin, requireAuth } from "../auth/auth.middleware";
import { notify } from "../notifications/notification.service";
import { emitWarningsChanged } from "./late-warning";

/**
 * Warnings: the automatic ones for late arrivals (see late-warning.ts) and the
 * ones an admin grants by hand.
 *
 * Everyone reads their OWN (GET /me); only an admin sees the team, grants or
 * revokes. As in attendance.routes.ts, /me is registered before requireAdmin.
 * Nothing is ever deleted: revoking stamps the row so the history stays whole.
 */
const router = Router();
router.use(requireAuth);

const HISTORY_TAKE = 1000;

const EMPLOYEE_SELECT = { id: true, employeeNumber: true, name: true } as const;

const WARNING_SELECT = {
  id: true,
  employeeId: true,
  source: true,
  reason: true,
  month: true,
  half: true,
  lateMinutes: true,
  tolerance: true,
  createdByName: true,
  createdAt: true,
  revokedAt: true,
  revokedByName: true,
  revokeReason: true,
  revokedBySystem: true,
} as const;

function validationError(res: Response, error: z.ZodError) {
  return res.status(400).json({
    code: "VALIDATION_ERROR",
    message: error.issues[0]?.message ?? "The warning could not be validated",
  });
}

async function nameOf(employeeId: number) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { name: true },
  });
  return employee?.name ?? null;
}

router.get("/me", async (req, res) => {
  const rows = await prisma.warning.findMany({
    where: { employeeId: req.auth!.employeeId },
    select: WARNING_SELECT,
    orderBy: { createdAt: "desc" },
  });
  res.json(rows);
});

// Everything below is the team view and the writes.
router.use(requireAdmin);

/** Every warning, newest first, optionally one person's. */
router.get("/", async (req, res) => {
  const employeeId = req.query.employeeId ? Number(req.query.employeeId) : undefined;
  if (employeeId !== undefined && !Number.isInteger(employeeId)) {
    return res.status(400).json({ code: "INVALID_EMPLOYEE", message: "Invalid employee" });
  }

  const rows = await prisma.warning.findMany({
    where: employeeId !== undefined ? { employeeId } : {},
    select: { ...WARNING_SELECT, employee: { select: EMPLOYEE_SELECT } },
    orderBy: { createdAt: "desc" },
    take: HISTORY_TAKE + 1,
  });

  res.json({
    rows: rows.slice(0, HISTORY_TAKE),
    truncated: rows.length > HISTORY_TAKE,
  });
});

const grantSchema = z.object({
  employeeId: z.number().int(),
  reason: z.string().trim().min(1, "The reason is required").max(500),
});

router.post("/", async (req, res) => {
  const parsed = grantSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);

  const { employeeId, reason } = parsed.data;
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, active: true },
  });
  if (!employee || !employee.active) {
    return res.status(404).json({ code: "EMPLOYEE_NOT_FOUND", message: "Employee not found" });
  }

  const actorId = req.auth!.employeeId;
  const warning = await prisma.warning.create({
    data: {
      employeeId,
      source: "MANUAL",
      reason,
      createdById: actorId,
      createdByName: await nameOf(actorId),
    },
    select: WARNING_SELECT,
  });

  await notify({
    recipientIds: [employeeId],
    actorId,
    type: "WARNING_GRANTED",
    title: "New warning",
    body: `You received a warning: ${reason.slice(0, 200)}`,
  });
  await emitWarningsChanged(employeeId);

  res.status(201).json(warning);
});

const revokeSchema = z.object({
  reason: z.string().trim().min(1, "The reason is required").max(500),
});

router.post("/:id/revoke", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(404).json({ code: "WARNING_NOT_FOUND", message: "Warning not found" });
  }

  const parsed = revokeSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);

  const existing = await prisma.warning.findUnique({
    where: { id },
    select: { employeeId: true, revokedAt: true },
  });
  if (!existing) {
    return res.status(404).json({ code: "WARNING_NOT_FOUND", message: "Warning not found" });
  }
  if (existing.revokedAt) {
    return res
      .status(409)
      .json({ code: "WARNING_ALREADY_REVOKED", message: "The warning is already revoked" });
  }

  const actorId = req.auth!.employeeId;
  const warning = await prisma.warning.update({
    where: { id },
    data: {
      revokedAt: new Date(),
      revokedById: actorId,
      revokedByName: await nameOf(actorId),
      revokeReason: parsed.data.reason,
      // An admin's revocation is final: a later save over the allowance must
      // not bring this one back (see decideLateWarning).
      revokedBySystem: false,
    },
    select: WARNING_SELECT,
  });

  await notify({
    recipientIds: [existing.employeeId],
    actorId,
    type: "WARNING_REVOKED",
    title: "Warning revoked",
    body: `One of your warnings was revoked: ${parsed.data.reason.slice(0, 200)}`,
  });
  await emitWarningsChanged(existing.employeeId);

  res.json(warning);
});

export default router;
