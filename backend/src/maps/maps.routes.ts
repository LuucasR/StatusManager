import express, { Router, type NextFunction, type Request, type Response } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "../prisma/client";
import { requireAdmin, requireAuth } from "../auth/auth.middleware";
import { canManageTasks, isAdmin } from "../auth/roles";
import type { AuthPayload } from "../auth/auth.token";
import { notify } from "../notifications/notification.service";
import { emitMapsChanged } from "../realtime";
import {
  MAP_IMAGE_MAX_BYTES,
  MAP_IMAGE_TYPES,
  createRegionSchema,
  detectImageType,
  mapTitleSchema,
  updateRegionSchema,
} from "./maps-validation";

/**
 * A project's Maps tab: a map image and the sectors marked on it, each saying
 * what is being done there.
 *
 * - Anyone uploads a map. An admin's is on the map list straight away; anyone
 *   else's waits PENDING for an admin's approval, seen only by the admins and
 *   the uploader until then - the same rule as a task created by a non-admin.
 * - Anyone draws sectors on an approved map. A sector is edited or deleted by
 *   whoever drew it, or by a board manager.
 * - Renaming and deleting a map are for the board managers; the uploader can
 *   also withdraw their own map while it was never approved.
 */
const router = Router();
router.use(requireAuth);

const EMPLOYEE_SUMMARY = { select: { id: true, employeeNumber: true, name: true } } as const;

const MAP_SELECT = {
  id: true,
  projectId: true,
  title: true,
  approval: true,
  reviewedAt: true,
  rejectReason: true,
  createdAt: true,
  updatedAt: true,
  createdBy: EMPLOYEE_SUMMARY,
  _count: { select: { regions: true } },
} as const;

const REGION_SELECT = {
  id: true,
  x: true,
  y: true,
  w: true,
  h: true,
  title: true,
  description: true,
  state: true,
  color: true,
  createdAt: true,
  updatedAt: true,
  createdBy: EMPLOYEE_SUMMARY,
  task: { select: { id: true, title: true, state: true } },
  assignees: { select: { employee: EMPLOYEE_SUMMARY }, orderBy: { addedAt: "asc" } },
} as const;

type RegionRow = {
  assignees: { employee: { id: number; employeeNumber: number; name: string } }[];
};

const toRegionDto = <T extends RegionRow>({ assignees, ...region }: T) => ({
  ...region,
  assignees: assignees.map((link) => link.employee),
});

function parseId(raw: unknown) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const MAP_NOT_FOUND = { code: "MAP_NOT_FOUND", message: "Map not found" };
const PROJECT_NOT_FOUND = { code: "PROJECT_NOT_FOUND", message: "Project not found" };
const REGION_NOT_FOUND = { code: "MAP_REGION_NOT_FOUND", message: "Sector not found" };
const MAP_NOT_APPROVED = { code: "MAP_NOT_APPROVED", message: "This map is waiting for an admin's approval" };
const MAP_NOT_ALLOWED = { code: "MAP_NOT_ALLOWED", message: "You cannot change this map" };
const REGION_NOT_ALLOWED = {
  code: "MAP_REGION_NOT_ALLOWED",
  message: "Only whoever drew the sector or a task manager can change it",
};

function validationError(res: Response, message: string | undefined) {
  return res.status(400).json({ code: "VALIDATION_ERROR", message: message ?? "Invalid data" });
}

/** Who sees a map that is not approved: admins, and the uploader their own. */
function visibleWhere(auth: AuthPayload): Prisma.SiteMapWhereInput {
  if (isAdmin(auth.role)) return {};
  return { OR: [{ approval: "APPROVED" }, { createdById: auth.employeeId }] };
}

/** The map of the URL if the caller may see it; null after answering 404. */
async function visibleMap(req: Request, res: Response) {
  const id = parseId(req.params.id);
  const map = id
    ? await prisma.siteMap.findFirst({
        where: { id, ...visibleWhere(req.auth!) },
        select: { id: true, title: true, approval: true, createdById: true, projectId: true },
      })
    : null;
  if (!map) {
    res.status(404).json(MAP_NOT_FOUND);
    return null;
  }
  return map;
}

