import type { Role } from "@prisma/client";

/**
 * Permission matrix, in one place.
 *
 * - EMPLOYEE     : their own day, their own history, the tasks they take part in.
 * - TASK_MANAGER : also runs the board (creates, edits, deletes, moves and pins
 *                  any task). Does NOT see the team's history or reports, does
 *                  not request confirmations and does not read the chat of
 *                  tasks they are not part of.
 * - SUPERVISOR   : task management plus visibility of the team: history,
 *                  reports, activity confirmation and the chat of any task.
 *                  Does NOT touch accounts or other people's statuses.
 * - ADMIN        : all of the above plus account management (create, role,
 *                  deactivate, approve sign-ups, password changes) and changing
 *                  another employee's status.
 *
 * These are TWO distinct capabilities, not a ladder: `canManageTasks` (the
 * board) and `isStaff` (seeing the team). TASK_MANAGER has the first without
 * the second.
 */

/** Runs the task board: admin, supervisor or task manager. */
export function canManageTasks(role: Role | undefined) {
  return role === "ADMIN" || role === "SUPERVISOR" || role === "TASK_MANAGER";
}

/** Sees the team: history, reports and other people's chats. Admin or supervisor. */
export function isStaff(role: Role | undefined) {
  return role === "ADMIN" || role === "SUPERVISOR";
}

/** Admin only: accounts, roles and other people's statuses. */
export function isAdmin(role: Role | undefined) {
  return role === "ADMIN";
}

export const ROLE_LABELS: Record<Role, string> = {
  EMPLOYEE: "Employee",
  TASK_MANAGER: "Task manager",
  SUPERVISOR: "Supervisor",
  ADMIN: "Administrator",
};
