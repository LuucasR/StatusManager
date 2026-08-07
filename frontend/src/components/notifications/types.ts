import {
  ChatBubbleRounded,
  PersonAddAlt1Rounded,
  PersonRemoveAlt1Rounded,
  SwapHorizRounded,
} from "@mui/icons-material";
import type { SvgIconComponent } from "@mui/icons-material";

export type NotificationType =
  | "TASK_ADDED"
  | "TASK_REMOVED"
  | "TASK_STATE"
  | "TASK_MESSAGE";

export type AppNotification = {
  id: number;
  type: NotificationType;
  title: string;
  body: string;
  taskId: number | null;
  readAt: string | null;
  createdAt: string;
};

/** Mismo molde que STATE_META: tipado exhaustivo para que agregar un tipo rompa. */
export const NOTIFICATION_META: Record<
  NotificationType,
  { Icon: SvgIconComponent; accent: string; soft: string }
> = {
  TASK_ADDED: { Icon: PersonAddAlt1Rounded, accent: "#2eae70", soft: "#e2f6eb" },
  TASK_REMOVED: { Icon: PersonRemoveAlt1Rounded, accent: "#b23c4a", soft: "#fbe7ea" },
  TASK_STATE: { Icon: SwapHorizRounded, accent: "#5b5ce2", soft: "#ecebff" },
  TASK_MESSAGE: { Icon: ChatBubbleRounded, accent: "#16738b", soft: "#e2f5f8" },
};

export type NotificationPage = {
  items: AppNotification[];
  hasMore: boolean;
  nextBefore: number | null;
  unreadCount: number;
};
