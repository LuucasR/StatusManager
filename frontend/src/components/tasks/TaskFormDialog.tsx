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
  /** A new task from a non-admin waits for an admin before reaching the board. */
  needsApproval?: boolean;
  /** Admins only: when the task leaves the board. */
  canSetArchiveDate?: boolean;
};

/**
 * Seeds the editor in edit mode. An existing item keys on its own id, which is
 * what tells the backend to keep its tick instead of recreating the row.
 */
function toDrafts(
  items: { id: number; text: string; assignees: { id: number }[] }[]
): ChecklistDraft[] {
  return items.map((item) => ({
    key: item.id,
    id: item.id,
    text: item.text,
    assigneeIds: item.assignees.map((assignee) => assignee.id),
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

export default function TaskFormDialog({
  open,
  task,
  employees,
  onClose,
  onSubmit,
  needsApproval = false,
  canSetArchiveDate = false,
}: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  // "" = the default, 14 days after the end.
  const [archiveAt, setArchiveAt] = useState("");
  const [participants, setParticipants] = useState<TaskParticipant[]>([]);
  const [checklist, setChecklist] = useState<ChecklistDraft[]>([]);
  const [autoComplete, setAutoComplete] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Blank rows do not count: the switch has to be live only when there is
  // something for it to complete.
  const hasItems = checklist.some((draft) => draft.text.trim());

  /**
   * Removing somebody from the task also takes them off the items they were in
   * charge of; the other people on those items stay.
   *
   * Done here rather than left to the save, because the dropdown they were
   * chosen from no longer offers them: the row would still carry an id nobody
   * can see, and the backend would then refuse the whole save with
   * INVALID_ASSIGNEE over something the form appeared to have cleared.
   */
  function changeParticipants(next: TaskParticipant[]) {
    setParticipants(next);
    const stillThere = new Set(next.map((participant) => participant.id));
    setChecklist((current) =>
      current.map((draft) =>
        draft.assigneeIds.every((id) => stillThere.has(id))
          ? draft
          : { ...draft, assigneeIds: draft.assigneeIds.filter((id) => stillThere.has(id)) }
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
      setArchiveAt(task.archiveAt ? toLocalInputValue(task.archiveAt) : "");
      // Rebuilt against `employees` so isOptionEqualToValue sees the same object
      // references as the Autocomplete's options. Somebody missing from it has
      // been deactivated: they are dropped, or saving would be refused.
      const kept = employees.length
        ? task.participants.flatMap((participant) => employees.filter((e) => e.id === participant.id))
        : task.participants;
      const keptIds = new Set(kept.map((participant) => participant.id));
      setParticipants(kept);
      setChecklist(
        toDrafts(task.checklist).map((draft) => ({
          ...draft,
          assigneeIds: draft.assigneeIds.filter((id) => keptIds.has(id)),
        }))
      );
      setAutoComplete(task.autoCompleteOnChecklist);
    } else {
      const range = defaultRange();
      setTitle("");
      setDescription("");
      setStartsAt(range.startsAt);
      setEndsAt(range.endsAt);
      setArchiveAt("");
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
    if (canSetArchiveDate && archiveAt && new Date(archiveAt) <= new Date(endsAt)) {
      return setError(t("error.INVALID_ARCHIVE_DATE"));
    }
    if (participants.length === 0) return setError(t("taskForm.participantsRequired"));

    // A row that was added and never filled in is not an error, it is one row
    // too many. The backend would reject the empty string, so it is dropped here.
    const items = checklist
      .filter((draft) => draft.text.trim())
      .map((draft) => ({ id: draft.id, text: draft.text.trim(), assigneeIds: draft.assigneeIds }));

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
          // Left out for everyone else: the backend refuses it from a non-admin.
          ...(canSetArchiveDate
            ? { archiveAt: archiveAt ? fromLocalInputValue(archiveAt) : null }
            : {}),
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
          {needsApproval && !task && <Alert severity="info">{t("approval.formHint")}</Alert>}

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

          {canSetArchiveDate && (
            <TextField
              label={t("taskForm.archiveAt")}
              type="datetime-local"
              value={archiveAt}
              onChange={(e) => setArchiveAt(e.target.value)}
              helperText={t("taskForm.archiveAtHint")}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: endsAt } }}
            />
          )}
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
