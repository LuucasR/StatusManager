import {
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
} from "@mui/material";
import { useEffect, useState } from "react";

export type Period = "all" | "today" | "last7" | "last30" | "custom";

const PERIOD_LABELS: Record<Period, string> = {
  all: "Todo el historial",
  today: "Hoy",
  last7: "Últimos 7 días",
  last30: "Últimos 30 días",
  custom: "Rango personalizado",
};

/** Medianoche LOCAL del día de `date`, desplazada `days` días. */
function localMidnight(days = 0, date = new Date()) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * Traduce el período a `from`/`to` en ISO **con el huso del navegador**.
 *
 * `new Date("2026-08-01")` es medianoche UTC, no local: en Argentina el rango
 * arrancaba el día anterior a las 21:00, y el backend no tiene forma de
 * adivinar el huso de quien consulta. Por eso el rango se arma acá, a partir
 * de las piezas de la fecha local, y viaja como ISO completo.
 *
 * `to` es EXCLUSIVO (medianoche del día siguiente), que es lo que espera
 * `overlappingWhere` del backend con su `startedAt < to`. Usar 23:59:59 dejaba
 * afuera el último segundo del día.
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
    // Los <input type="date"> dan "YYYY-MM-DD". Se parsean por partes para que
    // no los interprete como UTC.
    const [fy, fm, fd] = from.split("-").map(Number);
    const [ty, tm, td] = to.split("-").map(Number);
    params.set("from", new Date(fy, fm - 1, fd).toISOString());
    // +1 día: el rango "hasta el 5" tiene que incluir el 5 entero.
    params.set("to", new Date(ty, tm - 1, td + 1).toISOString());
  }

  return params;
}

type Props = {
  /** Solo se dispara cuando el rango está completo (custom exige ambas fechas). */
  onChange: (params: URLSearchParams) => void;
  initialPeriod?: Period;
  label?: string;
};

export default function PeriodFilter({
  onChange,
  initialPeriod = "all",
  label = "Período",
}: Props) {
  const [period, setPeriod] = useState<Period>(initialPeriod);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    // Un rango custom a medio completar no dispara la consulta: mandarlo
    // significaría pedir "desde siempre" y mostrar un total que no es el que
    // se está por elegir.
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
            label="Desde"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            size="small"
            label="Hasta"
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
