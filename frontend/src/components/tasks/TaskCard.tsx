import { useDraggable } from "@dnd-kit/core";
import {
  ChatBubbleOutlineRounded,
  Inventory2Rounded,
  BedtimeRounded,
  MoreVertRounded,
  PersonOffRounded,
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
  noteVars,
  participantColor,
  type Task,
  type TaskState,
} from "./types";
import { t, tf } from "../../i18n";

type Props = {
  task: Task;
  canMove: boolean;
  canEdit: boolean;
  /** Copy drawn inside the DragOverlay: no drag, no menu. */
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
  if (days <= 0) return t("board.archivesToday");
  if (days === 1) return t("board.archivesTomorrow");
  return tf("board.archivesInDays", { days });
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

  // The overlay mounts a second TaskCard with the same task.id; without the
  // prefix there would be two draggables sharing an id and the drag breaks.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: overlay ? `overlay-${task.id}` : task.id,
    disabled: !canMove || overlay,
    data: { state: task.state },
  });

  const daysLeft = daysUntilArchive(task);
  const showArchiveWarning = !task.pinned && daysLeft <= ARCHIVE_WARNING_DAYS;

  const dragProps = overlay ? {} : { ref: setNodeRef, ...attributes, ...listeners };

  return (
    // The Paper is only the draggable anchor: dnd-kit writes `transform` onto it,
    // so it has to stay free of one of its own. Everything that makes it look
    // like a note - paper, tilt, shadow, pin - lives on .task-note inside it.
    <Paper
      {...dragProps}
      elevation={0}
      style={noteVars(task)}
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
      <Box className="task-note">
        {/* The pin carries the state colour. The paper tone varies per task so the
            wall looks physical, which is exactly why it must not encode state. */}
        <Box className="task-note-pin" aria-hidden />

        {/* Colour cannot be the only carrier of the state. */}
        <span className="sr-only">{tf("board.statusLabel", { state: meta.label })}</span>
        {task.pinned && <span className="sr-only">{t("board.pinnedLabel")}</span>}

        <Stack direction="row" spacing={1} sx={{ alignItems: "start" }}>
          <Typography
            variant="subtitle2"
            className="task-card-title"
            sx={{ flex: 1, fontWeight: 700 }}
            onClick={() => onOpen?.(task)}
          >
            {task.title}
          </Typography>

          {!overlay && (
            <IconButton
              size="small"
              aria-label={tf("board.cardActions", { title: task.title })}
              onClick={(event) => {
                event.stopPropagation();
                setMenuAnchor(event.currentTarget);
              }}
              // dnd-kit's pointer sensor swallows the event unless we stop it here.
              onPointerDown={(event) => event.stopPropagation()}
              sx={{ color: "var(--note-ink-soft)" }}
            >
              <MoreVertRounded fontSize="small" />
            </IconButton>
          )}
        </Stack>

        <Typography variant="body2" className="task-card-desc">
          {task.description}
        </Typography>

        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", mt: 1.5 }}>
          <ScheduleRounded sx={{ fontSize: 15, color: "var(--note-ink-soft)" }} />
          <Typography variant="caption" sx={{ fontWeight: 600 }}>
            {formatRange(task.startsAt, task.endsAt)}
          </Typography>
          <Box sx={{ flex: 1 }} />
          <Chip
            size="small"
            className="note-chip"
            label={formatDuration(task.startsAt, task.endsAt)}
          />
        </Stack>

        <Stack direction="row" spacing={1} sx={{ alignItems: "center", mt: 1.5 }}>
          {task.participants.length === 0 ? (
            <Chip
              size="small"
              className="note-chip note-chip-warn"
              icon={<PersonOffRounded />}
              label={t("board.noParticipants")}
            />
          ) : (
            <AvatarGroup
              max={4}
              sx={{ "& .MuiAvatar-root": { width: 26, height: 26, fontSize: 11, fontWeight: 700 } }}
              slotProps={{
                surplus: {
                  sx: { bgcolor: "var(--note-chip-bg)", color: "var(--note-ink-soft)" },
                },
              }}
            >
              {task.participants.map((participant) => (
                <Tooltip
                  key={participant.id}
                  title={`#${participant.employeeNumber} ${participant.name}`}
                >
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
              sx={{ alignItems: "center", color: "var(--note-ink-soft)" }}
              aria-label={tf("board.commentCount", { count: task.commentsCount })}
            >
              <ChatBubbleOutlineRounded sx={{ fontSize: 14 }} />
              <Typography variant="caption">{task.commentsCount}</Typography>
            </Stack>
          )}
        </Stack>

        {task.autoPausedAt && (
          <Box sx={{ mt: 1.25 }}>
            <Chip
              size="small"
              className="note-chip"
              icon={<BedtimeRounded />}
              label={t("board.pausedOvernight")}
            />
          </Box>
        )}

        {showArchiveWarning && (
          <Box sx={{ mt: 1.25 }}>
            <Chip
              size="small"
              className="note-chip note-chip-warn"
              icon={<Inventory2Rounded />}
              label={archiveLabel(daysLeft)}
            />
          </Box>
        )}
      </Box>

      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
        <MenuItem
          onClick={() => {
            setMenuAnchor(null);
            onOpen?.(task);
          }}
        >
          {t("common.viewDetail")}
        </MenuItem>

        <MenuItem
          disabled={!canMove}
          onClick={() => {
            setMenuAnchor(null);
            onPin?.(task, !task.pinned);
          }}
        >
          {task.pinned ? t("board.unpin") : t("board.pin")}
        </MenuItem>

        {/* Accessible alternative to drag and drop: keyboard and touch guaranteed. */}
        {STATE_ORDER.map((state) => (
          <MenuItem
            key={state}
            disabled={!canMove || state === task.state}
            onClick={() => {
              setMenuAnchor(null);
              onMove?.(task.id, state);
            }}
          >
            {tf("board.moveTo", { state: STATE_META[state].label })}
          </MenuItem>
        ))}

        {!canMove && (
          <MenuItem disabled sx={{ whiteSpace: "normal", maxWidth: 240 }}>
            {/* Same sentence the API answers with, so the rule reads identically
                whether you are stopped by the UI or by the server. */}
            <Typography variant="caption">{t("error.MOVE_NOT_ALLOWED")}</Typography>
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
            {t("common.edit")}
          </MenuItem>,
          <MenuItem
            key="delete"
            sx={{ color: "error.main" }}
            onClick={() => {
              setMenuAnchor(null);
              onDelete?.(task);
            }}
          >
            {t("common.delete")}
          </MenuItem>,
        ]}
      </Menu>
    </Paper>
  );
}
