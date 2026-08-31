import { ChevronLeftRounded, ChevronRightRounded } from "@mui/icons-material";
import {
  Alert,
  Box,
  CircularProgress,
  Container,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { isAdminRole } from "../components/roles";
import type { AppOutletContext } from "../layouts/AppLayout";
import { t } from "../i18n";
import { LOCALE } from "../locale";
import DayExceptionDialog from "../components/workday/DayExceptionDialog";
import {
  getSettings,
  listExceptions,
  monthGrid,
  saveSettings,
  toDayKey,
  type WorkdayException,
  type WorkdaySettings,
} from "../components/workday/workdayApi";

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

/**
 * Admin-only working calendar.
 *
 * The scheduler reads exactly what this page writes: the weekly pattern decides
 * the ordinary week, and a dated exception overrides it in either direction.
 */
export default function WorkdayPage() {
  const { me } = useOutletContext<AppOutletContext>();
  const [settings, setSettings] = useState<WorkdaySettings | null>(null);
  const [exceptions, setExceptions] = useState<WorkdayException[]>([]);
  const [cursor, setCursor] = useState(() => new Date());
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  // The whole team is subject to these hours, so the whole team can read them.
  // Editing is the admin's, and the backend enforces that regardless.
  const canEdit = isAdminRole(me?.role);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const cells = useMemo(() => monthGrid(year, month), [year, month]);

  const loadExceptions = useCallback(async () => {
    if (cells.length === 0) return;
    try {
      setExceptions(
        await listExceptions(cells[0].key, cells[cells.length - 1].key)
      );
    } catch (err) {
      setError((err as Error).message);
    }
  }, [cells]);

  useEffect(() => {
    getSettings().then(setSettings).catch((err) => setError((err as Error).message));
  }, []);

  useEffect(() => {
    void loadExceptions();
  }, [loadExceptions]);

  const byDate = useMemo(() => {
    const map = new Map<string, WorkdayException>();
    for (const entry of exceptions) map.set(entry.date, entry);
    return map;
  }, [exceptions]);

  async function persist(patch: Partial<WorkdaySettings>) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      setSettings(await saveSettings(patch));
      setNotice(t("workday.saved"));
    } catch (err) {
      setError((err as Error).message);
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

  const todayKey = toDayKey(new Date());
  const monthLabel = new Intl.DateTimeFormat(LOCALE, {
    month: "long",
    year: "numeric",
  }).format(cursor);

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
          <Typography className="eyebrow">{t("workday.eyebrow")}</Typography>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            {t("workday.title")}
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            {canEdit ? t("workday.subtitle") : t("workday.readOnly")}
          </Typography>
        </Box>
      </Box>

      <Paper className="status-card" elevation={0} sx={{ p: 3, mt: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
          {t("workday.settings")}
        </Typography>

        <Stack spacing={3}>
          <FormControlLabel
            control={
              <Switch
                checked={settings.enabled}
                disabled={!canEdit}
                onChange={(e) => void persist({ enabled: e.target.checked })}
              />
            }
            label={t("workday.enabled")}
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: "0 !important" }}>
            {t("workday.enabledHelp")}
          </Typography>

          <Box>
            <Typography variant="overline" color="text.secondary">
              {t("workday.weekdays")}
            </Typography>
            <ToggleButtonGroup
              value={settings.workingWeekdays}
              disabled={!canEdit}
              onChange={(_, value: number[]) => {
                // The backend refuses an empty week; stopping it here avoids a
                // pointless round-trip and a red banner for a slip of the mouse.
                if (value.length === 0) return;
                void persist({ workingWeekdays: value });
              }}
              size="small"
              sx={{ mt: 1, flexWrap: "wrap" }}
            >
              {WEEKDAYS.map((day) => (
                <ToggleButton key={day} value={day} sx={{ px: 2 }}>
                  {t(`weekday.${day}` as "weekday.0")}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Box>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              label={t("workday.startTime")}
              type="time"
              disabled={!canEdit}
              value={settings.startTime}
              onChange={(e) => setSettings({ ...settings, startTime: e.target.value })}
              onBlur={(e) => void persist({ startTime: e.target.value })}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label={t("workday.endTime")}
              type="time"
              disabled={!canEdit}
              value={settings.endTime}
              onChange={(e) => setSettings({ ...settings, endTime: e.target.value })}
              onBlur={(e) => void persist({ endTime: e.target.value })}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Stack>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              label={t("workday.delay")}
              type="number"
              disabled={!canEdit}
              value={settings.confirmationDelayMinutes}
              helperText={t("workday.delayHelp")}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  confirmationDelayMinutes: Number(e.target.value),
                })
              }
              onBlur={(e) =>
                void persist({ confirmationDelayMinutes: Number(e.target.value) })
              }
            />
            <TextField
              label={t("workday.timeout")}
              type="number"
              disabled={!canEdit}
              value={settings.confirmationTimeoutSeconds}
              helperText={t("workday.timeoutHelp")}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  confirmationTimeoutSeconds: Number(e.target.value),
                })
              }
              onBlur={(e) =>
                void persist({ confirmationTimeoutSeconds: Number(e.target.value) })
              }
            />
          </Stack>

          <TextField
            select
            label={t("workday.timezone")}
            value={settings.timezone}
            onChange={(e) => void persist({ timezone: e.target.value })}
            disabled={saving || !canEdit}
          >
            {/* Intl.supportedValuesOf gives every zone the runtime knows, so the
                list cannot drift from what the backend will accept. */}
            {Intl.supportedValuesOf("timeZone").map((zone) => (
              <MenuItem key={zone} value={zone}>
                {zone}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      </Paper>

      <Paper className="status-card" elevation={0} sx={{ p: 3, mt: 3 }}>
        <Stack
          direction="row"
          spacing={2}
          sx={{ alignItems: "center", justifyContent: "space-between", mb: 1 }}
        >
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {t("workday.calendar")}
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

        <Typography variant="caption" color="text.secondary">
          {t("workday.calendarHelp")}
        </Typography>

        <Box className="cal-grid" sx={{ mt: 2 }}>
          {WEEKDAYS.map((day) => (
            <Box key={`head-${day}`} className="cal-head">
              {t(`weekday.${day}` as "weekday.0")}
            </Box>
          ))}

          {cells.map((cell) => {
            const entry = byDate.get(cell.key) ?? null;
            const patternWorking = settings.workingWeekdays.includes(cell.date.getDay());
            const working = entry ? entry.working : patternWorking;

            return (
              <Box
                key={cell.key}
                component={canEdit ? "button" : "div"}
                {...(canEdit
                  ? { type: "button" as const, onClick: () => setOpenDay(cell.key) }
                  : {})}
                className={[
                  "cal-cell",
                  working ? "working" : "closed",
                  entry ? "exception" : "",
                  cell.inMonth ? "" : "outside",
                  cell.key === todayKey ? "today" : "",
                  canEdit ? "" : "readonly",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <span className="cal-day">{cell.date.getDate()}</span>
                {entry?.label && <span className="cal-label">{entry.label}</span>}
                {entry?.startTime && entry?.endTime && (
                  <span className="cal-hours">
                    {entry.startTime}–{entry.endTime}
                  </span>
                )}
              </Box>
            );
          })}
        </Box>

        <Stack direction="row" spacing={2} sx={{ mt: 2, flexWrap: "wrap" }} useFlexGap>
          <Box className="cal-key"><span className="cal-swatch working" />{t("workday.open")}</Box>
          <Box className="cal-key"><span className="cal-swatch closed" />{t("workday.closed")}</Box>
          <Box className="cal-key"><span className="cal-swatch exception" />{t("workday.calendar")}</Box>
        </Stack>
      </Paper>

      <DayExceptionDialog
        date={openDay}
        current={openDay ? byDate.get(openDay) ?? null : null}
        defaultStart={settings.startTime}
        defaultEnd={settings.endTime}
        onClose={() => setOpenDay(null)}
        onChanged={() => void loadExceptions()}
      />

      <Box sx={{ height: 40 }} />
    </Container>
  );
}
