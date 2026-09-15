import { Router } from "express";
import prisma from "../prisma/client";
import { requireAuth } from "../auth/auth.middleware";
import { isAdmin } from "../auth/roles";
import { getWorkdayConfig, isCalendarDay } from "../scheduler/workday";

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

router.get("/settings", async (req, res) => {
  const config = await getWorkdayConfig();
  if (isAdmin(req.auth?.role)) return res.json(config);

  // The hours are everyone's; how the activity check is timed is the admin's.
  // Knowing the exact window is knowing how long a prompt can be ignored.
  const {
    confirmationDelayMinutes: _delay,
    confirmationTimeoutSeconds: _timeout,
    recheckIntervalMinutes: _recheck,
    ...visible
  } = config;
  res.json(visible);
});

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
