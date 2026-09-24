import { DeleteOutlineRounded, EditRounded, LockRounded } from "@mui/icons-material";
import { Box, Chip, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import { t } from "../../i18n";
import { STATE_META } from "../tasks/types";
import { CATEGORY_LABELS, type PatchEntry } from "./patchNotesApi";

type Props = {
  entries: PatchEntry[];
  /** Whether the edit/delete buttons show for this entry. */
  canEdit: (entry: PatchEntry) => boolean;
  onEdit: (entry: PatchEntry) => void;
  onDelete: (entry: PatchEntry) => void;
};

export default function EntryList({ entries, canEdit, onEdit, onDelete }: Props) {
  return (
    <Stack spacing={1.5}>
      {entries.map((entry) => {
        const taskTitle = entry.task?.title ?? entry.taskTitle;
        return (
          <Box
            key={entry.id}
            sx={{
              display: "flex",
              gap: 1.5,
              p: 1.5,
              borderRadius: 2,
              borderLeft: "3px solid",
              borderLeftColor: entry.internal ? "text.disabled" : "primary.main",
              bgcolor: "action.hover",
            }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack direction="row" spacing={1} sx={{ mb: 0.75, flexWrap: "wrap", rowGap: 0.5 }}>
                <Chip size="small" label={CATEGORY_LABELS[entry.category]} color="primary" variant="outlined" />
                {taskTitle && (
                  <Chip
                    size="small"
                    label={`${entry.taskId != null ? `#${entry.taskId} ` : ""}${taskTitle}${
                      entry.task ? ` · ${STATE_META[entry.task.state].label}` : ""
                    }`}
                  />
                )}
                {entry.internal && (
                  <Chip size="small" icon={<LockRounded />} label={t("patchNotes.internalChip")} />
                )}
              </Stack>
              <Typography sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{entry.body}</Typography>
            </Box>
            {canEdit(entry) && (
              <Stack direction="row" spacing={0.5} sx={{ alignSelf: "flex-start" }}>
                <Tooltip title={t("common.edit")}>
                  <IconButton size="small" onClick={() => onEdit(entry)} aria-label={t("common.edit")}>
                    <EditRounded fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title={t("common.delete")}>
                  <IconButton size="small" onClick={() => onDelete(entry)} aria-label={t("common.delete")}>
                    <DeleteOutlineRounded fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            )}
          </Box>
        );
      })}
    </Stack>
  );
}
