import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { verifyToken } from "./auth/auth.token";

let io: Server;

export function initializeRealtime(server: HttpServer) {
  io = new Server(server, { cors: { origin: process.env.FRONTEND_URL ?? "http://localhost:5173" } });
  io.use((socket, next) => {
    try {
      verifyToken(String(socket.handshake.auth.token ?? ""));
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });
  return io;
}

export function emitStatusChanged(payload: unknown) {
  io?.emit("status:changed", payload);
}
