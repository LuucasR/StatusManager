import { AddRounded, ChevronLeftRounded, ChevronRightRounded } from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { isStaff } from "../components/roles";
import type { AppOutletContext } from "../layouts/AppLayout";
import { t, tf } from "../i18n";
import { LOCALE } from "../locale";
import { useOnReconnect, useSocketEvent } from "../realtime/useSocketEvent";
import PdfPreviewDialog from "../components/pdf/PdfPreviewDialog";
import { usePdfPreview } from "../components/pdf/usePdfPreview";
import AdminPanel from "../components/patchNotes/AdminPanel";
import EntryDialog from "../components/patchNotes/EntryDialog";
import EntryList from "../components/patchNotes/EntryList";
import {
  WEEK_STATUS_LABELS,
  addDays,
  createEntry,
  deleteEntry,
  formatMs,
  getInsights,
  getMyTasks,
  getWeek,
  listWeeks,
  reportUrl,
  setWeekStatus,
  updateEntry,
  updateWeek,
  type EntryInput,
  type PatchEntry,
  type PatchWeekStatus,
  type TaskTime,
  type WeekDetail,
  type WeekInsights,
  type WeekListItem,
} from "../components/patchNotes/patchNotesApi";

const STATUS_COLOR: Record<PatchWeekStatus, "default" | "warning" | "success"> = {
  DRAFT: "default",
  CLOSED: "warning",
  PUBLISHED: "success",
};

