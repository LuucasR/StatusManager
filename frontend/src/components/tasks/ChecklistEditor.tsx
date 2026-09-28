import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AddRounded, CloseRounded, DragIndicatorRounded } from "@mui/icons-material";
import {
  Avatar,
  AvatarGroup,
  Box,
  Button,
  Checkbox,
  IconButton,
  ListItemText,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { participantColor, type TaskParticipant } from "./types";
import { t, tf } from "../../i18n";

/**
 * A row while it is being edited.
 *
 * `key` is NOT the array index. Deleting a row from the middle shifts every
 * index below it, so React would reuse the wrong input and the caret would jump
 * to another line mid-typing. Existing items key on their real id; new ones get
 * a negative counter, which cannot collide with one. It is also the sortable id.
 */
export type ChecklistDraft = {
  key: number;
  /** Absent = new item. Present = existing one, whose tick has to survive. */
  id?: number;
  text: string;
  /** Everybody in charge; [] = nobody. Only ever the task's participants. */
  assigneeIds: number[];
};

type Props = {
  value: ChecklistDraft[];
  onChange: (value: ChecklistDraft[]) => void;
  /**
   * The task's participants as they stand in this same dialog, not the whole
   * team: somebody who does not take part cannot be put in charge, and the
   * backend refuses it. Editing the participants above re-filters these.
   */
  participants: TaskParticipant[];
  disabled?: boolean;
};

/** Next key for a row that does not exist in the database yet. */
function nextKey(value: ChecklistDraft[]) {
  return Math.min(0, ...value.map((draft) => draft.key)) - 1;
}

export default function ChecklistEditor({ value, onChange, participants, disabled }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const add = () => onChange([...value, { key: nextKey(value), text: "", assigneeIds: [] }]);

  const patch = (key: number, changes: Partial<ChecklistDraft>) =>
    onChange(value.map((draft) => (draft.key === key ? { ...draft, ...changes } : draft)));

  const remove = (key: number) => onChange(value.filter((draft) => draft.key !== key));

  // The order of the rows IS the order saved: the backend turns the array index
  // into the position, so a drop only has to move the row.
  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = value.findIndex((draft) => draft.key === active.id);
    const to = value.findIndex((draft) => draft.key === over.id);
    if (from < 0 || to < 0) return;
    onChange(arrayMove(value, from, to));
  }

  return (
    <Box>
      <Typography variant="overline" color="text.secondary">
        {t("taskForm.checklist")}
      </Typography>

      <Stack spacing={1} sx={{ mt: 0.5 }}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={value.map((draft) => draft.key)}
            strategy={verticalListSortingStrategy}
          >
            {value.map((draft, index) => (
              <SortableRow
                key={draft.key}
                draft={draft}
                index={index}
                isLast={index === value.length - 1}
                participants={participants}
                disabled={disabled}
                onPatch={(changes) => patch(draft.key, changes)}
                onRemove={() => remove(draft.key)}
                onAdd={add}
              />
            ))}
          </SortableContext>
        </DndContext>

        <Box>
          <Button size="small" startIcon={<AddRounded />} disabled={disabled} onClick={add}>
            {t("taskForm.checklistAdd")}
          </Button>
        </Box>

        <Typography variant="caption" color="text.secondary">
          {t("taskForm.checklistHint")}
        </Typography>
      </Stack>
    </Box>
  );
}

type RowProps = {
  draft: ChecklistDraft;
  index: number;
  isLast: boolean;
  participants: TaskParticipant[];
  disabled?: boolean;
  onPatch: (changes: Partial<ChecklistDraft>) => void;
  onRemove: () => void;
  onAdd: () => void;
};

