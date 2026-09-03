/**
 * Single source of truth for activity statuses on the frontend.
 *
 * DashboardPage and SummaryPage each carried their own copy of the type, the
 * labels and the colours, so a change had to be made in three places (counting
 * the backend) and drifting was silent.
 *
 * The backend keeps its own copy in activities/activity-status.ts because it
 * needs the labels to render PDFs; that duplication crosses a process boundary
 * and is deliberate. This one did not.
 */
import { lazyLabels } from "../../i18n";

export type Status =
  | "AVAILABLE"
  | "WORKING"
  | "BREAK"
  | "LUNCH"
  | "MEETING"
  | "OFFLINE"
  | "DISCONNECTED"
  | "AUTO_DISCONNECTED";

/**
 * Mirrors STATUS_META in the backend.
 *
 * "Away" (OFFLINE) is a justified absence and IS audited; "Disconnected" means
 * nobody is there and there is nothing to report, so it never reaches the
 * history. Keeping the two words distinct matters: they are not synonyms here.
 *
 * "Auto-disconnected" is a third thing again: the app set it because the person
 * did not answer the end-of-day check. Unlike Disconnected it IS audited, since
 * it is the finding the check exists to produce.
 */
export const STATUS_ORDER: Status[] = [
  "AVAILABLE",
  "WORKING",
  "BREAK",
  "LUNCH",
  "MEETING",
  "OFFLINE",
  "DISCONNECTED",
  "AUTO_DISCONNECTED",
];

export const STATUS_LABELS = lazyLabels(STATUS_ORDER, (status) => `status.${status}` as const);

/** Hex per status, matching the palette the PDF reports use. */
export const STATUS_COLORS: Record<Status, string> = {
  AVAILABLE: "#208454",
  WORKING: "#4C4DC9",
  BREAK: "#A66A00",
  LUNCH: "#8C4EA3",
  MEETING: "#16738B",
  OFFLINE: "#666A7D",
  DISCONNECTED: "#B23C4A",
  AUTO_DISCONNECTED: "#C2410C",
};

/** MUI Chip palette slots, for the places that render a <Chip> instead of raw hex. */
export const STATUS_CHIP_COLORS: Record<
  Status,
  "success" | "primary" | "warning" | "secondary" | "info" | "default" | "error"
> = {
  AVAILABLE: "success",
  WORKING: "primary",
  BREAK: "warning",
  LUNCH: "secondary",
  MEETING: "info",
  OFFLINE: "default",
  DISCONNECTED: "error",
  AUTO_DISCONNECTED: "warning",
};

/**
 * Statuses that require a comment. Mirrors statusesRequiringDetail in the
 * backend. WORKING left the list once a task could be declared; it demands one
 * again only when "no task" is chosen.
 */
export const requiresDetail = new Set<Status>(["OFFLINE"]);

/**
 * What a person may pick for themselves.
 *
 * AUTO_DISCONNECTED is excluded because only the activity check produces it;
 * offering it would let someone file themselves as having failed a check they
 * were never shown. The backend refuses it too (activity-validation.ts) - this
 * list only keeps it out of the menu.
 */
export const SELECTABLE_STATUSES: Status[] = STATUS_ORDER.filter(
  (status) => status !== "AUTO_DISCONNECTED"
);

/** Only status where a task is declared. Mirrors statusesAllowingTask. */
export const allowsTask = new Set<Status>(["WORKING"]);
