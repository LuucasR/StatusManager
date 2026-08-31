import { Router } from "express";
import PDFDocument from "pdfkit";
import prisma from "../prisma/client";
import { requireAdmin, requireAuth, requireStaff } from "../auth/auth.middleware";
import { renderActivityReport } from "../reports/activity-report";
import { emitStatusChanged, sendConfirmationRequest } from "../realtime";
import { changeStatusSchema } from "../activities/activity-validation";
import { hashPassword } from "../auth/auth.password";
import { approvePasswordReset } from "../auth/auth.service";
import { visibleHistoryWhere } from "../activities/activity-status";
import { WorkingTaskError, resolveWorkingTask } from "../activities/activity-task";
import { z } from "zod";
import { Role } from "@prisma/client";
import { LOCALE } from "../locale";
import {
  WORKDAY_SETTINGS_ID,
  isValidTimeOfDay,
  isValidTimeZone,
} from "../scheduler/workday";


const createEmployeeSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email(),
  password: z.string().min(8).max(72),
  role: z.nativeEnum(Role),
});

const changeRoleSchema = z.object({
  role: z.nativeEnum(Role),
});


const router = Router();

/**
 * requireAuth is global, but the level is decided PER ROUTE: a supervisor sees
 * the team and its reports, and the admin is the only one who touches accounts,
 * roles and other people's statuses. The whole router used to be requireAdmin.
 */
router.use(requireAuth);



router.get("/employees", requireStaff, async (_req, res) => {
  const employees = await prisma.employee.findMany({
    select: {
      id: true,
      employeeNumber: true,
      name: true,
      email: true,
      role: true,
      currentStatus: true,
      statusSince: true,
      active: true,

      activities: {
        where: {
          endedAt: null,
        },
        take: 1,
        select: {
          detail: true,
          taskTitle: true,
        },
      },
    },
    orderBy: {
      name: "asc",
    },
  });

  res.json(
    employees.map((employee) => {
      const open = employee.activities[0];
      return {
        id: employee.id,
        employeeNumber: employee.employeeNumber,
        name: employee.name,
        email: employee.email,
        role: employee.role,
        currentStatus: employee.currentStatus,
        statusSince: employee.statusSince,
        active: employee.active,
        // Same fallback as GET /activities/team: the comment stopped being
        // mandatory for WORKING, so without this the card would read "No detail"
        // for exactly everyone who is working.
        detail: open?.detail || open?.taskTitle || "",
        taskTitle: open?.taskTitle ?? null,
      };
    })
  );
});

