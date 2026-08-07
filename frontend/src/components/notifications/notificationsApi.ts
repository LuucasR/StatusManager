import { api } from "../../api";
import type { NotificationPage } from "./types";

export const listNotifications = (before?: number | null) =>
  api<NotificationPage>(`/notifications${before ? `?before=${before}` : ""}`);

export const markNotificationRead = (id: number) =>
  api<{ success: boolean; unreadCount: number }>(`/notifications/${id}/read`, {
    method: "POST",
  });

export const markAllNotificationsRead = () =>
  api<{ success: boolean; unreadCount: number }>("/notifications/read-all", {
    method: "POST",
  });
