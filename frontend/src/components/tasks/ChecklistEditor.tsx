import { AddRounded, CloseRounded, DragIndicatorRounded } from "@mui/icons-material";
import {
  Avatar,
  Box,
  Button,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { participantColor, type TaskParticipant } from "./types";
import { t, tf } from "../../i18n";

/**
 * A row while it is being edited.
 *
 * `key` is NOT the array index. Deleting a row from the middle shifts every
 * index below it, so React would reuse the wrong input and the caret would jump
 * to another line mid-typing. Existing items key on their real id; new ones get
 * a negative counter, which cannot collide with one.
 */
export type ChecklistDraft = {
  key: number;
  /** Absent = new item. Present = existing one, whose tick has to survive. */
  id?: number;
  text: string;
  /** null = nobody is in charge. Only ever one of the task's participants. */
  assigneeId: number | null;
};

type Props = {
  value: ChecklistDraft[];
  onChange: (value: ChecklistDraft[]) => void;
  /**
   * The task's participants as they stand in this same dialog, not the whole
   * team: somebody who does not take part cannot be put in charge, and the
   * backend refuses it. Editing the participants above re-filters these.
   */
  participants: TaskParticipant[];
  disabled?: boolean;
};

/** Next key for a row that does not exist in the database yet. */
function nextKey(value: ChecklistDraft[]) {
  return Math.min(0, ...value.map((draft) => draft.key)) - 1;
}

export default function ChecklistEditor({ value, onChange, participants, disabled }: Props) {
  const add = () =>
    onChange([...value, { key: nextKey(value), text: "", assigneeId: null }]);

  const patch = (key: number, changes: Partial<ChecklistDraft>) =>
    onChange(value.map((draft) => (draft.key === key ? { ...draft, ...changes } : draft)));

  const remove = (key: number) => onChange(value.filter((draft) => draft.key !== key));

  return (
    <Box>
      <Typography variant="overline" color="text.secondary">
        {t("taskForm.checklist")}
      </Typography>

      <Stack spacing={1} sx={{ mt: 0.5 }}>
        {value.map((draft, index) => (
          <Stack key={draft.key} direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
            {/* Decoration only: the order is the order of the rows, and there is
                no drag yet. Kept because a bare row reads as a stray text box. */}
            <DragIndicatorRounded sx={{ fontSize: 18, color: "text.disabled" }} />

            <TextField
              fullWidth
              size="small"
              disabled={disabled}
              label={tf("taskForm.checklistItem", { number: index + 1 })}
              value={draft.text}
              onChange={(event) => patch(draft.key, { text: event.target.value })}
              onKeyDown={(event) => {
                // Enter on the last row adds another, so a list can be typed
                // straight through without reaching for the mouse. Anywhere else
                // it would silently submit the dialog.
                if (event.key !== "Enter") return;
                event.preventDefault();
                if (index === value.length - 1 && draft.text.trim()) add();
              }}
            />

            <TextField
              select
              size="small"
              // Wide enough for a name, narrow enough to leave the text the room:
              // the item is what is being written, the owner is a secondary choice.
              sx={{ minWidth: 150 }}
              disabled={disabled || participants.length === 0}
              label={t("taskForm.checklistAssignee")}
              value={draft.assigneeId ?? ""}
              onChange={(event) =>
                patch(draft.key, {
                  assigneeId: event.target.value === "" ? null : Number(event.target.value),
                })
              }
            >
              <MenuItem value="">
                <em>{t("taskForm.checklistNobody")}</em>
              </MenuItem>
              {participants.map((participant) => (
                <MenuItem key={participant.id} value={participant.id}>
                  {participant.name}
                </MenuItem>
              ))}
            </TextField>

            {/* The avatar repeats the name as a colour, so a long list can be
                scanned by owner without reading every dropdown. */}
            {draft.assigneeId !== null && (
              <Avatar
                sx={{
                  width: 24,
                  height: 24,
                  fontSize: 11,
                  fontWeight: 700,
                  bgcolor: participantColor(draft.assigneeId),
                  color: "#fff",
                }}
              >
                {(participants.find((p) => p.id === draft.assigneeId)?.name ?? "?")
                  .slice(0, 1)
                  .toUpperCase()}
              </Avatar>
            )}

            <IconButton
              size="small"
              disabled={disabled}
              aria-label={t("taskForm.checklistRemove")}
              onClick={() => remove(draft.key)}
            >
              <CloseRounded fontSize="small" />
            </IconButton>
          </Stack>
        ))}

        <Box>
          <Button size="small" startIcon={<AddRounded />} disabled={disabled} onClick={add}>
            {t("taskForm.checklistAdd")}
          </Button>
        </Box>

        <Typography variant="caption" color="text.secondary">
          {t("taskForm.checklistHint")}
        </Typography>
      </Stack>
    </Box>
  );
}
