import { ChevronLeftRounded, ChevronRightRounded } from "@mui/icons-material";
import {
  Alert,
  Box,
  CircularProgress,
  Container,
  IconButton,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { t, tf } from "../../i18n";
import { LOCALE } from "../../locale";
import {
  getSettings,
  listExceptions,
  monthGrid,
  toDayKey,
  type WorkdayException,
  type WorkdaySettings,
} from "../workday/workdayApi";
import { getMine, type MyAttendance as MyAttendanceData } from "./attendanceApi";
import { HalfCell } from "./AttendanceChips";

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

/**
 * What an employee sees on the Attendance tab: their own arrivals as a month
 * calendar, read-only. Recording arrivals and seeing anyone else's stays with
 * the admin view, and the backend only ever returns the caller's own rows here.
 */
export default function MyAttendance() {
  const [cursor, setCursor] = useState(() => new Date());
  const [settings, setSettings] = useState<WorkdaySettings | null>(null);
  const [data, setData] = useState<MyAttendanceData | null>(null);
  const [exceptions, setExceptions] = useState<WorkdayException[]>([]);
  const [error, setError] = useState("");

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  const cells = useMemo(() => monthGrid(year, month), [year, month]);

  useEffect(() => {
    getSettings().then(setSettings).catch((err) => setError((err as Error).message));
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getMine(monthKey), listExceptions(cells[0].key, cells[cells.length - 1].key)])
      .then(([mine, dated]) => {
        if (cancelled) return;
        setData(mine);
        setExceptions(dated);
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [monthKey, cells]);

  const entriesByDay = useMemo(
    () => new Map((data?.entries ?? []).map((entry) => [entry.date, entry])),
    [data]
  );
  const exceptionsByDay = useMemo(
    () => new Map(exceptions.map((entry) => [entry.date, entry])),
    [exceptions]
  );

  if (!settings || !data) {
    return (
      <Container maxWidth="lg" sx={{ py: 6 }}>
        {error ? <Alert severity="error">{error}</Alert> : <CircularProgress />}
      </Container>
    );
  }

  const todayKey = toDayKey(new Date());
  const monthLabel = new Intl.DateTimeFormat(LOCALE, { month: "long", year: "numeric" }).format(
    cursor
  );

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      <Box className="page-heading">
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            {t("attendance.title")}
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            {t("attendance.mySubtitle")}
          </Typography>
        </Box>
      </Box>

      <Paper className="status-card" elevation={0} sx={{ p: 3, mt: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
          {t("attendance.tolerances")}
        </Typography>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={3}>
          <Box>
            <Typography variant="overline" color="text.secondary">
              {t("attendance.firstHalfShort")}
            </Typography>
            <HalfCell half={data.first} />
          </Box>
          <Box>
            <Typography variant="overline" color="text.secondary">
              {t("attendance.secondHalfShort")}
            </Typography>
            <HalfCell half={data.second} />
          </Box>
        </Stack>
      </Paper>

      <Paper className="status-card" elevation={0} sx={{ p: 3, mt: 3 }}>
        <Stack
          direction="row"
          spacing={2}
          sx={{ alignItems: "center", justifyContent: "space-between", mb: 2 }}
        >
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {t("attendance.myCalendar")}
          </Typography>

          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <IconButton
              aria-label={t("workday.previousMonth")}
              onClick={() => setCursor(new Date(year, month - 1, 1))}
            >
              <ChevronLeftRounded />
            </IconButton>
            <Typography sx={{ minWidth: 160, textAlign: "center", fontWeight: 700 }}>
              {monthLabel}
            </Typography>
            <IconButton
              aria-label={t("workday.nextMonth")}
              onClick={() => setCursor(new Date(year, month + 1, 1))}
            >
              <ChevronRightRounded />
            </IconButton>
          </Stack>
        </Stack>

        <Box className="cal-grid">
          {WEEKDAYS.map((day) => (
            <Box key={`head-${day}`} className="cal-head">
              {t(`weekday.${day}` as "weekday.0")}
            </Box>
          ))}

          {cells.map((cell) => {
            // Entries only come back for the month on screen, so the padding
            // days of the neighbouring months simply show no arrival.
            const entry = cell.inMonth ? entriesByDay.get(cell.key) : undefined;
            const exception = exceptionsByDay.get(cell.key);
            const working = exception
              ? exception.working
              : settings.workingWeekdays.includes(cell.date.getDay());

            return (
              <Box
                key={cell.key}
                className={[
                  "cal-cell",
                  "readonly",
                  working ? "working" : "closed",
                  cell.inMonth ? "" : "outside",
                  cell.key === todayKey ? "today" : "",
                  entry ? (entry.lateMinutes > 0 ? "late" : "on-time") : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                title={
                  entry
                    ? tf("attendance.arrivalTitle", {
                        time: entry.arrivedAt,
                        expected: entry.expectedStart || "—",
                      })
                    : undefined
                }
              >
                <span className="cal-day">{cell.date.getDate()}</span>
                {exception?.label && <span className="cal-label">{exception.label}</span>}
                {entry && <span className="cal-arrival">{entry.arrivedAt}</span>}
                {entry && entry.lateMinutes > 0 && (
                  <span className="cal-late">
                    {tf("attendance.lateShort", { minutes: entry.lateMinutes })}
                  </span>
                )}
              </Box>
            );
          })}
        </Box>

        <Stack direction="row" spacing={2} sx={{ mt: 2, flexWrap: "wrap" }} useFlexGap>
          <Box className="cal-key">
            <span className="cal-swatch on-time" />
            {t("attendance.onTime")}
          </Box>
          <Box className="cal-key">
            <span className="cal-swatch late" />
            {t("attendance.late")}
          </Box>
          <Box className="cal-key">
            <span className="cal-swatch closed" />
            {t("workday.closed")}
          </Box>
        </Stack>
      </Paper>

      <Box sx={{ height: 40 }} />
    </Container>
  );
}
