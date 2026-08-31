import { io, type Socket } from "socket.io-client";
import { API_URL } from "../api";

let socket: Socket | null = null;

/**
 * One connection for the whole app. Each page used to open its own, so no
 * listener survived navigating between /dashboard and /tasks - the bell and the
 * chat need exactly the opposite.
 */
export function getSocket() {
  if (!socket) {
    socket = io(API_URL, {
      autoConnect: false,
      // `auth` as a function and not an object: with an object the token is
      // frozen at socket-construction time and a reconnect retries with the
      // stale one.
      auth: (cb) => cb({ token: localStorage.getItem("token") ?? "" }),
    });
  }
  return socket;
}

export function closeSocket() {
  socket?.disconnect();
  socket = null;
}
