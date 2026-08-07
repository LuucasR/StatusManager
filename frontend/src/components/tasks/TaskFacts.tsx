import { Avatar, Box, Chip, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { formatDuration, formatRange } from "./datetime";
import { STATE_META, participantColor, type TaskParticipant, type TaskState } from "./types";

/**
 * Deliberadamente MAS ANGOSTO que `Task`: el resumen de actividades trae los
 * datos de la tarea embebidos y no tiene `conversationId`, `chatClosed`,
 * `commentsCount` ni `archivesAt`. Exigir el `Task` completo lo obligaria a
 * pedir GET /tasks/:id una vez por tarea del periodo.
 */
export type TaskFactsData = {
  description: string;
  state: TaskState;
  startsAt: string;
  endsAt: string;
  participants: TaskParticipant[];
  createdBy?: TaskParticipant | null;
};

type Props = {
  task: TaskFactsData;
  /** El detalle de la tarea ya muestra el estado en su cabecera; el resumen no. */
  showState?: boolean;
  /** Fecha del tramo, para aclarar que los integrantes son los de HOY. */
  asOfNote?: string;
};

/**
 * Los datos duros de una tarea: descripcion, duracion, integrantes y autoria.
 * Extraido de TaskDetailDialog para que el resumen de actividades muestre
 * exactamente lo mismo sin arrastrar el hilo de chat, que tiene su propio ACL.
 */
export default function TaskFacts({ task, showState = false, asOfNote }: Props) {
  const meta = STATE_META[task.state];

  return (
    <Stack spacing={2.5}>
      {showState && (
        <Box>
          <Typography variant="overline" color="text.secondary">
            Estado
          </Typography>
          <Box sx={{ mt: 0.5 }}>
            <Chip
              size="small"
              icon={<meta.Icon />}
              label={meta.label}
              sx={{
                bgcolor: meta.soft,
                color: meta.ink,
                fontWeight: 700,
                border: `1px solid ${alpha(meta.accent, 0.35)}`,
                "& .MuiChip-icon": { color: meta.accent, fontSize: 16 },
              }}
            />
          </Box>
        </Box>
      )}

      <Box>
        <Typography variant="overline" color="text.secondary">
          Descripción
        </Typography>
        <Typography sx={{ whiteSpace: "pre-wrap" }}>{task.description}</Typography>
      </Box>

      <Box>
        <Typography variant="overline" color="text.secondary">
          Duración
        </Typography>
        <Typography>
          {formatRange(task.startsAt, task.endsAt)}{" "}
          <Typography component="span" color="text.secondary">
            ({formatDuration(task.startsAt, task.endsAt)})
          </Typography>
        </Typography>
      </Box>

      <Box>
        <Typography variant="overline" color="text.secondary">
          Integrantes
        </Typography>
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", mt: 0.5 }} useFlexGap>
          {task.participants.length === 0 ? (
            <Typography color="warning.main" variant="body2">
              Sin participantes
            </Typography>
          ) : (
            task.participants.map((participant) => (
              <Chip
                key={participant.id}
                avatar={
                  <Avatar
                    sx={{ bgcolor: participantColor(participant.id), color: "#fff !important" }}
                  >
                    {participant.name.slice(0, 1).toUpperCase()}
                  </Avatar>
                }
                label={`#${participant.employeeNumber} ${participant.name}`}
              />
            ))
          )}
        </Stack>
        {asOfNote && (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75 }}>
            {asOfNote}
          </Typography>
        )}
      </Box>

      {task.createdBy && (
        <Typography variant="caption" color="text.secondary">
          Creada por {task.createdBy.name} (#{task.createdBy.employeeNumber})
        </Typography>
      )}
    </Stack>
  );
}
