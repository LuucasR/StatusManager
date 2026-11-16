import { ActivityStatus } from "@prisma/client";
import { z } from "zod";
import { statusesAllowingTask, statusesRequiringDetail } from "./activity-status";

export { statusesRequiringDetail };

/** How many checklist items one Working segment can declare. Same limit in the picker. */
export const MAX_WORKING_ITEMS = 3;

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
    /**
     * Checklist items of `taskId` being worked on, in the order picked. Only
     * valid together with a task. Up to MAX_WORKING_ITEMS: some work really
     * does advance two or three items at once, more than that is no longer
     * saying which part of the task is being done.
     */
    checklistItemIds: z
      .array(z.number().int().positive())
      .max(MAX_WORKING_ITEMS, {
        message: `At most ${MAX_WORKING_ITEMS} checklist items can be declared at once`,
      })
      .refine((ids) => new Set(ids).size === ids.length, {
        message: "The same checklist item was declared twice",
      })
      .optional()
      .default([]),
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

    if (value.checklistItemIds.length > 0 && value.taskId == null) {
      context.addIssue({
        code: "custom",
        path: ["checklistItemIds"],
        message: "A checklist item can only be declared together with its task",
      });
    }
  });
