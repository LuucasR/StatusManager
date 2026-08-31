import type { ChatMessage } from "./types";

/**
 * Per-conversation message cache, module-level and with subscribers.
 *
 * It lives outside React on purpose: the task detail dialog and the floating
 * window show the SAME thread, and with two copies of state a message sent from
 * one would not appear in the other. It also stops the provider repainting on
 * every keystroke in the open thread.
 */
type Entry = {
  messages: ChatMessage[];
  hasMore: boolean;
  cursor: number | null;
  loaded: boolean;
};

const EMPTY: Entry = { messages: [], hasMore: false, cursor: null, loaded: false };

const store = new Map<number, Entry>();
const listeners = new Map<number, Set<() => void>>();

/** Cap so a tab left open all day does not grow without bound. */
const MAX_MESSAGES = 500;

function emit(conversationId: number) {
  listeners.get(conversationId)?.forEach((listener) => listener());
}

export function getEntry(conversationId: number): Entry {
  return store.get(conversationId) ?? EMPTY;
}

export function subscribe(conversationId: number, listener: () => void) {
  if (!listeners.has(conversationId)) listeners.set(conversationId, new Set());
  listeners.get(conversationId)!.add(listener);
  return () => {
    listeners.get(conversationId)?.delete(listener);
  };
}

function write(conversationId: number, next: Entry) {
  store.set(conversationId, next);
  emit(conversationId);
}

export function setPage(
  conversationId: number,
  items: ChatMessage[],
  hasMore: boolean,
  cursor: number | null
) {
  write(conversationId, { messages: items, hasMore, cursor, loaded: true });
}

export function prependPage(
  conversationId: number,
  items: ChatMessage[],
  hasMore: boolean,
  cursor: number | null
) {
  const entry = getEntry(conversationId);
  write(conversationId, {
    messages: [...items, ...entry.messages].slice(-MAX_MESSAGES),
    hasMore,
    cursor,
    loaded: true,
  });
}

/** Idempotent: drops the duplicate that arrives over the socket after the POST. */
export function appendMessage(conversationId: number, message: ChatMessage) {
  const entry = getEntry(conversationId);
  if (entry.messages.some((m) => m.id === message.id)) return;
  write(conversationId, {
    ...entry,
    messages: [...entry.messages, message].slice(-MAX_MESSAGES),
  });
}

export function addPending(conversationId: number, message: ChatMessage) {
  const entry = getEntry(conversationId);
  write(conversationId, { ...entry, messages: [...entry.messages, message] });
}

/** Replaces the optimistic message with the real one, or drops it if sending failed. */
export function resolvePending(
  conversationId: number,
  tempId: number,
  message: ChatMessage | null
) {
  const entry = getEntry(conversationId);
  const withoutTemp = entry.messages.filter((m) => m.id !== tempId);
  const next =
    message && !withoutTemp.some((m) => m.id === message.id)
      ? [...withoutTemp, message]
      : withoutTemp;
  write(conversationId, { ...entry, messages: next });
}

export function removeMessage(conversationId: number, messageId: number) {
  const entry = getEntry(conversationId);
  write(conversationId, {
    ...entry,
    messages: entry.messages.filter((m) => m.id !== messageId),
  });
}
