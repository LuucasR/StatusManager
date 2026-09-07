import { PushPinOutlined, PushPinRounded } from "@mui/icons-material";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
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
import TaskFacts from "./TaskFacts";
import { formatCommentDate } from "./datetime";
import {
  STATE_META,
  checklistProgress,
  participantColor,
  type Task,
  type TaskChecklistItem,
} from "./types";
import { t, tf } from "../../i18n";

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
  me: { id: number; name: string } | null;
  onClose: () => void;
  onPin: (task: Task, pinned: boolean) => void;
  onToggleChecklistItem: (task: Task, item: TaskChecklistItem, done: boolean) => void;
};

export default function TaskDetailDialog({
  open,
  task,
  loading,
  canReadChat,
  canComment,
  canPin,
  canCheck,
  me,
  onClose,
  onPin,
  onToggleChecklistItem,
}: Props) {
  // The thread comes from the same store as the floating window: what is typed
  // in one appears in the other with no round-trip. null is passed when there is
  // no read permission: mounting it anyway would be a guaranteed 403.
  const thread = useConversation(canReadChat ? (task?.conversationId ?? null) : null);

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
                        bgcolor: "var(--surface)",
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

                      <Stack>
                        {task.checklist.map((item) => (
                          <FormControlLabel
                            key={item.id}
                            control={
                              <Checkbox
                                checked={item.done}
                                disabled={!canCheck}
                                onChange={(event) =>
                                  onToggleChecklistItem(task, item, event.target.checked)
                                }
                              />
                            }
                            // The label is two lines high, so the box has to sit
                            // at the top of it rather than centre on the pair.
                            sx={{ alignItems: "flex-start", mb: 0.5 }}
                            label={
                              <Box sx={{ pt: 1 }}>
                                <Typography
                                  sx={{
                                    textDecoration: item.done ? "line-through" : "none",
                                    color: item.done ? "text.secondary" : "text.primary",
                                  }}
                                >
                                  {item.text}
                                </Typography>

                                <Stack
                                  direction="row"
                                  spacing={1}
                                  sx={{ alignItems: "center", flexWrap: "wrap" }}
                                  useFlexGap
                                >
                                  {item.assignee && (
                                    <Chip
                                      size="small"
                                      avatar={
                                        <Avatar
                                          sx={{
                                            bgcolor: participantColor(item.assignee.id),
                                            color: "#fff !important",
                                          }}
                                        >
                                          {item.assignee.name.slice(0, 1).toUpperCase()}
                                        </Avatar>
                                      }
                                      label={tf("taskDetail.checklistAssigned", {
                                        name: item.assignee.name,
                                      })}
                                    />
                                  )}

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
                              </Box>
                            }
                          />
                        ))}
                      </Stack>

                      {!canCheck && (
                        <Typography variant="caption" color="text.secondary">
                          {t("taskDetail.cannotCheck")}
                        </Typography>
                      )}
                    </Box>
                  );
                })()}

              <Divider />

              <Box>
                <Typography variant="overline" color="text.secondary">
                  {tf("taskDetail.conversation", { count: task.commentsCount })}
                </Typography>

                {canReadChat ? (
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
