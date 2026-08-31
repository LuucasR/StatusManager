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
import {
  STATUS_COLORS,
  STATUS_LABELS,
  type Status,
} from "../components/activities/statuses";
import { t, tf } from "../i18n";




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

/** "3 h 07 min" / "45 min". Same shape as formatDuration in the PDF report. */
function formatMs(ms: number) {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} h`;
  return `${hours} h ${String(rest).padStart(2, "0")} min`;
}

/** Segment count, pluralised through the catalogue so each language picks its own form. */
function segmentLabel(count: number) {
  return tf(count === 1 ? "summary.segments.one" : "summary.segments.many", { count });
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

  // The initial load is triggered by PeriodFilter: its mount effect calls
  // onChange with the default period, so no separate fetch is needed.
  //
  // The open segment keeps accruing while the page is open: if the status
  // changes, the total on screen stops being the real one. useSocketEvent keeps
  // the handler in a ref, so `params` here is always the current one.
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
          <Typography className="eyebrow">{t("summary.eyebrow")}</Typography>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            {t("summary.title")}
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
              {t("summary.timeLogged")}
            </Typography>
            <Typography variant="h3" sx={{ fontWeight: 800 }}>
              {formatMs(summary.totalMs)}
            </Typography>
            {/* "Time logged" and not "% of the working day" on purpose: there
                are real gaps between segments and Disconnected periods stay out
                of the history, so the total does not match the clock. */}
            <Typography variant="caption" color="text.secondary">
              {t("summary.timeLoggedNote")}
            </Typography>
          </Paper>

          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 1.5 }}>
              {t("summary.byStatus")}
            </Typography>

            {summary.byStatus.length === 0 ? (
              <Typography color="text.secondary">
                {t("summary.empty")}
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
                            {segmentLabel(bucket.segments)}
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
              {t("summary.tasksWorked")}
            </Typography>

            {summary.byTask.length === 0 ? (
              <Typography color="text.secondary">
                {t("summary.noTasks")}
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
                        {bucket.title ?? t("summary.untitledTask")}
                      </Typography>

                      {bucket.deleted && (
                        <Chip size="small" label={t("summary.deleted")} variant="outlined" color="warning" />
                      )}

                      <Typography variant="caption" color="text.secondary">
                        {segmentLabel(bucket.segments)}
                      </Typography>

                      <Typography sx={{ fontWeight: 700 }}>{formatMs(bucket.totalMs)}</Typography>
                    </Stack>
                  </AccordionSummary>

                  <AccordionDetails>
                    {bucket.task ? (
                      <TaskFacts
                        task={bucket.task}
                        showState
                        asOfNote={t("summary.asOfNote")}
                      />
                    ) : (
                      <Alert severity="warning">
                        {t("summary.taskDeleted")}
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
