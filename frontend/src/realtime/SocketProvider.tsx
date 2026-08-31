import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Socket } from "socket.io-client";
import { expireSession } from "../session";
import { getSocket } from "./socket";

type SocketContextValue = {
  socket: Socket;
  connected: boolean;
  /** Bumped on every reconnect: used to re-sync data. */
  reconnectCount: number;
};

const SocketContext = createContext<SocketContextValue | null>(null);

export function useSocketContext() {
  const value = useContext(SocketContext);
  if (!value) throw new Error("useSocketContext must be used inside SocketProvider");
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
      // socket.active === true means socket.io will retry on its own (backend
      // down, network). Signing out there would kick the whole team out every
      // time the server restarts.
      if (socket.active) return;
      // active === false is a rejection from the server: the auth middleware
      // answered "unauthorized". The JWT lasts a day, so the typical case is a
      // tab left open since yesterday.
      if (error.message === "unauthorized") expireSession();
    };

    const onReconnect = () => setReconnectCount((value) => value + 1);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    // `reconnect` lives on the Manager, not on the socket.
    socket.io.on("reconnect", onReconnect);

    if (!socket.connected) socket.connect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      socket.io.off("reconnect", onReconnect);
      // Deliberately NOT disconnecting here: under React.StrictMode the effect
      // runs twice in development and a disconnect would produce a
      // connect/disconnect/connect loop. AppLayout only unmounts on sign-out,
      // and logout() calls closeSocket() before the replace.
    };
  }, [socket]);

  const value = useMemo(
    () => ({ socket, connected, reconnectCount }),
    [socket, connected, reconnectCount]
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}
