import { DeleteOutlineRounded, RefreshRounded, SaveRounded } from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { isAdminRole } from "../components/roles";
import type { AppOutletContext } from "../layouts/AppLayout";
import { t, tf } from "../i18n";
import { HalfCell, LateChip } from "../components/attendance/AttendanceChips";
import MyAttendance from "../components/attendance/MyAttendance";
import { LOCALE } from "../locale";
import PeriodFilter from "../components/PeriodFilter";
import {
  getSettings,
  saveSettings,
  toDayKey,
  type WorkdaySettings,
} from "../components/workday/workdayApi";
import {
  clearEntry,
  getDay,
  getHistory,
  getSummary,
  saveEntry,
  type AttendanceDay,
  type AttendanceHistory,
  type AttendanceSummary,
} from "../components/attendance/attendanceApi";

/** "YYYY-MM-DD" -> a local date label, parsed piece by piece so it is not UTC. */
function formatDay(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date).toLocaleDateString(LOCALE);
}

/**
 * The Attendance tab. An admin records everyone's arrivals and sets the
 * allowance; anyone else sees their own month as a read-only calendar.
 *
 * The choice waits for the role: rendering either view before AppLayout has
 * fetched it would briefly show an employee the admin screen, or fire requests
 * that bounce with 403.
 */
export default function AttendancePage() {
  const { me } = useOutletContext<AppOutletContext>();

  if (!me) {
    return (
      <Container maxWidth="lg" sx={{ py: 6 }}>
        <CircularProgress />
      </Container>
    );
  }

  return isAdminRole(me.role) ? <AdminAttendance /> : <MyAttendance />;
}

/**
 * Everyone's arrival records.
 *
 * Times are typed in by hand, one day at a time. Lateness is measured against the
 * working calendar's start time for that day and adds up into a budget per half of
 * the month, whose size is set at the top of this page.
 */
