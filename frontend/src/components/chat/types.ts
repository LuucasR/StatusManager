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
  /** Solo en el optimista, hasta que vuelve el id real del servidor. */
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

export const KIND_LABELS: Record<ConversationKind, string> = {
  GENERAL: "Equipo",
  TASK: "Tareas",
  DIRECT: "Directos",
};

/** Por qué está cerrada, para el aviso del composer. */
export function closedReason(conversation: Conversation) {
  if (!conversation.closed) return null;
  if (conversation.taskDeleted) {
    return "La tarea fue eliminada. El historial queda como solo lectura.";
  }
  return "El chat se cerró cuando la tarea pasó a Terminada. Movela a otro estado para volver a escribir.";
}
