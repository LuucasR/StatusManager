import { api } from "../../api";
import type { Task, TaskComment, TaskState } from "./types";

export type TaskPayload = {
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  participantIds: number[];
  /**
   * The whole list, in order: the array index becomes the item's position. An
   * entry carrying an `id` is one that already exists and keeps its tick; one
   * without is new.
   */
  checklist: { id?: number; text: string; assigneeId: number | null }[];
  autoCompleteOnChecklist: boolean;
};

export const listTasks = () => api<Task[]>("/tasks");

export const getTask = (id: number) => api<Task>(`/tasks/${id}`);

export const createTask = (payload: TaskPayload) =>
  api<Task>("/tasks", { method: "POST", body: JSON.stringify(payload) });

export const updateTask = (id: number, payload: Partial<TaskPayload>) =>
  api<Task>(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify(payload) });

export const moveTask = (id: number, state: TaskState) =>
  api<Task>(`/tasks/${id}/state`, { method: "PATCH", body: JSON.stringify({ state }) });

export const pinTask = (id: number, pinned: boolean) =>
  api<Task>(`/tasks/${id}/pin`, { method: "PATCH", body: JSON.stringify({ pinned }) });

/**
 * Ticking one item. Its own call and not part of updateTask because it is a
 * different permission: any participant may tick, only a manager may edit the
 * list itself.
 */
export const setChecklistItem = (taskId: number, itemId: number, done: boolean) =>
  api<Task>(`/tasks/${taskId}/checklist/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify({ done }),
  });

export const deleteTask = (id: number) =>
  api<{ success: boolean }>(`/tasks/${id}`, { method: "DELETE" });

export const addComment = (id: number, body: string) =>
  api<TaskComment>(`/tasks/${id}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
