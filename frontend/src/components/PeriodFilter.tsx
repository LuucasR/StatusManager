import {
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
} from "@mui/material";
import { useEffect, useState } from "react";
import { lazyLabels, t } from "../i18n";

export type Period = "all" | "today" | "last7" | "last30" | "custom";

const PERIOD_ORDER: Period[] = ['all', 'today', 'last7', 'last30', 'custom'];

const PERIOD_LABELS = lazyLabels(PERIOD_ORDER, (period) => `period.${period}` as const);

/** LOCAL midnight of `date`, shifted by `days` days. */
function localMidnight(days = 0, date = new Date()) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * Turns the period into `from`/`to` as ISO strings **in the browser's timezone**.
 *
 * `new Date("2026-08-01")` is midnight UTC, not local: in Argentina the range
 * started the previous day at 21:00, and the backend has no way of guessing the
 * timezone of whoever is asking. So the range is built here, out of the pieces
 * of the local date, and travels as a full ISO string.
 *
 * `to` is EXCLUSIVE (midnight of the following day), which is what the
 * backend's `overlappingWhere` expects with its `startedAt < to`. Using
 * 23:59:59 dropped the last second of the day.
 */
function periodToParams(period: Period, from: string, to: string) {
  const params = new URLSearchParams();

  if (period === "today") {
    params.set("from", localMidnight(0).toISOString());
    params.set("to", localMidnight(1).toISOString());
  }
  if (period === "last7" || period === "last30") {
    params.set("from", localMidnight(period === "last7" ? -7 : -30).toISOString());
    params.set("to", localMidnight(1).toISOString());
  }
  if (period === "custom" && from && to) {
    // <input type="date"> yields "YYYY-MM-DD". Parsed piece by piece so it is
    // not interpreted as UTC.
    const [fy, fm, fd] = from.split("-").map(Number);
    const [ty, tm, td] = to.split("-").map(Number);
    params.set("from", new Date(fy, fm - 1, fd).toISOString());
    // +1 day: the range "up to the 5th" has to include the whole 5th.
    params.set("to", new Date(ty, tm - 1, td + 1).toISOString());
  }

  return params;
}

type Props = {
  /** Only fires once the range is complete (custom needs both dates). */
  onChange: (params: URLSearchParams) => void;
  initialPeriod?: Period;
  label?: string;
};

export default function PeriodFilter({
  onChange,
  initialPeriod = "all",
  label = t("period.label"),
}: Props) {
  const [period, setPeriod] = useState<Period>(initialPeriod);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    // A half-filled custom range does not fire the query: sending it would mean
    // asking for "since forever" and showing a total that is not the one about
    // to be chosen.
    if (period === "custom" && (!from || !to)) return;
    onChange(periodToParams(period, from, to));
  }, [period, from, to, onChange]);

  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={2}
      sx={{ alignItems: { sm: "center" }, flexWrap: "wrap" }}
      useFlexGap
    >
      <FormControl size="small" sx={{ minWidth: 200 }}>
        <InputLabel>{label}</InputLabel>
        <Select
          value={period}
          label={label}
          onChange={(e) => setPeriod(e.target.value as Period)}
        >
          {(Object.keys(PERIOD_LABELS) as Period[]).map((value) => (
            <MenuItem key={value} value={value}>
              {PERIOD_LABELS[value]}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {period === "custom" && (
        <Stack direction="row" spacing={2}>
          <TextField
            size="small"
            label={t("period.from")}
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            size="small"
            label={t("period.to")}
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Stack>
      )}
    </Stack>
  );
}
