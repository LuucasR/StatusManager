import { api } from "../../api";

export type AnnouncementPriority = "CRITICAL" | "IMPORTANT" | "INFO";

export const PRIORITY_ORDER: AnnouncementPriority[] = ["CRITICAL", "IMPORTANT", "INFO"];

export type Announcement = {
  id: number;
  title: string;
  body: string;
  priority: AnnouncementPriority;
  pinned: boolean;
  authorId: number | null;
  authorName: string;
  createdAt: string;
  updatedAt: string;
  /** When I read it, or null. */
  readAt: string | null;
  /** How many of the active team have read it, out of how many. */
  readCount: number;
  teamCount: number;
  readByAll: boolean;
};

export type AnnouncementPayload = {
  title: string;
  body: string;
  priority: AnnouncementPriority;
  pinned: boolean;
};

export type AnnouncementReader = {
  employee: { id: number; employeeNumber: number; name: string };
  readAt: string | null;
};

/** Already sorted by the server: priority, then pinned, then newest. */
export const listAnnouncements = () => api<Announcement[]>("/announcements");

export const markAnnouncementRead = (id: number) =>
  api<{ success: boolean }>(`/announcements/${id}/read`, { method: "POST" });

export const listAnnouncementReaders = (id: number) =>
  api<AnnouncementReader[]>(`/announcements/${id}/reads`);

export const createAnnouncement = (payload: AnnouncementPayload) =>
  api<Announcement>("/announcements", { method: "POST", body: JSON.stringify(payload) });

export const updateAnnouncement = (id: number, payload: Partial<AnnouncementPayload>) =>
  api<Announcement>(`/announcements/${id}`, { method: "PATCH", body: JSON.stringify(payload) });

export const deleteAnnouncement = (id: number) =>
  api<{ success: boolean }>(`/announcements/${id}`, { method: "DELETE" });
