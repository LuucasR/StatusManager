import { Router } from "express";
import prisma from "../prisma/client";
import { requireAuth } from "../auth/auth.middleware";
import { getWorkdayConfig } from "../scheduler/workday";

/**
 * Read-only view of the working calendar, for everyone.
 *
 * The whole team is subject to these hours - the board is paused and people are
 * asked to confirm on their strength - so everyone can see them. Only an admin
 * changes them, and those endpoints stay on the /admin router behind
 * requireAdmin.
 *
 * The GET here deliberately does NOT upsert the settings row the way the admin
 * one does: reading a page should never create configuration. getWorkdayConfig
 * already falls back to the defaults when the row is missing.
 */
const router = Router();
router.use(requireAuth);

router.get("/settings", async (_req, res) => {
  res.json(await getWorkdayConfig());
});

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDay(value: string) {
  if (!DAY_PATTERN.test(value)) return false;
  // Round-tripping catches 2026-02-30, which Date happily rolls into March.
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

router.get("/exceptions", async (req, res) => {
  const from = String(req.query.from ?? "");
  const to = String(req.query.to ?? "");

  if (!isCalendarDay(from) || !isCalendarDay(to)) {
    return res.status(400).json({
      code: "INVALID_DATE_RANGE",
      message: "Invalid date range",
    });
  }

  // Plain string comparison works because the format is zero-padded and fixed
  // width, which is one of the reasons the date is stored as text.
  const rows = await prisma.workdayException.findMany({
    where: { date: { gte: from, lte: to } },
    orderBy: { date: "asc" },
  });

  res.json(rows);
});

export default router;
