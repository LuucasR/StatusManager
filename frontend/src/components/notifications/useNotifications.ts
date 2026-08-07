import { useCallback, useEffect, useState } from "react";
import { useOnReconnect, useSocketEvent } from "../../realtime/useSocketEvent";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "./notificationsApi";
import type { AppNotification } from "./types";

export function useNotifications() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const page = await listNotifications();
      setItems(page.items);
      setUnread(page.unreadCount);
      setHasMore(page.hasMore);
      setCursor(page.nextBefore);
    } catch {
      // Un fallo de la campana no puede romper la app; se reintenta al reconectar.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useOnReconnect(() => void reload());

  useSocketEvent<{ notification: AppNotification; unreadCount: number }>(
    "notification:new",
    (payload) => {
      setUnread(payload.unreadCount);
      setItems((current) => [
        payload.notification,
        // El colapso del backend puede actualizar una notificación existente:
        // se saca la vieja para que no quede duplicada.
        ...current.filter((n) => n.id !== payload.notification.id),
      ]);
    }
  );

  const loadMore = useCallback(async () => {
    if (!cursor) return;
    const page = await listNotifications(cursor);
    setItems((current) => [...current, ...page.items]);
    setHasMore(page.hasMore);
    setCursor(page.nextBefore);
  }, [cursor]);

  const markRead = useCallback(async (id: number) => {
    // Optimista: el badge baja al instante y la request va en paralelo.
    setItems((current) =>
      current.map((n) => (n.readAt ? n : n.id === id ? { ...n, readAt: new Date().toISOString() } : n))
    );
    setUnread((value) => Math.max(0, value - 1));
    try {
      const result = await markNotificationRead(id);
      setUnread(result.unreadCount);
    } catch {
      void reload();
    }
  }, [reload]);

  const markAllRead = useCallback(async () => {
    const now = new Date().toISOString();
    setItems((current) => current.map((n) => (n.readAt ? n : { ...n, readAt: now })));
    setUnread(0);
    try {
      await markAllNotificationsRead();
    } catch {
      void reload();
    }
  }, [reload]);

  return { items, unread, hasMore, loading, loadMore, markRead, markAllRead };
}
