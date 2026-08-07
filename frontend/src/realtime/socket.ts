import { io, type Socket } from "socket.io-client";
import { API_URL } from "../api";

let socket: Socket | null = null;

/**
 * Conexión única para toda la app. Antes cada página abría la suya, así que
 * ningún listener sobrevivía a navegar entre /dashboard y /tareas — la campana
 * y el chat necesitan justamente lo contrario.
 */
export function getSocket() {
  if (!socket) {
    socket = io(API_URL, {
      autoConnect: false,
      // `auth` como función y no como objeto: con un objeto el token queda
      // congelado en el momento de construir el socket y una reconexión
      // reintenta con el token viejo.
      auth: (cb) => cb({ token: localStorage.getItem("token") ?? "" }),
    });
  }
  return socket;
}

export function closeSocket() {
  socket?.disconnect();
  socket = null;
}