router.get("/password-change-requests", requireAdmin, async (_req, res) => {
  const requests = await prisma.passwordChangeRequest.findMany({
    where: { status: "PENDING" },
    select: {
      id: true,
      createdAt: true,
      employee: {
        select: {
          id: true,
          employeeNumber: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  res.json(requests);
});

router.patch("/password-change-requests/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const decision = req.body?.decision;

  if (
    !Number.isInteger(id) ||
    (decision !== "APPROVED" && decision !== "REJECTED")
  ) {
    return res.status(400).json({ code: "INVALID_REQUEST_DECISION", message: "Invalid request or decision" });
  }

  const request = await prisma.passwordChangeRequest.findUnique({
    where: { id },
  });

  if (!request || request.status !== "PENDING") {
    return res.status(404).json({
      code: "REQUEST_ALREADY_RESOLVED", message: "That request does not exist or was already resolved",
    });
  }

  if (decision === "REJECTED") {
    await prisma.passwordChangeRequest.update({
      where: { id },
      data: { status: "REJECTED", resolvedAt: new Date() },
    });
    return res.json({ code: "REQUEST_REJECTED", message: "Request rejected" });
  }

  // Minted here, never stored in cleartext and never written to a log. It goes
  // out in this one response for the admin to read to the employee, who is then
  // forced to replace it on next login (mustChangePassword).
  //
  // The old flow instead saved the password the EMPLOYEE picked, unhashed, and
  // showed it on this same screen.
  const temporaryPassword = await approvePasswordReset(request.employeeId);

  await prisma.passwordChangeRequest.update({
    where: { id },
    data: { status: "APPROVED", resolvedAt: new Date() },
  });

  res.json({
    temporaryPassword,
    code: "TEMPORARY_PASSWORD_ISSUED",
    message:
      "Temporary password generated. Read it out to the employee: it will not be shown again.",
  });
});



router.get("/history", requireStaff, async (req, res) => {
  const employeeId = req.query.employeeId
    ? Number(req.query.employeeId)
    : undefined;

  const rows = await prisma.activityHistory.findMany({
    where: {
      ...visibleHistoryWhere,
      ...(Number.isFinite(employeeId) ? { employeeId } : {}),
    },
    include: {
      employee: {
        select: {
          employeeNumber: true,
          name: true,
        },
      },
    },
    orderBy: {
      startedAt: "desc",
    },
    take: 1000,
  });

  res.json(rows);
});

/**
 * Account created by an admin. Unlike POST /auth/register, the account is born
 * ACTIVE (there is nothing to approve: an admin made it) and with whichever
 * role they pick. The employee number is automatic, the next one free.
 */
router.post("/employees", requireAdmin, async (req, res) => {
  const parsed = createEmployeeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      code: "INVALID_INPUT",
      message: parsed.error.issues[0]?.message ?? "Check the details you entered",
    });
  }

  const email = parsed.data.email.toLowerCase();
  const taken = await prisma.employee.findUnique({ where: { email }, select: { id: true } });
  if (taken) {
    return res.status(409).json({ code: "EMAIL_TAKEN", message: "An account with that email already exists" });
  }

  try {
    const employee = await prisma.$transaction(async (tx) => {
      const last = await tx.employee.findFirst({
        orderBy: { employeeNumber: "desc" },
        select: { employeeNumber: true },
      });
      return tx.employee.create({
        data: {
          employeeNumber: (last?.employeeNumber ?? 999) + 1,
          name: parsed.data.name,
          email,
          password: await hashPassword(parsed.data.password),
          role: parsed.data.role,
          active: true,
        },
        select: {
          id: true,
          employeeNumber: true,
          name: true,
          email: true,
          role: true,
          active: true,
        },
      });
    });

    res.status(201).json(employee);
  } catch {
    // Race with another simultaneous sign-up on the same email or number.
    res.status(409).json({ code: "ACCOUNT_DUPLICATE", message: "Could not create the account: duplicate details" });
  }
});

/** Role change on an existing account. */
router.patch("/employees/:id/role", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ code: "INVALID_EMPLOYEE", message: "Invalid employee" });
  }

  const parsed = changeRoleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ code: "INVALID_ROLE", message: "Invalid role" });
  }

  // Changing your own role is the fastest way to lock yourself out, and since
  // requireAuth now reads the role from the database it takes effect on the very
  // next request rather than at the next login.
  if (id === req.auth!.employeeId) {
    return res.status(400).json({ code: "CANNOT_CHANGE_OWN_ROLE", message: "You cannot change your own role" });
  }

  const employee = await prisma.employee.findUnique({
    where: { id },
    select: { id: true, role: true },
  });
  if (!employee) {
    return res.status(404).json({ code: "EMPLOYEE_NOT_FOUND", message: "Employee not found" });
  }

  // Nobody may leave the system without administrators: with no admin there is
  // no way to create one again from inside the app.
  if (employee.role === Role.ADMIN && parsed.data.role !== Role.ADMIN) {
    const admins = await prisma.employee.count({ where: { role: Role.ADMIN, active: true } });
    if (admins <= 1) {
      return res
        .status(400)
        .json({ code: "LAST_ADMIN_ROLE", message: "You cannot remove the last active administrator" });
    }
  }

  const updated = await prisma.employee.update({
    where: { id },
    data: { role: parsed.data.role },
    select: { id: true, employeeNumber: true, name: true, email: true, role: true, active: true },
  });

  res.json(updated);
});

