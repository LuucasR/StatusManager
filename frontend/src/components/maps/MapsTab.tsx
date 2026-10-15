import {
  AddPhotoAlternateRounded,
  CropFreeRounded,
  DeleteOutlineRounded,
  EditRounded,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { api } from "../../api";
import { canManageTasks } from "../roles";
import type { AppOutletContext } from "../../layouts/AppLayout";
import { t, tf } from "../../i18n";
import { useOnReconnect, useSocketEvent } from "../../realtime/useSocketEvent";
import MapCanvas from "./MapCanvas";
import RegionCard from "./RegionCard";
import RegionDialog, { type LinkableTask } from "./RegionDialog";
import {
  MAP_IMAGE_ACCEPT,
  MAP_IMAGE_MAX_BYTES,
  createRegion,
  deleteMap,
  deleteRegion,
  getMap,
  listMaps,
  renameMap,
  updateRegion,
  uploadMap,
  useMapImage,
  type MapRegion,
  type Rect,
  type RegionInput,
  type SiteMap,
  type SiteMapSummary,
} from "./mapsApi";
import { listTasks } from "../tasks/tasksApi";
import { isApprovedTask, type TaskParticipant } from "../tasks/types";

/**
 * A project's Maps tab (on trial): upload a map, drag a rectangle over a sector
 * and say what is being done there. Everyone looks; board managers upload and
 * draw.
 */
export default function MapsTab({ projectId }: { projectId: number }) {
  const { me } = useOutletContext<AppOutletContext>();
  const manager = canManageTasks(me?.role);
  const [searchParams, setSearchParams] = useSearchParams();

  const [maps, setMaps] = useState<SiteMapSummary[] | null>(null);
  const [map, setMap] = useState<SiteMap | null>(null);
  const [error, setError] = useState("");

  const [employees, setEmployees] = useState<TaskParticipant[]>([]);
  const [tasks, setTasks] = useState<LinkableTask[]>([]);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [drawing, setDrawing] = useState(false);
  /** The sector whose rectangle is being redrawn, if that is what the drawing is for. */
  const [redrawing, setRedrawing] = useState<MapRegion | null>(null);
  const [dialog, setDialog] = useState<{ region: MapRegion | null; rect: Rect | null } | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  const mapIdParam = Number(searchParams.get("map")) || null;
  // A ?map= left over from another project (or a deleted map) falls back to
  // this project's newest one.
  const mapId = maps?.some((item) => item.id === mapIdParam)
    ? mapIdParam
    : (maps?.[0]?.id ?? null);
  const image = useMapImage(mapId);

  const loadMaps = useCallback(async () => {
    try {
      setMaps(await listMaps(projectId));
    } catch (err) {
      setError((err as Error).message);
    }
  }, [projectId]);

  const loadMap = useCallback(async () => {
    if (!mapId) {
      setMap(null);
      return;
    }
    try {
      setMap(await getMap(mapId));
    } catch (err) {
      setMap(null);
      setError((err as Error).message);
    }
  }, [mapId]);

  useEffect(() => {
    void loadMaps();
  }, [loadMaps]);
  useEffect(() => {
    void loadMap();
  }, [loadMap]);

  // Only the managers fill in the form, so only they need its options.
  useEffect(() => {
    if (!manager) return;
    void Promise.all([api<TaskParticipant[]>("/activities/team"), listTasks()])
      .then(([team, taskList]) => {
        setEmployees(team.map((e) => ({ id: e.id, employeeNumber: e.employeeNumber, name: e.name })));
        setTasks(taskList.filter(isApprovedTask).map((task) => ({ id: task.id, title: task.title })));
      })
      .catch((err: Error) => setError(err.message));
  }, [manager]);

  useSocketEvent("maps:changed", () => {
    void loadMaps();
    void loadMap();
  });
  useOnReconnect(() => {
    void loadMaps();
    void loadMap();
  });

  const regions = useMemo(() => map?.regions ?? [], [map]);

  function pickMap(id: number) {
    setSelectedId(null);
    setDrawing(false);
    setSearchParams({ map: String(id) }, { replace: true });
  }

  function select(region: MapRegion) {
    setSelectedId(region.id);
    document.getElementById(`map-region-${region.id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  async function onDrawn(rect: Rect) {
    setDrawing(false);
    if (redrawing && map) {
      const region = redrawing;
      setRedrawing(null);
      try {
        await updateRegion(map.id, region.id, rect);
        await loadMap();
      } catch (err) {
        setError((err as Error).message);
      }
      return;
    }
    setDialog({ region: null, rect });
  }

  async function submitRegion(input: RegionInput) {
    if (!map || !dialog) return;
    const saved = dialog.region
      ? await updateRegion(map.id, dialog.region.id, input)
      : await createRegion(map.id, input);
    setDialog(null);
    setSelectedId(saved.id);
    await loadMap();
  }

  async function removeRegion(region: MapRegion) {
    if (!map || !window.confirm(tf("maps.confirmDeleteRegion", { title: region.title }))) return;
    try {
      await deleteRegion(map.id, region.id);
      await loadMap();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function rename() {
    if (!map) return;
    const title = window.prompt(t("maps.renamePrompt"), map.title)?.trim();
    if (!title || title === map.title) return;
    try {
      await renameMap(map.id, title);
      await Promise.all([loadMaps(), loadMap()]);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function removeMap() {
    if (!map || !window.confirm(tf("maps.confirmDeleteMap", { title: map.title }))) return;
    try {
      await deleteMap(map.id);
      setSearchParams({}, { replace: true });
      setMap(null);
      await loadMaps();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (!me || !maps) {
    return (
      <Box sx={{ py: 4 }}>
        {error ? <Alert severity="error">{error}</Alert> : <CircularProgress />}
      </Box>
    );
  }

  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1}
        sx={{ alignItems: { sm: "center" }, justifyContent: "space-between" }}
      >
        <Typography color="text.secondary">
          {manager ? t("maps.subtitleManager") : t("maps.subtitle")}
        </Typography>
        {manager && (
          <Button
            variant="contained"
            startIcon={<AddPhotoAlternateRounded />}
            onClick={() => setUploadOpen(true)}
            sx={{ flexShrink: 0 }}
          >
            {t("maps.upload")}
          </Button>
        )}
      </Stack>

      {maps.length === 0 ? (
        <Paper className="status-card" elevation={0} sx={{ p: 3, mt: 3 }}>
          <Typography color="text.secondary">{t("maps.empty")}</Typography>
        </Paper>
      ) : (
        <>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            sx={{ mt: 3, mb: 2, alignItems: { sm: "center" } }}
          >
            <TextField
              select
              size="small"
              label={t("maps.pick")}
              value={mapId ?? ""}
              onChange={(event) => pickMap(Number(event.target.value))}
              sx={{ minWidth: 260 }}
            >
              {maps.map((item) => (
                <MenuItem key={item.id} value={item.id}>
                  {item.title} ({item.regionsCount})
                </MenuItem>
              ))}
            </TextField>
            {manager && map && (
              <>
                <Button
                  variant={drawing ? "contained" : "outlined"}
                  startIcon={<CropFreeRounded />}
                  onClick={() => {
                    setRedrawing(null);
                    setDrawing((value) => !value);
                  }}
                >
                  {drawing ? t("maps.stopDrawing") : t("maps.draw")}
                </Button>
                <Box sx={{ flex: 1 }} />
                <Button startIcon={<EditRounded />} onClick={() => void rename()}>
                  {t("maps.rename")}
                </Button>
                <Button color="error" startIcon={<DeleteOutlineRounded />} onClick={() => void removeMap()}>
                  {t("maps.deleteMap")}
                </Button>
              </>
            )}
          </Stack>

          {drawing && (
            <Alert severity="info" sx={{ mb: 2 }}>
              {redrawing ? tf("maps.redrawHint", { title: redrawing.title }) : t("maps.drawHint")}
            </Alert>
          )}
          {image.error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {image.error}
            </Alert>
          )}

          <Box
            sx={{
              display: "grid",
              gap: 2,
              gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "minmax(0, 2.2fr) minmax(0, 1fr)" },
              alignItems: "start",
            }}
          >
            <MapCanvas
              imageUrl={image.url}
              regions={regions}
              selectedId={selectedId}
              onSelect={select}
              drawing={drawing}
              onDrawn={(rect) => void onDrawn(rect)}
            />

            <Stack spacing={1.5} sx={{ maxHeight: { md: "75vh" }, overflowY: { md: "auto" }, pr: { md: 0.5 } }}>
              <Typography variant="overline" color="text.secondary">
                {tf("maps.regions", { count: regions.length })}
              </Typography>
              {regions.length === 0 && (
                <Typography variant="body2" color="text.secondary">
                  {manager ? t("maps.noRegionsManager") : t("maps.noRegions")}
                </Typography>
              )}
              {regions.map((region) => (
                <Box key={region.id} id={`map-region-${region.id}`}>
                  <RegionCard
                    region={region}
                    selected={region.id === selectedId}
                    canEdit={manager}
                    onSelect={select}
                    onEdit={(item) => setDialog({ region: item, rect: null })}
                    onDelete={(item) => void removeRegion(item)}
                  />
                </Box>
              ))}
            </Stack>
          </Box>
        </>
      )}

      <RegionDialog
        open={Boolean(dialog)}
        region={dialog?.region ?? null}
        rect={dialog?.rect ?? null}
        employees={employees}
        tasks={tasks}
        onClose={() => setDialog(null)}
        onSubmit={submitRegion}
        onRedraw={() => {
          setRedrawing(dialog?.region ?? null);
          setDialog(null);
          setDrawing(true);
        }}
      />

      <UploadMapDialog
        projectId={projectId}
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={async (id) => {
          setUploadOpen(false);
          await loadMaps();
          pickMap(id);
        }}
      />
    </Box>
  );
}

function UploadMapDialog({
  projectId,
  open,
  onClose,
  onUploaded,
}: {
  projectId: number;
  open: boolean;
  onClose: () => void;
  onUploaded: (id: number) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setFile(null);
    setSaving(false);
    setError("");
  }, [open]);

  function pick(next: File | null) {
    setError("");
    if (next && next.size > MAP_IMAGE_MAX_BYTES) {
      setFile(null);
      setError(t("error.MAP_IMAGE_TOO_LARGE"));
      return;
    }
    setFile(next);
    // The file name is a fair first guess at the title.
    if (next && !title.trim()) setTitle(next.name.replace(/\.[^.]+$/, ""));
  }

  async function submit() {
    if (!file) return;
    setSaving(true);
    try {
      const { id } = await uploadMap(projectId, title.trim(), file);
      await onUploaded(id);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t("maps.upload")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <Button variant="outlined" component="label" startIcon={<AddPhotoAlternateRounded />}>
            {file ? file.name : t("maps.chooseImage")}
            <input
              hidden
              type="file"
              accept={MAP_IMAGE_ACCEPT}
              onChange={(event) => pick(event.target.files?.[0] ?? null)}
            />
          </Button>
          <Typography variant="caption" color="text.secondary">
            {t("maps.imageHint")}
          </Typography>
          <TextField
            label={t("maps.mapTitle")}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            slotProps={{ htmlInput: { maxLength: 120 } }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button
          variant="contained"
          onClick={() => void submit()}
          disabled={saving || !file || !title.trim()}
        >
          {saving ? t("maps.uploading") : t("maps.upload")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
