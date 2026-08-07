import { ExpandMoreRounded } from "@mui/icons-material";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Chip,
  CircularProgress,
  Container,
  LinearProgress,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { useCallback, useState } from "react";
import { api } from "../api";
import PeriodFilter from "../components/PeriodFilter";
import TaskFacts from "../components/tasks/TaskFacts";
import type { TaskParticipant, TaskState } from "../components/tasks/types";
import { useOnReconnect, useSocketEvent } from "../realtime/useSocketEvent";

type Status =
  | "AVAILABLE"
  | "WORKING"
  | "BREAK"
  | "LUNCH"
  | "MEETING"
  | "OFFLINE"
  | "DISCONNECTED";

// Espeja STATUS_META del backend (activities/activity-status.ts). DISCONNECTED
// nunca llega —visibleHistoryWhere lo excluye— pero se lista igual para que el
// Record quede exhaustivo y no explote si eso cambia.
const STATUS_LABELS: Record<Status, string> = {
  AVAILABLE: "Disponible",
  WORKING: "Trabajando",
  BREAK: "Descanso",
  LUNCH: "Almuerzo",
  MEETING: "Reunión",
  OFFLINE: "Ausente",
  DISCONNECTED: "Desconectado",
};

const STATUS_COLORS: Record<Status, string> = {
  AVAILABLE: "#208454",
  WORKING: "#4C4DC9",
  BREAK: "#A66A00",
  LUNCH: "#8C4EA3",
  MEETING: "#16738B",
  OFFLINE: "#666A7D",
  DISCONNECTED: "#B23C4A",
};

type StatusBucket = { status: Status; totalMs: number; segments: number };

type TaskBucket = {
  key: string;
  taskId: number | null;
  title: string | null;
  deleted: boolean;
  totalMs: number;
  segments: number;
  lastWorkedAt: string;
  task: {
    description: string;
    state: TaskState;
    startsAt: string;
    endsAt: string;
    participants: TaskParticipant[];
    createdBy: TaskParticipant | null;
  } | null;
};

type Summary = {
  from: string | null;
  to: string | null;
  totalMs: number;
  byStatus: StatusBucket[];
  byTask: TaskBucket[];
};

