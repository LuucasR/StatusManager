import { useDraggable } from "@dnd-kit/core";
import {
  ChatBubbleOutlineRounded,
  Inventory2Rounded,
  MoreVertRounded,
  PersonOffRounded,
  PushPinRounded,
  ScheduleRounded,
} from "@mui/icons-material";
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
import {
  ARCHIVE_WARNING_DAYS,
  STATE_META,
  STATE_ORDER,
  daysUntilArchive,
  participantColor,
  stateVars,
  type Task,
  type TaskState,
} from "./types";

type Props = {
  task: Task;
  canMove: boolean;
  canEdit: boolean;
  /** Copia que se dibuja dentro del DragOverlay: sin drag, sin menú. */
  overlay?: boolean;
  onOpen?: (task: Task) => void;
  onMove?: (taskId: number, state: TaskState) => void;
  onPin?: (task: Task, pinned: boolean) => void;
  onEdit?: (task: Task) => void;
  onDelete?: (task: Task) => void;
};

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function archiveLabel(days: number) {
  if (days <= 0) return "Se archiva hoy";
  if (days === 1) return "Se archiva mañana";
  return `Se archiva en ${days} d`;
}

export default function TaskCard({
  task,
  canMove,
  canEdit,
  overlay = false,
  onOpen,
  onMove,
  onPin,
  onEdit,
  onDelete,
}: Props) {
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const meta = STATE_META[task.state];

  // El overlay monta un segundo TaskCard con el mismo task.id; sin el prefijo
  // habría dos draggables con el mismo id y el drag se rompe.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: overlay ? `overlay-${task.id}` : task.id,
    disabled: !canMove || overlay,
    data: { state: task.state },
  });

  const daysLeft = daysUntilArchive(task);
  const showArchiveWarning = !task.pinned && daysLeft <= ARCHIVE_WARNING_DAYS;

  const dragProps = overlay ? {} : { ref: setNodeRef, ...attributes, ...listeners };

  return (
    <Paper
      {...dragProps}
      elevation={0}
      style={stateVars(task.state)}
      className={[
        "task-card",
        task.pinned ? "pinned" : "",
        isDragging && !overlay ? "dragging" : "",
        overlay ? "task-card-overlay" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      sx={{
        cursor: overlay ? "grabbing" : canMove ? "grab" : "default",
        "&:active": { cursor: canMove ? "grabbing" : "default" },
      }}
    >
      {/* El color no puede ser el único portador del estado. */}
      <span className="sr-only">Estado: {meta.label}</span>

      <Stack direction="row" spacing={1} sx={{ alignItems: "start" }}>
        <Typography
          variant="subtitle2"
          className="task-card-title"
          sx={{ flex: 1, fontWeight: 700 }}
          onClick={() => onOpen?.(task)}
        >
          {task.title}
        </Typography>

        {task.pinned && (
          <Tooltip title="Fijada — no se archiva">
            <PushPinRounded
              sx={{ fontSize: 16, color: "#d9901f", transform: "rotate(30deg)", mt: 0.25 }}
            />
          </Tooltip>
        )}
        {task.pinned && <span className="sr-only">Fijada</span>}

        {!overlay && (
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
        )}
      </Stack>

      <Typography variant="body2" color="text.secondary" className="task-card-desc">
        {task.description}
      </Typography>

      <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", mt: 1.5 }}>
        <ScheduleRounded sx={{ fontSize: 15, color: "var(--accent)" }} />
        <Typography variant="caption" sx={{ fontWeight: 600 }} color="text.secondary">
          {formatRange(task.startsAt, task.endsAt)}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Chip
          size="small"
          label={formatDuration(task.startsAt, task.endsAt)}
          sx={{ height: 22, fontSize: 11, fontWeight: 700, bgcolor: "#f3f4f9", color: "text.secondary", border: 0 }}
        />
      </Stack>

      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mt: 1.5 }}>
        {task.participants.length === 0 ? (
          <Chip
            size="small"
            icon={<PersonOffRounded />}
            label="Sin participantes"
            sx={{
              height: 22,
              fontSize: 11,
              fontWeight: 700,
              bgcolor: "#fff3dc",
              color: "#8a5a10",
              "& .MuiChip-icon": { fontSize: 14, color: "#8a5a10" },
            }}
          />
        ) : (
          <AvatarGroup
            max={4}
            sx={{ "& .MuiAvatar-root": { width: 26, height: 26, fontSize: 11, fontWeight: 700 } }}
            slotProps={{
              surplus: { sx: { bgcolor: "#eef0f6", color: "#6d7087" } },
            }}
          >
            {task.participants.map((participant) => (
              <Tooltip key={participant.id} title={`#${participant.employeeNumber} ${participant.name}`}>
                <Avatar sx={{ bgcolor: participantColor(participant.id), color: "#fff" }}>
                  {initials(participant.name)}
                </Avatar>
              </Tooltip>
            ))}
          </AvatarGroup>
        )}

        <Box sx={{ flex: 1 }} />

        {task.commentsCount > 0 && (
          <Stack
            direction="row"
            spacing={0.5}
            sx={{ alignItems: "center", color: "text.secondary" }}
            aria-label={`${task.commentsCount} comentarios`}
          >
            <ChatBubbleOutlineRounded sx={{ fontSize: 14 }} />
            <Typography variant="caption">{task.commentsCount}</Typography>
          </Stack>
        )}
      </Stack>

      {showArchiveWarning && (
        <Box sx={{ mt: 1.25 }}>
          <Chip
            size="small"
            icon={<Inventory2Rounded />}
            label={archiveLabel(daysLeft)}
            sx={{
              height: 22,
              fontSize: 11,
              fontWeight: 700,
              bgcolor: "#fff3dc",
              color: "#8a5a10",
              "& .MuiChip-icon": { fontSize: 14, color: "#8a5a10" },
            }}
          />
        </Box>
      )}

      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
        <MenuItem
          onClick={() => {
            setMenuAnchor(null);
            onOpen?.(task);
          }}
        >
          Ver detalle
        </MenuItem>

        <MenuItem
          disabled={!canMove}
          onClick={() => {
            setMenuAnchor(null);
            onPin?.(task, !task.pinned);
          }}
        >
          {task.pinned ? "Dejar de fijar" : "Fijar tarjeta"}
        </MenuItem>

        {/* Alternativa accesible al drag & drop: teclado y touch garantizados. */}
        {STATE_ORDER.map((state) => (
          <MenuItem
            key={state}
            disabled={!canMove || state === task.state}
            onClick={() => {
              setMenuAnchor(null);
              onMove?.(task.id, state);
            }}
          >
            Mover a {STATE_META[state].label}
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
              onEdit?.(task);
            }}
          >
            Editar
          </MenuItem>,
          <MenuItem
            key="delete"
            sx={{ color: "error.main" }}
            onClick={() => {
              setMenuAnchor(null);
              onDelete?.(task);
            }}
          >
            Eliminar
          </MenuItem>,
        ]}
      </Menu>
    </Paper>
  );
}
