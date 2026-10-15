import { Router, type Response } from "express";
import { z } from "zod";
import type { AnnouncementPriority, Prisma } from "@prisma/client";
import prisma from "../prisma/client";
import { requireAdmin, requireAuth, requireStaff } from "../auth/auth.middleware";
import { notify } from "../notifications/notification.service";
import { emitAnnouncementsChanged } from "../realtime";

/**
 * Team announcements: news and important notices, the app's landing tab.
 *
 * Everyone reads them and marks them read; staff (ADMIN and SUPERVISOR)
 * publishes, edits and deletes, and sees exactly who has read each one. A
 * CRITICAL announcement is the one that has to reach the whole team: the app
 * insists on it until it is read, and it reports once everyone has.
 */
const router = Router();
router.use(requireAuth);

const LIST_TAKE = 200;

/** Lower sorts first: what matters most is on top. */
const PRIORITY_RANK: Record<AnnouncementPriority, number> = {
  CRITICAL: 0,
  IMPORTANT: 1,
  INFO: 2,
};

const ANNOUNCEMENT_NOT_FOUND = {
  code: "ANNOUNCEMENT_NOT_FOUND",
  message: "Announcement not found",
};

function parseId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function validationError(res: Response, error: z.ZodError) {
  return res.status(400).json({
    code: "VALIDATION_ERROR",
    message: error.issues[0]?.message ?? "The announcement could not be validated",
  });
}

/** Not expired yet: no date, or one still ahead. */
const liveWhere = (): Prisma.AnnouncementWhereInput => ({
  OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
});

/** The people an announcement is for: the active team. */
async function activeTeamIds() {
  const team = await prisma.employee.findMany({ where: { active: true }, select: { id: true } });
  return team.map((employee) => employee.id);
}

router.get("/", async (req, res) => {
  const me = req.auth!.employeeId;
  const [rows, teamIds] = await Promise.all([
    // Expired ones leave the team's list; the admins' box still has them.
    prisma.announcement.findMany({
      where: liveWhere(),
      orderBy: { createdAt: "desc" },
      take: LIST_TAKE,
      include: { reads: { select: { employeeId: true, readAt: true } } },
    }),
    activeTeamIds(),
  ]);

  const team = new Set(teamIds);
  const announcements = rows
    .map(({ reads, ...announcement }) => {
      // Only people still on the team count towards "seen by everyone".
      const readers = reads.filter((read) => team.has(read.employeeId));
      const mine = reads.find((read) => read.employeeId === me);
      return {
        ...announcement,
        readAt: mine?.readAt ?? null,
        readCount: readers.length,
        teamCount: team.size,
        readByAll: readers.length >= team.size,
      };
    })
    .sort(
      (a, b) =>
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
        Number(b.pinned) - Number(a.pinned) ||
        b.createdAt.getTime() - a.createdAt.getTime()
    );

  res.json(announcements);
});

/**
 * The admins' box: every announcement ever published, expired ones included,
 * with who saw it and who has not. `q` searches title, message and author.
 *
 * IMPORTANT: registered BEFORE "/:id/..." routes, same reason as /tasks/archived.
 */
