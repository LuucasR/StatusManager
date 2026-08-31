import { Router } from "express";
import PDFDocument from "pdfkit";
import { z } from "zod";
import prisma from "../prisma/client";
import { requireAuth } from "../auth/auth.middleware";
import { emitStatusChanged, confirmActivity } from "../realtime";
import { renderActivityReport } from "../reports/activity-report";
import { changeStatusSchema } from "./activity-validation";
import { overlappingWhere, visibleHistoryWhere } from "./activity-status";
import {
  WorkingTaskError,
  listAssignableTasks,
  resolveWorkingTask,
} from "./activity-task";
import { summarize } from "./activity-summary";
import { LOCALE } from "../locale";

const router = Router();
router.use(requireAuth);

/** Cap on the on-screen history. The client is told when it gets trimmed. */
const HISTORY_TAKE = 500;

/**
 * `new Date("2026-08-01")` is midnight UTC, not local: in Argentina the range
 * started the previous day at 21:00. The frontend sends full ISO strings with
 * an offset; here it is only validated, so that `?from=garbage` is a 400 and
 * not a Prisma 500 over an `Invalid Date`.
 */
const rangeSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

function parseRange(query: unknown) {
  return rangeSchema.safeParse(query);
}

/** Task fields that travel alongside a history segment. */
const HISTORY_TASK_INCLUDE = {
  select: { id: true, title: true, state: true },
} as const;

router.get("/me", async (req, res) => {
  const employee = await prisma.employee.findUnique({
    where: { id: req.auth!.employeeId },
    select: { id: true, employeeNumber: true, name: true, email: true, role: true, currentStatus: true, statusSince: true },
  });
  res.json(employee);
});

router.get("/team", async (_req, res) => {
  const employees = await prisma.employee.findMany({
    where: { active: true },
    select: {
      id: true,
      employeeNumber: true,
      name: true,
      role: true,
      currentStatus: true,
      statusSince: true,
      activities: {
        where: { endedAt: null },
        take: 1,
        select: { detail: true, taskTitle: true },
      },
    },
    orderBy: { name: "asc" },
  });

  res.json(
    employees.map((employee) => {
      const open = employee.activities[0];
      return {
        id: employee.id,
        employeeNumber: employee.employeeNumber,
        name: employee.name,
        role: employee.role,
        currentStatus: employee.currentStatus,
        statusSince: employee.statusSince,
        active: true,
        // No longer falls back to the task title: the card shows the declared
        // task on its own line now, so folding it in here printed it twice.
        detail: open?.detail ?? "",
        taskTitle: open?.taskTitle ?? null,
      };
    })
  );
});

/** Tasks the employee can declare when switching to Working. */
router.get("/assignable-tasks", async (req, res) => {
  res.json(await listAssignableTasks(req.auth!.employeeId));
});

router.get("/history", async (req, res) => {
  const range = parseRange(req.query);
  if (!range.success) {
    return res.status(400).json({ code: "INVALID_DATE_RANGE", message: "Invalid date range" });
  }
  const { from, to } = range.data;

  const rows = await prisma.activityHistory.findMany({
    where: {
      employeeId: req.auth!.employeeId,
      ...visibleHistoryWhere,
      ...overlappingWhere(from, to),
    },
    include: { task: HISTORY_TASK_INCLUDE },
    orderBy: { startedAt: "desc" },
    take: HISTORY_TAKE + 1,
  });

  // One extra row is fetched so the client can be TOLD it was trimmed: with a
  // silent cap, the table and the summary showed different totals for the same
  // range with no way to notice.
  const truncated = rows.length > HISTORY_TAKE;
  res.json({ rows: truncated ? rows.slice(0, HISTORY_TAKE) : rows, truncated });
});

/**
 * Aggregated summary for the period. Always the authenticated employee's: it
 * does NOT accept `employeeId`. There is no team summary, and adding the
 * parameter without a requireStaff would be a leak.
 */
