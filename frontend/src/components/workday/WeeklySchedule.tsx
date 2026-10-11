import { ContentCopyRounded, SaveRounded } from "@mui/icons-material";
import { Box, Button, Stack, Switch, TextField, Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { t, tf } from "../../i18n";
import { hoursFor, minutesOf, type WeekdaySchedule, type WorkdaySettings } from "./workdayApi";

/** Monday first: how the team reads a week, even though Sunday is 0. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

type Row = { working: boolean; start: string; end: string };

function rowsFrom(settings: WorkdaySettings): Record<number, Row> {
  const rows: Record<number, Row> = {};
  for (const day of WEEK_ORDER) {
    rows[day] = { working: settings.workingWeekdays.includes(day), ...hoursFor(settings, day) };
  }
  return rows;
}

/** "6 h", "7 h 30 min", or null when the times do not make a valid day. */
function durationLabel(start: string, end: string) {
  const from = minutesOf(start);
  const to = minutesOf(end);
  if (from === null || to === null || to <= from) return null;
  const total = to - from;
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return minutes ? tf("workday.durationHm", { hours, minutes }) : tf("workday.durationH", { hours });
}

type Props = {
  settings: WorkdaySettings;
  canEdit: boolean;
  saving: boolean;
  onSave: (patch: Partial<WorkdaySettings>) => Promise<void>;
};

/**
 * The working week, one row per weekday with its own hours, so a short Tuesday
 * and a long Monday are both just a row. Lateness is measured against the start
 * of that day's row; a dated exception in the calendar still overrides it.
 */
export default function WeeklySchedule({ settings, canEdit, saving, onSave }: Props) {
  const [rows, setRows] = useState(() => rowsFrom(settings));

  useEffect(() => setRows(rowsFrom(settings)), [settings]);

  const saved = useMemo(() => rowsFrom(settings), [settings]);
  const dirty = WEEK_ORDER.some(
    (day) =>
      rows[day].working !== saved[day].working ||
      rows[day].start !== saved[day].start ||
      rows[day].end !== saved[day].end
  );

  const invalid = WEEK_ORDER.some(
    (day) => rows[day].working && durationLabel(rows[day].start, rows[day].end) === null
  );
  const noneWorking = WEEK_ORDER.every((day) => !rows[day].working);

  const totalMinutes = WEEK_ORDER.reduce((sum, day) => {
    const row = rows[day];
    const from = minutesOf(row.start);
    const to = minutesOf(row.end);
    return row.working && from !== null && to !== null && to > from ? sum + (to - from) : sum;
  }, 0);

  function update(day: number, patch: Partial<Row>) {
    setRows((current) => ({ ...current, [day]: { ...current[day], ...patch } }));
  }

  /** Copies the first working day's hours to every other working day. */
  function copyToAll() {
    const source = WEEK_ORDER.find((day) => rows[day].working);
    if (source === undefined) return;
    const { start, end } = rows[source];
    setRows((current) => {
      const next = { ...current };
      for (const day of WEEK_ORDER) if (next[day].working) next[day] = { ...next[day], start, end };
      return next;
    });
  }

  async function save() {
    const weekdaySchedule: WeekdaySchedule = {};
    for (const day of WEEK_ORDER) {
      weekdaySchedule[String(day)] = { start: rows[day].start, end: rows[day].end };
    }
    await onSave({
      workingWeekdays: WEEK_ORDER.filter((day) => rows[day].working).sort((a, b) => a - b),
      weekdaySchedule,
    });
  }

  return (
    <Box>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1}
        sx={{ justifyContent: "space-between", alignItems: { sm: "center" }, mb: 1.5 }}
      >
        <Box>
          <Typography variant="overline" color="text.secondary">
            {t("workday.weekSchedule")}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t("workday.weekScheduleHelp")}
          </Typography>
        </Box>
        <Typography variant="body2" sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>
          {tf("workday.weekTotal", { hours: Math.round((totalMinutes / 60) * 10) / 10 })}
        </Typography>
      </Stack>

      <Box className="week-table">
        {WEEK_ORDER.map((day) => {
          const row = rows[day];
          const duration = durationLabel(row.start, row.end);
          return (
            <Box key={day} className={`week-row${row.working ? "" : " off"}`}>
              <Stack direction="row" sx={{ alignItems: "center", minWidth: 150 }}>
                <Switch
                  size="small"
                  checked={row.working}
                  disabled={!canEdit}
                  onChange={(event) => update(day, { working: event.target.checked })}
                  slotProps={{ input: { "aria-label": t(`weekday.long.${day}` as "weekday.long.0") } }}
                />
                <Typography sx={{ fontWeight: 650 }}>
                  {t(`weekday.long.${day}` as "weekday.long.0")}
                </Typography>
              </Stack>

              {row.working ? (
                <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", flex: 1 }}>
                  <TextField
                    size="small"
                    type="time"
                    label={t("workday.startTime")}
                    value={row.start}
                    disabled={!canEdit}
                    onChange={(event) => update(day, { start: event.target.value })}
                    slotProps={{ inputLabel: { shrink: true } }}
                  />
                  <TextField
                    size="small"
                    type="time"
                    label={t("workday.endTime")}
                    value={row.end}
                    disabled={!canEdit}
                    onChange={(event) => update(day, { end: event.target.value })}
                    slotProps={{ inputLabel: { shrink: true } }}
                  />
                  <Box className={`week-hours${duration ? "" : " invalid"}`}>
                    {duration ?? t("workday.invalidHours")}
                  </Box>
                </Stack>
              ) : (
                <Typography color="text.secondary" sx={{ flex: 1 }}>
                  {t("workday.dayOff")}
                </Typography>
              )}
            </Box>
          );
        })}
      </Box>

      {canEdit && (
        <Stack direction="row" spacing={1.5} sx={{ mt: 2, justifyContent: "flex-end", flexWrap: "wrap" }} useFlexGap>
          <Button startIcon={<ContentCopyRounded />} onClick={copyToAll} disabled={saving}>
            {t("workday.copyToAll")}
          </Button>
          <Button
            variant="contained"
            startIcon={<SaveRounded />}
            onClick={() => void save()}
            disabled={saving || !dirty || invalid || noneWorking}
          >
            {t("workday.saveWeek")}
          </Button>
        </Stack>
      )}
    </Box>
  );
}
