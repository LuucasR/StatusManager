import { ArrowDownwardRounded } from "@mui/icons-material";
import { Avatar, Box, Button, CircularProgress, Stack, Typography } from "@mui/material";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { formatClock, relativeDay } from "../tasks/datetime";
import { participantColor } from "../tasks/types";
import type { ChatMessage } from "./types";

type Props = {
  messages: ChatMessage[];
  meId?: number;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  /** Alto del scroller; el diálogo de tarea usa uno más chico que el widget. */
  height?: number | string;
  showAuthorNames?: boolean;
};

const NEAR_BOTTOM = 80;

export default function MessageThread({
  messages,
  meId,
  hasMore,
  loading,
  loadingMore,
  onLoadMore,
  height = 320,
  showAuthorNames = true,
}: Props) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const atBottomRef = useRef(true);
  const prevHeightRef = useRef(0);
  const prevCountRef = useRef(0);
  const [newCount, setNewCount] = useState(0);

  function scrollToBottom(behavior: ScrollBehavior = "auto") {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    atBottomRef.current = true;
    setNewCount(0);
  }

  // Al abrir, al fondo sin flash: useLayoutEffect corre antes del paint.
  useLayoutEffect(() => {
    if (loading) return;
    scrollToBottom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    const added = messages.length - prevCountRef.current;
    prevCountRef.current = messages.length;
    if (added <= 0) return;

    // Al anteponer una página vieja hay que compensar la altura, si no la vista
    // salta al tope en cada carga. Es el bug clásico de este componente.
    if (prevHeightRef.current && el.scrollHeight > prevHeightRef.current && !atBottomRef.current) {
      el.scrollTop += el.scrollHeight - prevHeightRef.current;
      prevHeightRef.current = 0;
      return;
    }

    const last = messages[messages.length - 1];
    const mine = last?.author.id != null && last.author.id === meId;
    if (atBottomRef.current || mine) {
      scrollToBottom();
    } else {
      // Nunca mover la vista de quien está leyendo hacia arriba.
      setNewCount((value) => value + added);
    }
  }, [messages, meId]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    function onScroll() {
      const node = el!;
      atBottomRef.current =
        node.scrollHeight - node.scrollTop - node.clientHeight < NEAR_BOTTOM;
      if (atBottomRef.current) setNewCount(0);

      if (node.scrollTop < 40 && hasMore && !loadingMore) {
        prevHeightRef.current = node.scrollHeight;
        onLoadMore();
      }
    }

    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, [hasMore, loadingMore, onLoadMore]);

  let lastDay = "";

  return (
    <Box sx={{ position: "relative", flex: 1, minHeight: 0 }}>
      <Box ref={scrollerRef} className="chat-scroller" sx={{ height }}>
        {loadingMore && (
          <Stack sx={{ alignItems: "center", py: 1 }}>
            <CircularProgress size={18} />
          </Stack>
        )}

        {loading && messages.length === 0 && (
          <Stack sx={{ alignItems: "center", py: 4 }}>
            <CircularProgress size={22} />
          </Stack>
        )}

        {!loading && messages.length === 0 && (
          <Typography variant="body2" color="text.disabled" sx={{ textAlign: "center", py: 4 }}>
            Todavía no hay mensajes.
          </Typography>
        )}

        {messages.map((message, index) => {
          const mine = message.author.id != null && message.author.id === meId;
          const previous = messages[index - 1];
          const day = relativeDay(message.createdAt);
          const showDay = day !== lastDay;
          lastDay = day;

          // Avatar solo en el primer mensaje de una ráfaga del mismo autor.
          const burst =
            previous &&
            previous.author.id === message.author.id &&
            new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() < 300_000;

          return (
            <Box key={message.id}>
              {showDay && <Box className="chat-day">{day}</Box>}

              <Stack
                direction="row"
                spacing={1}
                sx={{ mt: burst ? 0.4 : 1.2, justifyContent: mine ? "flex-end" : "flex-start" }}
              >
                {!mine && (
                  <Box sx={{ width: 26, flex: "none" }}>
                    {!burst && (
                      <Avatar
                        sx={{
                          width: 26,
                          height: 26,
                          fontSize: 11,
                          fontWeight: 700,
                          bgcolor: participantColor(message.author.id ?? 0),
                          color: "#fff",
                        }}
                      >
                        {message.author.name.slice(0, 2).toUpperCase()}
                      </Avatar>
                    )}
                  </Box>
                )}

                <Box className={`chat-bubble chat-bubble${mine ? " mine" : ""}`}>
                  {!mine && !burst && showAuthorNames && (
                    <Typography
                      variant="caption"
                      sx={{ fontWeight: 700, color: participantColor(message.author.id ?? 0) }}
                    >
                      {message.author.name}
                    </Typography>
                  )}
                  <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", opacity: message.pending ? 0.6 : 1 }}>
                    {message.body}
                  </Typography>
                  <Box className="chat-bubble-time">{formatClock(message.createdAt)}</Box>
                </Box>
              </Stack>
            </Box>
          );
        })}
      </Box>

      {newCount > 0 && (
        <Button
          size="small"
          variant="contained"
          className="chat-newpill"
          startIcon={<ArrowDownwardRounded />}
          onClick={() => scrollToBottom("smooth")}
        >
          {newCount} {newCount === 1 ? "mensaje nuevo" : "mensajes nuevos"}
        </Button>
      )}
    </Box>
  );
}