router.get("/summary", async (req, res) => {
  const range = parseRange(req.query);
  if (!range.success) {
    return res.status(400).json({ code: "INVALID_DATE_RANGE", message: "Invalid date range" });
  }
  const { from, to } = range.data;

  const rows = await prisma.activityHistory.findMany({
    where: {
      employeeId: req.auth!.employeeId,
      ...visibleHistoryWhere,
      ...overlappingWhere(from, to),
    },
    include: {
      // No archive filter on purpose: the summary is history, not the board. If
      // it filtered by visibleTasksWhere, anything older than 14 days past the
      // task's end would show up with no participants and no state.
      task: {
        select: {
          id: true,
          title: true,
          state: true,
          startsAt: true,
          endsAt: true,
          description: true,
          createdBy: { select: { id: true, employeeNumber: true, name: true } },
          participants: {
            select: { employee: { select: { id: true, employeeNumber: true, name: true } } },
            orderBy: { addedAt: "asc" },
          },
        },
      },
    },
    orderBy: { startedAt: "desc" },
  });

  res.json({
    from: from ?? null,
    to: to ?? null,
    ...summarize(rows, from, to),
  });
});

router.get("/report.pdf", async (req, res) => {
  const range = parseRange(req.query);
  if (!range.success) {
    return res.status(400).json({ code: "INVALID_DATE_RANGE", message: "Invalid date range" });
  }
  const { from, to } = range.data;

  const employee = await prisma.employee.findUniqueOrThrow({ where: { id: req.auth!.employeeId } });
  const rows = await prisma.activityHistory.findMany({
    where: {
      employeeId: req.auth!.employeeId,
      ...visibleHistoryWhere,
      ...overlappingWhere(from, to),
    },
    orderBy: { startedAt: "desc" },
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", 'inline; filename="my-activity.pdf"');
  const doc = new PDFDocument({ margin: 0, size: "A4" });
  doc.pipe(res);
  const periodLabel = from || to
    ? `${from ? from.toLocaleDateString(LOCALE) : "Start"} to ${to ? to.toLocaleDateString(LOCALE) : "now"}`
    : "Full history";

  renderActivityReport(doc, {
    title: "My activity log",
    subtitle: `Employee #${employee.employeeNumber} - ${employee.name}`,
    periodLabel,
    rows: rows.map((row) => ({
      ...row,
      employee: {
        employeeNumber: employee.employeeNumber,
        name: employee.name,
      },
    })),
  });
});


router.post("/confirm-activity", async (req, res) => {
  const confirmed = confirmActivity(req.auth!.employeeId);

  if (!confirmed) {
    return res.status(400).json({
      code: "NO_PENDING_CONFIRMATION", message: "There is no pending confirmation."
    });
  }

  // Stamped in the database as well as cleared in memory. The closing job reads
  // this, not the in-memory map, so an answer survives a restart between the
  // prompt and the close - and it is what keeps this person's tasks off the
  // pause list.
  await prisma.employee.update({
    where: { id: req.auth!.employeeId },
    data: { lastConfirmedAt: new Date() },
  });

  res.json({ success: true });
});


router.post("/status", async (req, res) => {
  const parsed = changeStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      code: "INVALID_STATUS_CHANGE",
      message:
        parsed.error.issues[0]?.message ??
        "The status change could not be validated",
    });
  }

  const now = new Date();

  // Outside the transaction: these are reads, and if it rejects there is
  // nothing to undo. `enforce` only here - an admin is not bound by someone
  // else's task list.
  let task;
  try {
    task = await resolveWorkingTask({
      employeeId: req.auth!.employeeId,
      status: parsed.data.status,
      detail: parsed.data.detail,
      taskId: parsed.data.taskId,
      enforce: true,
      now,
    });
  } catch (error) {
    if (error instanceof WorkingTaskError) {
      return res.status(400).json({ code: error.code, message: error.message });
    }
    throw error;
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.activityHistory.updateMany({
      where: { employeeId: req.auth!.employeeId, endedAt: null },
      data: { endedAt: now },
    });
    const activity = await tx.activityHistory.create({
      data: {
        employeeId: req.auth!.employeeId,
        status: parsed.data.status,
        detail: parsed.data.detail,
        startedAt: now,
        taskId: task.taskId,
        taskTitle: task.taskTitle,
      },
    });
    const employee = await tx.employee.update({
      where: { id: req.auth!.employeeId },
      data: { currentStatus: parsed.data.status, statusSince: now },
      select: { id: true, employeeNumber: true, name: true, currentStatus: true, statusSince: true },
    });
    return { activity, employee };
  });
  emitStatusChanged(result.employee);
  res.status(201).json(result);
});

export default router;
