import { Router, type Request, type Response } from "express";
import { PatchCategory, PatchWeekStatus, Prisma } from "@prisma/client";
import PDFDocument from "pdfkit";
import { z } from "zod";
import prisma from "../prisma/client";
import { requireAuth, requireStaff } from "../auth/auth.middleware";
import { isStaff } from "../auth/roles";
import { getWorkdayConfig } from "../scheduler/workday";
import { overlappingWhere } from "../activities/activity-status";
import { teamTaskTimes } from "../activities/activity-summary";
import { emitPatchNotesChanged } from "../realtime";
import { renderPatchNotesReport } from "../reports/patch-notes-report";
import { addDays, currentWeekStart, isWeekStart, weekRange } from "./patch-week";

/**
 * Weekly patch notes.
 *
 * Everyone reads every week and writes their own entries while the week is a
 * DRAFT. Staff (admin or supervisor) edit anyone's entries until the week is
 * PUBLISHED, run the DRAFT -> CLOSED -> PUBLISHED workflow, see the team's time
 * per task and download the PDF. The staff-only routes are registered after the
 * requireStaff line, same layout as attendance.routes.ts.
 */
const router = Router();
router.use(requireAuth);

const ENTRY_SELECT = {
  id: true,
  authorId: true,
  authorName: true,
  taskId: true,
  taskTitle: true,
  category: true,
  body: true,
  internal: true,
  position: true,
  createdAt: true,
  updatedAt: true,
  task: { select: { title: true, state: true } },
} as const;

const WEEK_SELECT = {
  id: true,
  weekStart: true,
  version: true,
  title: true,
  summary: true,
  status: true,
  closedAt: true,
  publishedAt: true,
  publishedBy: { select: { id: true, name: true } },
} as const;

function badWeek(res: Response) {
  return res.status(400).json({ code: "INVALID_WEEK", message: "The week must be a Monday as YYYY-MM-DD" });
}

function locked(res: Response) {
  return res.status(409).json({ code: "PATCH_WEEK_LOCKED", message: "This week can no longer be edited" });
}

function validationError(res: Response, error: z.ZodError) {
  return res.status(400).json({
    code: "VALIDATION_ERROR",
    message: error.issues[0]?.message ?? "The patch note could not be validated",
  });
}

/** The week as the client sees it: a week nobody wrote into yet reads as an empty DRAFT. */
async function loadWeek(weekStart: string) {
  return prisma.patchWeek.findUnique({ where: { weekStart }, select: WEEK_SELECT });
}

/** Created on the first write, so browsing empty weeks leaves no rows behind. */
async function ensureWeek(weekStart: string) {
  return prisma.patchWeek.upsert({
    where: { weekStart },
    create: { weekStart },
    update: {},
    select: { id: true, status: true },
  });
}

/**
 * Whether the caller may write into a week in this status. Staff keep editing a
 * CLOSED week - that is the review step - and nobody touches a PUBLISHED one.
 */
function canWrite(req: Request, status: PatchWeekStatus) {
  if (status === PatchWeekStatus.PUBLISHED) return false;
  return status === PatchWeekStatus.DRAFT || isStaff(req.auth!.role);
}

/** WORKING segments of the week with a task, optionally one person's. */
async function weekTaskTimes(weekStart: string, employeeId?: number) {
  const config = await getWorkdayConfig();
  const { from, to } = weekRange(weekStart, config.timezone);
  const rows = await prisma.activityHistory.findMany({
    where: {
      status: "WORKING",
      OR: [{ taskId: { not: null } }, { taskTitle: { not: null } }],
      ...(employeeId !== undefined ? { employeeId } : {}),
      ...overlappingWhere(from, to),
    },
    select: {
      employeeId: true,
      startedAt: true,
      endedAt: true,
      taskId: true,
      taskTitle: true,
      employee: { select: { name: true } },
      task: { select: { title: true, state: true } },
    },
  });
  return teamTaskTimes(rows, from, to);
}

const entrySchema = z.object({
  category: z.nativeEnum(PatchCategory),
  body: z.string().trim().min(3, "The note needs at least 3 characters").max(2000),
  taskId: z.number().int().positive().nullable().optional(),
  internal: z.boolean().optional(),
});

