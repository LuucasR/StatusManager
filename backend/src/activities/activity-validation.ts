import { ActivityStatus } from "@prisma/client";
import { z } from "zod";
import { statusesAllowingTask, statusesRequiringDetail } from "./activity-status";

export { statusesRequiringDetail };

/**
 * Shared by POST /activities/status and POST /admin/employees/:id/status.
 *
 * Validates SHAPE only. Whether the task exists, whether the employee takes
 * part in it and whether it is mandatory are rules that need the database:
 * they live in activity-task.ts, and the two routes apply them separately
 * because the admin is not subject to the mandatory part.
 */
export const changeStatusSchema = z
  .object({
    // AUTO_DISCONNECTED is excluded from what a caller may set: only the
    // end-of-day job produces it. Without this, anyone could POST it and file
    // themselves - or, through the admin route, somebody else - as having failed
    // a check that was never sent.
    status: z
      .nativeEnum(ActivityStatus)
      .refine((status) => status !== ActivityStatus.AUTO_DISCONNECTED, {
        message: "That status is set by the system and cannot be chosen",
      }),
    detail: z.string().trim().max(500).optional().default(""),
    taskId: z.number().int().positive().nullable().optional(),
  })
  .superRefine((value, context) => {
    if (statusesRequiringDetail.has(value.status) && value.detail.length < 3) {
      context.addIssue({
        code: "custom",
        path: ["detail"],
        message:
          "The comment must be at least 3 characters for the Away status",
      });
    }

    if (value.taskId != null && !statusesAllowingTask.has(value.status)) {
      context.addIssue({
        code: "custom",
        path: ["taskId"],
        message: "A task can only be declared when switching to Working",
      });
    }
  });
