import { useEffect, useState } from "react";
import { api, apiBlob, apiUpload } from "../../api";
import { STATE_META, type TaskParticipant, type TaskState } from "../tasks/types";

/** Mirrors MAP_IMAGE_MAX_BYTES in the backend's maps-validation.ts. */
export const MAP_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const MAP_IMAGE_ACCEPT = "image/png,image/jpeg,image/webp";

export type MapApproval = "APPROVED" | "PENDING" | "REJECTED";

export type SiteMapSummary = {
  id: number;
  projectId: number;
  title: string;
  /** A map uploaded by anyone but an admin waits PENDING for one. */
  approval: MapApproval;
  reviewedAt: string | null;
  rejectReason: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: TaskParticipant | null;
  regionsCount: number;
};

/** A rectangle as fractions (0..1) of the image, so it holds at any size. */
export type Rect = { x: number; y: number; w: number; h: number };

export type MapRegion = Rect & {
  id: number;
  title: string;
  description: string;
  state: TaskState;
  /** "#rrggbb", or null to paint it with the state's color. */
  color: string | null;
  createdBy: TaskParticipant | null;
  task: { id: number; title: string; state: TaskState } | null;
  assignees: TaskParticipant[];
  createdAt: string;
  updatedAt: string;
};

export type SiteMap = SiteMapSummary & { regions: MapRegion[] };

export type RegionInput = Rect & {
  title: string;
  description: string;
  state: TaskState;
  color: string | null;
  assigneeIds: number[];
  taskId: number | null;
};

export const listMaps = (projectId: number) => api<SiteMapSummary[]>(`/maps?projectId=${projectId}`);
export const getMap = (id: number) => api<SiteMap>(`/maps/${id}`);

export const uploadMap = (projectId: number, title: string, file: File) =>
  apiUpload<{ id: number; approval: MapApproval }>(`/maps?projectId=${projectId}&title=${encodeURIComponent(title)}`, file);

export const renameMap = (id: number, title: string) =>
  api(`/maps/${id}`, { method: "PATCH", body: JSON.stringify({ title }) });

export const deleteMap = (id: number) => api(`/maps/${id}`, { method: "DELETE" });

/** Admin only. */
export const approveMap = (id: number) => api(`/maps/${id}/approve`, { method: "POST" });

/** Admin only. */
export const rejectMap = (id: number, reason: string) =>
  api(`/maps/${id}/reject`, { method: "POST", body: JSON.stringify(reason ? { reason } : {}) });

/** What a sector is painted with: its own color, or its state's. */
export const regionColor = (region: { color: string | null; state: TaskState }) =>
  region.color ?? STATE_META[region.state].accent;

/** Picks for a sector's color; null = its state's color. */
export const REGION_COLORS = [
  "#e5484d",
  "#f76b15",
  "#ffc53d",
  "#30a46c",
  "#12a594",
  "#0090ff",
  "#3e63dd",
  "#8e4ec6",
  "#d6409f",
  "#8d6e63",
] as const;

export const createRegion = (mapId: number, input: RegionInput) =>
  api<MapRegion>(`/maps/${mapId}/regions`, { method: "POST", body: JSON.stringify(input) });

export const updateRegion = (mapId: number, regionId: number, input: Partial<RegionInput>) =>
  api<MapRegion>(`/maps/${mapId}/regions/${regionId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });

export const deleteRegion = (mapId: number, regionId: number) =>
  api(`/maps/${mapId}/regions/${regionId}`, { method: "DELETE" });

/**
 * The map's image as a blob URL: the route needs the Bearer token, which an
 * <img src> cannot send. Revoked when the map changes or the page unmounts.
 */
export function useMapImage(mapId: number | null) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!mapId) return;
    let href: string | null = null;
    let cancelled = false;
    setUrl(null);
    setError("");

    apiBlob(`/maps/${mapId}/image`)
      .then((blob) => {
        if (cancelled) return;
        href = URL.createObjectURL(blob);
        setUrl(href);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
      if (href) URL.revokeObjectURL(href);
    };
  }, [mapId]);

  return { url: mapId ? url : null, error };
}
