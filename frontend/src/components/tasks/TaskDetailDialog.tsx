import { PushPinOutlined, PushPinRounded } from "@mui/icons-material";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import MessageComposer from "../chat/MessageComposer";
import MessageThread from "../chat/MessageThread";
import { useConversation } from "../chat/useConversation";
import { formatDuration, formatRange } from "./datetime";
import { STATE_META, participantColor, type Task } from "./types";

type Props = {
  open: boolean;
  task: Task | null;
  loading: boolean;
  canComment: boolean;
  /** Fijar usa el mismo permiso que mover: admin o participante. */
  canPin: boolean;
  me: { id: number; name: string } | null;
  onClose: () => void;
  onPin: (task: Task, pinned: boolean) => void;
};

export default function TaskDetailDialog({
  open,
  task,
  loading,
  canComment,
  canPin,
  me,
  onClose,
  onPin,
}: Props) {
  // El hilo sale del mismo store que la ventana flotante: lo que se escribe en
  // un lado aparece en el otro sin round-trip.
  const thread = useConversation(task?.conversationId ?? null);

  const blockedReason = !task
    ? null
    : task.chatClosed
      ? task.state === "DONE"
        ? "El chat se cerró cuando la tarea pasó a Terminada. Movela a otro estado para volver a escribir."
        : "La tarea fue eliminada. El historial queda como solo lectura."
      : !canComment
        ? "Solo los participantes pueden escribir en esta tarea."
        : null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      slotProps={{ paper: { sx: { overflow: "hidden" } } }}
    >
      {loading || !task ? (
        <DialogContent>
          <Stack sx={{ alignItems: "center", py: 6 }}>
            <CircularProgress />
          </Stack>
        </DialogContent>
      ) : (
        <>
          {(() => {
            const meta = STATE_META[task.state];
            return (
              <>
                <Box sx={{ height: 5, bgcolor: meta.accent }} />
                <DialogTitle
                  sx={{
                    bgcolor: meta.soft,
                    borderBottom: `1px solid ${alpha(meta.accent, 0.2)}`,
                  }}
                >
                  <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                    <Box sx={{ flex: 1 }}>{task.title}</Box>

                    <Chip
                      size="small"
                      icon={<meta.Icon />}
                      label={meta.label}
                      sx={{
                        bgcolor: "#fff",
                        color: meta.ink,
                        fontWeight: 700,
                        border: `1px solid ${alpha(meta.accent, 0.35)}`,
                        "& .MuiChip-icon": { color: meta.accent, fontSize: 16 },
                      }}
                    />

                    <Tooltip
                      title={
                        canPin
                          ? task.pinned
                            ? "Dejar de fijar"
                            : "Fijar — no se archiva a los 14 días"
                          : "Solo los participantes pueden fijar esta tarea"
                      }
                    >
                      <span>
                        <IconButton
                          size="small"
                          disabled={!canPin}
                          onClick={() => onPin(task, !task.pinned)}
                          aria-label={task.pinned ? "Dejar de fijar" : "Fijar tarjeta"}
                        >
                          {task.pinned ? (
                            <PushPinRounded sx={{ fontSize: 18, color: "#d9901f" }} />
                          ) : (
                            <PushPinOutlined sx={{ fontSize: 18 }} />
                          )}
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Stack>
                </DialogTitle>
              </>
            );
          })()}

          <DialogContent dividers>
            <Stack spacing={2.5}>
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
                  Participantes
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
                          <Avatar sx={{ bgcolor: participantColor(participant.id), color: "#fff !important" }}>
                            {participant.name.slice(0, 1).toUpperCase()}
                          </Avatar>
                        }
                        label={`#${participant.employeeNumber} ${participant.name}`}
                      />
                    ))
                  )}
                </Stack>
              </Box>

              {task.createdBy && (
                <Typography variant="caption" color="text.secondary">
                  Creada por {task.createdBy.name} (#{task.createdBy.employeeNumber})
                </Typography>
              )}

              <Divider />

              <Box>
                <Typography variant="overline" color="text.secondary">
                  Conversación ({task.commentsCount})
                </Typography>

                <Box
                  sx={{
                    mt: 1,
                    border: "1px solid #e8e9f1",
                    borderRadius: "14px",
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <MessageThread
                    messages={thread.messages}
                    meId={me?.id}
                    hasMore={thread.hasMore}
                    loading={thread.loading}
                    loadingMore={thread.loadingMore}
                    onLoadMore={thread.loadMore}
                    height={280}
                  />
                  <MessageComposer
                    blockedReason={blockedReason}
                    disabled={!me}
                    onSend={(body) => thread.send(body, { id: me!.id, name: me!.name })}
                  />
                </Box>
              </Box>

              {thread.error && (
                <Alert severity="error" onClose={thread.clearError}>
                  {thread.error}
                </Alert>
              )}
            </Stack>
          </DialogContent>

          <DialogActions>
            <Button onClick={onClose}>Cerrar</Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}
