import { DeleteOutlineRounded, EditNoteRounded, EditRounded, RocketLaunchRounded } from "@mui/icons-material";
import { Box, Button, Chip, Paper, Stack, Typography } from "@mui/material";
import { useState } from "react";
import type { Task } from "./types";
import { t, tf } from "../../i18n";
import { LOCALE } from "../../locale";

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString(LOCALE, { dateStyle: "short", timeStyle: "short" });

type Props = {
  /** Drafts: only admins ever receive them from the backend. */
  tasks: Task[];
  onOpen: (task: Task) => void;
  onEdit: (task: Task) => void;
  onActivate: (task: Task) => Promise<void>;
  onDelete: (task: Task) => void;
};

/**
 * An admin's drafts, above the board: tasks saved without publishing them.
 * Nobody else sees them and nobody is notified until one is activated, at which
 * point it behaves exactly like a task created live.
 */
export default function DraftTasks({ tasks, onOpen, onEdit, onActivate, onDelete }: Props) {
  const [busy, setBusy] = useState<number | null>(null);

  if (tasks.length === 0) return null;

  return (
    <Paper className="approval-panel" sx={{ p: { xs: 2, md: 2.5 }, mb: 3 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 0.5 }}>
        <EditNoteRounded color="action" />
        <Typography variant="h6" sx={{ fontWeight: 800 }}>
          {t("draft.title")}
        </Typography>
        <Chip size="small" label={tasks.length} />
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        {t("draft.subtitle")}
      </Typography>

      <Stack spacing={1}>
        {tasks.map((task) => (
          <Box key={task.id} className="approval-row">
            <Box sx={{ minWidth: 0, flex: 1, cursor: "pointer" }} onClick={() => onOpen(task)}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                <Typography sx={{ fontWeight: 700 }} noWrap>
                  {task.title}
                </Typography>
                <Chip size="small" variant="outlined" label={t("draft.chip")} />
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {tf("draft.meta", {
                  name: task.createdBy?.name ?? "—",
                  date: formatDateTime(task.updatedAt),
                  people: task.participants.length,
                })}
              </Typography>
            </Box>

            <Stack direction="row" spacing={1} sx={{ flexShrink: 0, flexWrap: "wrap" }}>
              <Button
                size="small"
                variant="contained"
                startIcon={<RocketLaunchRounded />}
                disabled={busy === task.id}
                onClick={async () => {
                  setBusy(task.id);
                  try {
                    await onActivate(task);
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                {t("draft.activate")}
              </Button>
              <Button
                size="small"
                variant="outlined"
                startIcon={<EditRounded />}
                disabled={busy === task.id}
                onClick={() => onEdit(task)}
              >
                {t("common.edit")}
              </Button>
              <Button
                size="small"
                color="inherit"
                startIcon={<DeleteOutlineRounded />}
                disabled={busy === task.id}
                onClick={() => onDelete(task)}
              >
                {t("common.delete")}
              </Button>
            </Stack>
          </Box>
        ))}
      </Stack>
    </Paper>
  );
}
