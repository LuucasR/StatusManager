import { PushPinOutlined, PushPinRounded, SendRounded } from "@mui/icons-material";
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
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useState } from "react";
import { formatCommentDate, formatDuration, formatRange } from "./datetime";
import { STATE_META, participantColor, type Task } from "./types";

type Props = {
  open: boolean;
  task: Task | null;
  loading: boolean;
  canComment: boolean;
  /** Fijar usa el mismo permiso que mover: admin o participante. */
  canPin: boolean;
  onClose: () => void;
  onComment: (body: string) => Promise<void>;
  onPin: (task: Task, pinned: boolean) => void;
};

export default function TaskDetailDialog({
  open,
  task,
  loading,
  canComment,
  canPin,
  onClose,
  onComment,
  onPin,
}: Props) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!body.trim()) return;
    setSending(true);
    setError("");
    try {
      await onComment(body.trim());
      setBody("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

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
                  Comentarios ({task.comments?.length ?? 0})
                </Typography>

                <Stack spacing={1.5} sx={{ mt: 1 }}>
                  {(task.comments?.length ?? 0) === 0 && (
                    <Typography variant="body2" color="text.disabled">
                      Todavía no hay comentarios.
                    </Typography>
                  )}

                  {task.comments?.map((comment) => (
                    <Paper key={comment.id} elevation={0} className="task-comment">
                      <Stack direction="row" spacing={1.5}>
                        <Avatar
                          sx={{
                            width: 30,
                            height: 30,
                            fontSize: 12,
                            fontWeight: 700,
                            bgcolor: participantColor(comment.author.id),
                            color: "#fff",
                          }}
                        >
                          {comment.author.name.slice(0, 2).toUpperCase()}
                        </Avatar>
                        <Box sx={{ flex: 1 }}>
                          <Stack direction="row" spacing={1} sx={{ alignItems: "baseline" }}>
                            <Typography variant="subtitle2">{comment.author.name}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {formatCommentDate(comment.createdAt)}
                            </Typography>
                          </Stack>
                          <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                            {comment.body}
                          </Typography>
                        </Box>
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
              </Box>

              {error && <Alert severity="error">{error}</Alert>}

              {canComment ? (
                <Stack direction="row" spacing={1} sx={{ alignItems: "flex-end" }}>
                  <TextField
                    label="Agregar un comentario"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    multiline
                    minRows={2}
                  />
                  <Button
                    variant="contained"
                    startIcon={<SendRounded />}
                    onClick={submit}
                    disabled={sending || !body.trim()}
                    sx={{ whiteSpace: "nowrap" }}
                  >
                    Enviar
                  </Button>
                </Stack>
              ) : (
                <Typography variant="body2" color="text.disabled">
                  Solo los participantes pueden comentar esta tarea.
                </Typography>
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