/** Resolves the task to link and snapshots its title. `undefined` = not found. */
async function linkedTask(taskId: number | null | undefined) {
  if (taskId == null) return { taskId: null, taskTitle: null };
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true, title: true } });
  return task ? { taskId: task.id, taskTitle: task.title } : undefined;
}

/** Same keying as TeamTaskTime.key: by id, or by title once the task is gone. */
function taskKeyOf(entry: { taskId: number | null; taskTitle: string | null }) {
  return entry.taskId != null ? `id:${entry.taskId}` : `title:${entry.taskTitle}`;
}

function taskNotFound(res: Response) {
  return res.status(404).json({ code: "TASK_NOT_FOUND", message: "Task not found" });
}

/** Weeks that exist, newest first, plus the current one so the UI can open on it. */
router.get("/weeks", async (_req, res) => {
  const config = await getWorkdayConfig();
  const weeks = await prisma.patchWeek.findMany({
    select: {
      weekStart: true,
      version: true,
      title: true,
      status: true,
      _count: { select: { entries: true } },
    },
    orderBy: { weekStart: "desc" },
    take: 200,
  });

  res.json({
    current: currentWeekStart(config.timezone),
    weeks: weeks.map(({ _count, ...week }) => ({ ...week, entryCount: _count.entries })),
  });
});

router.get("/weeks/:weekStart", async (req, res) => {
  const weekStart = String(req.params.weekStart);
  if (!isWeekStart(weekStart)) return badWeek(res);

  const week = await loadWeek(weekStart);
  const [rows, times] = week
    ? await Promise.all([
        prisma.patchEntry.findMany({
          where: { weekId: week.id },
          select: ENTRY_SELECT,
          orderBy: [{ authorName: "asc" }, { position: "asc" }, { id: "asc" }],
        }),
        weekTaskTimes(weekStart),
      ])
    : [[], []];

  // The team's total on the linked task that week. Totals only: the split per
  // person stays in the staff-only /insights.
  const totalByTask = new Map(times.map((task) => [task.key, task.totalMs]));
  const entries = rows.map((entry) => ({
    ...entry,
    taskMs: totalByTask.get(taskKeyOf(entry)) ?? 0,
  }));

  res.json({
    weekStart,
    weekEnd: addDays(weekStart, 6),
    week: week ?? {
      id: null,
      weekStart,
      version: null,
      title: null,
      summary: "",
      status: PatchWeekStatus.DRAFT,
      closedAt: null,
      publishedAt: null,
      publishedBy: null,
    },
    entries,
  });
});

/** The caller's own time per task that week, to suggest what to write about. */
router.get("/weeks/:weekStart/my-tasks", async (req, res) => {
  const weekStart = String(req.params.weekStart);
  if (!isWeekStart(weekStart)) return badWeek(res);

  const times = await weekTaskTimes(weekStart, req.auth!.employeeId);
  res.json(times.map(({ byEmployee: _mine, ...task }) => task));
});

router.post("/weeks/:weekStart/entries", async (req, res) => {
  const weekStart = String(req.params.weekStart);
  if (!isWeekStart(weekStart)) return badWeek(res);

  const parsed = entrySchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);

  const week = await ensureWeek(weekStart);
  if (!canWrite(req, week.status)) return locked(res);

  const task = await linkedTask(parsed.data.taskId);
  if (!task) return taskNotFound(res);

  const author = await prisma.employee.findUniqueOrThrow({
    where: { id: req.auth!.employeeId },
    select: { id: true, name: true },
  });
  const last = await prisma.patchEntry.aggregate({
    where: { weekId: week.id, authorId: author.id },
    _max: { position: true },
  });

  const entry = await prisma.patchEntry.create({
    data: {
      weekId: week.id,
      authorId: author.id,
      authorName: author.name,
      ...task,
      category: parsed.data.category,
      body: parsed.data.body,
      internal: parsed.data.internal ?? false,
      position: (last._max.position ?? -1) + 1,
    },
    select: ENTRY_SELECT,
  });

  emitPatchNotesChanged({ weekStart });
  res.status(201).json(entry);
});

