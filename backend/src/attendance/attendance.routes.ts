import { Router } from "express";
import { z } from "zod";
import prisma from "../prisma/client";
import { requireAdmin, requireAuth } from "../auth/auth.middleware";
import {
  getWorkdayConfig,
  getWorkdayException,
  isCalendarDay,
  isValidTimeOfDay,
  resolveWorkday,
} from "../scheduler/workday";
import {
  formatTimeOfDay,
  halvesOf,
  isMonth,
  lateMinutes,
  summarize,
  weekdayOf,
} from "./attendance";
import { syncLateWarning } from "../warnings/late-warning";

/**
 * Arrival times, typed in by an admin day by day, and the half-month summary
 * they add up to.
 *
 * Two audiences: everyone can read their OWN month (GET /me), and only an admin
 * sees the team or writes anything. The /me route is registered before the
 * requireAdmin line on purpose - Express applies router.use to what follows it.
 */
const router = Router();
router.use(requireAuth);

const HISTORY_TAKE = 1000;

const EMPLOYEE_SELECT = { id: true, employeeNumber: true, name: true } as const;

const ENTRY_SELECT = {
  id: true,
  employeeId: true,
  date: true,
  arrivedAt: true,
  expectedStart: true,
  lateMinutes: true,
  note: true,
} as const;

function badMonth(res: import("express").Response) {
  return res.status(400).json({ code: "INVALID_MONTH", message: "The month must be YYYY-MM" });
}

/** The caller's own arrivals for a month, and both halves of their allowance. */
router.get("/me", async (req, res) => {
  const month = String(req.query.month ?? "");
  if (!isMonth(month)) return badMonth(res);

  const employeeId = req.auth!.employeeId;
  const halves = halvesOf(month);

  const [config, entries] = await Promise.all([
    getWorkdayConfig(),
    prisma.attendanceEntry.findMany({
      where: { employeeId, date: { gte: halves.first.from, lte: halves.second.to } },
      select: ENTRY_SELECT,
      orderBy: { date: "asc" },
    }),
  ]);

  const summary = summarize(entries, [employeeId], config).get(employeeId)!;

  res.json({
    month,
    firstHalf: { ...halves.first, tolerance: config.lateToleranceFirstHalfMinutes },
    secondHalf: { ...halves.second, tolerance: config.lateToleranceSecondHalfMinutes },
    entries,
    first: summary.first,
    second: summary.second,
  });
});

// Everything below is the team view and the writes.
router.use(requireAdmin);

/** Start of `date` per the calendar, exception included. */
async function expectedStartOf(date: string) {
  const [config, exception] = await Promise.all([
    getWorkdayConfig(),
    getWorkdayException(date),
  ]);
  const day = resolveWorkday(config, weekdayOf(date), exception);
  return { day, exception };
}

function badDate(res: import("express").Response) {
  return res.status(400).json({
    code: "INVALID_DATE",
    message: "The date must be a real YYYY-MM-DD day",
  });
}

/** Every active employee, with their entry for the day if there is one. */
router.get("/day/:date", async (req, res) => {
  const date = String(req.params.date);
  if (!isCalendarDay(date)) return badDate(res);

  const [{ day, exception }, employees, entries] = await Promise.all([
    expectedStartOf(date),
    prisma.employee.findMany({
      where: { active: true },
      select: EMPLOYEE_SELECT,
      orderBy: { name: "asc" },
    }),
    prisma.attendanceEntry.findMany({ where: { date } }),
  ]);

  const byEmployee = new Map(entries.map((entry) => [entry.employeeId, entry]));

  res.json({
    date,
    working: day.working,
    expectedStart: day.startMinutes === null ? null : formatTimeOfDay(day.startMinutes),
    label: exception?.label ?? null,
    rows: employees.map((employee) => ({
      employee,
      entry: byEmployee.get(employee.id) ?? null,
    })),
  });
});

const entrySchema = z.object({
  arrivedAt: z
    .string()
    .refine(isValidTimeOfDay, "The arrival time must be HH:MM in 24-hour format"),
  note: z.string().trim().max(200).nullable().optional(),
});

