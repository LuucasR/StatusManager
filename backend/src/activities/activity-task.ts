import { ActivityStatus, Prisma, TaskState } from "@prisma/client";
import prisma from "../prisma/client";
import { visibleTasksWhere } from "../tasks/task-state";
import { statusesAllowingTask } from "./activity-status";

/**
 * Business-rule error: the route turns it into a 400 carrying this message.
 *
 * Carries its own code so the client can translate it. Without one, these were
 * the only two responses in the API whose text reached the user untranslated.
 */
export class WorkingTaskError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Tasks an employee can declare work against: their own, not done, and still
 * on the board.
 *
 * This is the SAME definition the picker uses (GET /activities/assignable-tasks)
 * and the one that validates the POST. If they diverge, the UI offers options
 * the backend rejects.
 */
export function assignableTasksWhere(
  employeeId: number,
  now: Date = new Date()
): Prisma.TaskWhereInput {
  return {
    participants: { some: { employeeId } },
    // You cannot START working on a Done task. A segment already open against a
    // task that later moves to DONE stays alive on purpose: closing it behind
    // the scenes would erase real time from someone.
    state: { not: TaskState.DONE },
    // Nobody books time against a task that is not approved yet.
    approval: "APPROVED",
    // visibleTasksWhere contributes an `OR`; the rest are flat keys, so Prisma
    // ANDs them together without clashing.
    ...visibleTasksWhere(now),
  };
}

/** Checklist items that can be declared: not ticked yet. Same rule picker and POST. */
const pendingItemsWhere = { done: false } satisfies Prisma.TaskChecklistItemWhereInput;

export async function listAssignableTasks(employeeId: number, now: Date = new Date()) {
  const tasks = await prisma.task.findMany({
    where: assignableTasksWhere(employeeId, now),
    select: {
      id: true,
      title: true,
      state: true,
      startsAt: true,
      endsAt: true,
      checklist: {
        where: pendingItemsWhere,
        select: {
          id: true,
          text: true,
          label: true,
          priority: true,
          assignees: { select: { employeeId: true } },
        },
        orderBy: [{ position: "asc" }, { id: "asc" }],
      },
    },
    orderBy: [{ pinned: "desc" }, { startsAt: "asc" }, { id: "asc" }],
    take: 200,
  });

  return tasks.map(({ checklist, ...task }) => ({
    ...task,
    // `mine` lets the picker put the caller's own items first; anyone on the
    // task can still pick any pending item, assigned or not.
    items: checklist.map(({ assignees, ...item }) => ({
      ...item,
      mine: assignees.some((link) => link.employeeId === employeeId),
    })),
  }));
}

type ResolveInput = {
  employeeId: number;
  status: ActivityStatus;
  detail: string;
  taskId?: number | null;
  checklistItemId?: number | null;
  /**
   * true only in the self-service path. An admin fixes other people's statuses
   * and should not be blocked by someone else's task list.
   */
  enforce: boolean;
  now?: Date;
};

export type ResolvedWork = {
  taskId: number | null;
  taskTitle: string | null;
  checklistItemId: number | null;
  checklistItemText: string | null;
};

const NOTHING: ResolvedWork = {
  taskId: null,
  taskTitle: null,
  checklistItemId: null,
  checklistItemText: null,
};

/**
 * Validates the declared task (and checklist item) and returns what gets
 * persisted on the segment.
 *
 * `taskTitle` and `checklistItemText` are deliberate snapshots: the FKs are
 * SetNull, so deleting a task or an item cannot take with it the time somebody
 * booked against it, but without the text the summary would be left showing a
 * gap.
 */
export async function resolveWorkingTask({
  employeeId,
  status,
  detail,
  taskId,
  checklistItemId,
  enforce,
  now = new Date(),
}: ResolveInput): Promise<ResolvedWork> {
  if (!statusesAllowingTask.has(status)) return NOTHING;

  if (taskId != null) {
    const task = await prisma.task.findFirst({
      where: { id: taskId, ...assignableTasksWhere(employeeId, now) },
      select: {
        id: true,
        title: true,
        checklist: { where: pendingItemsWhere, select: { id: true, text: true } },
      },
    });
    if (!task) {
      throw new WorkingTaskError(
        "TASK_NOT_ASSIGNABLE",
        "That task is not one of yours, is already done, or has left the board"
      );
    }

    const resolved = { ...NOTHING, taskId: task.id, taskTitle: task.title };

    if (checklistItemId != null) {
      const item = task.checklist.find((candidate) => candidate.id === checklistItemId);
      if (!item) {
        throw new WorkingTaskError(
          "CHECKLIST_ITEM_NOT_ASSIGNABLE",
          "That item is not on this task's checklist or is already done"
        );
      }
      return { ...resolved, checklistItemId: item.id, checklistItemText: item.text };
    }

    // A task with items still open says what part of it is being done: that is
    // what the per-item breakdown is built from. A task with no checklist, or
    // with everything ticked, has nothing to pick, so nothing is required.
    if (enforce && task.checklist.length > 0) {
      throw new WorkingTaskError(
        "CHECKLIST_ITEM_REQUIRED",
        "Pick the checklist item you are going to work on"
      );
    }
    return resolved;
  }

  if (!enforce) return NOTHING;

  // With no task you have to say what you are working on. Only required when
  // there is something to pick: otherwise someone with no assigned tasks could
  // not even mark themselves as working.
  if (detail.length >= 3) return NOTHING;

  const assignable = await prisma.task.count({
    where: assignableTasksWhere(employeeId, now),
  });
  if (assignable > 0) {
    throw new WorkingTaskError(
      "TASK_OR_COMMENT_REQUIRED",
      "Pick the task you are going to work on, or write a comment of at least 3 characters if it is other work"
    );
  }

  return NOTHING;
}

/** What the cards show about the segment someone has open right now. */
export const OPEN_SEGMENT_SELECT = {
  detail: true,
  taskId: true,
  taskTitle: true,
  checklistItemId: true,
  checklistItemText: true,
  checklistItem: { select: { done: true } },
} as const;

type OpenSegment = {
  detail: string;
  taskId: number | null;
  taskTitle: string | null;
  checklistItemId: number | null;
  checklistItemText: string | null;
  checklistItem: { done: boolean } | null;
};

export function openSegmentFields(open: OpenSegment | undefined) {
  return {
    // No longer falls back to the task title: the card shows the declared task
    // on its own line, so folding it in here printed it twice.
    detail: open?.detail ?? "",
    taskId: open?.taskId ?? null,
    taskTitle: open?.taskTitle ?? null,
    checklistItemId: open?.checklistItemId ?? null,
    checklistItemText: open?.checklistItemText ?? null,
    // Ticked while still being worked on: the card says so until they move on.
    checklistItemDone: open?.checklistItem?.done ?? false,
  };
}
