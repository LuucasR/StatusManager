import { useEffect, useRef } from "react";
import { useSocketContext } from "./SocketProvider";

/**
 * Suscribe un handler a un evento del socket compartido. El handler se guarda
 * en un ref, así puede leer estado fresco sin re-suscribirse en cada render y
 * sin obligar a quien lo usa a estabilizarlo con useCallback.
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

/** Dispara el callback cada vez que el socket se reconecta, para re-sincronizar. */
export function useOnReconnect(callback: () => void) {
  const { reconnectCount } = useSocketContext();
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (reconnectCount === 0) return;
    callbackRef.current();
  }, [reconnectCount]);
}
