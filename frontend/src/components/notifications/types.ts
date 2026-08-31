import {
  ChatBubbleRounded,
  PersonAddAlt1Rounded,
  PersonRemoveAlt1Rounded,
  ReportProblemRounded,
  SwapHorizRounded,
} from "@mui/icons-material";
import type { SvgIconComponent } from "@mui/icons-material";

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
  TASK_ADDED: { Icon: PersonAddAlt1Rounded, accent: "#2eae70", soft: "#e2f6eb" },
  TASK_REMOVED: { Icon: PersonRemoveAlt1Rounded, accent: "#b23c4a", soft: "#fbe7ea" },
  TASK_STATE: { Icon: SwapHorizRounded, accent: "#5b5ce2", soft: "#ecebff" },
  TASK_MESSAGE: { Icon: ChatBubbleRounded, accent: "#16738b", soft: "#e2f5f8" },
  ACTIVITY_NO_RESPONSE: { Icon: ReportProblemRounded, accent: "#c2410c", soft: "#fdebe0" },
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