router.get("/admin", requireAdmin, async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 120) : "";

  const [rows, team] = await Promise.all([
    prisma.announcement.findMany({
      where: q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { body: { contains: q, mode: "insensitive" } },
              { authorName: { contains: q, mode: "insensitive" } },
            ],
          }
        : {},
      orderBy: { createdAt: "desc" },
      take: 500,
      include: { reads: { select: { employeeId: true, readAt: true } } },
    }),
    prisma.employee.findMany({
      where: { active: true },
      select: { id: true, employeeNumber: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const now = Date.now();
  res.json(
    rows.map(({ reads, ...announcement }) => {
      const readAt = new Map(reads.map((read) => [read.employeeId, read.readAt]));
      // Only people still on the team: a deactivated account is neither
      // "seen" nor "pending" any more.
      const seen = team
        .filter((employee) => readAt.has(employee.id))
        .map((employee) => ({ employee, readAt: readAt.get(employee.id)! }));
      const pending = team.filter((employee) => !readAt.has(employee.id));
      return {
        ...announcement,
        expired: announcement.expiresAt ? announcement.expiresAt.getTime() <= now : false,
        seen,
        pending,
      };
    })
  );
});

/** Who has read it and who has not. Staff only: it is the author's follow-up list. */
router.get("/:id/reads", requireStaff, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(404).json(ANNOUNCEMENT_NOT_FOUND);

  const announcement = await prisma.announcement.findUnique({
    where: { id },
    select: { reads: { select: { employeeId: true, readAt: true } } },
  });
  if (!announcement) return res.status(404).json(ANNOUNCEMENT_NOT_FOUND);

  const team = await prisma.employee.findMany({
    where: { active: true },
    select: { id: true, employeeNumber: true, name: true },
    orderBy: { name: "asc" },
  });
  const readAt = new Map(announcement.reads.map((read) => [read.employeeId, read.readAt]));

  res.json(team.map((employee) => ({ employee, readAt: readAt.get(employee.id) ?? null })));
});

/** Idempotent: reading it twice keeps the first time. */
router.post("/:id/read", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(404).json(ANNOUNCEMENT_NOT_FOUND);

  const exists = await prisma.announcement.findFirst({ where: { id, ...liveWhere() }, select: { id: true } });
  if (!exists) return res.status(404).json(ANNOUNCEMENT_NOT_FOUND);

  const employeeId = req.auth!.employeeId;
  await prisma.announcementRead.upsert({
    where: { announcementId_employeeId: { announcementId: id, employeeId } },
    create: { announcementId: id, employeeId },
    update: {},
  });

  // Read counts change for everyone looking at the page.
  emitAnnouncementsChanged({ id });
  res.json({ success: true });
});

const announcementSchema = z.object({
  title: z.string().trim().min(1, "The title is required").max(160),
  body: z.string().trim().min(1, "The message is required").max(5000),
  priority: z.enum(["CRITICAL", "IMPORTANT", "INFO"]),
  pinned: z.boolean().optional(),
  // Optional; null = it never expires. Has to be in the future when set.
  expiresAt: z.coerce
    .date()
    .refine((date) => date.getTime() > Date.now(), "The expiry date has to be in the future")
    .nullable()
    .optional(),
});

router.post("/", requireStaff, async (req, res) => {
  const parsed = announcementSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);

  const authorId = req.auth!.employeeId;
  const author = await prisma.employee.findUniqueOrThrow({
    where: { id: authorId },
    select: { name: true },
  });

  const announcement = await prisma.announcement.create({
    data: {
      ...parsed.data,
      pinned: parsed.data.pinned ?? false,
      authorId,
      authorName: author.name,
      // Whoever wrote it has obviously seen it.
      reads: { create: { employeeId: authorId } },
    },
  });

  emitAnnouncementsChanged({ id: announcement.id });
  await notify({
    recipientIds: await activeTeamIds(),
    actorId: authorId,
    type: "ANNOUNCEMENT",
    title:
      announcement.priority === "CRITICAL"
        ? `CRITICAL: ${announcement.title}`
        : announcement.title,
    body: announcement.body.slice(0, 200),
  });

  res.status(201).json(announcement);
});

router.patch("/:id", requireStaff, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(404).json(ANNOUNCEMENT_NOT_FOUND);

  const parsed = announcementSchema.partial().safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);

  const exists = await prisma.announcement.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return res.status(404).json(ANNOUNCEMENT_NOT_FOUND);

  const announcement = await prisma.announcement.update({ where: { id }, data: parsed.data });
  emitAnnouncementsChanged({ id });
  res.json(announcement);
});

router.delete("/:id", requireStaff, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(404).json(ANNOUNCEMENT_NOT_FOUND);

  const exists = await prisma.announcement.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return res.status(404).json(ANNOUNCEMENT_NOT_FOUND);

  await prisma.announcement.delete({ where: { id } });
  emitAnnouncementsChanged({ id });
  res.json({ success: true });
});

export default router;