/** "3 h 07 min" / "45 min". Misma forma que formatDuration del reporte PDF. */
function formatMs(ms: number) {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} h`;
  return `${hours} h ${String(rest).padStart(2, "0")} min`;
}

function plural(count: number, singular: string, pluralForm: string) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export default function SummaryPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [params, setParams] = useState(() => new URLSearchParams());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (query: URLSearchParams) => {
    setLoading(true);
    try {
      const search = query.toString();
      setSummary(await api<Summary>(`/activities/summary${search ? `?${search}` : ""}`));
      setError("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const handlePeriodChange = useCallback(
    (next: URLSearchParams) => {
      setParams(next);
      void load(next);
    },
    [load]
  );

  // La carga inicial la dispara PeriodFilter: su efecto de montaje llama a
  // onChange con el período por defecto, así que no hace falta un fetch aparte.
  //
  // El tramo abierto sigue sumando mientras la página está abierta: si cambia
  // el estado, el total en pantalla deja de ser el real. useSocketEvent guarda
  // el handler en un ref, así que `params` acá siempre es el actual.
  useSocketEvent("status:changed", () => void load(params));
  useOnReconnect(() => void load(params));

  const maxStatusMs = summary?.byStatus[0]?.totalMs ?? 0;

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      <Box className="page-heading">
        <Box>
          <Typography className="eyebrow">TU ACTIVIDAD</Typography>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            Resumen
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            En qué se te fue el tiempo durante el período, y los detalles de cada tarea que
            trabajaste.
          </Typography>
        </Box>
      </Box>

      <Box sx={{ mb: 3 }}>
        <PeriodFilter onChange={handlePeriodChange} initialPeriod="last7" />
      </Box>

      {loading && !summary ? (
        <Stack sx={{ alignItems: "center", py: 8 }}>
          <CircularProgress />
        </Stack>
      ) : !summary ? null : (
        <Stack spacing={3}>
          <Paper className="table-card" elevation={0} sx={{ p: 3 }}>
            <Typography variant="overline" color="text.secondary">
              Tiempo registrado
            </Typography>
            <Typography variant="h3" sx={{ fontWeight: 800 }}>
              {formatMs(summary.totalMs)}
            </Typography>
            {/* "Tiempo registrado" y no "% de la jornada" a propósito: hay
                huecos reales entre tramos y los períodos Desconectado quedan
                fuera del historial, así que el total no cierra con el reloj. */}
            <Typography variant="caption" color="text.secondary">
              Suma de los tramos registrados dentro del período. No incluye los períodos
              Desconectado ni el tiempo sin ningún estado puesto.
            </Typography>
          </Paper>

          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 1.5 }}>
              Por estado
            </Typography>

            {summary.byStatus.length === 0 ? (
              <Typography color="text.secondary">
                No hay actividad registrada en este período.
              </Typography>
            ) : (
              <Paper className="table-card" elevation={0} sx={{ p: 3 }}>
                <Stack spacing={2}>
                  {summary.byStatus.map((bucket) => (
                    <Box key={bucket.status}>
                      <Stack
                        direction="row"
                        sx={{ justifyContent: "space-between", alignItems: "baseline", mb: 0.5 }}
                      >
                        <Typography sx={{ fontWeight: 600 }}>
                          {STATUS_LABELS[bucket.status]}
                        </Typography>
                        <Stack direction="row" spacing={1.5} sx={{ alignItems: "baseline" }}>
                          <Typography variant="caption" color="text.secondary">
                            {plural(bucket.segments, "tramo", "tramos")}
                          </Typography>
                          <Typography sx={{ fontWeight: 700 }}>
                            {formatMs(bucket.totalMs)}
                          </Typography>
                        </Stack>
                      </Stack>
                      <LinearProgress
                        variant="determinate"
                        value={maxStatusMs ? (bucket.totalMs / maxStatusMs) * 100 : 0}
                        sx={{
                          height: 8,
                          borderRadius: 4,
                          bgcolor: "#eef0f6",
                          "& .MuiLinearProgress-bar": {
                            borderRadius: 4,
                            bgcolor: STATUS_COLORS[bucket.status],
                          },
                        }}
                      />
                    </Box>
                  ))}
                </Stack>
              </Paper>
            )}
          </Box>

          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 1.5 }}>
              Tareas trabajadas
            </Typography>

            {summary.byTask.length === 0 ? (
              <Typography color="text.secondary">
                No declaraste ninguna tarea en este período.
              </Typography>
            ) : (
              summary.byTask.map((bucket) => (
                <Accordion key={bucket.key} disableGutters elevation={0} className="table-card">
                  <AccordionSummary expandIcon={<ExpandMoreRounded />}>
                    <Stack
                      direction="row"
                      spacing={2}
                      sx={{ alignItems: "center", width: "100%", pr: 1 }}
                    >
                      <Typography sx={{ fontWeight: 600, flex: 1 }}>
                        {bucket.title ?? "Tarea sin título"}
                      </Typography>

                      {bucket.deleted && (
                        <Chip size="small" label="Eliminada" variant="outlined" color="warning" />
                      )}

                      <Typography variant="caption" color="text.secondary">
                        {plural(bucket.segments, "tramo", "tramos")}
                      </Typography>

                      <Typography sx={{ fontWeight: 700 }}>{formatMs(bucket.totalMs)}</Typography>
                    </Stack>
                  </AccordionSummary>

                  <AccordionDetails>
                    {bucket.task ? (
                      <TaskFacts
                        task={bucket.task}
                        showState
                        asOfNote="Integrantes y estado son los actuales de la tarea, no los del momento en que trabajaste."
                      />
                    ) : (
                      <Alert severity="warning">
                        La tarea fue eliminada. Solo queda el registro del tiempo que le imputaste y
                        su título.
                      </Alert>
                    )}
                  </AccordionDetails>
                </Accordion>
              ))
            )}
          </Box>
        </Stack>
      )}
    </Container>
  );
}
