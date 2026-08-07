import type { ChatMessage } from "./types";

/**
 * Cache de mensajes por conversación, a nivel módulo y con suscriptores.
 *
 * Vive fuera de React a propósito: el diálogo de detalle de la tarea y la
 * ventana flotante muestran el MISMO hilo, y con dos copias de estado un
 * mensaje enviado desde uno no aparecería en el otro. Además evita que el
 * provider repinte en cada tecla del hilo abierto.
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

/** Tope para que una pestaña abierta todo el día no crezca sin límite. */
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

/** Idempotente: descarta el duplicado que llega por socket tras el POST. */
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

/** Reemplaza el optimista por el real, o lo borra si el envío falló. */
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
