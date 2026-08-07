import { ActivityStatus } from "@prisma/client";
import { z } from "zod";
import { statusesAllowingTask, statusesRequiringDetail } from "./activity-status";

export { statusesRequiringDetail };

/**
 * Compartido por POST /activities/status y POST /admin/employees/:id/status.
 *
 * Solo valida la FORMA. Que la tarea exista, que el empleado participe de ella
 * y que sea obligatoria son reglas que necesitan la base: viven en
 * activity-task.ts, y las dos rutas las aplican por separado porque el admin no
 * queda sujeto a la obligatoriedad.
 */
export const changeStatusSchema = z
  .object({
    status: z.nativeEnum(ActivityStatus),
    detail: z.string().trim().max(500).optional().default(""),
    taskId: z.number().int().positive().nullable().optional(),
  })
  .superRefine((value, context) => {
    if (statusesRequiringDetail.has(value.status) && value.detail.length < 3) {
      context.addIssue({
        code: "custom",
        path: ["detail"],
        message:
          "El comentario debe tener al menos 3 caracteres para el estado Ausente",
      });
    }

    if (value.taskId != null && !statusesAllowingTask.has(value.status)) {
      context.addIssue({
        code: "custom",
        path: ["taskId"],
        message: "Solo se puede declarar una tarea al ponerse a Trabajando",
      });
    }
  });
