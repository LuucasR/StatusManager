import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Socket } from "socket.io-client";
import { expireSession } from "../session";
import { getSocket } from "./socket";

type SocketContextValue = {
  socket: Socket;
  connected: boolean;
  /** Se incrementa en cada reconexión: sirve para re-sincronizar datos. */
  reconnectCount: number;
};

const SocketContext = createContext<SocketContextValue | null>(null);

export function useSocketContext() {
  const value = useContext(SocketContext);
  if (!value) throw new Error("useSocketContext debe usarse dentro de SocketProvider");
  return value;
}

export default function SocketProvider({ children }: { children: ReactNode }) {
  const socket = getSocket();
  const [connected, setConnected] = useState(socket.connected);
  const [reconnectCount, setReconnectCount] = useState(0);

  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    const onConnectError = (error: Error) => {
      setConnected(false);
      // socket.active === true significa que socket.io va a reintentar solo
      // (backend caído, red). Desloguear ahí expulsaría a todo el equipo cada
      // vez que se reinicia el server.
      if (socket.active) return;
      // active === false es un rechazo del servidor: el middleware de auth
      // devolvió "unauthorized". El JWT dura un día, así que el caso típico es
      // la pestaña abierta desde ayer.
      if (error.message === "unauthorized") expireSession();
    };

    const onReconnect = () => setReconnectCount((value) => value + 1);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    // `reconnect` vive en el Manager, no en el socket.
    socket.io.on("reconnect", onReconnect);

    if (!socket.connected) socket.connect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      socket.io.off("reconnect", onReconnect);
      // NO se desconecta acá a propósito: en React.StrictMode el efecto corre
      // dos veces en desarrollo y un disconnect produciría un ciclo
      // connect/disconnect/connect. AppLayout solo se desmonta al desloguear, y
      // logout() llama closeSocket() antes del replace.
    };
  }, [socket]);

  const value = useMemo(
    () => ({ socket, connected, reconnectCount }),
    [socket, connected, reconnectCount]
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}