router.patch("/employees/:id/approve", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id)) {
    return res.status(400).json({
      code: "INVALID_EMPLOYEE", message: "Invalid employee",
    });
  }

  const employee = await prisma.employee.update({
    where: {
      id,
    },
    data: {
      active: true,
    },
    select: {
      id: true,
      employeeNumber: true,
      name: true,
      email: true,
      active: true,
    },
  });

  res.json(employee);
});

router.post("/employees/:id/request-confirmation", requireStaff, async (req, res) => {

  const employeeId = Number(req.params.id);

  if (!Number.isInteger(employeeId)) {
    return res.status(400).json({
      code: "INVALID_EMPLOYEE", message: "Invalid employee"
    });
  }

  const employee = await prisma.employee.findUnique({
    where: {
      id: employeeId
    },
    select: {
      id: true,
      name: true
    }
  });

  if (!employee) {
    return res.status(404).json({
      code: "EMPLOYEE_NOT_FOUND", message: "Employee not found"
    });
  }

  const sent = sendConfirmationRequest(employeeId);

  if (!sent) {
    return res.status(400).json({
      code: "EMPLOYEE_OFFLINE", message: "That employee is not connected."
    });
  }

  res.json({
    success: true
  });

});

router.post("/employees/:id/status", requireAdmin, async (req, res) => {
  const employeeId = Number(req.params.id);

  if (!Number.isInteger(employeeId)) {
    return res.status(400).json({
      code: "INVALID_EMPLOYEE", message: "Invalid employee",
    });
  }

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

  // The schema is shared with /activities/status, so this route also receives
  // taskId. It is validated against the TARGET employee: without that an admin
  // could book anyone's time against a task they do not take part in, and would
  // also store the taskId without its title snapshot.
  // `enforce: false`: fixing someone else's status must not be blocked by that
  // person's pending tasks.
  let task;
  try {
    task = await resolveWorkingTask({
      employeeId,
      status: parsed.data.status,
      detail: parsed.data.detail,
      taskId: parsed.data.taskId,
      enforce: false,
      now,
    });
  } catch (error) {
    if (error instanceof WorkingTaskError) {
      return res.status(400).json({ code: error.code, message: error.message });
    }
    throw error;
  }

  const employee = await prisma.$transaction(async (tx) => {
    await tx.activityHistory.updateMany({
      where: { employeeId, endedAt: null },
      data: { endedAt: now },
    });

    await tx.activityHistory.create({
      data: {
        employeeId,
        status: parsed.data.status,
        detail: parsed.data.detail,
        startedAt: now,
        taskId: task.taskId,
        taskTitle: task.taskTitle,
      },
    });

    return tx.employee.update({
      where: { id: employeeId },
      data: {
        currentStatus: parsed.data.status,
        statusSince: now,
      },
      select: {
        id: true,
        employeeNumber: true,
        name: true,
        currentStatus: true,
        statusSince: true,
      },
    });
  });

  emitStatusChanged(employee);
  res.json({ success: true, employee });
});


router.delete("/employees/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id)) {
    return res.status(400).json({
      code: "INVALID_EMPLOYEE", message: "Invalid employee",
    });
  }

  if (id === req.auth!.employeeId) {
    return res.status(400).json({
      code: "CANNOT_DELETE_SELF", message: "You cannot delete your own administrator account",
    });
  }

  const employee = await prisma.employee.findUnique({
    where: { id },
    select: { id: true, role: true },
  });

  if (!employee) {
    return res.status(404).json({
      code: "EMPLOYEE_NOT_FOUND", message: "Employee not found",
    });
  }

  // Same reason as the role change: with no admins there is no way to recover
  // administration from inside the app.
  if (employee.role === Role.ADMIN) {
    const admins = await prisma.employee.count({ where: { role: Role.ADMIN, active: true } });
    if (admins <= 1) {
      return res
        .status(400)
        .json({ code: "LAST_ADMIN_DELETE", message: "You cannot delete the last active administrator" });
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.activityHistory.deleteMany({
      where: { employeeId: id },
    });
    await tx.employee.delete({
      where: { id },
    });
  });

  res.json({
    success: true,
  });
});

