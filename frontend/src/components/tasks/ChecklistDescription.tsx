import { NotesRounded } from "@mui/icons-material";
import {
  Avatar,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Popover,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useRef, useState } from "react";
import { LabelChip } from "./ChecklistLabel";
import { PriorityChip } from "./ChecklistPriority";
import { formatCommentDate } from "./datetime";
import { participantColor, type TaskChecklistItem } from "./types";
import { t, tf } from "../../i18n";

/** Matches the backend's limit (task-validation.ts). */
const MAX_DESCRIPTION = 2000;

type PickerProps = {
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
};

/**
 * A notes button that opens a box to write the item's description. A button
 * rather than a field, like the priority and the label: the row is the item's
 * one-line title, the description is the longer explanation behind it.
 */
export function DescriptionPicker({ value, onChange, disabled }: PickerProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const tooltip = value ? t("checklistDescription.edit") : t("checklistDescription.add");

  const commit = (next: string | null) => {
    onChange(next?.trim() || null);
    setAnchor(null);
  };

  return (
    <>
      <Tooltip title={tooltip}>
        <span>
          <IconButton
            size="small"
            disabled={disabled}
            aria-label={tooltip}
            onClick={(event) => {
              setDraft(value ?? "");
              setAnchor(event.currentTarget);
            }}
          >
            <NotesRounded
              fontSize="small"
              sx={{ color: value ? "primary.main" : "text.disabled" }}
            />
          </IconButton>
        </span>
      </Tooltip>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => commit(draft)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        // Same as the label picker: the popover takes focus once it has opened.
        slotProps={{ transition: { onEntered: () => inputRef.current?.focus() } }}
      >
        <Stack spacing={1} sx={{ p: 1.5, width: 360, maxWidth: "90vw" }}>
          <TextField
            multiline
            minRows={4}
            maxRows={12}
            size="small"
            inputRef={inputRef}
            label={t("checklistDescription.field")}
            placeholder={t("checklistDescription.placeholder")}
            value={draft}
            onChange={(event) => setDraft(event.target.value.slice(0, MAX_DESCRIPTION))}
            helperText={`${draft.length}/${MAX_DESCRIPTION}`}
          />
          <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
            {value && (
              <Button size="small" color="inherit" onClick={() => commit(null)}>
                {t("checklistDescription.remove")}
              </Button>
            )}
            <Button size="small" variant="contained" onClick={() => commit(draft)}>
              {t("checklistLabel.apply")}
            </Button>
          </Stack>
        </Stack>
      </Popover>
    </>
  );
}

/**
 * The popup that opens when an item is clicked in the task detail: its
 * description, plus what the row already says, in one place to read.
 */
export function ChecklistItemDialog({
  item,
  onClose,
}: {
  item: TaskChecklistItem | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={Boolean(item)} onClose={onClose} fullWidth maxWidth="sm">
      {item && (
        <>
          <DialogTitle
            sx={{
              textDecoration: item.done ? "line-through" : "none",
              color: item.done ? "text.secondary" : "text.primary",
              wordBreak: "break-word",
            }}
          >
            {item.text}
          </DialogTitle>
          <DialogContent dividers>
            <Stack spacing={2}>
              {(item.label || item.priority || item.assignees.length > 0) && (
                <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
                  <LabelChip label={item.label} />
                  <PriorityChip priority={item.priority} />
                  {item.assignees.map((assignee) => (
                    <Chip
                      key={assignee.id}
                      size="small"
                      avatar={
                        <Avatar sx={{ bgcolor: participantColor(assignee.id), color: "#fff !important" }}>
                          {assignee.name.slice(0, 1).toUpperCase()}
                        </Avatar>
                      }
                      label={tf("taskDetail.checklistAssigned", { name: assignee.name })}
                    />
                  ))}
                </Stack>
              )}

              <Box>
                <Typography variant="overline" color="text.secondary">
                  {t("checklistDescription.field")}
                </Typography>
                {item.description ? (
                  <Typography sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {item.description}
                  </Typography>
                ) : (
                  <Typography color="text.secondary" sx={{ fontStyle: "italic" }}>
                    {t("checklistDescription.empty")}
                  </Typography>
                )}
              </Box>

              {item.done && item.doneBy && (
                <Typography variant="caption" color="text.secondary">
                  {tf("taskDetail.checklistDoneBy", { name: item.doneBy.name })}
                  {item.doneAt && ` · ${formatCommentDate(item.doneAt)}`}
                </Typography>
              )}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose}>{t("common.close")}</Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}
