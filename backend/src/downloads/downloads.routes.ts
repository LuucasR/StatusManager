import { Router, type Response } from "express";
import { z } from "zod";
import prisma from "../prisma/client";
import { requireAdmin, requireAuth } from "../auth/auth.middleware";
import { emitDownloadsChanged } from "../realtime";

/**
 * Company tools the team can download. Everyone lists them; only admins add,
 * edit or remove them. The routes below requireAdmin are admin only.
 *
 * Only links are stored: the browser downloads straight from the host, so a
 * ~1 GB installer never touches this server.
 */
const router = Router();
router.use(requireAuth);

const UTILITY_SELECT = {
  id: true,
  name: true,
  description: true,
  version: true,
  url: true,
  sizeLabel: true,
  platform: true,
  position: true,
  updatedAt: true,
} as const;

function validationError(res: Response, error: z.ZodError) {
  return res.status(400).json({
    code: "VALIDATION_ERROR",
    message: error.issues[0]?.message ?? "The download could not be validated",
  });
}

function notFound(res: Response) {
  return res.status(404).json({ code: "UTILITY_NOT_FOUND", message: "Download not found" });
}

router.get("/", async (_req, res) => {
  const utilities = await prisma.utility.findMany({
    select: UTILITY_SELECT,
    orderBy: [{ position: "asc" }, { name: "asc" }],
  });
  res.json(utilities);
});

router.use(requireAdmin);

const utilitySchema = z.object({
  name: z.string().trim().min(1, "The name is required").max(120),
  description: z.string().trim().max(2000).default(""),
  version: z.string().trim().max(40).default(""),
  url: z
    .string()
    .trim()
    .max(2000)
    .url("The link must be a valid URL")
    .refine((value) => value.startsWith("https://"), "The link must start with https://"),
  sizeLabel: z.string().trim().max(40).default(""),
  platform: z.string().trim().max(40).default(""),
  position: z.number().int().min(0).max(10000).default(0),
});

function parseId(raw: unknown) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

router.post("/", async (req, res) => {
  const parsed = utilitySchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);

  const utility = await prisma.utility.create({ data: parsed.data, select: UTILITY_SELECT });
  emitDownloadsChanged();
  res.status(201).json(utility);
});

router.patch("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return notFound(res);

  // Partial: only the fields sent are validated and changed, without the
  // create defaults blanking the rest.
  const parsed = utilitySchema
    .partial()
    .extend({
      description: z.string().trim().max(2000).optional(),
      version: z.string().trim().max(40).optional(),
      sizeLabel: z.string().trim().max(40).optional(),
      platform: z.string().trim().max(40).optional(),
      position: z.number().int().min(0).max(10000).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);

  const existing = await prisma.utility.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return notFound(res);

  const utility = await prisma.utility.update({ where: { id }, data: parsed.data, select: UTILITY_SELECT });
  emitDownloadsChanged();
  res.json(utility);
});

router.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return notFound(res);

  const { count } = await prisma.utility.deleteMany({ where: { id } });
  if (count === 0) return notFound(res);

  emitDownloadsChanged();
  res.json({ success: true });
});

export default router;
