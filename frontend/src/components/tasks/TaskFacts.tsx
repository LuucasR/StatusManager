import { Avatar, Box, Chip, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { formatDuration, formatRange } from "./datetime";
import { STATE_META, participantColor, type TaskParticipant, type TaskState } from "./types";

/**
 * Deliberately NARROWER than `Task`: the activity summary carries the task data
 * embedded and has no `conversationId`, `chatClosed`, `commentsCount` or
 * `archivesAt`. Demanding the full `Task` would force it to call GET /tasks/:id
 * once per task in the period.
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
  /** The task detail already shows the state in its header; the summary does not. */
  showState?: boolean;
  /** Segment date, to make clear the participants are TODAY's. */
  asOfNote?: string;
};

/**
 * The hard facts of a task: description, duration, participants and authorship.
 * Extracted from TaskDetailDialog so the activity summary shows exactly the same
 * thing without dragging in the chat thread, which has its own ACL.
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