function SortableRow({
  draft,
  index,
  isLast,
  participants,
  disabled,
  onPatch,
  onRemove,
  onAdd,
}: RowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: draft.key, disabled });

  const nameOf = (id: number) => participants.find((p) => p.id === id)?.name ?? "?";

  return (
    <Stack
      ref={setNodeRef}
      direction="row"
      spacing={0.5}
      sx={{
        alignItems: "center",
        position: "relative",
        zIndex: isDragging ? 1 : "auto",
        opacity: isDragging ? 0.85 : 1,
        bgcolor: isDragging ? "background.paper" : "transparent",
      }}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      {/* The handle is the only part that drags: listeners on the whole row
          would steal the pointer from the text field and the select. */}
      <IconButton
        ref={setActivatorNodeRef}
        size="small"
        disabled={disabled}
        aria-label={t("taskForm.checklistReorder")}
        sx={{ cursor: disabled ? "default" : "grab", touchAction: "none", p: 0.25 }}
        {...attributes}
        {...listeners}
      >
        <DragIndicatorRounded sx={{ fontSize: 18, color: "text.disabled" }} />
      </IconButton>

      <TextField
        fullWidth
        size="small"
        disabled={disabled}
        label={tf("taskForm.checklistItem", { number: index + 1 })}
        value={draft.text}
        onChange={(event) => onPatch({ text: event.target.value })}
        onKeyDown={(event) => {
          // Enter on the last row adds another, so a list can be typed
          // straight through without reaching for the mouse. Anywhere else
          // it would silently submit the dialog.
          if (event.key !== "Enter") return;
          event.preventDefault();
          if (isLast && draft.text.trim()) onAdd();
        }}
      />

      <TextField
        select
        size="small"
        // Wide enough for a couple of avatars, narrow enough to leave the text
        // the room: the item is what is being written, the owners are secondary.
        sx={{ minWidth: 150, maxWidth: 180 }}
        disabled={disabled || participants.length === 0}
        label={t("taskForm.checklistAssignee")}
        value={draft.assigneeIds}
        onChange={(event) => {
          const raw = event.target.value as unknown as (number | string)[] | string;
          const ids = (typeof raw === "string" ? raw.split(",") : raw).map(Number);
          onPatch({ assigneeIds: ids });
        }}
        slotProps={{
          select: {
            multiple: true,
            displayEmpty: true,
            renderValue: (selected) => {
              const ids = selected as number[];
              if (ids.length === 0) {
                return (
                  <Typography component="em" variant="body2" color="text.secondary">
                    {t("taskForm.checklistNobody")}
                  </Typography>
                );
              }
              // Avatars rather than names: the colour lets a long list be scanned
              // by owner without reading every field; the names are in the menu.
              return (
                <AvatarGroup
                  max={4}
                  sx={{
                    justifyContent: "flex-end",
                    "& .MuiAvatar-root": { width: 22, height: 22, fontSize: 10, fontWeight: 700 },
                  }}
                >
                  {ids.map((id) => (
                    <Avatar key={id} title={nameOf(id)} sx={{ bgcolor: participantColor(id), color: "#fff" }}>
                      {nameOf(id).slice(0, 1).toUpperCase()}
                    </Avatar>
                  ))}
                </AvatarGroup>
              );
            },
          },
          inputLabel: { shrink: true },
        }}
      >
        {participants.map((participant) => (
          <MenuItem key={participant.id} value={participant.id} dense>
            <Checkbox size="small" checked={draft.assigneeIds.includes(participant.id)} />
            <Avatar
              sx={{
                width: 22,
                height: 22,
                fontSize: 10,
                fontWeight: 700,
                mr: 1,
                bgcolor: participantColor(participant.id),
                color: "#fff",
              }}
            >
              {participant.name.slice(0, 1).toUpperCase()}
            </Avatar>
            <ListItemText primary={participant.name} />
          </MenuItem>
        ))}
      </TextField>

      <IconButton
        size="small"
        disabled={disabled}
        aria-label={t("taskForm.checklistRemove")}
        onClick={onRemove}
      >
        <CloseRounded fontSize="small" />
      </IconButton>
    </Stack>
  );
}
