import { Router } from "express";
import { z } from "zod";
import prisma from "../prisma/client";
import { requireAdmin, requireAuth } from "../auth/auth.middleware";
import { emitProjectsChanged } from "../realtime";

/**
 * Company projects. Everyone lists them (each one is an entry of the sidebar,
 * with its tasks, maps, patch notes and documents as tabs);
 * only admins create, rename and delete them, from the dashboard.
 */
const router = Router();
router.use(requireAuth);

const PROJECT_SELECT = {
  id: true,
  name: true,
  createdAt: true,
  _count: { select: { maps: true, tasks: true } },
} as const;

type ProjectRow = { id: number; name: string; createdAt: Date; _count: { maps: number; tasks: number } };
const toProjectDto = ({ _count, ...project }: ProjectRow) => ({
  ...project,
  mapsCount: _count.maps,
  tasksCount: _count.tasks,
});

const PROJECT_NOT_FOUND = { code: "PROJECT_NOT_FOUND", message: "Project not found" };
const PROJECT_NAME_TAKEN = { code: "PROJECT_NAME_TAKEN", message: "There is already a project with that name" };

const projectSchema = z.object({
  name: z.string().trim().min(1, "The project needs a name").max(80),
});

function parseId(raw: unknown) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Case-insensitive: "Frommisfortunecomes" and "frommisfortunecomes" are one project. */
async function nameTaken(name: string, exceptId?: number) {
  const found = await prisma.project.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  return Boolean(found);
}

router.get("/", async (_req, res) => {
  const projects = await prisma.project.findMany({ select: PROJECT_SELECT, orderBy: { name: "asc" } });
  res.json(projects.map(toProjectDto));
});

router.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(404).json(PROJECT_NOT_FOUND);

  const project = await prisma.project.findUnique({ where: { id }, select: PROJECT_SELECT });
  if (!project) return res.status(404).json(PROJECT_NOT_FOUND);
  res.json(toProjectDto(project));
});

router.use(requireAdmin);

router.post("/", async (req, res) => {
  const parsed = projectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message });
  }
  if (await nameTaken(parsed.data.name)) return res.status(409).json(PROJECT_NAME_TAKEN);

  const project = await prisma.project.create({
    data: { name: parsed.data.name, createdById: req.auth!.employeeId },
    select: PROJECT_SELECT,
  });

  emitProjectsChanged();
  res.status(201).json(toProjectDto(project));
});

router.patch("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(404).json(PROJECT_NOT_FOUND);

  const parsed = projectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message });
  }
  if (await nameTaken(parsed.data.name, id)) return res.status(409).json(PROJECT_NAME_TAKEN);

  const { count } = await prisma.project.updateMany({ where: { id }, data: { name: parsed.data.name } });
  if (!count) return res.status(404).json(PROJECT_NOT_FOUND);

  emitProjectsChanged();
  res.json({ success: true });
});

/**
 * Takes its maps and their sectors with it; the dashboard says so before
 * asking. Tasks, patch notes and documents are real work: a project that has
 * any is refused rather than wiping them.
 */
router.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(404).json(PROJECT_NOT_FOUND);

  const work = await prisma.project.findUnique({
    where: { id },
    // A week only exists once somebody wrote into it; one whose notes were all
    // deleted again is no work to protect.
    select: {
      _count: {
        select: { tasks: true, docs: true, patchWeeks: { where: { entries: { some: {} } } } },
      },
    },
  });
  if (!work) return res.status(404).json(PROJECT_NOT_FOUND);
  if (work._count.tasks || work._count.patchWeeks || work._count.docs) {
    return res.status(409).json({
      code: "PROJECT_NOT_EMPTY",
      message: "The project has tasks, patch notes or documents; it cannot be deleted",
    });
  }

  const count = await prisma.$transaction(async (tx) => {
    await tx.patchWeek.deleteMany({ where: { projectId: id } });
    return (await tx.project.deleteMany({ where: { id } })).count;
  });
  if (!count) return res.status(404).json(PROJECT_NOT_FOUND);

  emitProjectsChanged();
  res.json({ success: true });
});

export default router;