/** The entry, its week, and whether the caller may change it. */
async function entryForWrite(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ code: "INVALID_PATCH_ENTRY", message: "Invalid patch note entry" });
    return null;
  }

  const entry = await prisma.patchEntry.findUnique({
    where: { id },
    select: { id: true, authorId: true, week: { select: { weekStart: true, status: true } } },
  });
  if (!entry) {
    res.status(404).json({ code: "PATCH_ENTRY_NOT_FOUND", message: "Patch note entry not found" });
    return null;
  }

  const own = entry.authorId === req.auth!.employeeId;
  if (!own && !isStaff(req.auth!.role)) {
    res.status(403).json({ code: "PATCH_ENTRY_FORBIDDEN", message: "You can only edit your own entries" });
    return null;
  }
  if (!canWrite(req, entry.week.status)) {
    locked(res);
    return null;
  }
  return entry;
}

router.patch("/entries/:id", async (req, res) => {
  const entry = await entryForWrite(req, res);
  if (!entry) return;

  const parsed = entrySchema.partial().safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);

  const data: Prisma.PatchEntryUncheckedUpdateInput = {};
  if (parsed.data.category !== undefined) data.category = parsed.data.category;
  if (parsed.data.body !== undefined) data.body = parsed.data.body;
  if (parsed.data.internal !== undefined) data.internal = parsed.data.internal;
  if (parsed.data.taskId !== undefined) {
    const task = await linkedTask(parsed.data.taskId);
    if (!task) return taskNotFound(res);
    Object.assign(data, task);
  }

  const updated = await prisma.patchEntry.update({
    where: { id: entry.id },
    data,
    select: ENTRY_SELECT,
  });

  emitPatchNotesChanged({ weekStart: entry.week.weekStart });
  res.json(updated);
});

router.delete("/entries/:id", async (req, res) => {
  const entry = await entryForWrite(req, res);
  if (!entry) return;

  await prisma.patchEntry.delete({ where: { id: entry.id } });
  emitPatchNotesChanged({ weekStart: entry.week.weekStart });
  res.json({ success: true });
});

// Everything below is staff only: review, workflow, team times and the PDF.
router.use(requireStaff);

/**
 * Team time per task for the week, and what is missing from the notes: tasks
 * with booked time and no entry, and active people who wrote nothing.
 */
router.get("/weeks/:weekStart/insights", async (req, res) => {
  const weekStart = String(req.params.weekStart);
  if (!isWeekStart(weekStart)) return badWeek(res);

  const [times, week, employees] = await Promise.all([
    weekTaskTimes(weekStart),
    prisma.patchWeek.findUnique({
      where: { weekStart },
      select: { entries: { select: { taskId: true, taskTitle: true, authorId: true } } },
    }),
    prisma.employee.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const entries = week?.entries ?? [];
  const noted = new Set(entries.map((entry) => (entry.taskId != null ? `id:${entry.taskId}` : `title:${entry.taskTitle}`)));
  const authors = new Set(entries.map((entry) => entry.authorId));
  const workers = new Set(times.flatMap((task) => task.byEmployee.map((person) => person.id)));

  res.json({
    taskTimes: times,
    undocumentedTasks: times.filter((task) => !noted.has(task.key)),
    // Only people who actually booked task time that week: nobody is chased
    // for a section about a week they did not work.
    missingAuthors: employees.filter((employee) => workers.has(employee.id) && !authors.has(employee.id)),
  });
});

const weekSchema = z.object({
  title: z.string().trim().max(120).nullable().optional(),
  summary: z.string().trim().max(8000).optional(),
  version: z
    .string()
    .trim()
    .max(40)
    .regex(/^[\w.\-+ ]*$/, "The version can only use letters, numbers, dots and dashes")
    .nullable()
    .optional(),
});

router.patch("/weeks/:weekStart", async (req, res) => {
  const weekStart = String(req.params.weekStart);
  if (!isWeekStart(weekStart)) return badWeek(res);

  const parsed = weekSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);

  const current = await ensureWeek(weekStart);
  if (current.status === PatchWeekStatus.PUBLISHED) return locked(res);

  const data = {
    ...(parsed.data.title !== undefined ? { title: parsed.data.title || null } : {}),
    ...(parsed.data.summary !== undefined ? { summary: parsed.data.summary } : {}),
    ...(parsed.data.version !== undefined ? { version: parsed.data.version || null } : {}),
  };

  try {
    const week = await prisma.patchWeek.update({ where: { weekStart }, data, select: WEEK_SELECT });
    emitPatchNotesChanged({ weekStart });
    res.json(week);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return res.status(409).json({ code: "PATCH_VERSION_TAKEN", message: "Another week already uses that version" });
    }
    throw error;
  }
});