/** Active accounts only: a deactivated one cannot be put in charge of anything. */
async function assigneesAreActive(ids: number[]) {
  const unique = [...new Set(ids)];
  if (!unique.length) return true;
  const found = await prisma.employee.count({ where: { id: { in: unique }, active: true } });
  return found === unique.length;
}

async function taskIsLinkable(taskId: number | null | undefined) {
  if (!taskId) return true;
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { approval: true } });
  return task?.approval === "APPROVED";
}

/** Shared by create and update: the people and the task have to exist. */
async function checkLinks(
  res: Response,
  data: { assigneeIds?: number[]; taskId?: number | null }
) {
  if (data.assigneeIds && !(await assigneesAreActive(data.assigneeIds))) {
    res.status(400).json({
      code: "INVALID_MAP_ASSIGNEE",
      message: "One of the people does not exist or is inactive",
    });
    return false;
  }
  if (!(await taskIsLinkable(data.taskId))) {
    res.status(400).json({ code: "MAP_TASK_NOT_FOUND", message: "That task does not exist" });
    return false;
  }
  return true;
}

/** Active admins, the ones asked to approve. */
async function adminIds() {
  const admins = await prisma.employee.findMany({ where: { role: "ADMIN", active: true }, select: { id: true } });
  return admins.map((admin) => admin.id);
}

/** One project's maps: ?projectId= is required, maps only exist inside one. */
router.get("/", async (req, res) => {
  const projectId = parseId(req.query.projectId);
  if (!projectId) return res.status(404).json(PROJECT_NOT_FOUND);

  const maps = await prisma.siteMap.findMany({
    where: { projectId, ...visibleWhere(req.auth!) },
    select: MAP_SELECT,
    orderBy: { createdAt: "desc" },
  });
  res.json(maps.map(({ _count, ...map }) => ({ ...map, regionsCount: _count.regions })));
});

router.get("/:id", async (req, res) => {
  const visible = await visibleMap(req, res);
  if (!visible) return;

  const map = await prisma.siteMap.findUniqueOrThrow({
    where: { id: visible.id },
    select: {
      ...MAP_SELECT,
      regions: { select: REGION_SELECT, orderBy: { createdAt: "asc" } },
    },
  });

  const { _count, regions, ...rest } = map;
  res.json({ ...rest, regionsCount: _count.regions, regions: regions.map(toRegionDto) });
});

/** The bytes. Fetched by the client with its Bearer token and shown as a blob URL. */
router.get("/:id/image", async (req, res) => {
  const visible = await visibleMap(req, res);
  if (!visible) return;

  const map = await prisma.siteMap.findUniqueOrThrow({
    where: { id: visible.id },
    select: { data: true, mimeType: true },
  });

  res.setHeader("Content-Type", map.mimeType);
  // The image of a map never changes (a new one is a new map), so the browser
  // can keep it.
  res.setHeader("Cache-Control", "private, max-age=86400, immutable");
  res.send(Buffer.from(map.data));
});

/**
 * The raw body parser for this route alone: the app-wide one is JSON at 100kb.
 * Its "too large" error is answered here, or it would surface as a 500.
 */
const rawImage = express.raw({ type: [...MAP_IMAGE_TYPES], limit: MAP_IMAGE_MAX_BYTES });
function readImage(req: Request, res: Response, next: NextFunction) {
  rawImage(req, res, (error?: unknown) => {
    if ((error as { type?: string } | undefined)?.type === "entity.too.large") {
      return res
        .status(413)
        .json({ code: "MAP_IMAGE_TOO_LARGE", message: "The image is larger than 8 MB" });
    }
    next(error);
  });
}

