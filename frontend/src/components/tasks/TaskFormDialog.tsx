import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormHelperText,
  Stack,
  Switch,
  TextField,
} from "@mui/material";
import { useEffect, useState } from "react";
import ChecklistEditor, { type ChecklistDraft } from "./ChecklistEditor";
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

/**
 * Seeds the editor in edit mode. An existing item keys on its own id, which is
 * what tells the backend to keep its tick instead of recreating the row.
 */
function toDrafts(
  items: { id: number; text: string; assignee: { id: number } | null }[]
): ChecklistDraft[] {
  return items.map((item) => ({
    key: item.id,
    id: item.id,
    text: item.text,
    assigneeId: item.assignee?.id ?? null,
  }));
}

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
  const [checklist, setChecklist] = useState<ChecklistDraft[]>([]);
  const [autoComplete, setAutoComplete] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Blank rows do not count: the switch has to be live only when there is
  // something for it to complete.
  const hasItems = checklist.some((draft) => draft.text.trim());

  /**
   * Removing somebody from the task also drops the items they were in charge of.
   *
   * Done here rather than left to the save, because the dropdown they were
   * chosen from no longer offers them: the row would show an empty owner while
   * still carrying their id, and the backend would then refuse the whole save
   * with INVALID_ASSIGNEE over something the form appeared to have cleared.
   */
  function changeParticipants(next: TaskParticipant[]) {
    setParticipants(next);
    const stillThere = new Set(next.map((participant) => participant.id));
    setChecklist((current) =>
      current.map((draft) =>
        draft.assigneeId !== null && !stillThere.has(draft.assigneeId)
          ? { ...draft, assigneeId: null }
          : draft
      )
    );
  }

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
      setChecklist(toDrafts(task.checklist));
      setAutoComplete(task.autoCompleteOnChecklist);
    } else {
      const range = defaultRange();
      setTitle("");
      setDescription("");
      setStartsAt(range.startsAt);
      setEndsAt(range.endsAt);
      setParticipants([]);
      setChecklist([]);
      setAutoComplete(false);
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

    // A row that was added and never filled in is not an error, it is one row
    // too many. The backend would reject the empty string, so it is dropped here.
    const items = checklist
      .filter((draft) => draft.text.trim())
      .map((draft) => ({ id: draft.id, text: draft.text.trim(), assigneeId: draft.assigneeId }));

    setSaving(true);
    try {
      await onSubmit(
        {
          title: title.trim(),
          description: description.trim(),
          startsAt: fromLocalInputValue(startsAt),
          endsAt: fromLocalInputValue(endsAt),
          participantIds: participants.map((participant) => participant.id),
          checklist: items,
          // A switch with no items would promise something that cannot happen:
          // an empty list never completes. See applyChecklistAutoComplete.
          autoCompleteOnChecklist: autoComplete && items.length > 0,
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
            onChange={changeParticipants}
          />

          <ChecklistEditor
            value={checklist}
            onChange={setChecklist}
            participants={participants}
          />

          <Box>
            <FormControlLabel
              control={
                <Switch
                  checked={autoComplete}
                  disabled={!hasItems}
                  onChange={(event) => setAutoComplete(event.target.checked)}
                />
              }
              label={t("taskForm.autoComplete")}
            />
            <FormHelperText>{t("taskForm.autoCompleteHint")}</FormHelperText>
          </Box>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              label={t("common.start")}
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