/** Allowed moves. PUBLISHED -> CLOSED is the escape hatch for a correction. */
const TRANSITIONS: Record<PatchWeekStatus, PatchWeekStatus[]> = {
  DRAFT: [PatchWeekStatus.CLOSED],
  CLOSED: [PatchWeekStatus.DRAFT, PatchWeekStatus.PUBLISHED],
  PUBLISHED: [PatchWeekStatus.CLOSED],
};

router.post("/weeks/:weekStart/status", async (req, res) => {
  const weekStart = String(req.params.weekStart);
  if (!isWeekStart(weekStart)) return badWeek(res);

  const parsed = z.object({ status: z.nativeEnum(PatchWeekStatus) }).safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);
  const next = parsed.data.status;

  const current = await ensureWeek(weekStart);
  if (!TRANSITIONS[current.status].includes(next)) {
    return res.status(409).json({
      code: "PATCH_INVALID_TRANSITION",
      message: "The week cannot move to that status from its current one",
    });
  }

  if (next === PatchWeekStatus.PUBLISHED) {
    const week = await prisma.patchWeek.findUniqueOrThrow({ where: { weekStart }, select: { version: true } });
    if (!week.version) {
      return res.status(409).json({
        code: "PATCH_VERSION_REQUIRED",
        message: "Set a version before publishing the week",
      });
    }
  }

  const now = new Date();
  const week = await prisma.patchWeek.update({
    where: { weekStart },
    data: {
      status: next,
      ...(next === PatchWeekStatus.CLOSED && current.status === PatchWeekStatus.DRAFT ? { closedAt: now } : {}),
      ...(next === PatchWeekStatus.DRAFT ? { closedAt: null } : {}),
      ...(next === PatchWeekStatus.PUBLISHED
        ? { publishedAt: now, publishedById: req.auth!.employeeId }
        : { publishedAt: null, publishedById: null }),
    },
    select: WEEK_SELECT,
  });

  emitPatchNotesChanged({ weekStart });
  res.json(week);
});

/**
 * The patch notes as a PDF. `mode=internal` (default) carries times, people and
 * internal notes; `mode=public` is the player-facing version: task names and total time,
 * without people or internal notes.
 */
router.get("/weeks/:weekStart/report.pdf", async (req, res) => {
  const weekStart = String(req.params.weekStart);
  if (!isWeekStart(weekStart)) return badWeek(res);
  const mode = req.query.mode === "public" ? "public" : "internal";

  const [week, times] = await Promise.all([
    prisma.patchWeek.findUnique({
      where: { weekStart },
      select: {
        ...WEEK_SELECT,
        entries: { select: ENTRY_SELECT, orderBy: [{ position: "asc" }, { id: "asc" }] },
      },
    }),
    weekTaskTimes(weekStart),
  ]);

  const name = week?.version ? `patch-notes-${week.version}` : `patch-notes-${weekStart}`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `inline; filename="${name.replace(/[^\w.\-]/g, "_")}${mode === "public" ? "-public" : ""}.pdf"`
  );

  const doc = new PDFDocument({ margin: 0, size: "A4" });
  doc.pipe(res);

  renderPatchNotesReport(doc, {
    mode,
    weekStart,
    weekEnd: addDays(weekStart, 6),
    version: week?.version ?? null,
    title: week?.title ?? null,
    summary: week?.summary ?? "",
    status: week?.status ?? PatchWeekStatus.DRAFT,
    publishedAt: week?.publishedAt ?? null,
    entries: (week?.entries ?? []).map((entry) => ({
      authorName: entry.authorName,
      taskId: entry.taskId,
      taskTitle: entry.task?.title ?? entry.taskTitle,
      taskState: entry.task?.state ?? null,
      category: entry.category,
      body: entry.body,
      internal: entry.internal,
    })),
    taskTimes: times,
  });
});

export default router;
