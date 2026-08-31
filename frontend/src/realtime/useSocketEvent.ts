import { useEffect, useRef } from "react";
import { useSocketContext } from "./SocketProvider";

/**
 * Subscribes a handler to an event on the shared socket. The handler is kept in
 * a ref, so it can read fresh state without re-subscribing on every render and
 * without forcing callers to stabilise it with useCallback.
 */
export function useSocketEvent<T = unknown>(event: string, handler: (payload: T) => void) {
  const { socket } = useSocketContext();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const listener = (payload: T) => handlerRef.current(payload);
    socket.on(event, listener);
    return () => {
      socket.off(event, listener);
    };
  }, [socket, event]);
}

/** Fires the callback every time the socket reconnects, to re-sync. */
export function useOnReconnect(callback: () => void) {
  const { reconnectCount } = useSocketContext();
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (reconnectCount === 0) return;
    callbackRef.current();
  }, [reconnectCount]);
}
