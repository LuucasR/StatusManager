import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
} from "@mui/material";
import { useEffect, useState } from "react";
import { t } from "../../i18n";
import {
  CATEGORY_LABELS,
  PATCH_CATEGORIES,
  formatMs,
  type EntryInput,
  type PatchCategory,
  type PatchEntry,
  type TaskTime,
} from "./patchNotesApi";

type Props = {
  open: boolean;
  /** null = new entry. */
  entry: PatchEntry | null;
  /** Prefill for a new entry started from one of "my tasks". */
  seedTask: TaskTime | null;
  /** Tasks the author booked time on that week: what can be linked. */
  tasks: TaskTime[];
  onClose: () => void;
  onSubmit: (input: EntryInput) => Promise<void>;
};

const NO_TASK = "";

export default function EntryDialog({ open, entry, seedTask, tasks, onClose, onSubmit }: Props) {
  const [category, setCategory] = useState<PatchCategory>("FEATURE");
  const [taskId, setTaskId] = useState<string>(NO_TASK);
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setCategory(entry?.category ?? "FEATURE");
    setTaskId(String(entry?.taskId ?? seedTask?.taskId ?? NO_TASK));
    setBody(entry?.body ?? "");
    setInternal(entry?.internal ?? false);
    setError("");
  }, [open, entry, seedTask]);

  // The linked task stays selectable when editing, even if the author booked no
  // time on it this week (or staff is editing somebody else's entry).
  const options = tasks.filter((task) => task.taskId != null);
  if (entry?.taskId != null && !options.some((task) => task.taskId === entry.taskId)) {
    options.push({
      key: `id:${entry.taskId}`,
      taskId: entry.taskId,
      title: entry.task?.title ?? entry.taskTitle ?? "",
      state: entry.task?.state ?? null,
      totalMs: 0,
    });
  }

  async function submit() {
    setSaving(true);
    setError("");
    try {
      await onSubmit({
        category,
        body: body.trim(),
        taskId: taskId === NO_TASK ? null : Number(taskId),
        internal,
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{entry ? t("patchNotes.editEntry") : t("patchNotes.newEntry")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <TextField
            select
            label={t("patchNotes.category")}
            value={category}
            onChange={(event) => setCategory(event.target.value as PatchCategory)}
          >
            {PATCH_CATEGORIES.map((value) => (
              <MenuItem key={value} value={value}>
                {CATEGORY_LABELS[value]}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            label={t("patchNotes.linkedTask")}
            value={taskId}
            onChange={(event) => setTaskId(event.target.value)}
            helperText={t("patchNotes.linkedTaskHelp")}
          >
            <MenuItem value={NO_TASK}>{t("patchNotes.noTask")}</MenuItem>
            {options.map((task) => (
              <MenuItem key={task.key} value={String(task.taskId)}>
                #{task.taskId} {task.title}
                {task.totalMs > 0 ? ` · ${formatMs(task.totalMs)}` : ""}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            label={t("patchNotes.note")}
            placeholder={t("patchNotes.notePlaceholder")}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            multiline
            minRows={4}
            slotProps={{ htmlInput: { maxLength: 2000 } }}
            autoFocus
          />

          <FormControlLabel
            control={<Switch checked={internal} onChange={(event) => setInternal(event.target.checked)} />}
            label={t("patchNotes.internal")}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          {t("common.cancel")}
        </Button>
        <Button variant="contained" onClick={submit} disabled={saving || body.trim().length < 3}>
          {saving ? t("common.saving") : t("patchNotes.saveEntry")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
