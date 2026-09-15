import { DeleteOutlineRounded } from "@mui/icons-material";
import {
  Alert,
  Box,
  Chip,
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
import { useCallback, useEffect, useState } from "react";
import { Navigate, useOutletContext } from "react-router-dom";
import { isAdminRole } from "../components/roles";
import type { AppOutletContext } from "../layouts/AppLayout";
import { t, tf } from "../i18n";
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
  type HalfSummary,
} from "../components/attendance/attendanceApi";

/** "YYYY-MM-DD" -> a local date label, parsed piece by piece so it is not UTC. */
function formatDay(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date).toLocaleDateString(LOCALE);
}

function HalfCell({ half }: { half: HalfSummary }) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }} useFlexGap>
      <Chip
        size="small"
        color={half.exceeded ? "error" : "success"}
        label={tf("attendance.used", { used: half.lateMinutes, tolerance: half.tolerance })}
      />
      <Typography variant="caption" color="text.secondary">
        {tf("attendance.lateDays", { days: half.lateDays })}
      </Typography>
    </Stack>
  );
}

function LateChip({ minutes }: { minutes: number }) {
  return minutes > 0 ? (
    <Chip size="small" color="warning" label={tf("attendance.lateMinutes", { minutes })} />
  ) : (
    <Chip size="small" color="success" variant="outlined" label={t("attendance.onTime")} />
  );
}

/**
 * Admin-only arrival records.
 *
 * Times are typed in by hand, one day at a time. Lateness is measured against the
 * working calendar's start time for that day and adds up into a budget per half of
 * the month, whose size is set at the top of this page.
 */
export default function AttendancePage() {
  const { me } = useOutletContext<AppOutletContext>();
  const admin = isAdminRole(me?.role);

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

  const fail = useCallback((err: unknown) => setError((err as Error).message), []);

  const loadDay = useCallback(async () => {
    const loaded = await getDay(date);
    setDay(loaded);
    setDrafts(
      Object.fromEntries(loaded.rows.map((row) => [row.employee.id, row.entry?.arrivedAt ?? ""]))
    );
  }, [date]);

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

  // Nothing is fetched until the role is known to be admin: every endpoint
  // would answer 403 to anyone else, and the page redirects them anyway.
  useEffect(() => {
    if (!admin) return;
    getSettings().then(setSettings).catch(fail);
  }, [admin, fail]);

  useEffect(() => {
    if (admin && date) loadDay().catch(fail);
  }, [admin, date, loadDay, fail]);

  useEffect(() => {
    if (admin) loadSummary().catch(fail);
  }, [admin, loadSummary, fail]);

  useEffect(() => {
    if (admin) loadHistory().catch(fail);
  }, [admin, loadHistory, fail]);

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

  async function saveArrival(employeeId: number, value: string) {
    const current = day?.rows.find((row) => row.employee.id === employeeId)?.entry ?? null;
    if (value === (current?.arrivedAt ?? "")) return;

    setError("");
    setNotice("");
    try {
      // An emptied field is how a mistyped arrival gets taken back.
      if (value === "") await clearEntry(date, employeeId);
      else {
        await saveEntry(date, employeeId, value);
        setNotice(t("attendance.entrySaved"));
      }
      await Promise.all([loadDay(), loadSummary(), loadHistory()]);
    } catch (err) {
      fail(err);
    }
  }

  if (me && !admin) return <Navigate to="/dashboard" replace />;

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
          <TextField
            size="small"
            type="date"
            label={t("attendance.date")}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
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
                      onBlur={(e) => void saveArrival(employee.id, e.target.value)}
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
                  <TableCell align="right">
                    {entry && (
                      <Tooltip title={t("attendance.clear")}>
                        <IconButton
                          size="small"
                          aria-label={t("attendance.clear")}
                          onClick={() => void saveArrival(employee.id, "")}
                        >
                          <DeleteOutlineRounded fontSize="small" />
                        </IconButton>
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
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {t("attendance.summary")}
          </Typography>
          <TextField
            size="small"
            type="month"
            label={t("attendance.month")}
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
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
