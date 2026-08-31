import { GroupsRounded, LockOutlined } from "@mui/icons-material";
import { Avatar, Box, Chip, Stack, Typography } from "@mui/material";
import { Fragment } from "react";
import { formatClock } from "../tasks/datetime";
import { STATE_META, participantColor } from "../tasks/types";
import { KIND_LABELS, KIND_ORDER, type Conversation } from "./types";
import { t } from "../../i18n";

type Props = {
  conversations: Conversation[];
  unreadByConversation: Record<number, number>;
  onOpen: (id: number) => void;
};

function initials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

export default function ConversationList({ conversations, unreadByConversation, onOpen }: Props) {
  return (
    <Box className="chat-body" role="list">
      {KIND_ORDER.map((kind) => {
        const group = conversations.filter((c) => c.kind === kind);
        if (group.length === 0) return null;

        return (
          <Fragment key={kind}>
            <Box className="chat-section-title">{KIND_LABELS[kind]}</Box>

            {group.map((conversation) => {
              const unread = unreadByConversation[conversation.id] ?? 0;
              const meta = conversation.taskState ? STATE_META[conversation.taskState] : null;

              return (
                <Box
                  key={conversation.id}
                  component="button"
                  role="listitem"
                  onClick={() => onOpen(conversation.id)}
                  className={`chat-row${conversation.closed ? " closed" : ""}`}
                >
                  {conversation.kind === "GENERAL" ? (
                    <Avatar sx={{ width: 34, height: 34, bgcolor: "#ecebff", color: "#5b5ce2" }}>
                      <GroupsRounded sx={{ fontSize: 19 }} />
                    </Avatar>
                  ) : conversation.kind === "TASK" ? (
                    <Avatar
                      sx={{
                        width: 34,
                        height: 34,
                        bgcolor: meta?.soft ?? "var(--surface-2)",
                        color: meta?.accent ?? "#6d7087",
                        fontSize: 13,
                        fontWeight: 800,
                      }}
                    >
                      {initials(conversation.title)}
                    </Avatar>
                  ) : (
                    <Avatar
                      sx={{
                        width: 34,
                        height: 34,
                        fontSize: 12,
                        fontWeight: 700,
                        bgcolor: participantColor(conversation.peer?.id ?? 0),
                        color: "#fff",
                      }}
                    >
                      {initials(conversation.peer?.name ?? conversation.title)}
                    </Avatar>
                  )}

                  <Box sx={{ minWidth: 0, textAlign: "left" }}>
                    <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
                      <Typography
                        variant="body2"
                        noWrap
                        sx={{ fontWeight: unread ? 800 : 600, minWidth: 0 }}
                      >
                        {conversation.title}
                      </Typography>
                      {conversation.closed && (
                        <Chip
                          size="small"
                          icon={<LockOutlined />}
                          label={conversation.taskDeleted ? "Eliminada" : "Cerrada"}
                          sx={{
                            height: 18,
                            fontSize: 10,
                            fontWeight: 700,
                            bgcolor: "#eef0f6",
                            color: "#6d7087",
                            "& .MuiChip-icon": { fontSize: 12, color: "#6d7087" },
                          }}
                        />
                      )}
                    </Stack>
                    <Typography variant="caption" color="text.secondary" noWrap component="div">
                      {conversation.lastMessage
                        ? `${conversation.lastMessage.authorName}: ${conversation.lastMessage.body}`
                        : t("chat.noMessages")}
                    </Typography>
                  </Box>

                  <Stack sx={{ alignItems: "flex-end", gap: 0.5 }}>
                    {conversation.lastMessageAt && (
                      <Typography variant="caption" color="text.secondary">
                        {formatClock(conversation.lastMessageAt)}
                      </Typography>
                    )}
                    {unread > 0 && <Box className="chat-badge">{unread > 99 ? "99+" : unread}</Box>}
                  </Stack>
                </Box>
              );
            })}
          </Fragment>
        );
      })}

      {conversations.length === 0 && (
        <Typography variant="body2" color="text.disabled" sx={{ p: 3, textAlign: "center" }}>
          {t("chat.noConversations")}
        </Typography>
      )}
    </Box>
  );
}
