import { PushPinOutlined, PushPinRounded } from "@mui/icons-material";
import {
  Alert,
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
import TaskFacts from "./TaskFacts";
import { STATE_META, type Task } from "./types";
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
  me: { id: number; name: string } | null;
  onClose: () => void;
  onPin: (task: Task, pinned: boolean) => void;
};

export default function TaskDetailDialog({
  open,
  task,
  loading,
  canReadChat,
  canComment,
  canPin,
  me,
  onClose,
  onPin,
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
