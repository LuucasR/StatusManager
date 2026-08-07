import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { listMessages, sendMessage } from "./chatApi";
import { addPending, getEntry, prependPage, resolvePending, setPage, subscribe } from "./messageStore";
import type { ChatMessage } from "./types";

/** Ids negativos para los optimistas: nunca chocan con los del servidor. */
let tempSeq = -1;

export function useConversation(conversationId: number | null) {
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const entry = useSyncExternalStore(
    useCallback(
      (listener) => (conversationId ? subscribe(conversationId, listener) : () => {}),
      [conversationId]
    ),
    () => (conversationId ? getEntry(conversationId) : getEntry(-1))
  );

  useEffect(() => {
    if (!conversationId) return;
    if (getEntry(conversationId).loaded) return;

    let cancelled = false;
    setLoading(true);
    listMessages(conversationId)
      .then((page) => {
        if (cancelled) return;
        setPage(conversationId, page.items, page.hasMore, page.nextBefore);
      })
      .catch((err) => !cancelled && setError((err as Error).message))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  const loadMore = useCallback(async () => {
    if (!conversationId || loadingMore) return;
    const current = getEntry(conversationId);
    if (!current.hasMore || !current.cursor) return;

    setLoadingMore(true);
    try {
      const page = await listMessages(conversationId, current.cursor);
      prependPage(conversationId, page.items, page.hasMore, page.nextBefore);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }, [conversationId, loadingMore]);

  const send = useCallback(
    async (body: string, author: { id: number; name: string }) => {
      if (!conversationId) return;
      const tempId = tempSeq--;

      addPending(conversationId, {
        id: tempId,
        conversationId,
        body,
        createdAt: new Date().toISOString(),
        author: { id: author.id, employeeNumber: null, name: author.name, deleted: false },
        pending: true,
      } satisfies ChatMessage);

      try {
        const saved = await sendMessage(conversationId, body);
        // El mismo mensaje vuelve además por socket; el store descarta el
        // duplicado por id.
        resolvePending(conversationId, tempId, saved);
      } catch (err) {
        resolvePending(conversationId, tempId, null);
        setError((err as Error).message);
        throw err;
      }
    },
    [conversationId]
  );

  return {
    messages: entry.messages,
    hasMore: entry.hasMore,
    loading,
    loadingMore,
    error,
    clearError: () => setError(""),
    loadMore,
    send,
  };
}
