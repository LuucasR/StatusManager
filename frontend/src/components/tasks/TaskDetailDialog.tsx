import { SendRounded } from "@mui/icons-material";
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
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { formatCommentDate, formatDuration, formatRange } from "./datetime";
import { STATE_COLORS, STATE_LABELS, type Task } from "./types";

type Props = {
  open: boolean;
  task: Task | null;
  loading: boolean;
  canComment: boolean;
  onClose: () => void;
  onComment: (body: string) => Promise<void>;
};

export default function TaskDetailDialog({
  open,
  task,
  loading,
  canComment,
  onClose,
  onComment,
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
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      {loading || !task ? (
        <DialogContent>
          <Stack sx={{ alignItems: "center", py: 6 }}>
            <CircularProgress />
          </Stack>
        </DialogContent>
      ) : (
        <>
          <DialogTitle>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
              <Box sx={{ flex: 1 }}>{task.title}</Box>
              <Chip
                size="small"
                color={STATE_COLORS[task.state]}
                label={STATE_LABELS[task.state]}
              />
            </Stack>
          </DialogTitle>

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
                        <Avatar sx={{ width: 30, height: 30, fontSize: 12 }}>
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
