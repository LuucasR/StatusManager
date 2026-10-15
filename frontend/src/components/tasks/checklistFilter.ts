import type { TaskChecklistItem } from "./types";

export type ChecklistFilters = {
  query: string;
  status: "all" | "open" | "done";
  /**
   * People in charge: an item has to have EVERY one of them, which is what
   * tells whether an item is shared between them. [] = no filter.
   */
  members: number[];
  /** Items with nobody in charge. Excludes `members`. */
  unassigned: boolean;
  /** With people picked: nobody else may be in charge of the item. */
  onlyMembers: boolean;
};

export const EMPTY_CHECKLIST_FILTERS: ChecklistFilters = {
  query: "",
  status: "all",
  members: [],
  unassigned: false,
  onlyMembers: false,
};

export const hasChecklistFilters = (filters: ChecklistFilters) =>
  filters.query.trim() !== "" ||
  filters.status !== "all" ||
  filters.members.length > 0 ||
  filters.unassigned;

/** Lower case and without accents, so "gonzalez" finds "González". */
export const fold = (value: string) =>
  value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** The text matches the item itself or the name of somebody in charge of it. */
export function filterChecklist(items: TaskChecklistItem[], filters: ChecklistFilters) {
  const query = fold(filters.query.trim());
  return items.filter((item) => {
    if (filters.status === "open" && item.done) return false;
    if (filters.status === "done" && !item.done) return false;

    if (filters.unassigned && item.assignees.length > 0) return false;
    if (filters.members.length > 0) {
      const ids = item.assignees.map((assignee) => assignee.id);
      if (!filters.members.every((id) => ids.includes(id))) return false;
      if (filters.onlyMembers && ids.length !== filters.members.length) return false;
    }

    if (!query) return true;
    return (
      fold(item.text).includes(query) ||
      item.assignees.some((assignee) => fold(assignee.name).includes(query))
    );
  });
}
