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
import {
  DragIndicatorRounded,
  FlagRounded,
  NotesRounded,
  PushPinOutlined,
  PushPinRounded,
} from "@mui/icons-material";
import { useEffect, useState, type ReactNode } from "react";
import {
  Alert,
  Avatar,
  Box,
  Button,
  ButtonBase,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  LinearProgress,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import MessageComposer from "../chat/MessageComposer";
import MessageThread from "../chat/MessageThread";
import { useConversation } from "../chat/useConversation";
import ChecklistFilterBar from "./ChecklistFilterBar";
import { PriorityChip } from "./ChecklistPriority";
import { LabelGroupBox } from "./ChecklistLabel";
import { ChecklistItemDialog } from "./ChecklistDescription";
import { groupChecklist, labelKey, regroupByLabel } from "./checklistLabels";
import { EMPTY_CHECKLIST_FILTERS, filterChecklist, hasChecklistFilters } from "./checklistFilter";
import TaskFacts from "./TaskFacts";
import TaskHistory from "./TaskHistory";
import { formatCommentDate } from "./datetime";
import {
  STATE_META,
  TASK_COLOR_HEX,
  checklistProgress,
  participantColor,
  taskColorLabel,
  type Task,
  type TaskChecklistItem,
} from "./types";
import { t, tf } from "../../i18n";

/**
 * One checklist line that can be dragged by its handle. When reordering is not
 * allowed it renders the line alone, with no handle taking up room.
 */
function SortableChecklistRow({
  id,
  enabled,
  children,
}: {
  id: number;
  enabled: boolean;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled: !enabled });

  if (!enabled) return <>{children}</>;

  return (
    <Stack
      ref={setNodeRef}
      direction="row"
      sx={{
        alignItems: "flex-start",
        position: "relative",
        zIndex: isDragging ? 1 : "auto",
        bgcolor: isDragging ? "background.paper" : "transparent",
        borderRadius: 1,
        boxShadow: isDragging ? 3 : "none",
      }}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <IconButton
        ref={setActivatorNodeRef}
        size="small"
        aria-label={t("taskForm.checklistReorder")}
        sx={{ cursor: "grab", touchAction: "none", mt: 0.75, p: 0.25 }}
        {...attributes}
        {...listeners}
      >
        <DragIndicatorRounded sx={{ fontSize: 18, color: "text.disabled" }} />
      </IconButton>
      {children}
    </Stack>
  );
}

type Props = {
  open: boolean;
  task: Task | null;
  loading: boolean;
  /**
   * The chat ACL (backend/src/chat/chat.access.ts) does not grant it for merely
   * managing the board. Without this, a task manager opening a task they do not
   * take part in fires a 403 as the thread mounts.
   */
  canReadChat: boolean;
  canComment: boolean;
  /** Pinning uses the same permission as moving: admin or participant. */
  canPin: boolean;
  /**
   * Ticking an item is the SAME rule as pinning and moving - whoever may drag
   * the task says which part of it is finished. Kept as its own prop anyway, so
   * the two cannot silently drift apart at the call site.
   */
  canCheck: boolean;
  /** Dragging the items into another order: board managers, like editing the list. */
  canReorder: boolean;
  me: { id: number; name: string } | null;
  onClose: () => void;
  onPin: (task: Task, pinned: boolean) => void;
  onToggleChecklistItem: (task: Task, item: TaskChecklistItem, done: boolean) => void;
  onReorderChecklist: (task: Task, itemIds: number[]) => void;
};

