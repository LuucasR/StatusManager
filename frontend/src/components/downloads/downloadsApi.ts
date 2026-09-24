import { api } from "../../api";

export type Utility = {
  id: number;
  name: string;
  description: string;
  version: string;
  /** Where the installer is hosted. The browser downloads straight from it. */
  url: string;
  sizeLabel: string;
  platform: string;
  position: number;
  updatedAt: string;
};

export type UtilityInput = Omit<Utility, "id" | "updatedAt">;

export function listUtilities() {
  return api<Utility[]>("/downloads");
}

/** Admin only, like updateUtility and deleteUtility. */
export function createUtility(input: UtilityInput) {
  return api<Utility>("/downloads", { method: "POST", body: JSON.stringify(input) });
}

export function updateUtility(id: number, input: Partial<UtilityInput>) {
  return api<Utility>(`/downloads/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteUtility(id: number) {
  return api<{ success: true }>(`/downloads/${id}`, { method: "DELETE" });
}