/** Anyone uploads; anyone but an admin waits for an admin's approval. */
router.post("/", readImage, async (req, res) => {
  const title = mapTitleSchema.safeParse(req.query.title ?? "");
  if (!title.success) return validationError(res, title.error.issues[0]?.message);

  const projectId = parseId(req.query.projectId);
  const project = projectId
    ? await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } })
    : null;
  if (!project) return res.status(404).json(PROJECT_NOT_FOUND);

  const data: unknown = req.body;
  const mimeType = Buffer.isBuffer(data) ? detectImageType(data) : null;
  if (!Buffer.isBuffer(data) || !mimeType) {
    return res
      .status(400)
      .json({ code: "INVALID_MAP_IMAGE", message: "The file has to be a PNG, JPG or WEBP image" });
  }

  const needsApproval = !isAdmin(req.auth!.role);
  const map = await prisma.siteMap.create({
    data: {
      projectId: project.id,
      title: title.data,
      mimeType,
      data: new Uint8Array(data),
      approval: needsApproval ? "PENDING" : "APPROVED",
      createdById: req.auth!.employeeId,
    },
    select: { id: true, approval: true, createdBy: { select: { name: true } } },
  });

  emitMapsChanged({ mapId: map.id });
  if (needsApproval) {
    await notify({
      recipientIds: await adminIds(),
      actorId: req.auth!.employeeId,
      type: "MAP_APPROVAL_REQUEST",
      title: title.data,
      body: `${map.createdBy?.name ?? "Someone"} uploaded the map "${title.data}" and it needs your approval`,
      mapId: map.id,
    });
  }
  res.status(201).json({ id: map.id, approval: map.approval });
});

const rejectSchema = z.object({ reason: z.string().trim().max(500).optional() });

router.post("/:id/approve", requireAdmin, async (req, res) => {
  const map = await visibleMap(req, res);
  if (!map) return;
  if (map.approval === "APPROVED") {
    return res.status(409).json({ code: "MAP_ALREADY_REVIEWED", message: "This map was already reviewed" });
  }

  await prisma.siteMap.update({
    where: { id: map.id },
    data: { approval: "APPROVED", reviewedAt: new Date(), rejectReason: null },
  });

  emitMapsChanged({ mapId: map.id });
  if (map.createdById) {
    await notify({
      recipientIds: [map.createdById],
      actorId: req.auth!.employeeId,
      type: "MAP_APPROVED",
      title: map.title,
      body: `Your map "${map.title}" was approved`,
      mapId: map.id,
    });
  }
  res.json({ success: true });
});

router.post("/:id/reject", requireAdmin, async (req, res) => {
  const map = await visibleMap(req, res);
  if (!map) return;
  if (map.approval !== "PENDING") {
    return res.status(409).json({ code: "MAP_ALREADY_REVIEWED", message: "This map was already reviewed" });
  }

  const parsed = rejectSchema.safeParse(req.body ?? {});
  if (!parsed.success) return validationError(res, parsed.error.issues[0]?.message);
  const reason = parsed.data.reason || null;

  await prisma.siteMap.update({
    where: { id: map.id },
    data: { approval: "REJECTED", reviewedAt: new Date(), rejectReason: reason },
  });

  emitMapsChanged({ mapId: map.id });
  if (map.createdById) {
    await notify({
      recipientIds: [map.createdById],
      actorId: req.auth!.employeeId,
      type: "MAP_REJECTED",
      title: map.title,
      body: `Your map "${map.title}" was rejected${reason ? `: ${reason.slice(0, 200)}` : ""}`,
      mapId: map.id,
    });
  }
  res.json({ success: true });
});

/** Board managers rename any map; the uploader, their own. */
router.patch("/:id", async (req, res) => {
  const map = await visibleMap(req, res);
  if (!map) return;
  if (!canManageTasks(req.auth!.role) && map.createdById !== req.auth!.employeeId) {
    return res.status(403).json(MAP_NOT_ALLOWED);
  }

  const title = mapTitleSchema.safeParse(req.body?.title);
  if (!title.success) return validationError(res, title.error.issues[0]?.message);

  await prisma.siteMap.update({ where: { id: map.id }, data: { title: title.data } });
  emitMapsChanged({ mapId: map.id });
  res.json({ success: true });
});

