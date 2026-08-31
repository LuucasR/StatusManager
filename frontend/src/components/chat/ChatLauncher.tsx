import { ChatRounded } from "@mui/icons-material";
import { Badge, Fab, Tooltip } from "@mui/material";
import { useChat } from "./ChatProvider";
import ChatWindow from "./ChatWindow";
import { t, tf } from "../../i18n";

type Props = {
  me: { id: number; name: string } | null;
};

export default function ChatLauncher({ me }: Props) {
  const chat = useChat();

  if (chat.open) {
    return <ChatWindow me={me} onMinimize={() => chat.setOpen(false)} />;
  }

  return (
    <Tooltip title={t("chat.messages")} placement="left">
      <Badge
        className="chat-launcher"
        badgeContent={chat.unreadTotal}
        max={99}
        slotProps={{ badge: { "aria-hidden": true } as never }}
        sx={{ "& .MuiBadge-badge": { bgcolor: "#b23c4a", color: "#fff", fontWeight: 700 } }}
      >
        <Fab
          color="primary"
          onClick={() => chat.setOpen(true)}
          aria-label={
            chat.unreadTotal
              ? tf("chat.messagesUnread", { count: chat.unreadTotal })
              : t("chat.messages")
          }
        >
          <ChatRounded />
        </Fab>
      </Badge>
    </Tooltip>
  );
}
