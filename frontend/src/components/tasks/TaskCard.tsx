import { useDraggable } from "@dnd-kit/core";
import { MoreVertRounded, ScheduleRounded } from "@mui/icons-material";
import {
  Avatar,
  AvatarGroup,
  Box,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { formatDuration, formatRange } from "./datetime";
import { STATE_LABELS, STATE_ORDER, type Task, type TaskState } from "./types";

type Props = {
  task: Task;
  canMove: boolean;
  canEdit: boolean;
  onOpen: (task: Task) => void;
  onMove: (taskId: number, state: TaskState) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
};

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export default function TaskCard({
  task,
  canMove,
  canEdit,
  onOpen,
  onMove,
  onEdit,
  onDelete,
}: Props) {
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    disabled: !canMove,
    data: { state: task.state },
  });

  return (
    <Paper
      ref={setNodeRef}
      className="task-card"
      elevation={0}
      sx={{
        opacity: isDragging ? 0.4 : 1,
        cursor: canMove ? "grab" : "default",
      }}
      {...attributes}
      {...listeners}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: "start" }}>
        <Typography
          variant="subtitle2"
          sx={{ flex: 1, fontWeight: 700, cursor: "pointer" }}
          onClick={() => onOpen(task)}
        >
          {task.title}
        </Typography>

        <IconButton
          size="small"
          aria-label={`Acciones de ${task.title}`}
          onClick={(event) => {
            event.stopPropagation();
            setMenuAnchor(event.currentTarget);
          }}
          // El pointer sensor de dnd-kit se queda con el evento si no lo frenamos.
          onPointerDown={(event) => event.stopPropagation()}
        >
          <MoreVertRounded fontSize="small" />
        </IconButton>
      </Stack>

      <Typography variant="body2" color="text.secondary" className="task-card-desc">
        {task.description}
      </Typography>

      <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", mt: 1.5 }}>
        <ScheduleRounded sx={{ fontSize: 15, color: "text.disabled" }} />
        <Typography variant="caption" color="text.secondary">
          {formatRange(task.startsAt, task.endsAt)}
        </Typography>
        <Chip size="small" variant="outlined" label={formatDuration(task.startsAt, task.endsAt)} />
      </Stack>

      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mt: 1.5 }}>
        {task.participants.length === 0 ? (
          <Typography variant="caption" color="warning.main">
            Sin participantes
          </Typography>
        ) : (
          <AvatarGroup max={4} sx={{ "& .MuiAvatar-root": { width: 26, height: 26, fontSize: 11 } }}>
            {task.participants.map((participant) => (
              <Tooltip key={participant.id} title={`#${participant.employeeNumber} ${participant.name}`}>
                <Avatar>{initials(participant.name)}</Avatar>
              </Tooltip>
            ))}
          </AvatarGroup>
        )}

        <Box sx={{ flex: 1 }} />

        {task.commentsCount > 0 && (
          <Typography variant="caption" color="text.secondary">
            {task.commentsCount} {task.commentsCount === 1 ? "comentario" : "comentarios"}
          </Typography>
        )}
      </Stack>

      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
        <MenuItem
          onClick={() => {
            setMenuAnchor(null);
            onOpen(task);
          }}
        >
          Ver detalle
        </MenuItem>

        {/* Alternativa accesible al drag & drop: teclado y touch garantizados. */}
        {STATE_ORDER.map((state) => (
          <MenuItem
            key={state}
            disabled={!canMove || state === task.state}
            onClick={() => {
              setMenuAnchor(null);
              onMove(task.id, state);
            }}
          >
            Mover a {STATE_LABELS[state]}
          </MenuItem>
        ))}

        {!canMove && (
          <MenuItem disabled sx={{ whiteSpace: "normal", maxWidth: 240 }}>
            <Typography variant="caption">
              Solo los participantes pueden mover esta tarea
            </Typography>
          </MenuItem>
        )}

        {canEdit && [
          <MenuItem
            key="edit"
            onClick={() => {
              setMenuAnchor(null);
              onEdit(task);
            }}
          >
            Editar
          </MenuItem>,
          <MenuItem
            key="delete"
            sx={{ color: "error.main" }}
            onClick={() => {
              setMenuAnchor(null);
              onDelete(task);
            }}
          >
            Eliminar
          </MenuItem>,
        ]}
      </Menu>
    </Paper>
  );
}
