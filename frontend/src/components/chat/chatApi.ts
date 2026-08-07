import { api } from "../../api";
import type { ChatMessage, Conversation } from "./types";

export const listConversations = () => api<Conversation[]>("/chat/conversations");

export const getUnreadCounts = () =>
  api<{ total: number; byConversation: Record<number, number> }>("/chat/unread-count");

export const openDirect = (employeeId: number) =>
  api<Conversation>("/chat/direct", {
    method: "POST",
    body: JSON.stringify({ employeeId }),
  });

export const listMessages = (conversationId: number, before?: number | null) =>
  api<{ items: ChatMessage[]; hasMore: boolean; nextBefore: number | null }>(
    `/chat/conversations/${conversationId}/messages${before ? `?before=${before}` : ""}`
  );

export const sendMessage = (conversationId: number, body: string) =>
  api<ChatMessage>(`/chat/conversations/${conversationId}/messages`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });

export const markConversationRead = (conversationId: number) =>
  api<{ success: boolean }>(`/chat/conversations/${conversationId}/read`, { method: "POST" });
