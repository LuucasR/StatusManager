import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import prisma from "./prisma/client";
import { env } from "./env";
import { verifyToken } from "./auth/auth.token";

/**
 * Cada socket se une a la room `emp:<employeeId>` al conectarse. Se usa una
 * room y no un Map<employeeId, socketId> porque una room admite N sockets por
 * empleado (varias pestañas) y Socket.IO la limpia sola en `disconnect`.
 *
 * La version anterior guardaba UN socket por empleado y en `disconnect` hacia
 * `delete` sin comparar el socket.id: con dos pestañas, la segunda pisaba a la
 * primera y cerrar cualquiera dejaba al empleado sin socket registrado.
 */
const employeeRoom = (employeeId: number) => `emp:${employeeId}`;

type PendingConfirmation = {
  employeeId: number;
  timeout: NodeJS.Timeout;
};

const pendingConfirmations = new Map<number, PendingConfirmation>();

let io: Server;

export function initializeRealtime(server: HttpServer) {
  io = new Server(server, { cors: { origin: env.FRONTEND_URL ?? "http://localhost:5173" } });

  /**
   * Same rule as requireAuth: the signature proves who is connecting, the
   * database decides whether they still may. A socket outlives a single
   * request, so accepting a stale token here would keep a deactivated employee
   * receiving live team activity until they closed the tab.
   */
  io.use(async (socket, next) => {
    try {
      const payload = verifyToken(String(socket.handshake.auth.token ?? ""));

      const employee = await prisma.employee.findUnique({
        where: { id: payload.employeeId },
        select: { id: true, role: true, active: true, passwordChangedAt: true },
      });

      if (!employee || !employee.active) return next(new Error("unauthorized"));

      if (
        employee.passwordChangedAt &&
        payload.iat < Math.floor(employee.passwordChangedAt.getTime() / 1000)
      ) {
        return next(new Error("unauthorized"));
      }

      socket.data.employeeId = employee.id;
      socket.data.role = employee.role;

      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    socket.join(employeeRoom(socket.data.employeeId));
  });

  return io;
}

export function emitStatusChanged(payload: unknown) {
  io?.emit("status:changed", payload);
}

/**
 * Un solo canal para toda la pizarra. El payload lleva `type` (created,
 * updated, moved, deleted, commented) y el frontend decide si refresca el
 * tablero, el detalle abierto, o ambos.
 */
export function emitTaskChanged(payload: unknown) {
  io?.emit("task:changed", payload);
}

/**
 * Emite solo a los empleados indicados, a todas sus pestañas abiertas. Se
 * emite a rooms de empleado y no a rooms por conversacion para no tener que
 * mantener join/leave sincronizados con cada alta y baja de participante: la
 * membresia se consulta en la base al momento de emitir, que es la unica
 * fuente de verdad.
 */
export function emitToEmployees(employeeIds: number[], event: string, payload: unknown) {
  const rooms = [...new Set(employeeIds)].map(employeeRoom);
  if (rooms.length === 0) return;
  io?.to(rooms).emit(event, payload);
}

/** true si el empleado tiene al menos una pestaña conectada. */
export function isEmployeeOnline(employeeId: number) {
  return (io?.sockets.adapter.rooms.get(employeeRoom(employeeId))?.size ?? 0) > 0;
}

export function sendConfirmationRequest(employeeId: number) {
  if (!isEmployeeOnline(employeeId)) {
    return false;
  }

  const old = pendingConfirmations.get(employeeId);

  if (old) {
    clearTimeout(old.timeout);
  }

  io.to(employeeRoom(employeeId)).emit("confirmation:request");

  const timeout = setTimeout(() => {
    io.emit("confirmation:timeout", {
      employeeId,
    });

    pendingConfirmations.delete(employeeId);
  }, 120000);

  pendingConfirmations.set(employeeId, {
    employeeId,
    timeout,
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
    employeeId,
  });

  return true;
}
