import {
  AddCommentRounded,
  ArrowBackRounded,
  CloseRounded,
  RemoveRounded,
} from "@mui/icons-material";
import { Box, IconButton, Paper, Stack, Tooltip, Typography } from "@mui/material";
import { useState } from "react";
import { useSocketContext } from "../../realtime/SocketProvider";
import { STATE_META } from "../tasks/types";
import ConversationList from "./ConversationList";
import MessageComposer from "./MessageComposer";
import MessageThread from "./MessageThread";
import NewDirectDialog from "./NewDirectDialog";
import { useChat } from "./ChatProvider";
import { useConversation } from "./useConversation";
import { closedReason } from "./types";
import { t, tf } from "../../i18n";

type Props = {
  me: { id: number; name: string } | null;
  onMinimize: () => void;
};

export default function ChatWindow({ me, onMinimize }: Props) {
  const chat = useChat();
  const { connected } = useSocketContext();
  const [newDirectOpen, setNewDirectOpen] = useState(false);

  const active = chat.conversations.find((c) => c.id === chat.activeId) ?? null;
  const thread = useConversation(active?.id ?? null);

  const blocked = active
    ? closedReason(active)
    : null;

  return (
    <Paper className="chat-window chat-window" elevation={0} role="dialog" aria-label={t("chat.messages")}>
      <Stack direction="row" spacing={1} className="chat-head">
        {active && (
          <IconButton size="small" onClick={chat.backToList} aria-label={t("chat.backToList")}>
            <ArrowBackRounded fontSize="small" />
          </IconButton>
        )}

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 800 }} noWrap>
            {active ? active.title : t("chat.messages")}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap component="div">
            {!connected
              ? t("chat.reconnecting")
              : active
                ? active.kind === "TASK"
                  ? active.taskDeleted
                    ? t("chat.taskDeleted")
                    : `${t("common.task")} · ${active.taskState ? STATE_META[active.taskState].label : ""}`
                  : active.kind === "GENERAL"
                    ? t("chat.teamChannel")
                    : `#${active.peer?.employeeNumber ?? ""}`
                : tf("chat.conversationCount", { count: chat.conversations.length })}
          </Typography>
        </Box>

        {!active && (
          <Tooltip title={t("chat.newDirect")}>
            <IconButton size="small" onClick={() => setNewDirectOpen(true)} aria-label={t("chat.newMessage")}>
              <AddCommentRounded fontSize="small" />
            </IconButton>
          </Tooltip>
        )}

        <IconButton size="small" onClick={onMinimize} aria-label="Minimizar chat">
          <RemoveRounded fontSize="small" />
        </IconButton>
        <IconButton
          size="small"
          onClick={onMinimize}
          aria-label={t("chat.close")}
          sx={{ display: { xs: "inline-flex", sm: "none" } }}
        >
          <CloseRounded fontSize="small" />
        </IconButton>
      </Stack>

      {active ? (
        <>
          <MessageThread
            messages={thread.messages}
            meId={me?.id}
            hasMore={thread.hasMore}
            loading={thread.loading}
            loadingMore={thread.loadingMore}
            onLoadMore={thread.loadMore}
            height="100%"
            showAuthorNames={active.kind !== "DIRECT"}
          />
          <MessageComposer
            blockedReason={blocked}
            disabled={!me}
            onSend={(body) => thread.send(body, { id: me!.id, name: me!.name })}
          />
        </>
      ) : (
        <ConversationList
          conversations={chat.conversations}
          unreadByConversation={chat.unreadByConversation}
          onOpen={chat.openConversation}
        />
      )}

      <NewDirectDialog
        open={newDirectOpen}
        meId={me?.id}
        onClose={() => setNewDirectOpen(false)}
        onPick={chat.startDirect}
      />
    </Paper>
  );
}