export default function TaskDetailDialog({
  open,
  task,
  loading,
  canReadChat,
  canComment,
  canPin,
  canCheck,
  canReorder,
  me,
  onClose,
  onPin,
  onToggleChecklistItem,
  onReorderChecklist,
}: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // The thread comes from the same store as the floating window: what is typed
  // in one appears in the other with no round-trip. null is passed when there is
  // no read permission: mounting it anyway would be a guaranteed 403.
  const thread = useConversation(canReadChat ? (task?.conversationId ?? null) : null);

  // Starts clean for every task opened; survives the reloads of the same one
  // (ticking an item, a socket refresh).
  const [filters, setFilters] = useState(EMPTY_CHECKLIST_FILTERS);
  // The item whose popup is open. An id, not the item, so the popup follows
  // the live task (somebody ticking it while it is open).
  const [openItemId, setOpenItemId] = useState<number | null>(null);
  const taskId = task?.id;
  useEffect(() => {
    setFilters(EMPTY_CHECKLIST_FILTERS);
    setOpenItemId(null);
  }, [taskId]);

  const blockedReason = !task
    ? null
    : task.chatClosed
      ? task.state === "DONE"
        ? t("chat.closed.taskDone")
        : t("chat.closed.taskDeleted")
      : !canComment
        ? t("taskDetail.cannotComment")
        : null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="xl"
      slotProps={{ paper: { sx: { overflow: "hidden", width: "95vw", maxHeight: "92vh" } } }}
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
                    borderBottom: `1px solid color-mix(in srgb, ${meta.accent} 20%, transparent)`,
                  }}
                >
                  <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                    <Box sx={{ flex: 1 }}>{task.title}</Box>

                    <Chip
                      size="small"
                      icon={<meta.Icon />}
                      label={meta.label}
                      sx={{
                        bgcolor: "var(--surface)",
                        color: meta.ink,
                        fontWeight: 700,
                        border: `1px solid color-mix(in srgb, ${meta.accent} 35%, transparent)`,
                        "& .MuiChip-icon": { color: meta.accent, fontSize: 16 },
                      }}
                    />

                    {task.color && (
                      <Chip
                        size="small"
                        icon={<FlagRounded />}
                        label={taskColorLabel(task.color)}
                        sx={{
                          bgcolor: "var(--surface)",
                          fontWeight: 700,
                          border: `1px solid ${alpha(TASK_COLOR_HEX[task.color], 0.5)}`,
                          "& .MuiChip-icon": { color: TASK_COLOR_HEX[task.color], fontSize: 16 },
                        }}
                      />
                    )}

                    <Tooltip
                      title={
                        canPin
                          ? task.pinned
                            ? t("taskDetail.unpin")
                            : t("taskDetail.pin")
                          : t("taskDetail.cannotPin")
                      }
                    >
                      <span>
                        <IconButton
                          size="small"
                          disabled={!canPin}
                          onClick={() => onPin(task, !task.pinned)}
                          aria-label={task.pinned ? t("board.unpin") : t("board.pin")}
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
              <TaskFacts task={task} />

              {/* Only when there is a list: an empty heading with a 0% bar under
                  it reads as something broken rather than as nothing to show. */}
              {task.checklist.length > 0 &&
                (() => {
                  const { done, total } = checklistProgress(task);
                  const visible = filterChecklist(task.checklist, filters);
                  const filtering = hasChecklistFilters(filters);
                  // Dragging inside a partial list cannot say where the item goes
                  // among the hidden ones, so reordering waits for a full list.
                  const reorderable = canReorder && !filtering;
                  const members = [
                    ...new Map(
                      task.checklist
                        .flatMap((item) => item.assignees)
                        .map((assignee) => [assignee.id, assignee])
                    ).values(),
                  ].sort((a, b) => a.name.localeCompare(b.name));
                  const renderItem = (item: TaskChecklistItem) => (
                    <SortableChecklistRow key={item.id} id={item.id} enabled={reorderable}>
                      <Stack direction="row" sx={{ alignItems: "flex-start", mb: 0.5, flex: 1, minWidth: 0 }}>
                        <Checkbox
                          checked={item.done}
                          disabled={!canCheck}
                          slotProps={{ input: { "aria-label": item.text } }}
                          onChange={(event) => onToggleChecklistItem(task, item, event.target.checked)}
                        />
                        {/* The text opens the item's popup; only the box ticks it,
                            so reading a description cannot tick it by accident. */}
                        <ButtonBase
                          component="div"
                          onClick={() => setOpenItemId(item.id)}
                          sx={{
                            display: "block",
                            flex: 1,
                            minWidth: 0,
                            textAlign: "left",
                            borderRadius: 1,
                            pt: 1,
                            pb: 0.5,
                            px: 0.75,
                            "&:hover": { bgcolor: "action.hover" },
                          }}
                        >
                          <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
                            <Typography
                              sx={{
                                textDecoration: item.done ? "line-through" : "none",
                                color: item.done ? "text.secondary" : "text.primary",
                                wordBreak: "break-word",
                              }}
                            >
                              {item.text}
                            </Typography>
                            {item.description && (
                              <NotesRounded
                                fontSize="small"
                                titleAccess={t("checklistDescription.field")}
                                sx={{ color: "text.secondary", flex: "none" }}
                              />
                            )}
                          </Stack>

                          <Stack
                            direction="row"
                            spacing={1}
                            sx={{ alignItems: "center", flexWrap: "wrap" }}
                            useFlexGap
                          >
                            <PriorityChip priority={item.priority} />
                            {item.assignees.map((assignee) => (
                              <Chip
                                key={assignee.id}
                                size="small"
                                avatar={
                                  <Avatar
                                    sx={{
                                      bgcolor: participantColor(assignee.id),
                                      color: "#fff !important",
                                    }}
                                  >
                                    {assignee.name.slice(0, 1).toUpperCase()}
                                  </Avatar>
                                }
                                label={tf("taskDetail.checklistAssigned", {
                                  name: assignee.name,
                                })}
                              />
                            ))}

                            {/* Only once it is done: doneBy is cleared
                                when an item is unticked. */}
                            {item.done && item.doneBy && (
                              <Typography variant="caption" color="text.secondary">
                                {tf("taskDetail.checklistDoneBy", {
                                  name: item.doneBy.name,
                                })}
                                {item.doneAt && ` · ${formatCommentDate(item.doneAt)}`}
                              </Typography>
                            )}
                          </Stack>
                        </ButtonBase>
                      </Stack>
                    </SortableChecklistRow>
                  );
                  return (
                    <Box>
                      <Typography variant="overline" color="text.secondary">
                        {tf("taskDetail.checklist", { done, total })}
                      </Typography>

                      <LinearProgress
                        variant="determinate"
                        value={(done / total) * 100}
                        sx={{ height: 6, borderRadius: 3, my: 1 }}
                      />

                      <ChecklistFilterBar
                        value={filters}
                        onChange={setFilters}
                        members={members}
                        shown={visible.length}
                        total={total}
                      />

                      {visible.length === 0 && (
                        <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                          {t("checklistFilter.empty")}
                        </Typography>
                      )}

                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={({ active, over }: DragEndEvent) => {
                          if (!over || active.id === over.id) return;
                          // The order on screen, groups gathered: that is what
                          // the drag moved within, and what gets saved.
                          const shown = regroupByLabel(task.checklist);
                          const ids = shown.map((item) => item.id);
                          const from = ids.indexOf(Number(active.id));
                          const to = ids.indexOf(Number(over.id));
                          if (from < 0 || to < 0) return;
                          // Inside its own box only: dropping an item among
                          // another label's would not change its label.
                          if (labelKey(shown[from]!.label) !== labelKey(shown[to]!.label)) return;
                          onReorderChecklist(task, arrayMove(ids, from, to));
                        }}
                      >
                        <SortableContext
                          items={regroupByLabel(visible).map((item) => item.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          <Stack>
                            {groupChecklist(visible).map((block) =>
                              block.kind === "item" ? (
                                renderItem(block.item)
                              ) : (
                                <LabelGroupBox
                                  key={`label:${block.key}`}
                                  label={block.label}
                                  done={block.items.filter((item) => item.done).length}
                                  total={block.items.length}
                                >
                                  {block.items.map(renderItem)}
                                </LabelGroupBox>
                              )
                            )}
                          </Stack>
                        </SortableContext>
                      </DndContext>

                      {!canCheck && (
                        <Typography variant="caption" color="text.secondary">
                          {t("taskDetail.cannotCheck")}
                        </Typography>
                      )}
                    </Box>
                  );
                })()}

              <ChecklistItemDialog
                item={task.checklist.find((item) => item.id === openItemId) ?? null}
                onClose={() => setOpenItemId(null)}
              />

              <TaskHistory task={task} />

              <Divider />

              <Box>
                <Typography variant="overline" color="text.secondary">
                  {tf("taskDetail.conversation", { count: task.commentsCount })}
                </Typography>

                {canReadChat ? (
                  <Box
                    sx={{
                      mt: 1,
                      border: "1px solid var(--border)",
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
                ) : (
                  <Alert severity="info" sx={{ mt: 1 }}>
                    {t("taskDetail.privateThread")}
                  </Alert>
                )}
              </Box>

              {thread.error && (
                <Alert severity="error" onClose={thread.clearError}>
                  {thread.error}
                </Alert>
              )}
            </Stack>
          </DialogContent>

          <DialogActions>
            <Button onClick={onClose}>{t("common.close")}</Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}
