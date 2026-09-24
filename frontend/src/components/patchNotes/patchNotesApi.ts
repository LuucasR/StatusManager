import { api } from "../../api";
import { getApiUrl } from "../../serverConfig";
import { lazyLabels, type TranslationKey } from "../../i18n";
import type { TaskState } from "../tasks/types";

export type PatchWeekStatus = "DRAFT" | "CLOSED" | "PUBLISHED";

export const PATCH_CATEGORIES = [
  "FEATURE",
  "CONTENT",
  "BALANCE",
  "FIX",
  "ART",
  "AUDIO",
  "UI",
  "PERFORMANCE",
  "OTHER",
] as const;
export type PatchCategory = (typeof PATCH_CATEGORIES)[number];

export const CATEGORY_LABELS = lazyLabels(
  PATCH_CATEGORIES,
  (category) => `patchNotes.category.${category}` as TranslationKey
);

export const WEEK_STATUS_LABELS = lazyLabels(
  ["DRAFT", "CLOSED", "PUBLISHED"] as const,
  (status) => `patchNotes.status.${status}` as TranslationKey
);

export type PatchWeek = {
  id: number | null;
  weekStart: string;
  version: string | null;
  title: string | null;
  summary: string;
  status: PatchWeekStatus;
  closedAt: string | null;
  publishedAt: string | null;
  publishedBy: { id: number; name: string } | null;
};

export type PatchEntry = {
  id: number;
  authorId: number | null;
  authorName: string;
  taskId: number | null;
  taskTitle: string | null;
  category: PatchCategory;
  body: string;
  internal: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
  task: { title: string; state: TaskState } | null;
  /** Team total on the linked task that week; 0 without a task or time. */
  taskMs: number;
};

export type WeekListItem = {
  weekStart: string;
  version: string | null;
  title: string | null;
  status: PatchWeekStatus;
  entryCount: number;
};

export type WeekDetail = {
  weekStart: string;
  weekEnd: string;
  week: PatchWeek;
  entries: PatchEntry[];
};

export type TaskTime = {
  key: string;
  taskId: number | null;
  title: string;
  state: TaskState | null;
  totalMs: number;
};

export type TeamTaskTime = TaskTime & {
  byEmployee: { id: number; name: string; ms: number }[];
};

export type WeekInsights = {
  taskTimes: TeamTaskTime[];
  undocumentedTasks: TeamTaskTime[];
  missingAuthors: { id: number; name: string }[];
};

export type EntryInput = {
  category: PatchCategory;
  body: string;
  taskId: number | null;
  internal: boolean;
};

export function listWeeks() {
  return api<{ current: string; weeks: WeekListItem[] }>("/patch-notes/weeks");
}

export function getWeek(weekStart: string) {
  return api<WeekDetail>(`/patch-notes/weeks/${weekStart}`);
}

export function getMyTasks(weekStart: string) {
  return api<TaskTime[]>(`/patch-notes/weeks/${weekStart}/my-tasks`);
}

export function createEntry(weekStart: string, input: EntryInput) {
  return api<PatchEntry>(`/patch-notes/weeks/${weekStart}/entries`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateEntry(id: number, input: Partial<EntryInput>) {
  return api<PatchEntry>(`/patch-notes/entries/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteEntry(id: number) {
  return api<{ success: true }>(`/patch-notes/entries/${id}`, { method: "DELETE" });
}

/** Staff only. */
export function getInsights(weekStart: string) {
  return api<WeekInsights>(`/patch-notes/weeks/${weekStart}/insights`);
}

/** Staff only. */
export function updateWeek(
  weekStart: string,
  patch: { title?: string | null; summary?: string; version?: string | null }
) {
  return api<PatchWeek>(`/patch-notes/weeks/${weekStart}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

/** Staff only. */
export function setWeekStatus(weekStart: string, status: PatchWeekStatus) {
  return api<PatchWeek>(`/patch-notes/weeks/${weekStart}/status`, {
    method: "POST",
    body: JSON.stringify({ status }),
  });
}

/** Staff only. Fed to usePdfPreview, which adds the token. */
export function reportUrl(weekStart: string, mode: "internal" | "public") {
  return `${getApiUrl()}/patch-notes/weeks/${weekStart}/report.pdf?mode=${mode}`;
}

/** `day` plus `days` calendar days, on "YYYY-MM-DD" strings. */
export function addDays(day: string, days: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** "3 h 07 min" / "45 min". Same shape as the PDF and the summary page. */
export function formatMs(ms: number) {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} h`;
  return `${hours} h ${String(rest).padStart(2, "0")} min`;
}
