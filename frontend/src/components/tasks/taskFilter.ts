import { fold } from "./checklistFilter";
import type { Task, TaskState } from "./types";

export type TaskFilters = {
  query: string;
  status: "all" | TaskState;
  /**
   * Participants: a task has to have EVERY one of them, which is what tells
   * whether a task is shared between them. [] = no filter.
   */
  members: number[];
  /** Tasks with no participants. Excludes `members`. */
  unassigned: boolean;
  /** With people picked: nobody else may take part in the task. */
  onlyMembers: boolean;
};

export const EMPTY_TASK_FILTERS: TaskFilters = {
  query: "",
  status: "all",
  members: [],
  unassigned: false,
  onlyMembers: false,
};

export const hasTaskFilters = (filters: TaskFilters) =>
  filters.query.trim() !== "" ||
  filters.status !== "all" ||
  filters.members.length > 0 ||
  filters.unassigned;

/** The text matches the title, the description or a participant's name or number. */
export function filterTasks(tasks: Task[], filters: TaskFilters) {
  const query = fold(filters.query.trim());
  return tasks.filter((task) => {
    if (filters.status !== "all" && task.state !== filters.status) return false;

    if (filters.unassigned && task.participants.length > 0) return false;
    if (filters.members.length > 0) {
      const ids = task.participants.map((participant) => participant.id);
      if (!filters.members.every((id) => ids.includes(id))) return false;
      if (filters.onlyMembers && ids.length !== filters.members.length) return false;
    }

    if (!query) return true;
    return (
      fold(task.title).includes(query) ||
      fold(task.description).includes(query) ||
      task.participants.some(
        (participant) =>
          fold(participant.name).includes(query) ||
          `#${participant.employeeNumber}`.includes(query)
      )
    );
  });
}
