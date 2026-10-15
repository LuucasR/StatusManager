import express, { Router, type NextFunction, type Request, type Response } from "express";
import prisma from "../prisma/client";
import { requireAuth, requireTaskManagement } from "../auth/auth.middleware";
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
 * A project's Maps tab, on trial: a map image and the sectors marked on it,
 * each saying what is being done there. Everyone looks; the board managers (the
 * same people who run the task board) upload maps and draw sectors.
 */
const router = Router();
router.use(requireAuth);

const EMPLOYEE_SUMMARY = { select: { id: true, employeeNumber: true, name: true } } as const;

const MAP_SELECT = {
  id: true,
  projectId: true,
  title: true,
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
  createdAt: true,
  updatedAt: true,
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

function validationError(res: Response, message: string | undefined) {
  return res.status(400).json({ code: "VALIDATION_ERROR", message: message ?? "Invalid data" });
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

/** One project's maps: ?projectId= is required, maps only exist inside one. */
router.get("/", async (req, res) => {
  const projectId = parseId(req.query.projectId);
  if (!projectId) return res.status(404).json(PROJECT_NOT_FOUND);

  const maps = await prisma.siteMap.findMany({
    where: { projectId },
    select: MAP_SELECT,
    orderBy: { createdAt: "desc" },
  });
  res.json(maps.map(({ _count, ...map }) => ({ ...map, regionsCount: _count.regions })));
});

router.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(404).json(MAP_NOT_FOUND);

  const map = await prisma.siteMap.findUnique({
    where: { id },
    select: {
      ...MAP_SELECT,
      regions: { select: REGION_SELECT, orderBy: { createdAt: "asc" } },
    },
  });
  if (!map) return res.status(404).json(MAP_NOT_FOUND);

  const { _count, regions, ...rest } = map;
  res.json({ ...rest, regionsCount: _count.regions, regions: regions.map(toRegionDto) });
});

/** The bytes. Fetched by the client with its Bearer token and shown as a blob URL. */
router.get("/:id/image", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(404).json(MAP_NOT_FOUND);

  const map = await prisma.siteMap.findUnique({ where: { id }, select: { data: true, mimeType: true } });
  if (!map) return res.status(404).json(MAP_NOT_FOUND);

  res.setHeader("Content-Type", map.mimeType);
  // The image of a map never changes (a new one is a new map), so the browser
  // can keep it.
  res.setHeader("Cache-Control", "private, max-age=86400, immutable");
  res.send(Buffer.from(map.data));
});

router.use(requireTaskManagement);

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

  const map = await prisma.siteMap.create({
    data: {
      projectId: project.id,
      title: title.data,
      mimeType,
      data: new Uint8Array(data),
      createdById: req.auth!.employeeId,
    },
    select: { id: true },
  });

  emitMapsChanged({ mapId: map.id });
  res.status(201).json(map);
});

router.patch("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(404).json(MAP_NOT_FOUND);

  const title = mapTitleSchema.safeParse(req.body?.title);
  if (!title.success) return validationError(res, title.error.issues[0]?.message);

  const { count } = await prisma.siteMap.updateMany({ where: { id }, data: { title: title.data } });
  if (!count) return res.status(404).json(MAP_NOT_FOUND);

  emitMapsChanged({ mapId: id });
  res.json({ success: true });
});

router.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(404).json(MAP_NOT_FOUND);

  const { count } = await prisma.siteMap.deleteMany({ where: { id } });
  if (!count) return res.status(404).json(MAP_NOT_FOUND);

  emitMapsChanged({ mapId: id });
  res.json({ success: true });
});

router.post("/:id/regions", async (req, res) => {
  const mapId = parseId(req.params.id);
  if (!mapId) return res.status(404).json(MAP_NOT_FOUND);

  const parsed = createRegionSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error.issues[0]?.message);

  const map = await prisma.siteMap.findUnique({ where: { id: mapId }, select: { id: true } });
  if (!map) return res.status(404).json(MAP_NOT_FOUND);
  if (!(await checkLinks(res, parsed.data))) return;

  const { assigneeIds, ...fields } = parsed.data;
  const region = await prisma.mapRegion.create({
    data: {
      ...fields,
      mapId,
      createdById: req.auth!.employeeId,
      assignees: { create: [...new Set(assigneeIds)].map((employeeId) => ({ employeeId })) },
    },
    select: REGION_SELECT,
  });

  emitMapsChanged({ mapId });
  res.status(201).json(toRegionDto(region));
});

router.patch("/:id/regions/:regionId", async (req, res) => {
  const mapId = parseId(req.params.id);
  const regionId = parseId(req.params.regionId);
  if (!mapId || !regionId) return res.status(404).json(REGION_NOT_FOUND);

  const parsed = updateRegionSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error.issues[0]?.message);

  const current = await prisma.mapRegion.findUnique({
    where: { id: regionId },
    select: { mapId: true, assignees: { select: { employeeId: true } } },
  });
  if (!current || current.mapId !== mapId) return res.status(404).json(REGION_NOT_FOUND);

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

  emitMapsChanged({ mapId });
  res.json(toRegionDto(region));
});

router.delete("/:id/regions/:regionId", async (req, res) => {
  const mapId = parseId(req.params.id);
  const regionId = parseId(req.params.regionId);
  if (!mapId || !regionId) return res.status(404).json(REGION_NOT_FOUND);

  const { count } = await prisma.mapRegion.deleteMany({ where: { id: regionId, mapId } });
  if (!count) return res.status(404).json(REGION_NOT_FOUND);

  emitMapsChanged({ mapId });
  res.json({ success: true });
});

export default router;