/** Upsert: typing the same day twice corrects it. */
router.put("/:date/:employeeId", async (req, res) => {
  const date = String(req.params.date);
  if (!isCalendarDay(date)) return badDate(res);

  const employeeId = Number(req.params.employeeId);
  if (!Number.isInteger(employeeId)) {
    return res.status(400).json({ code: "INVALID_EMPLOYEE", message: "Invalid employee" });
  }

  const parsed = entrySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      code: "VALIDATION_ERROR",
      message: parsed.error.issues[0]?.message ?? "The arrival time could not be validated",
    });
  }

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true },
  });
  if (!employee) {
    return res.status(404).json({ code: "EMPLOYEE_NOT_FOUND", message: "Employee not found" });
  }

  // Computed here, never trusted from the client: the snapshot is what the
  // half-month summary adds up.
  const { day } = await expectedStartOf(date);
  const data = {
    arrivedAt: parsed.data.arrivedAt,
    expectedStart:
      day.startMinutes === null ? "" : formatTimeOfDay(day.startMinutes),
    lateMinutes: lateMinutes(parsed.data.arrivedAt, day.startMinutes),
    note: parsed.data.note || null,
  };

  const entry = await prisma.attendanceEntry.upsert({
    where: { employeeId_date: { employeeId, date } },
    create: { employeeId, date, createdById: req.auth!.employeeId, ...data },
    update: data,
  });

  await syncLateWarning(employeeId, date, req.auth!.employeeId);

  res.json(entry);
});

router.delete("/:date/:employeeId", async (req, res) => {
  const date = String(req.params.date);
  if (!isCalendarDay(date)) return badDate(res);

  const employeeId = Number(req.params.employeeId);
  if (!Number.isInteger(employeeId)) {
    return res.status(400).json({ code: "INVALID_EMPLOYEE", message: "Invalid employee" });
  }

  // deleteMany: clearing a day that had no entry is a no-op, not a 404.
  await prisma.attendanceEntry.deleteMany({ where: { employeeId, date } });
  await syncLateWarning(employeeId, date, req.auth!.employeeId);
  res.json({ success: true });
});

/** Entries between two inclusive days, newest first, optionally one person's. */
router.get("/history", async (req, res) => {
  const from = req.query.from ? String(req.query.from) : undefined;
  const to = req.query.to ? String(req.query.to) : undefined;
  const employeeId = req.query.employeeId ? Number(req.query.employeeId) : undefined;

  if (
    (from !== undefined && !isCalendarDay(from)) ||
    (to !== undefined && !isCalendarDay(to)) ||
    (employeeId !== undefined && !Number.isInteger(employeeId))
  ) {
    return res.status(400).json({ code: "INVALID_DATE_RANGE", message: "Invalid date range" });
  }

  // Plain string comparison works: the day format is zero-padded and fixed width.
  const rows = await prisma.attendanceEntry.findMany({
    where: {
      ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      ...(employeeId !== undefined ? { employeeId } : {}),
    },
    include: { employee: { select: EMPLOYEE_SELECT } },
    orderBy: [{ date: "desc" }, { arrivedAt: "asc" }],
    take: HISTORY_TAKE + 1,
  });

  res.json({
    rows: rows.slice(0, HISTORY_TAKE),
    truncated: rows.length > HISTORY_TAKE,
  });
});

/** Both halves of a month for every active employee, plus anyone with entries. */
router.get("/summary", async (req, res) => {
  const month = String(req.query.month ?? "");
  if (!isMonth(month)) return badMonth(res);

  const halves = halvesOf(month);

  const [config, entries] = await Promise.all([
    getWorkdayConfig(),
    prisma.attendanceEntry.findMany({
      where: { date: { gte: halves.first.from, lte: halves.second.to } },
      select: { employeeId: true, date: true, lateMinutes: true },
    }),
  ]);

  // Someone deactivated mid-month still owes the days they were recorded for.
  const employees = await prisma.employee.findMany({
    where: {
      OR: [{ active: true }, { id: { in: [...new Set(entries.map((e) => e.employeeId))] } }],
    },
    select: EMPLOYEE_SELECT,
    orderBy: { name: "asc" },
  });

  const summary = summarize(
    entries,
    employees.map((employee) => employee.id),
    config
  );

  res.json({
    month,
    firstHalf: { ...halves.first, tolerance: config.lateToleranceFirstHalfMinutes },
    secondHalf: { ...halves.second, tolerance: config.lateToleranceSecondHalfMinutes },
    rows: employees.map((employee) => ({ employee, ...summary.get(employee.id)! })),
  });
});

export default router;
