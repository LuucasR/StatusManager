import { api } from "../../api";

export type Project = {
  id: number;
  name: string;
  createdAt: string;
  mapsCount: number;
  tasksCount: number;
};

export const listProjects = () => api<Project[]>("/projects");

export const createProject = (name: string) =>
  api<Project>("/projects", { method: "POST", body: JSON.stringify({ name }) });

export const renameProject = (id: number, name: string) =>
  api(`/projects/${id}`, { method: "PATCH", body: JSON.stringify({ name }) });

export const deleteProject = (id: number) => api(`/projects/${id}`, { method: "DELETE" });

/** The tools a project has, each a tab of its page. The first one opens. */
export const PROJECT_TABS = ["tasks", "maps", "patch-notes", "docs"] as const;
export type ProjectTab = (typeof PROJECT_TABS)[number];
