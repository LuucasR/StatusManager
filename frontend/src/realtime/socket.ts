import { io, type Socket } from "socket.io-client";
import { getApiUrl } from "../serverConfig";

let socket: Socket | null = null;
/** Which host the cached socket was built for. */
let builtFor = "";

/**
 * One connection for the whole app. Each page used to open its own, so no
 * listener survived navigating between /dashboard and /tasks - the bell and the
 * chat need exactly the opposite.
 *
 * Keyed by URL because the address is no longer fixed at build time in the app.
 * Changing servers reloads the page, so this mostly cannot happen - but a
 * singleton that could hand out a connection to the previous host is the kind
 * of bug that only shows up as "live updates stopped", so it is closed here.
 */
export function getSocket() {
  const url = getApiUrl();
  if (socket && builtFor !== url) closeSocket();
  if (!socket) {
    builtFor = url;
    socket = io(url, {
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
  builtFor = "";
}