router.get("/report.pdf", requireStaff, async (req, res) => {
  const employeeId = req.query.employeeId;

  const where: any = { ...visibleHistoryWhere };

  if (employeeId && employeeId !== "all") {
    where.employeeId = Number(employeeId);
  }

  const period = req.query.period as string | undefined;
const from = req.query.from as string | undefined;
const to = req.query.to as string | undefined;

if (period === "today") {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  where.startedAt = {
    gte: start,
  };
}

if (period === "last7") {
  const start = new Date();
  start.setDate(start.getDate() - 7);

  where.startedAt = {
    gte: start,
  };
}

if (from && to) {
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);

  const end = new Date(to);
  end.setHours(23, 59, 59, 999);

  where.startedAt = {
    gte: start,
    lte: end,
  };
}

  const rows = await prisma.activityHistory.findMany({
    where,
    include: {
      employee: {
        select: {
          employeeNumber: true,
          name: true,
        },
      },
    },
    orderBy: {
      startedAt: "desc",
    },
    take: 1000,
  });

  res.setHeader("Content-Type", "application/pdf");

  res.setHeader(
    "Content-Disposition",
    `inline; filename="activity-report-${new Date()
      .toISOString()
      .slice(0, 10)}.pdf"`
  );

  const doc = new PDFDocument({
    margin: 0,
    size: "A4",
  });

  doc.pipe(res);

  let periodLabel = "Full history";
  if (period === "today") periodLabel = "Today";
  if (period === "last7") periodLabel = "Last 7 days";
  if (from && to) {
    periodLabel = `${new Date(from).toLocaleDateString(LOCALE)} to ${new Date(to).toLocaleDateString(LOCALE)}`;
  }

  // The employee is looked up separately rather than from rows[0]: if during the
  // period they only had hidden records (Disconnected), rows is empty and the
  // subtitle would fall back to "Team overview" even though one employee is
  // filtered.
  const selectedEmployee = employeeId && employeeId !== "all"
    ? await prisma.employee.findUnique({
        where: { id: Number(employeeId) },
        select: { employeeNumber: true, name: true },
      })
    : undefined;

  renderActivityReport(doc, {
    title: "Activity report",
    subtitle: selectedEmployee
      ? `Employee #${selectedEmployee.employeeNumber} - ${selectedEmployee.name}`
      : "Team overview",
    periodLabel,
    rows,
  });
});

/**
 * Working-day automation settings. Admin-only, and the only supported way to
 * change when the end-of-day check and the task pause/resume run.
 *
 * Validated here rather than trusted from the row: the scheduler reads these
 * every minute, and a malformed time would otherwise silently disable a job.
 */
const workdaySettingsSchema = z
  .object({
    startTime: z
      .string()
      .refine(isValidTimeOfDay, "Start time must be HH:MM in 24-hour format"),
    endTime: z
      .string()
      .refine(isValidTimeOfDay, "End time must be HH:MM in 24-hour format"),
    timezone: z
      .string()
      .refine(isValidTimeZone, "That timezone is not recognised"),
    // Floor of 30s so nobody can set a window too short to notice, ceiling of
    // an hour because the timer is in-process and would not survive longer.
    confirmationTimeoutSeconds: z.number().int().min(30).max(3600),
    enabled: z.boolean(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "There are no changes to apply",
  });

router.get("/workday-settings", requireAdmin, async (_req, res) => {
  const settings = await prisma.workdaySettings.upsert({
    where: { id: WORKDAY_SETTINGS_ID },
    create: { id: WORKDAY_SETTINGS_ID },
    update: {},
  });
  res.json(settings);
});

router.patch("/workday-settings", requireAdmin, async (req, res) => {
  const parsed = workdaySettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      code: "VALIDATION_ERROR",
      message:
        parsed.error.issues[0]?.message ??
        "The working-day settings could not be validated",
    });
  }

  const settings = await prisma.workdaySettings.upsert({
    where: { id: WORKDAY_SETTINGS_ID },
    create: { id: WORKDAY_SETTINGS_ID, ...parsed.data },
    update: parsed.data,
  });

  // No restart needed: the scheduler re-reads this row on every tick.
  res.json(settings);
});

export default router;
