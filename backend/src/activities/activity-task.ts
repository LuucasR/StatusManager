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
    // visibleTasksWhere contributes an `OR`; the rest are flat keys, so Prisma
    // ANDs them together without clashing.
    ...visibleTasksWhere(now),
  };
}

export function listAssignableTasks(employeeId: number, now: Date = new Date()) {
  return prisma.task.findMany({
    where: assignableTasksWhere(employeeId, now),
    select: { id: true, title: true, state: true, startsAt: true, endsAt: true },
    orderBy: [{ pinned: "desc" }, { startsAt: "asc" }, { id: "asc" }],
    take: 200,
  });
}

type ResolveInput = {
  employeeId: number;
  status: ActivityStatus;
  detail: string;
  taskId?: number | null;
  /**
   * true only in the self-service path. An admin fixes other people's statuses
   * and should not be blocked by someone else's task list.
   */
  enforce: boolean;
  now?: Date;
};

/**
 * Validates the declared task and returns what gets persisted on the segment.
 *
 * `taskTitle` is a deliberate snapshot: the FK is SetNull, so deleting a task
 * cannot take with it the time somebody booked against it, but without the
 * title the summary would be left showing a gap.
 */
export async function resolveWorkingTask({
  employeeId,
  status,
  detail,
  taskId,
  enforce,
  now = new Date(),
}: ResolveInput): Promise<{ taskId: number | null; taskTitle: string | null }> {
  if (!statusesAllowingTask.has(status)) return { taskId: null, taskTitle: null };

  if (taskId != null) {
    const task = await prisma.task.findFirst({
      where: { id: taskId, ...assignableTasksWhere(employeeId, now) },
      select: { id: true, title: true },
    });
    if (!task) {
      throw new WorkingTaskError(
        "TASK_NOT_ASSIGNABLE",
        "That task is not one of yours, is already done, or has left the board"
      );
    }
    return { taskId: task.id, taskTitle: task.title };
  }

  if (!enforce) return { taskId: null, taskTitle: null };

  // With no task you have to say what you are working on. Only required when
  // there is something to pick: otherwise someone with no assigned tasks could
  // not even mark themselves as working.
  if (detail.length >= 3) return { taskId: null, taskTitle: null };

  const assignable = await prisma.task.count({
    where: assignableTasksWhere(employeeId, now),
  });
  if (assignable > 0) {
    throw new WorkingTaskError(
      "TASK_OR_COMMENT_REQUIRED",
      "Pick the task you are going to work on, or write a comment of at least 3 characters if it is other work"
    );
  }

  return { taskId: null, taskTitle: null };
}
