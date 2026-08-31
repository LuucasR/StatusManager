import { TaskState } from "@prisma/client";
import { z } from "zod";

/**
 * z.coerce.date() and not z.string().datetime(): the frontend sends what
 * <input type="datetime-local"> produces run through toISOString(), but
 * coercing also tolerates the offset-less variants without breaking.
 */
const dateInput = z.coerce.date();

const participantIds = z
  .array(z.number().int().positive())
  .min(1, "The task needs at least one participant")
  .max(50);

export const createTaskSchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().min(1).max(2000),
    startsAt: dateInput,
    endsAt: dateInput,
    state: z.nativeEnum(TaskState).optional().default(TaskState.PENDING),
    participantIds,
  })
  .superRefine((value, context) => {
    if (value.endsAt <= value.startsAt) {
      context.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "The end date must be after the start date",
      });
    }
  });

/**
 * Every field is optional, so the endsAt > startsAt comparison cannot live here
 * (the body may carry only one of the two). It is validated in the handler
 * against the already-persisted values.
 */
export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(3).max(120).optional(),
    description: z.string().trim().min(1).max(2000).optional(),
    startsAt: dateInput.optional(),
    endsAt: dateInput.optional(),
    state: z.nativeEnum(TaskState).optional(),
    participantIds: participantIds.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "There are no changes to apply",
  });

export const changeTaskStateSchema = z.object({
  state: z.nativeEnum(TaskState),
});

/**
 * An explicit boolean and not a toggle that flips: with socket broadcast and an
 * optimistic UI, two clicks or two clients would leave the state undetermined.
 */
export const changeTaskPinSchema = z.object({
  pinned: z.boolean(),
});

export const createCommentSchema = z.object({
  body: z.string().trim().min(1, "The comment cannot be empty").max(1000),
});
