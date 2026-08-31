import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
} from "@mui/material";
import { useEffect, useState } from "react";
import ParticipantSelect from "./ParticipantSelect";
import { fromLocalInputValue, toLocalInputValue } from "./datetime";
import type { Task, TaskParticipant } from "./types";
import type { TaskPayload } from "./tasksApi";
import { t } from "../../i18n";

type Props = {
  open: boolean;
  task: Task | null;
  employees: TaskParticipant[];
  onClose: () => void;
  onSubmit: (payload: TaskPayload, taskId?: number) => Promise<void>;
};

/** Defaults to tomorrow 09:00-13:00 so nobody has to type it all out. */
function defaultRange() {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(9, 0, 0, 0);
  const end = new Date(start);
  end.setHours(13, 0, 0, 0);
  return {
    startsAt: toLocalInputValue(start.toISOString()),
    endsAt: toLocalInputValue(end.toISOString()),
  };
}

export default function TaskFormDialog({ open, task, employees, onClose, onSubmit }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [participants, setParticipants] = useState<TaskParticipant[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    setSaving(false);

    if (task) {
      setTitle(task.title);
      setDescription(task.description);
      setStartsAt(toLocalInputValue(task.startsAt));
      setEndsAt(toLocalInputValue(task.endsAt));
      // Rebuilt against `employees` so isOptionEqualToValue sees the same object
      // references as the Autocomplete's options.
      setParticipants(
        task.participants
          .map((participant) => employees.find((e) => e.id === participant.id) ?? participant)
      );
    } else {
      const range = defaultRange();
      setTitle("");
      setDescription("");
      setStartsAt(range.startsAt);
      setEndsAt(range.endsAt);
      setParticipants([]);
    }
  }, [open, task, employees]);

  async function submit() {
    setError("");

    if (title.trim().length < 3) return setError(t("taskForm.titleTooShort"));
    if (!description.trim()) return setError(t("taskForm.descriptionRequired"));
    if (!startsAt || !endsAt) return setError(t("taskForm.datesRequired"));
    // Mirrors the backend validation, so the form does not depend on the round-trip.
    if (new Date(endsAt) <= new Date(startsAt)) {
      return setError(t("error.INVALID_DATE_ORDER"));
    }
    if (participants.length === 0) return setError(t("taskForm.participantsRequired"));

    setSaving(true);
    try {
      await onSubmit(
        {
          title: title.trim(),
          description: description.trim(),
          startsAt: fromLocalInputValue(startsAt),
          endsAt: fromLocalInputValue(endsAt),
          participantIds: participants.map((participant) => participant.id),
        },
        task?.id
      );
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{task ? t("taskForm.edit") : t("taskForm.create")}</DialogTitle>

      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <TextField
            label={t("taskForm.title")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />

          <TextField
            label={t("taskForm.description")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            multiline
            minRows={3}
          />

          <ParticipantSelect
            options={employees}
            value={participants}
            onChange={setParticipants}
          />

          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              label="Inicio"
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="Fin"
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: startsAt } }}
            />
          </Stack>
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" onClick={submit} disabled={saving}>
          {saving ? t("common.saving") : task ? t("taskForm.save") : t("taskForm.submit")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