/** Board managers delete any map; the uploader withdraws theirs while unapproved. */
router.delete("/:id", async (req, res) => {
  const map = await visibleMap(req, res);
  if (!map) return;
  const ownUnapproved = map.approval !== "APPROVED" && map.createdById === req.auth!.employeeId;
  if (!canManageTasks(req.auth!.role) && !ownUnapproved) {
    return res.status(403).json(MAP_NOT_ALLOWED);
  }

  await prisma.siteMap.delete({ where: { id: map.id } });
  emitMapsChanged({ mapId: map.id });
  res.json({ success: true });
});

router.post("/:id/regions", async (req, res) => {
  const map = await visibleMap(req, res);
  if (!map) return;
  if (map.approval !== "APPROVED") return res.status(409).json(MAP_NOT_APPROVED);

  const parsed = createRegionSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error.issues[0]?.message);
  if (!(await checkLinks(res, parsed.data))) return;

  const { assigneeIds, ...fields } = parsed.data;
  const region = await prisma.mapRegion.create({
    data: {
      ...fields,
      mapId: map.id,
      createdById: req.auth!.employeeId,
      assignees: { create: [...new Set(assigneeIds)].map((employeeId) => ({ employeeId })) },
    },
    select: REGION_SELECT,
  });

  emitMapsChanged({ mapId: map.id });
  res.status(201).json(toRegionDto(region));
});

/** The sector of the URL if the caller may change it; null after answering. */
async function writableRegion(req: Request, res: Response) {
  const mapId = parseId(req.params.id);
  const regionId = parseId(req.params.regionId);
  const region =
    mapId && regionId
      ? await prisma.mapRegion.findUnique({
          where: { id: regionId },
          select: {
            id: true,
            mapId: true,
            createdById: true,
            assignees: { select: { employeeId: true } },
          },
        })
      : null;
  if (!region || region.mapId !== mapId) {
    res.status(404).json(REGION_NOT_FOUND);
    return null;
  }
  if (region.createdById !== req.auth!.employeeId && !canManageTasks(req.auth!.role)) {
    res.status(403).json(REGION_NOT_ALLOWED);
    return null;
  }
  return region;
}

router.patch("/:id/regions/:regionId", async (req, res) => {
  const parsed = updateRegionSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error.issues[0]?.message);

  const current = await writableRegion(req, res);
  if (!current) return;
  const regionId = current.id;

  // Only the people newly put in charge are checked: somebody already on the
  // sector stays valid even if the list is sent back unchanged.
  const before = current.assignees.map((link) => link.employeeId);
  const next = parsed.data.assigneeIds ? [...new Set(parsed.data.assigneeIds)] : null;
  const joined = next ? next.filter((employeeId) => !before.includes(employeeId)) : [];
  const dropped = next ? before.filter((employeeId) => !next.includes(employeeId)) : [];
  if (!(await checkLinks(res, { assigneeIds: joined, taskId: parsed.data.taskId }))) return;

  const { assigneeIds: _ignored, ...fields } = parsed.data;
  const region = await prisma.$transaction(async (tx) => {
    if (dropped.length) {
      await tx.mapRegionAssignee.deleteMany({ where: { regionId, employeeId: { in: dropped } } });
    }
    if (joined.length) {
      await tx.mapRegionAssignee.createMany({
        data: joined.map((employeeId) => ({ regionId, employeeId })),
        skipDuplicates: true,
      });
    }
    return tx.mapRegion.update({ where: { id: regionId }, data: fields, select: REGION_SELECT });
  });

  emitMapsChanged({ mapId: current.mapId });
  res.json(toRegionDto(region));
});

router.delete("/:id/regions/:regionId", async (req, res) => {
  const region = await writableRegion(req, res);
  if (!region) return;

  await prisma.mapRegion.delete({ where: { id: region.id } });
  emitMapsChanged({ mapId: region.mapId });
  res.json({ success: true });
});

export default router;