/** "21 Sep" from a "YYYY-MM-DD" day, read at noon UTC so no offset moves it. */
function formatDay(day: string) {
  return new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${day}T12:00:00Z`)
  );
}

/**
 * Weekly patch notes. Everyone writes their own section while the week is a
 * draft and reads everybody else's; staff review, close, publish and export.
 */
export default function PatchNotesPage() {
  const { me } = useOutletContext<AppOutletContext>();
  const staff = isStaff(me?.role);

  const [current, setCurrent] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState<string | null>(null);
  const [weeks, setWeeks] = useState<WeekListItem[]>([]);
  const [detail, setDetail] = useState<WeekDetail | null>(null);
  const [myTasks, setMyTasks] = useState<TaskTime[]>([]);
  const [insights, setInsights] = useState<WeekInsights | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PatchEntry | null>(null);
  const [seedTask, setSeedTask] = useState<TaskTime | null>(null);

  const pdf = usePdfPreview();

  useEffect(() => {
    listWeeks()
      .then((data) => {
        setCurrent(data.current);
        setWeeks(data.weeks);
        setWeekStart((selected) => selected ?? data.current);
      })
      .catch((err) => setError((err as Error).message));
  }, []);

  const load = useCallback(async () => {
    if (!weekStart || !me) return;
    try {
      const [week, tasks, teamInsights, list] = await Promise.all([
        getWeek(weekStart),
        getMyTasks(weekStart),
        staff ? getInsights(weekStart) : Promise.resolve(null),
        listWeeks(),
      ]);
      setDetail(week);
      setMyTasks(tasks);
      setInsights(teamInsights);
      setWeeks(list.weeks);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [weekStart, me, staff]);

  useEffect(() => {
    void load();
  }, [load]);

  useSocketEvent<{ weekStart: string }>("patchnotes:changed", (payload) => {
    if (payload.weekStart === weekStart) void load();
  });
  useOnReconnect(() => void load());

  const status = detail?.week.status ?? "DRAFT";
  // Mirrors canWrite() on the backend, which enforces it regardless.
  const writable = status === "DRAFT" || (staff && status === "CLOSED");

  const mine = useMemo(
    () => (detail?.entries ?? []).filter((entry) => entry.authorId === me?.id),
    [detail, me]
  );

  const team = useMemo(() => {
    const groups = new Map<string, PatchEntry[]>();
    for (const entry of detail?.entries ?? []) {
      if (entry.authorId === me?.id) continue;
      groups.set(entry.authorName, [...(groups.get(entry.authorName) ?? []), entry]);
    }
    return [...groups.entries()];
  }, [detail, me]);

  // Tasks I booked time on this week and have not written about yet.
  const suggestions = useMemo(() => {
    const noted = new Set(mine.map((entry) => entry.taskId).filter((id) => id != null));
    return myTasks.filter((task) => task.taskId != null && !noted.has(task.taskId));
  }, [mine, myTasks]);

  // Week picker: every existing week plus the one on screen and the current one.
  const weekOptions = useMemo(() => {
    const keys = new Set(weeks.map((week) => week.weekStart));
    if (current) keys.add(current);
    if (weekStart) keys.add(weekStart);
    return [...keys].sort().reverse();
  }, [weeks, current, weekStart]);

  function openNew(task: TaskTime | null) {
    setEditing(null);
    setSeedTask(task);
    setDialogOpen(true);
  }

  function openEdit(entry: PatchEntry) {
    setEditing(entry);
    setSeedTask(null);
    setDialogOpen(true);
  }

  async function submitEntry(input: EntryInput) {
    if (!weekStart) return;
    if (editing) await updateEntry(editing.id, input);
    else await createEntry(weekStart, input);
    setDialogOpen(false);
    await load();
  }

  async function removeEntry(entry: PatchEntry) {
    if (!window.confirm(t("patchNotes.confirmDelete"))) return;
    try {
      await deleteEntry(entry.id);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function saveHeader(patch: { title: string | null; summary: string; version: string | null }) {
    if (!weekStart) return;
    setError("");
    try {
      await updateWeek(weekStart, patch);
      setNotice(t("patchNotes.saved"));
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function changeStatus(next: PatchWeekStatus) {
    if (!weekStart) return;
    if (next === "PUBLISHED" && !window.confirm(t("patchNotes.confirmPublish"))) return;
    setError("");
    try {
      await setWeekStatus(weekStart, next);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function openPdf(mode: "internal" | "public") {
    if (!weekStart) return;
    const name = detail?.week.version ?? weekStart;
    try {
      await pdf.open(reportUrl(weekStart, mode), `patch-notes-${name}${mode === "public" ? "-public" : ""}.pdf`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  // The role decides the whole layout, so wait for it rather than flash the
  // employee view at an admin.
  if (!me || !weekStart) {
    return (
      <Container maxWidth="lg" sx={{ py: 6 }}>
        {error ? <Alert severity="error">{error}</Alert> : <CircularProgress />}
      </Container>
    );
  }

  const canEditEntry = (entry: PatchEntry) =>
    writable && (staff || (entry.authorId === me.id && status === "DRAFT"));

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError("")}>
          {error}
        </Alert>
      )}
      {notice && (
        <Alert severity="success" sx={{ mb: 3 }} onClose={() => setNotice("")}>
          {notice}
        </Alert>
      )}

      <Box className="page-heading">
        <Box>
          <Typography className="eyebrow">{t("patchNotes.eyebrow")}</Typography>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            {t("patchNotes.title")}
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            {staff ? t("patchNotes.subtitleStaff") : t("patchNotes.subtitle")}
          </Typography>
        </Box>
      </Box>

      <Paper className="status-card" elevation={0} sx={{ p: 2, mt: 3 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
          <IconButton onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label={t("patchNotes.previousWeek")}>
            <ChevronLeftRounded />
          </IconButton>
          <TextField
            select
            size="small"
            value={weekStart}
            onChange={(event) => setWeekStart(event.target.value)}
            sx={{ minWidth: 240 }}
          >
            {weekOptions.map((key) => {
              const known = weeks.find((week) => week.weekStart === key);
              return (
                <MenuItem key={key} value={key}>
                  {formatDay(key)} – {formatDay(addDays(key, 6))}
                  {known?.version ? ` · ${known.version}` : ""}
                  {key === current ? ` · ${t("patchNotes.thisWeek")}` : ""}
                </MenuItem>
              );
            })}
          </TextField>
          <IconButton onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label={t("patchNotes.nextWeek")}>
            <ChevronRightRounded />
          </IconButton>
          <Chip label={WEEK_STATUS_LABELS[status]} color={STATUS_COLOR[status]} />
          {detail?.week.version && <Chip label={detail.week.version} variant="outlined" />}
        </Stack>
        {detail?.week.title && (
          <Typography variant="h6" sx={{ fontWeight: 700, mt: 2 }}>
            {detail.week.title}
          </Typography>
        )}
        {detail?.week.summary && (
          <Typography color="text.secondary" sx={{ mt: 1, whiteSpace: "pre-wrap" }}>
            {detail.week.summary}
          </Typography>
        )}
        {status !== "DRAFT" && (
          <Alert severity={status === "PUBLISHED" ? "success" : "info"} sx={{ mt: 2 }}>
            {status === "PUBLISHED" ? t("patchNotes.publishedNotice") : t("patchNotes.closedNotice")}
          </Alert>
        )}
      </Paper>

      {staff && detail && (
        <AdminPanel
          week={detail.week}
          insights={insights}
          pdfLoading={pdf.loading}
          onSaveHeader={saveHeader}
          onStatus={changeStatus}
          onPdf={openPdf}
        />
      )}

      <Paper className="status-card" elevation={0} sx={{ p: 3, mt: 3 }}>
        <Stack direction="row" sx={{ alignItems: "center", mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, flex: 1 }}>
            {t("patchNotes.mySection")}
          </Typography>
          {status === "DRAFT" && (
            <Button variant="contained" startIcon={<AddRounded />} onClick={() => openNew(null)}>
              {t("patchNotes.addEntry")}
            </Button>
          )}
        </Stack>

        {status === "DRAFT" && suggestions.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {t("patchNotes.suggestions")}
            </Typography>
            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
              {suggestions.map((task) => (
                <Chip
                  key={task.key}
                  icon={<AddRounded />}
                  label={`#${task.taskId} ${task.title} · ${formatMs(task.totalMs)}`}
                  onClick={() => openNew(task)}
                  variant="outlined"
                  color="primary"
                />
              ))}
            </Stack>
          </Box>
        )}

        {mine.length === 0 ? (
          <Typography color="text.secondary">{t("patchNotes.myEmpty")}</Typography>
        ) : (
          <EntryList entries={mine} canEdit={canEditEntry} onEdit={openEdit} onDelete={removeEntry} />
        )}
      </Paper>

      <Paper className="status-card" elevation={0} sx={{ p: 3, mt: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
          {t("patchNotes.teamSection")}
        </Typography>
        {team.length === 0 ? (
          <Typography color="text.secondary">{t("patchNotes.teamEmpty")}</Typography>
        ) : (
          <Stack spacing={3}>
            {team.map(([author, entries]) => (
              <Box key={author}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                  {tf("patchNotes.authorEntries", { name: author, count: entries.length })}
                </Typography>
                <EntryList entries={entries} canEdit={canEditEntry} onEdit={openEdit} onDelete={removeEntry} />
              </Box>
            ))}
          </Stack>
        )}
      </Paper>

      <EntryDialog
        open={dialogOpen}
        entry={editing}
        seedTask={seedTask}
        tasks={myTasks}
        onClose={() => setDialogOpen(false)}
        onSubmit={submitEntry}
      />

      <PdfPreviewDialog
        url={pdf.url}
        title={t("patchNotes.title")}
        onClose={pdf.close}
        onDownload={pdf.download}
      />
    </Container>
  );
}
