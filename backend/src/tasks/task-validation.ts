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

/**
 * The whole checklist, sent as an ordered array: the index IS the position.
 *
 * An item carrying an `id` is one that already exists and whose `done` has to
 * survive the edit; one without is new. That distinction is what lets the update
 * route diff instead of replacing, the same lesson TaskParticipant already
 * learned - except here a blind rewrite would not just reshuffle the order, it
 * would untick every box each time somebody fixed a typo in the title.
 */
const checklist = z
  .array(
    z.object({
      id: z.number().int().positive().optional(),
      text: z.string().trim().min(1).max(200),
      // Everybody in charge of the item; [] = nobody.
      assigneeIds: z.array(z.number().int().positive()).max(50).optional(),
      // LEGACY single assignee, still accepted from clients built before an item
      // could have several people (the Android app ships its bundle). Only read
      // when assigneeIds is absent.
      assigneeId: z.number().int().positive().nullable().optional(),
    })
  )
  .max(50)
  .transform((items) =>
    items.map(({ assigneeId, assigneeIds, ...item }) => ({
      ...item,
      assigneeIds: [...new Set(assigneeIds ?? (assigneeId ? [assigneeId] : []))],
    }))
  );

export const createTaskSchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().min(1).max(2000),
    startsAt: dateInput,
    endsAt: dateInput,
    state: z.nativeEnum(TaskState).optional().default(TaskState.PENDING),
    participantIds,
    checklist: checklist.optional().default([]),
    autoCompleteOnChecklist: z.boolean().optional().default(false),
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
    checklist: checklist.optional(),
    autoCompleteOnChecklist: z.boolean().optional(),
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

/**
 * Ticking one checklist item. An explicit boolean rather than a toggle, for the
 * same reason as changeTaskPinSchema: with a socket broadcast and an optimistic
 * UI, two clicks would leave the state undetermined.
 */
export const setChecklistItemSchema = z.object({
  done: z.boolean(),
});

/**
 * Drag to reorder inside a task's checklist: the item ids in their new order.
 * Must be exactly the task's current items, checked in the route.
 */
export const reorderChecklistSchema = z.object({
  itemIds: z.array(z.number().int().positive()).max(50),
});

/**
 * Drag to reorder cards inside one board column: the task ids of that column in
 * their new order. The state travels too so a card that was moved to another
 * column in the meantime is skipped rather than given a position there.
 */
export const reorderTasksSchema = z.object({
  state: z.nativeEnum(TaskState),
  taskIds: z.array(z.number().int().positive()).max(500),
});

/** The fixed palette an admin can flag a task with. Mirrored in the frontend. */
export const TASK_COLORS = ["RED", "ORANGE", "YELLOW", "GREEN", "BLUE", "PURPLE"] as const;

/** null removes the flag. */
export const changeTaskColorSchema = z.object({
  color: z.enum(TASK_COLORS).nullable(),
});

export const createCommentSchema = z.object({
  body: z.string().trim().min(1, "The comment cannot be empty").max(1000),
});
