import { lazyLabels, t } from "../../i18n";

export type ConversationKind = "DIRECT" | "GENERAL" | "TASK";

export type ChatPeer = {
  id: number;
  employeeNumber: number;
  name: string;
};

export type ChatMessage = {
  id: number;
  conversationId: number;
  body: string;
  createdAt: string;
  author: {
    id: number | null;
    employeeNumber: number | null;
    name: string;
    deleted: boolean;
  };
  /** Only on the optimistic message, until the real server id arrives. */
  pending?: boolean;
};

export type Conversation = {
  id: number;
  kind: ConversationKind;
  title: string;
  closed: boolean;
  taskId: number | null;
  taskDeleted: boolean;
  taskState: "PENDING" | "IN_PROGRESS" | "DONE" | null;
  peer: ChatPeer | null;
  memberCount: number;
  lastMessageAt: string | null;
  lastMessage: { body: string; authorName: string; createdAt: string } | null;
  unread: boolean;
};

export const KIND_ORDER: ConversationKind[] = ["GENERAL", "TASK", "DIRECT"];

export const KIND_LABELS = lazyLabels(KIND_ORDER, (kind) => `chat.kind.${kind}` as const);

/** Why it is closed, for the notice above the composer. */
export function closedReason(conversation: Conversation) {
  if (!conversation.closed) return null;
  if (conversation.taskDeleted) {
    return t("chat.closed.taskDeleted");
  }
  return t("chat.closed.taskDone");
}
