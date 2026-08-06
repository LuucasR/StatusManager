import { ActivityStatus } from "@prisma/client";
import { z } from "zod";
import { statusesRequiringDetail } from "./activity-status";

export { statusesRequiringDetail };

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
