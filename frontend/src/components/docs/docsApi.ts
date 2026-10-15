import { api } from "../../api";

export type DocSummary = {
  id: number;
  projectId: number;
  title: string;
  section: string;
  createdByName: string;
  updatedByName: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectDoc = DocSummary & { body: string; createdById: number | null };

export type DocInput = { title: string; section: string; body: string };

export const listDocs = (projectId: number) => api<DocSummary[]>(`/docs?projectId=${projectId}`);
export const getDoc = (id: number) => api<ProjectDoc>(`/docs/${id}`);

export const createDoc = (projectId: number, input: DocInput) =>
  api<ProjectDoc>("/docs", { method: "POST", body: JSON.stringify({ projectId, ...input }) });

/** `updatedAt` is the version the editor loaded: a newer save answers DOC_EDIT_CONFLICT. */
export const updateDoc = (id: number, input: DocInput, updatedAt: string) =>
  api<ProjectDoc>(`/docs/${id}`, { method: "PATCH", body: JSON.stringify({ ...input, updatedAt }) });

export const deleteDoc = (id: number) => api(`/docs/${id}`, { method: "DELETE" });
