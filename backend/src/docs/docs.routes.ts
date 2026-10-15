import { Router, type Response } from "express";
import { z } from "zod";
import prisma from "../prisma/client";
import { requireAuth } from "../auth/auth.middleware";
import { canManageTasks } from "../auth/roles";
import { emitDocsChanged } from "../realtime";

/**
 * A project's GDD tab: design documents and notes. The whole team reads and
 * writes them - a design document is everybody's - and deleting one is for its
 * author or a board manager.
 *
 * Two people saving the same page: the client sends the `updatedAt` it loaded,
 * and a save over a newer version is refused (DOC_EDIT_CONFLICT) instead of
 * silently throwing the other person's work away.
 */
const router = Router();
router.use(requireAuth);

const DOC_NOT_FOUND = { code: "DOC_NOT_FOUND", message: "Document not found" };
const PROJECT_NOT_FOUND = { code: "PROJECT_NOT_FOUND", message: "Project not found" };

/** The list leaves the body out: a GDD page can be long. */
const DOC_SUMMARY = {
  id: true,
  projectId: true,
  title: true,
  section: true,
  createdByName: true,
  updatedByName: true,
  createdAt: true,
  updatedAt: true,
} as const;

const DOC_FULL = { ...DOC_SUMMARY, body: true, createdById: true } as const;

const docSchema = z.object({
  title: z.string().trim().min(1, "The document needs a title").max(160),
  section: z.string().trim().max(60).default(""),
  // Fits under the app-wide 100kb JSON limit with room to spare.
  body: z.string().max(50000, "The document is too long (50,000 characters at most)").default(""),
});

const updateSchema = docSchema.partial().extend({
  /** The version the editor loaded; omitted = overwrite whatever is there. */
  updatedAt: z.coerce.date().optional(),
});

function parseId(raw: unknown) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function validationError(res: Response, error: z.ZodError) {
  return res.status(400).json({
    code: "VALIDATION_ERROR",
    message: error.issues[0]?.message ?? "The document could not be validated",
  });
}

async function author(employeeId: number) {
  return prisma.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { id: true, name: true } });
}

router.get("/", async (req, res) => {
  const projectId = parseId(req.query.projectId);
  if (!projectId) return res.status(404).json(PROJECT_NOT_FOUND);

  const docs = await prisma.projectDoc.findMany({
    where: { projectId },
    select: DOC_SUMMARY,
    orderBy: [{ section: "asc" }, { title: "asc" }],
    take: 1000,
  });
  res.json(docs);
});

router.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(404).json(DOC_NOT_FOUND);

  const doc = await prisma.projectDoc.findUnique({ where: { id }, select: DOC_FULL });
  if (!doc) return res.status(404).json(DOC_NOT_FOUND);
  res.json(doc);
});

router.post("/", async (req, res) => {
  const projectId = parseId(req.body?.projectId);
  const project = projectId
    ? await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } })
    : null;
  if (!project) return res.status(404).json(PROJECT_NOT_FOUND);

  const parsed = docSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);

  const me = await author(req.auth!.employeeId);
  const doc = await prisma.projectDoc.create({
    data: {
      ...parsed.data,
      projectId: project.id,
      createdById: me.id,
      createdByName: me.name,
      updatedById: me.id,
      updatedByName: me.name,
    },
    select: DOC_FULL,
  });

  emitDocsChanged({ projectId: project.id, docId: doc.id });
  res.status(201).json(doc);
});

router.patch("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(404).json(DOC_NOT_FOUND);

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);

  const current = await prisma.projectDoc.findUnique({
    where: { id },
    select: { projectId: true, updatedAt: true },
  });
  if (!current) return res.status(404).json(DOC_NOT_FOUND);

  const { updatedAt: loaded, ...fields } = parsed.data;
  if (loaded && loaded.getTime() !== current.updatedAt.getTime()) {
    return res.status(409).json({
      code: "DOC_EDIT_CONFLICT",
      message: "Someone else saved this document after you opened it",
    });
  }

  const me = await author(req.auth!.employeeId);
  // updateMany on the version too, so two saves racing past the check above
  // cannot both win.
  const { count } = await prisma.projectDoc.updateMany({
    where: { id, updatedAt: current.updatedAt },
    data: { ...fields, updatedById: me.id, updatedByName: me.name },
  });
  if (!count) {
    return res.status(409).json({
      code: "DOC_EDIT_CONFLICT",
      message: "Someone else saved this document after you opened it",
    });
  }

  const doc = await prisma.projectDoc.findUniqueOrThrow({ where: { id }, select: DOC_FULL });
  emitDocsChanged({ projectId: current.projectId, docId: id });
  res.json(doc);
});

router.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(404).json(DOC_NOT_FOUND);

  const doc = await prisma.projectDoc.findUnique({
    where: { id },
    select: { projectId: true, createdById: true },
  });
  if (!doc) return res.status(404).json(DOC_NOT_FOUND);

  if (doc.createdById !== req.auth!.employeeId && !canManageTasks(req.auth!.role)) {
    return res
      .status(403)
      .json({ code: "DOC_DELETE_NOT_ALLOWED", message: "Only the author or a task manager can delete it" });
  }

  await prisma.projectDoc.delete({ where: { id } });
  emitDocsChanged({ projectId: doc.projectId, docId: id });
  res.json({ success: true });
});

export default router;