function AdminAttendance() {

  const [settings, setSettings] = useState<WorkdaySettings | null>(null);
  const [date, setDate] = useState(() => toDayKey(new Date()));
  const [day, setDay] = useState<AttendanceDay | null>(null);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [month, setMonth] = useState(() => toDayKey(new Date()).slice(0, 7));
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [range, setRange] = useState<{ from?: string; to?: string }>({});
  const [historyEmployee, setHistoryEmployee] = useState("all");
  const [history, setHistory] = useState<AttendanceHistory | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  const fail = useCallback((err: unknown) => setError((err as Error).message), []);

  /**
   * Reloads the day from the server. `keep` lists rows whose unsaved typing has
   * to survive the reload - saving one row must not wipe what is still being
   * typed in the others.
   */
  const loadDay = useCallback(
    async (keep: number[] = []) => {
      const loaded = await getDay(date);
      setDay(loaded);
      setDrafts((previous) => {
        const next: Record<number, string> = Object.fromEntries(
          loaded.rows.map((row) => [row.employee.id, row.entry?.arrivedAt ?? ""])
        );
        for (const id of keep) if (id in previous) next[id] = previous[id];
        return next;
      });
    },
    [date]
  );

  const loadSummary = useCallback(async () => {
    if (!month) return;
    setSummary(await getSummary(month));
  }, [month]);

  const loadHistory = useCallback(async () => {
    setHistory(
      await getHistory({
        ...range,
        employeeId: historyEmployee === "all" ? undefined : Number(historyEmployee),
      })
    );
  }, [range, historyEmployee]);

  useEffect(() => {
    getSettings().then(setSettings).catch(fail);
  }, [fail]);

  useEffect(() => {
    if (date) loadDay().catch(fail);
  }, [date, loadDay, fail]);

  useEffect(() => {
    loadSummary().catch(fail);
  }, [loadSummary, fail]);

  useEffect(() => {
    loadHistory().catch(fail);
  }, [loadHistory, fail]);

  /**
   * PeriodFilter speaks in instants with an exclusive end; attendance is keyed
   * by calendar day with an inclusive one, so the end steps back into the last
   * day it covers.
   */
  const handlePeriodChange = useCallback((params: URLSearchParams) => {
    const from = params.get("from");
    const to = params.get("to");
    setRange({
      from: from ? toDayKey(new Date(from)) : undefined,
      to: to ? toDayKey(new Date(new Date(to).getTime() - 1)) : undefined,
    });
  }, []);

  async function persistTolerance(patch: Partial<WorkdaySettings>) {
    setError("");
    setNotice("");
    try {
      setSettings(await saveSettings(patch));
      setNotice(t("attendance.saved"));
      await loadSummary();
    } catch (err) {
      fail(err);
    }
  }

  /** Rows with a complete time typed in that differs from what is saved. */
  const pendingIds = useMemo(
    () =>
      (day?.rows ?? [])
        .filter(({ employee, entry }) => {
          const draft = drafts[employee.id] ?? "";
          return draft !== "" && draft !== (entry?.arrivedAt ?? "");
        })
        .map(({ employee }) => employee.id),
    [day, drafts]
  );

  /**
   * Everything that shows a saved arrival, refreshed together. The summary
   * jumps to the month of the day being recorded: it has its own month picker,
   * and leaving it on another month made a save look like it had done nothing.
   */
  async function refreshAfterWrite(keep: number[]) {
    const target = date.slice(0, 7);
    await Promise.all([
      loadDay(keep),
      loadHistory(),
      // A changed month reloads through its own effect.
      target === month ? loadSummary() : Promise.resolve(setMonth(target)),
    ]);
  }

  /**
   * Explicit save rather than on blur. Saving on blur fired on a half-typed
   * time too - which the browser reports as an empty value - and that cleared
   * the arrival already on record.
   */
  async function saveArrivals(employeeIds: number[]) {
    if (employeeIds.length === 0) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      // One at a time: a handful of rows, and a failure then names the row
      // that broke instead of leaving the rest half-applied in parallel.
      for (const id of employeeIds) await saveEntry(date, id, drafts[id]);
      setNotice(tf("attendance.entriesSaved", { count: employeeIds.length }));
      await refreshAfterWrite(pendingIds.filter((id) => !employeeIds.includes(id)));
    } catch (err) {
      fail(err);
    } finally {
      setSaving(false);
    }
  }

  async function clearArrival(employeeId: number) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await clearEntry(date, employeeId);
      await refreshAfterWrite(pendingIds.filter((id) => id !== employeeId));
    } catch (err) {
      fail(err);
    } finally {
      setSaving(false);
    }
  }

  if (!settings) {
    return (
      <Container maxWidth="lg" sx={{ py: 6 }}>
        {error ? <Alert severity="error">{error}</Alert> : <CircularProgress />}
      </Container>
    );
  }

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
          <Typography className="eyebrow">{t("attendance.eyebrow")}</Typography>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            {t("attendance.title")}
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            {t("attendance.subtitle")}
          </Typography>
        </Box>
      </Box>

      <Paper className="status-card" elevation={0} sx={{ p: 3, mt: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          {t("attendance.tolerances")}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {t("attendance.tolerancesHelp")}
        </Typography>

        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mt: 2 }}>
          <TextField
            label={t("attendance.firstHalf")}
            type="number"
            value={settings.lateToleranceFirstHalfMinutes}
            onChange={(e) =>
              setSettings({ ...settings, lateToleranceFirstHalfMinutes: Number(e.target.value) })
            }
            onBlur={(e) =>
              void persistTolerance({ lateToleranceFirstHalfMinutes: Number(e.target.value) })
            }
            slotProps={{ htmlInput: { min: 0, max: 600 } }}
          />
          <TextField
            label={t("attendance.secondHalf")}
            type="number"
            value={settings.lateToleranceSecondHalfMinutes}
            onChange={(e) =>
              setSettings({ ...settings, lateToleranceSecondHalfMinutes: Number(e.target.value) })
            }
            onBlur={(e) =>
              void persistTolerance({ lateToleranceSecondHalfMinutes: Number(e.target.value) })
            }
            slotProps={{ htmlInput: { min: 0, max: 600 } }}
          />
        </Stack>
      </Paper>

      <Paper className="status-card" elevation={0} sx={{ p: 3, mt: 3 }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          sx={{ alignItems: { sm: "center" }, justifyContent: "space-between", mb: 2 }}
        >
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {t("attendance.day")}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <TextField
              size="small"
              type="date"
              label={t("attendance.date")}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <Button
              variant="contained"
              startIcon={<SaveRounded />}
              disabled={saving || pendingIds.length === 0}
              onClick={() => void saveArrivals(pendingIds)}
            >
              {tf("attendance.saveAll", { count: pendingIds.length })}
            </Button>
          </Stack>
        </Stack>

        {day && !day.working && (
          <Alert severity="info" sx={{ mb: 2 }}>
            {day.label ? `${day.label} · ` : ""}
            {t("attendance.closedDay")}
          </Alert>
        )}

        <Box sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t("attendance.employee")}</TableCell>
                <TableCell>{t("attendance.expected")}</TableCell>
                <TableCell>{t("attendance.arrival")}</TableCell>
                <TableCell>{t("attendance.late")}</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {day?.rows.map(({ employee, entry }) => (
                <TableRow key={employee.id}>
                  <TableCell>
                    {employee.name} · #{employee.employeeNumber}
                  </TableCell>
                  {/* A saved entry keeps the start it was judged against. */}
                  <TableCell>{entry?.expectedStart || day.expectedStart || "—"}</TableCell>
                  <TableCell>
                    <TextField
                      size="small"
                      type="time"
                      value={drafts[employee.id] ?? ""}
                      onChange={(e) =>
                        setDrafts((all) => ({ ...all, [employee.id]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && pendingIds.includes(employee.id)) {
                          void saveArrivals([employee.id]);
                        }
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    {entry ? (
                      <LateChip minutes={entry.lateMinutes} />
                    ) : (
                      <Typography variant="body2" color="text.disabled">
                        {t("attendance.notRecorded")}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                    <Button
                      size="small"
                      startIcon={<SaveRounded />}
                      disabled={saving || !pendingIds.includes(employee.id)}
                      onClick={() => void saveArrivals([employee.id])}
                    >
                      {t("attendance.save")}
                    </Button>
                    {entry && (
                      <Tooltip title={t("attendance.clear")}>
                        <span>
                          <IconButton
                            size="small"
                            aria-label={t("attendance.clear")}
                            disabled={saving}
                            onClick={() => void clearArrival(employee.id)}
                          >
                            <DeleteOutlineRounded fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </Paper>

      <Paper className="status-card" elevation={0} sx={{ p: 3, mt: 3 }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          sx={{ alignItems: { sm: "center" }, justifyContent: "space-between", mb: 2 }}
        >
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {t("attendance.summary")}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t("attendance.summaryHelp")}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <TextField
              size="small"
              type="month"
              label={t("attendance.month")}
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <Button
              variant="outlined"
              startIcon={<RefreshRounded />}
              onClick={() => void loadSummary().catch(fail)}
            >
              {t("attendance.refresh")}
            </Button>
          </Stack>
        </Stack>

        <Box sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t("attendance.employee")}</TableCell>
                <TableCell>{t("attendance.firstHalfShort")}</TableCell>
                <TableCell>{t("attendance.secondHalfShort")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {summary?.rows.map((row) => (
                <TableRow key={row.employee.id}>
                  <TableCell>
                    {row.employee.name} · #{row.employee.employeeNumber}
                  </TableCell>
                  <TableCell>
                    <HalfCell half={row.first} />
                  </TableCell>
                  <TableCell>
                    <HalfCell half={row.second} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </Paper>

      <Paper className="status-card" elevation={0} sx={{ p: 3, mt: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
          {t("attendance.history")}
        </Typography>

        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          sx={{ mb: 2, alignItems: { sm: "center" } }}
          useFlexGap
        >
          <PeriodFilter onChange={handlePeriodChange} initialPeriod="last30" />
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel>{t("attendance.employee")}</InputLabel>
            <Select
              value={historyEmployee}
              label={t("attendance.employee")}
              onChange={(e) => setHistoryEmployee(e.target.value)}
            >
              <MenuItem value="all">{t("attendance.allEmployees")}</MenuItem>
              {day?.rows.map(({ employee }) => (
                <MenuItem key={employee.id} value={String(employee.id)}>
                  {employee.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>

        {history?.truncated && (
          <Alert severity="info" sx={{ mb: 2 }}>
            {t("attendance.historyTruncated")}
          </Alert>
        )}

        <Box sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t("attendance.date")}</TableCell>
                <TableCell>{t("attendance.employee")}</TableCell>
                <TableCell>{t("attendance.expected")}</TableCell>
                <TableCell>{t("attendance.arrival")}</TableCell>
                <TableCell>{t("attendance.late")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {history && history.rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5}>
                    <Typography color="text.secondary" sx={{ py: 2 }}>
                      {t("attendance.empty")}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {history?.rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{formatDay(row.date)}</TableCell>
                  <TableCell>
                    {row.employee.name} · #{row.employee.employeeNumber}
                  </TableCell>
                  <TableCell>{row.expectedStart || "—"}</TableCell>
                  <TableCell>{row.arrivedAt}</TableCell>
                  <TableCell>
                    <LateChip minutes={row.lateMinutes} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </Paper>

      <Box sx={{ height: 40 }} />
    </Container>
  );
}
