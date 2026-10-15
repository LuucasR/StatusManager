import { TaskState } from "@prisma/client";
import { z } from "zod";

/** The upload route's cap; the client checks it too, before sending 8 MB for nothing. */
export const MAP_IMAGE_MAX_BYTES = 8 * 1024 * 1024;

export const MAP_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type MapImageType = (typeof MAP_IMAGE_TYPES)[number];

/**
 * The real type, read from the file's first bytes. The Content-Type header is
 * whatever the client said, and the image is served back with the type stored
 * here, so it has to be the file's own.
 */
export function detectImageType(data: Buffer): MapImageType | null {
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    data.length >= 12 &&
    data.subarray(0, 4).toString("ascii") === "RIFF" &&
    data.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export const mapTitleSchema = z.string().trim().min(1, "The map needs a title").max(120);

/** Smallest sector side, as a fraction of the image: below this it is a misclick. */
const MIN_SIDE = 0.01;
const fraction = z.number().min(0).max(1);

const regionFields = {
  x: fraction,
  y: fraction,
  w: fraction.min(MIN_SIDE, "The sector is too small"),
  h: fraction.min(MIN_SIDE, "The sector is too small"),
  title: z.string().trim().min(1, "The sector needs a title").max(120),
  description: z.string().trim().max(2000),
  state: z.nativeEnum(TaskState),
  assigneeIds: z.array(z.number().int().positive()).max(50),
  taskId: z.number().int().positive().nullable(),
};

/**
 * Small rounding slack: the client computes the fractions from pixels, and a
 * rectangle dragged to the very edge can land a hair past 1.
 */
const EPSILON = 1e-6;
const insideImage = (region: { x?: number; y?: number; w?: number; h?: number }) =>
  region.x === undefined ||
  region.y === undefined ||
  region.w === undefined ||
  region.h === undefined ||
  (region.x + region.w <= 1 + EPSILON && region.y + region.h <= 1 + EPSILON);

export const createRegionSchema = z
  .object({
    ...regionFields,
    description: regionFields.description.default(""),
    state: regionFields.state.default("PENDING"),
    assigneeIds: regionFields.assigneeIds.default([]),
    taskId: regionFields.taskId.default(null),
  })
  .refine(insideImage, "The sector has to be inside the image");

/** Partial, but the rectangle travels whole: half a move cannot be checked against the edge. */
export const updateRegionSchema = z
  .object(regionFields)
  .partial()
  .refine(
    (region) =>
      [region.x, region.y, region.w, region.h].every((value) => value === undefined) ||
      [region.x, region.y, region.w, region.h].every((value) => value !== undefined),
    "Send the whole rectangle (x, y, w, h) to move a sector"
  )
  .refine(insideImage, "The sector has to be inside the image");
