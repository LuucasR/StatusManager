import {
  CheckRounded,
  CloseRounded,
  DeleteOutlineRounded,
  HourglassTopRounded,
} from "@mui/icons-material";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useState } from "react";
import type { Task } from "./types";
import { t, tf } from "../../i18n";
import { LOCALE } from "../../locale";

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString(LOCALE, { dateStyle: "short", timeStyle: "short" });

type Props = {
  /** Tasks that are not approved: every one for an admin, their own for anyone else. */
  tasks: Task[];
  isAdmin: boolean;
  meId?: number;
  onOpen: (task: Task) => void;
  onApprove: (task: Task) => Promise<void>;
  onReject: (task: Task, reason: string) => Promise<void>;
  onWithdraw: (task: Task) => void;
};

/**
 * Tasks waiting for an admin, above the board. Admins decide here; whoever
 * created one sees it waiting (or rejected, with the reason) and can withdraw it.
 */
export default function PendingApprovals({
  tasks,
  isAdmin,
  meId,
  onOpen,
  onApprove,
  onReject,
  onWithdraw,
}: Props) {
  const [rejecting, setRejecting] = useState<Task | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<number | null>(null);

  if (tasks.length === 0) return null;

  const pendingCount = tasks.filter((task) => task.approval === "PENDING").length;

  async function run(task: Task, action: () => Promise<void>) {
    setBusy(task.id);
    try {
      await action();
    } finally {
      setBusy(null);
    }
  }

  return (
    <Paper className="approval-panel" sx={{ p: { xs: 2, md: 2.5 }, mb: 3 }}>
      <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", mb: 1.5 }}>
        <HourglassTopRounded sx={{ color: "var(--warning)" }} />
        <Typography variant="h6" sx={{ fontWeight: 750, flex: 1 }}>
          {isAdmin ? t("approval.titleAdmin") : t("approval.titleMine")}
        </Typography>
        {pendingCount > 0 && (
          <Chip size="small" color="warning" label={tf("approval.count", { count: pendingCount })} />
        )}
      </Stack>

      <Stack spacing={1}>
        {tasks.map((task) => {
          const rejected = task.approval === "REJECTED";
          const own = task.createdBy?.id === meId;
          return (
            <Box key={task.id} className="approval-row">
              <Box sx={{ minWidth: 0, flex: 1, cursor: "pointer" }} onClick={() => onOpen(task)}>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                  <Typography sx={{ fontWeight: 700 }} noWrap>
                    {task.title}
                  </Typography>
                  <Chip
                    size="small"
                    variant="outlined"
                    color={rejected ? "error" : "warning"}
                    label={rejected ? t("approval.rejected") : t("approval.pending")}
                  />
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  {tf("approval.meta", {
                    name: task.createdBy?.name ?? "—",
                    date: formatDateTime(task.createdAt),
                    people: task.participants.length,
                  })}
                </Typography>
                {rejected && task.rejectReason && (
                  <Typography variant="body2" sx={{ color: "var(--danger)", mt: 0.25 }}>
                    {tf("approval.reason", { reason: task.rejectReason })}
                  </Typography>
                )}
              </Box>

              <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
                {isAdmin && !rejected && (
                  <>
                    <Button
                      size="small"
                      variant="contained"
                      color="success"
                      startIcon={<CheckRounded />}
                      disabled={busy === task.id}
                      onClick={() => void run(task, () => onApprove(task))}
                    >
                      {t("approval.approve")}
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      color="error"
                      startIcon={<CloseRounded />}
                      disabled={busy === task.id}
                      onClick={() => {
                        setReason("");
                        setRejecting(task);
                      }}
                    >
                      {t("approval.reject")}
                    </Button>
                  </>
                )}
                {(own || (isAdmin && rejected)) && (
                  <Button
                    size="small"
                    color="inherit"
                    startIcon={<DeleteOutlineRounded />}
                    disabled={busy === task.id}
                    onClick={() => onWithdraw(task)}
                  >
                    {own ? t("approval.withdraw") : t("approval.discard")}
                  </Button>
                )}
              </Stack>
            </Box>
          );
        })}
      </Stack>

      <Dialog open={rejecting !== null} onClose={() => setRejecting(null)} fullWidth maxWidth="xs">
        <DialogTitle>{t("approval.rejectTitle")}</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            {rejecting?.title}
          </Typography>
          <TextField
            autoFocus
            fullWidth
            multiline
            minRows={2}
            label={t("approval.rejectReason")}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            slotProps={{ htmlInput: { maxLength: 500 } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejecting(null)}>{t("warnings.cancel")}</Button>
          <Button
            variant="contained"
            color="error"
            disabled={busy !== null}
            onClick={() => {
              const task = rejecting!;
              setRejecting(null);
              void run(task, () => onReject(task, reason.trim()));
            }}
          >
            {t("approval.reject")}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
