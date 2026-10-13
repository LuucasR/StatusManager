import {
  DeleteForeverRounded,
  FilterAltOffRounded,
  RestoreRounded,
  SearchRounded,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputAdornment,
  InputLabel,
  ListItemIcon,
  Menu,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { deleteTask, listArchivedTasks, restoreTask } from "./tasksApi";
import { STATE_META, STATE_ORDER, type Task, type TaskParticipant, type TaskState } from "./types";
import { t, tf } from "../../i18n";
import { LOCALE } from "../../locale";

const formatDate = (iso: string) => new Date(iso).toLocaleDateString(LOCALE, { dateStyle: "short" });

type Props = {
  open: boolean;
  employees: TaskParticipant[];
  onClose: () => void;
  onOpenTask: (task: Task) => void;
  /** A task was restored or deleted: the board has to reload. */
  onChanged: () => void;
};

/**
 * Admin only: the tasks that fell off the board, with search filters. From here
 * one is brought back to the column the admin picks (for another 14 days), or
 * deleted for good.
 */
export default function ArchivedTasksDialog({ open, employees, onClose, onOpenTask, onChanged }: Props) {
  const [query, setQuery] = useState("");
  // Debounced copy of `query`: one request per pause in typing, not per key.
  const [search, setSearch] = useState("");
  const [state, setState] = useState<TaskState | "all">("all");
  const [participant, setParticipant] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [restoreMenu, setRestoreMenu] = useState<{ anchor: HTMLElement; task: Task } | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);

  const hasFilters = query !== "" || state !== "all" || participant !== "all" || from !== "" || to !== "";

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    // Ignores the answer of a request overtaken by a newer filter change.
    let stale = false;
    setLoading(true);
    setError("");
    listArchivedTasks({
      q: search,
      state: state === "all" ? undefined : state,
      participantId: participant === "all" ? undefined : Number(participant),
      from,
      to,
    })
      .then((rows) => {
        if (!stale) setTasks(rows);
      })
      .catch((err) => {
        if (!stale) setError((err as Error).message);
      })
      .finally(() => {
        if (!stale) setLoading(false);
      });
    return () => {
      stale = true;
    };
  }, [open, search, state, participant, from, to]);

  // A fresh start every time it opens.
  useEffect(() => {
    if (open) return;
    setNotice("");
    setRestoreMenu(null);
    setDeleting(null);
  }, [open]);

  function clearFilters() {
    setQuery("");
    setSearch("");
    setState("all");
    setParticipant("all");
    setFrom("");
    setTo("");
  }

  async function run(task: Task, action: () => Promise<void>) {
    setBusy(task.id);
    setError("");
    setNotice("");
    try {
      await action();
      setTasks((current) => current.filter((row) => row.id !== task.id));
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function restore(task: Task, target: TaskState) {
    setRestoreMenu(null);
    void run(task, async () => {
      await restoreTask(task.id, target);
      setNotice(tf("archive.restored", { title: task.title }));
    });
  }

  function confirmDelete() {
    const task = deleting!;
    setDeleting(null);
    void run(task, async () => {
      await deleteTask(task.id);
    });
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{t("archive.title")}</DialogTitle>

      <DialogContent>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          {t("archive.subtitle")}
        </Typography>

        <Stack spacing={2} sx={{ mb: 2 }}>
          <TextField
            fullWidth
            placeholder={t("archive.search")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchRounded />
                  </InputAdornment>
                ),
              },
              htmlInput: { maxLength: 120 },
            }}
          />

          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
            <Chip
              label={t("common.all")}
              color={state === "all" ? "primary" : "default"}
              variant={state === "all" ? "filled" : "outlined"}
              onClick={() => setState("all")}
            />
            {STATE_ORDER.map((value) => (
              <Chip
                key={value}
                label={STATE_META[value].label}
                variant={state === value ? "filled" : "outlined"}
                onClick={() => setState(value)}
                sx={
                  state === value
                    ? { bgcolor: STATE_META[value].accent, color: "#fff" }
                    : { borderColor: STATE_META[value].accent, color: STATE_META[value].ink }
                }
              />
            ))}
          </Stack>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <FormControl fullWidth>
              <InputLabel>{t("archive.participant")}</InputLabel>
              <Select
                value={participant}
                label={t("archive.participant")}
                onChange={(event) => setParticipant(event.target.value)}
              >
                <MenuItem value="all">{t("common.all")}</MenuItem>
                {employees.map((employee) => (
                  <MenuItem key={employee.id} value={String(employee.id)}>
                    #{employee.employeeNumber} - {employee.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              fullWidth
              label={t("archive.endFrom")}
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: to || undefined } }}
            />
            <TextField
              fullWidth
              label={t("archive.endTo")}
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: from || undefined } }}
            />
          </Stack>

          <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
            <Typography variant="body2" color="text.secondary">
              {tf("archive.count", { count: tasks.length })}
            </Typography>
            <Button
              size="small"
              startIcon={<FilterAltOffRounded />}
              disabled={!hasFilters}
              onClick={clearFilters}
            >
              {t("archive.clear")}
            </Button>
          </Stack>
        </Stack>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>
            {error}
          </Alert>
        )}
        {notice && (
          <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice("")}>
            {notice}
          </Alert>
        )}

        {loading ? (
          <Stack sx={{ alignItems: "center", py: 4 }}>
            <CircularProgress />
          </Stack>
        ) : tasks.length === 0 ? (
          <Typography color="text.secondary" sx={{ py: 4, textAlign: "center" }}>
            {t("archive.empty")}
          </Typography>
        ) : (
          <Stack spacing={1}>
            {tasks.map((task) => {
              const meta = STATE_META[task.state];
              return (
                <Box key={task.id} className="approval-row">
                  <Box sx={{ minWidth: 0, flex: 1, cursor: "pointer" }} onClick={() => onOpenTask(task)}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                      <Typography sx={{ fontWeight: 700 }} noWrap>
                        {task.title}
                      </Typography>
                      <Chip
                        size="small"
                        label={meta.label}
                        sx={{ bgcolor: meta.soft, color: meta.ink, fontWeight: 600 }}
                      />
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      {tf("archive.meta", {
                        id: task.id,
                        end: formatDate(task.endsAt),
                        archived: formatDate(task.archivesAt),
                        people: task.participants.length,
                      })}
                    </Typography>
                  </Box>

                  <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
                    <Button
                      size="small"
                      variant="contained"
                      startIcon={<RestoreRounded />}
                      disabled={busy === task.id}
                      onClick={(event) => setRestoreMenu({ anchor: event.currentTarget, task })}
                    >
                      {t("archive.restore")}
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      color="error"
                      startIcon={<DeleteForeverRounded />}
                      disabled={busy === task.id}
                      onClick={() => setDeleting(task)}
                    >
                      {t("archive.delete")}
                    </Button>
                  </Stack>
                </Box>
              );
            })}
          </Stack>
        )}

        <Menu
          anchorEl={restoreMenu?.anchor}
          open={restoreMenu !== null}
          onClose={() => setRestoreMenu(null)}
        >
          {STATE_ORDER.map((value) => {
            const { Icon, accent } = STATE_META[value];
            return (
              <MenuItem key={value} onClick={() => restore(restoreMenu!.task, value)}>
                <ListItemIcon>
                  <Icon fontSize="small" sx={{ color: accent }} />
                </ListItemIcon>
                {tf("archive.restoreTo", { state: STATE_META[value].label })}
              </MenuItem>
            );
          })}
        </Menu>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>{t("common.close")}</Button>
      </DialogActions>

      <Dialog open={deleting !== null} onClose={() => setDeleting(null)} fullWidth maxWidth="xs">
        <DialogTitle>{t("archive.deleteTitle")}</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary">
            {tf("archive.deleteBody", { title: deleting?.title ?? "" })}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleting(null)}>{t("common.cancel")}</Button>
          <Button variant="contained" color="error" onClick={confirmDelete}>
            {t("archive.delete")}
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
