import { ActivityStatus } from "@prisma/client";
import { z } from "zod";

export const statusesRequiringDetail = new Set<ActivityStatus>([
  ActivityStatus.WORKING,
  ActivityStatus.OFFLINE,
]);

export const changeStatusSchema = z
  .object({
    status: z.nativeEnum(ActivityStatus),
    detail: z.string().trim().max(500).optional().default(""),
  })
  .superRefine((value, context) => {
    if (
      statusesRequiringDetail.has(value.status) &&
      value.detail.length < 3
    ) {
      context.addIssue({
        code: "custom",
        path: ["detail"],
        message:
          "El comentario debe tener al menos 3 caracteres para los estados Ausente y Trabajando",
      });
    }
  });
