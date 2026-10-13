import type { TaskChecklistItem } from "./types";

/** "all", "none" (nobody in charge) or an employee id. */
export type ChecklistMemberFilter = "all" | "none" | number;

export type ChecklistFilters = {
  query: string;
  status: "all" | "open" | "done";
  member: ChecklistMemberFilter;
  /** With a member picked: only the items that person has to themselves. */
  onlyMember: boolean;
};

export const EMPTY_CHECKLIST_FILTERS: ChecklistFilters = {
  query: "",
  status: "all",
  member: "all",
  onlyMember: false,
};

export const hasChecklistFilters = (filters: ChecklistFilters) =>
  filters.query.trim() !== "" || filters.status !== "all" || filters.member !== "all";

/** Lower case and without accents, so "gonzalez" finds "González". */
const fold = (value: string) =>
  value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** The text matches the item itself or the name of somebody in charge of it. */
export function filterChecklist(items: TaskChecklistItem[], filters: ChecklistFilters) {
  const query = fold(filters.query.trim());
  return items.filter((item) => {
    if (filters.status === "open" && item.done) return false;
    if (filters.status === "done" && !item.done) return false;

    if (filters.member === "none" && item.assignees.length > 0) return false;
    if (typeof filters.member === "number") {
      const ids = item.assignees.map((assignee) => assignee.id);
      if (!ids.includes(filters.member)) return false;
      if (filters.onlyMember && ids.length > 1) return false;
    }

    if (!query) return true;
    return (
      fold(item.text).includes(query) ||
      item.assignees.some((assignee) => fold(assignee.name).includes(query))
    );
  });
}
