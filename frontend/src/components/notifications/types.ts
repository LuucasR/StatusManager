import {
  ChatBubbleRounded,
  PersonAddAlt1Rounded,
  PersonRemoveAlt1Rounded,
  ReportProblemRounded,
  SwapHorizRounded,
} from "@mui/icons-material";
import type { SvgIconComponent } from "@mui/icons-material";
import { softOf } from "../tasks/types";

export type NotificationType =
  | "TASK_ADDED"
  | "TASK_REMOVED"
  | "TASK_STATE"
  | "TASK_MESSAGE"
  | "ACTIVITY_NO_RESPONSE";

export type AppNotification = {
  id: number;
  type: NotificationType;
  title: string;
  body: string;
  taskId: number | null;
  readAt: string | null;
  createdAt: string;
};

/** Same mould as STATE_META: exhaustive typing so adding a type breaks the build. */
export const NOTIFICATION_META: Record<
  NotificationType,
  { Icon: SvgIconComponent; accent: string; soft: string }
> = {
  // `soft` is a color-mix over var(--surface) rather than a pale hex, so the
  // icon chips sit on the panel in either theme instead of glowing white on a
  // dark one. The accents stay literal: they carry meaning and read on both.
  TASK_ADDED: { Icon: PersonAddAlt1Rounded, accent: "#2eae70", soft: softOf("#2eae70") },
  TASK_REMOVED: { Icon: PersonRemoveAlt1Rounded, accent: "#b23c4a", soft: softOf("#b23c4a") },
  TASK_STATE: { Icon: SwapHorizRounded, accent: "#5b5ce2", soft: softOf("#5b5ce2") },
  TASK_MESSAGE: { Icon: ChatBubbleRounded, accent: "#16738b", soft: softOf("#16738b") },
  ACTIVITY_NO_RESPONSE: { Icon: ReportProblemRounded, accent: "#c2410c", soft: softOf("#c2410c") },
};

/**
 * Forgiving lookup, same reasoning as roleMeta(): this union is hand-written
 * rather than generated, so a notification type added to the backend would
 * otherwise resolve to undefined and take the whole bell down with
 * "Cannot read properties of undefined".
 */
export function notificationMeta(type: string) {
  return NOTIFICATION_META[type as NotificationType] ?? NOTIFICATION_META.TASK_STATE;
}

export type NotificationPage = {
  items: AppNotification[];
  hasMore: boolean;
  nextBefore: number | null;
  unreadCount: number;
};
