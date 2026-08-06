import { api } from "../../api";
import type { Task, TaskComment, TaskState } from "./types";

export type TaskPayload = {
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  participantIds: number[];
};

export const listTasks = () => api<Task[]>("/tasks");

export const getTask = (id: number) => api<Task>(`/tasks/${id}`);

export const createTask = (payload: TaskPayload) =>
  api<Task>("/tasks", { method: "POST", body: JSON.stringify(payload) });

export const updateTask = (id: number, payload: Partial<TaskPayload>) =>
  api<Task>(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify(payload) });

export const moveTask = (id: number, state: TaskState) =>
  api<Task>(`/tasks/${id}/state`, { method: "PATCH", body: JSON.stringify({ state }) });

export const deleteTask = (id: number) =>
  api<{ success: boolean }>(`/tasks/${id}`, { method: "DELETE" });

export const addComment = (id: number, body: string) =>
  api<TaskComment>(`/tasks/${id}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
