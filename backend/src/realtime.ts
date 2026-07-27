import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { verifyToken } from "./auth/auth.token";


const employeeSockets = new Map<number, string>();

type PendingConfirmation = {
  employeeId: number;
  timeout: NodeJS.Timeout;
};

const pendingConfirmations = new Map<number, PendingConfirmation>();

let io: Server;

export function initializeRealtime(server: HttpServer) {
  io = new Server(server, { cors: { origin: process.env.FRONTEND_URL ?? "http://localhost:5173" } });
 io.use((socket, next) => {
  try {
    const payload = verifyToken(String(socket.handshake.auth.token ?? ""));

    socket.data.employeeId = payload.employeeId;
    socket.data.role = payload.role;

    next();
  } catch {
    next(new Error("unauthorized"));
  }
});
io.on("connection", (socket) => {

  const employeeId = socket.data.employeeId;

  employeeSockets.set(employeeId, socket.id);

  socket.on("disconnect", () => {
    employeeSockets.delete(employeeId);
  });

});
  return io;
}

export function emitStatusChanged(payload: unknown) {
  io?.emit("status:changed", payload);
}


export function sendConfirmationRequest(employeeId: number) {

  const socketId = employeeSockets.get(employeeId);

  if (!socketId) {
    return false;
  }

  const old = pendingConfirmations.get(employeeId);

  if (old) {
    clearTimeout(old.timeout);
  }

  io.to(socketId).emit("confirmation:request");

  const timeout = setTimeout(() => {

    io.emit("confirmation:timeout", {
      employeeId
    });

    pendingConfirmations.delete(employeeId);

  }, 120000);

  pendingConfirmations.set(employeeId, {
    employeeId,
    timeout
  });

  return true;
}

export function confirmActivity(employeeId: number) {

  const pending = pendingConfirmations.get(employeeId);

  if (!pending) {
    return false;
  }

  clearTimeout(pending.timeout);

  pendingConfirmations.delete(employeeId);

  io.emit("confirmation:confirmed", {
    employeeId
  });

  return true;
}