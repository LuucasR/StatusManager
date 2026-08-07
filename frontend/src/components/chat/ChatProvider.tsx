import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useOnReconnect, useSocketEvent } from "../../realtime/useSocketEvent";
import {
  getUnreadCounts,
  listConversations,
  markConversationRead,
  openDirect,
} from "./chatApi";
import { appendMessage, removeMessage } from "./messageStore";
import type { ChatMessage, Conversation } from "./types";

type ChatContextValue = {
  conversations: Conversation[];
  unreadByConversation: Record<number, number>;
  unreadTotal: number;
  open: boolean;
  activeId: number | null;
  setOpen: (open: boolean) => void;
  openConversation: (id: number) => void;
  backToList: () => void;
  startDirect: (employeeId: number) => Promise<void>;
  refresh: () => Promise<void>;
  markRead: (id: number) => Promise<void>;
};

const ChatContext = createContext<ChatContextValue | null>(null);

export function useChat() {
  const value = useContext(ChatContext);
  if (!value) throw new Error("useChat debe usarse dentro de ChatProvider");
  return value;
}

export default function ChatProvider({ children }: { children: ReactNode }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [unreadByConversation, setUnread] = useState<Record<number, number>>({});
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [list, counts] = await Promise.all([listConversations(), getUnreadCounts()]);
      setConversations(list);
      setUnread(counts.byConversation);
    } catch {
      // Un fallo del chat no puede romper la app; se reintenta al reconectar.
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useOnReconnect(() => void refresh());

  const markRead = useCallback(async (id: number) => {
    setUnread((current) => ({ ...current, [id]: 0 }));
    setConversations((current) =>
      current.map((c) => (c.id === id ? { ...c, unread: false } : c))
    );
    try {
      await markConversationRead(id);
    } catch {
      // ignorado: el próximo refresh corrige
    }
  }, []);

  useSocketEvent<{ conversationId: number; message?: ChatMessage; deletedId?: number }>(
    "chat:message",
    (payload) => {
      if (payload.deletedId) {
        removeMessage(payload.conversationId, payload.deletedId);
        void refresh();
        return;
      }
      if (!payload.message) return;

      appendMessage(payload.conversationId, payload.message);

      // Si el hilo está abierto a la vista, se marca leído en vez de sumar.
      const isVisible = open && activeId === payload.conversationId;
      if (isVisible) {
        void markConversationRead(payload.conversationId);
      } else {
        setUnread((current) => ({
          ...current,
          [payload.conversationId]: (current[payload.conversationId] ?? 0) + 1,
        }));
      }
      void refresh();
    }
  );

  useSocketEvent<{ conversationId: number }>("chat:read", (payload) => {
    setUnread((current) => ({ ...current, [payload.conversationId]: 0 }));
  });

  useSocketEvent("chat:conversation", () => void refresh());

  const openConversation = useCallback(
    (id: number) => {
      setActiveId(id);
      setOpen(true);
      void markRead(id);
    },
    [markRead]
  );

  const startDirect = useCallback(
    async (employeeId: number) => {
      const conversation = await openDirect(employeeId);
      await refresh();
      setActiveId(conversation.id);
      setOpen(true);
    },
    [refresh]
  );

  const unreadTotal = useMemo(
    () => Object.values(unreadByConversation).reduce((total, n) => total + n, 0),
    [unreadByConversation]
  );

  const value = useMemo(
    () => ({
      conversations,
      unreadByConversation,
      unreadTotal,
      open,
      activeId,
      setOpen,
      openConversation,
      backToList: () => setActiveId(null),
      startDirect,
      refresh,
      markRead,
    }),
    [conversations, unreadByConversation, unreadTotal, open, activeId, openConversation, startDirect, refresh, markRead]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
