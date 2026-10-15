import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useState, type ChangeEvent } from "react";
import ParticipantSelect from "../tasks/ParticipantSelect";
import { STATE_META, STATE_ORDER, type TaskParticipant, type TaskState } from "../tasks/types";
import { t } from "../../i18n";
import { REGION_COLORS, type MapRegion, type Rect, type RegionInput } from "./mapsApi";

export type LinkableTask = { id: number; title: string };

type Props = {
  open: boolean;
  /** null = a new sector, drawn as `rect`. */
  region: MapRegion | null;
  rect: Rect | null;
  /** Active accounts only (the team list), so nobody deactivated is offered. */
  employees: TaskParticipant[];
  tasks: LinkableTask[];
  onClose: () => void;
  onSubmit: (input: RegionInput) => Promise<void>;
  /** Editing only: back to the map to drag a new rectangle for this sector. */
  onRedraw?: () => void;
};

export default function RegionDialog({
  open,
  region,
  rect,
  employees,
  tasks,
  onClose,
  onSubmit,
  onRedraw,
}: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [state, setState] = useState<TaskState>("PENDING");
  /** null = painted with the state's color. */
  const [color, setColor] = useState<string | null>(null);
  const [people, setPeople] = useState<TaskParticipant[]>([]);
  const [task, setTask] = useState<LinkableTask | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle(region?.title ?? "");
    setDescription(region?.description ?? "");
    setState(region?.state ?? "PENDING");
    setColor(region?.color ?? null);
    // Same objects as the options, and only people still active.
    setPeople(
      (region?.assignees ?? []).flatMap((person) => employees.filter((e) => e.id === person.id))
    );
    setTask(region?.task ? (tasks.find((item) => item.id === region.task!.id) ?? region.task) : null);
    setError("");
    setSaving(false);
  }, [open, region, employees, tasks]);

  async function submit() {
    const shape = rect ?? region;
    if (!shape) return;
    setSaving(true);
    try {
      await onSubmit({
        x: shape.x,
        y: shape.y,
        w: shape.w,
        h: shape.h,
        title: title.trim(),
        description: description.trim(),
        state,
        color,
        assigneeIds: people.map((person) => person.id),
        taskId: task?.id ?? null,
      });
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{region ? t("maps.editRegion") : t("maps.newRegion")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label={t("maps.regionTitle")}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            autoFocus
            slotProps={{ htmlInput: { maxLength: 120 } }}
          />
          <Box>
            <Typography variant="caption" color="text.secondary">
              {t("maps.regionColor")}
            </Typography>
            <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: "wrap", mt: 0.75, alignItems: "center" }}>
              <Chip
                size="small"
                label={t("maps.colorByState")}
                onClick={() => setColor(null)}
                variant={color === null ? "filled" : "outlined"}
                color={color === null ? "primary" : "default"}
                avatar={<Box component="span" sx={{ bgcolor: `${STATE_META[state].accent} !important`, borderRadius: "50%" }} />}
              />
              {REGION_COLORS.map((swatch) => (
                <Box
                  key={swatch}
                  component="button"
                  type="button"
                  aria-label={swatch}
                  aria-pressed={color === swatch}
                  onClick={() => setColor(swatch)}
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    bgcolor: swatch,
                    border: "2px solid",
                    borderColor: color === swatch ? "text.primary" : "transparent",
                    outline: color === swatch ? `2px solid ${swatch}` : "none",
                    outlineOffset: 1,
                    cursor: "pointer",
                    p: 0,
                  }}
                />
              ))}
              {/* Any other color, through the browser's own picker. */}
              <Box
                component="input"
                type="color"
                aria-label={t("maps.customColor")}
                value={color ?? "#888888"}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setColor(event.target.value)}
                sx={{ width: 32, height: 28, p: 0, border: "none", bgcolor: "transparent", cursor: "pointer" }}
              />
            </Stack>
          </Box>
          <TextField
            label={t("maps.regionDescription")}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            multiline
            minRows={3}
            slotProps={{ htmlInput: { maxLength: 2000 } }}
          />
          <TextField
            select
            label={t("common.status")}
            value={state}
            onChange={(event) => setState(event.target.value as TaskState)}
          >
            {STATE_ORDER.map((value) => (
              <MenuItem key={value} value={value}>
                {STATE_META[value].label}
              </MenuItem>
            ))}
          </TextField>
          <ParticipantSelect
            options={employees}
            value={people}
            onChange={setPeople}
            label={t("maps.regionPeople")}
          />
          <Autocomplete
            options={tasks}
            value={task}
            onChange={(_, next) => setTask(next)}
            getOptionLabel={(option) => `#${option.id} · ${option.title}`}
            isOptionEqualToValue={(option, selected) => option.id === selected.id}
            renderInput={(params) => <TextField {...params} label={t("maps.linkedTask")} />}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        {region && onRedraw && (
          <Button onClick={onRedraw} sx={{ mr: "auto" }}>
            {t("maps.redraw")}
          </Button>
        )}
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="contained" onClick={() => void submit()} disabled={saving || !title.trim()}>
          {saving ? t("common.saving") : t("maps.save")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
