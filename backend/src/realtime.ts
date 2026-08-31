import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import prisma from "./prisma/client";
import { env } from "./env";
import { verifyToken } from "./auth/auth.token";
import { logger } from "./logger";

/**
 * Every socket joins the room `emp:<employeeId>` on connect. A room is used
 * rather than a Map<employeeId, socketId> because a room holds N sockets per
 * employee (several tabs) and Socket.IO cleans it up itself on `disconnect`.
 *
 * The previous version stored ONE socket per employee and on `disconnect` did a
 * `delete` without comparing socket.id: with two tabs the second overwrote the
 * first, and closing either left the employee with no registered socket.
 */
const employeeRoom = (employeeId: number) => `emp:${employeeId}`;

type PendingConfirmation = {
  employeeId: number;
  timeout: NodeJS.Timeout;
};

const pendingConfirmations = new Map<number, PendingConfirmation>();

export const DEFAULT_CONFIRMATION_TIMEOUT_MS = 120_000;

type ConfirmationTimeoutHandler = (employeeId: number) => void | Promise<void>;

/**
 * What to do when a check goes unanswered, injected at boot rather than
 * imported.
 *
 * The consequence (close the segment, set AUTO_DISCONNECTED, tell the admins)
 * needs notification.service, which already imports this module for
 * emitToEmployees. Importing it back would close a cycle, so the dependency is
 * registered instead. See activities/activity-confirmation.ts.
 */
let onConfirmationTimeout: ConfirmationTimeoutHandler | null = null;

export function setConfirmationTimeoutHandler(handler: ConfirmationTimeoutHandler) {
  onConfirmationTimeout = handler;
}

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
 * A single channel for the whole board. The payload carries `type` (created,
 * updated, moved, deleted, commented) and the frontend decides whether to
 * refresh the board, the open detail, or both.
 */
export function emitTaskChanged(payload: unknown) {
  io?.emit("task:changed", payload);
}

/**
 * Emits only to the given employees, across all their open tabs. It emits to
 * per-employee rooms rather than per-conversation rooms so that join/leave does
 * not have to be kept in sync with every participant added and removed:
 * membership is read from the database at emit time, which is the only source
 * of truth.
 */
export function emitToEmployees(employeeIds: number[], event: string, payload: unknown) {
  const rooms = [...new Set(employeeIds)].map(employeeRoom);
  if (rooms.length === 0) return;
  io?.to(rooms).emit(event, payload);
}

/** true if the employee has at least one tab connected. */
export function isEmployeeOnline(employeeId: number) {
  return (io?.sockets.adapter.rooms.get(employeeRoom(employeeId))?.size ?? 0) > 0;
}

/**
 * Asks one employee to confirm they are still working, and starts the clock.
 *
 * Returns false when they have no tab open: there is nobody to show the prompt
 * to, so the caller decides what that means (the end-of-day job treats it as an
 * immediate miss rather than waiting out a timer nobody can beat).
 *
 * NOTE: the timer is an in-process setTimeout, so a restart inside the window
 * drops it and that person is never resolved. Surviving a restart would mean
 * persisting the pending check; it is a known gap, not an oversight.
 */
export function sendConfirmationRequest(
  employeeId: number,
  timeoutMs: number = DEFAULT_CONFIRMATION_TIMEOUT_MS
) {
  if (!isEmployeeOnline(employeeId)) {
    return false;
  }

  const old = pendingConfirmations.get(employeeId);

  if (old) {
    clearTimeout(old.timeout);
  }

  io.to(employeeRoom(employeeId)).emit("confirmation:request");

  const timeout = setTimeout(() => {
    // Dropped from the map FIRST: the handler below is async, and leaving the
    // entry in place would let a late confirmActivity() think the check is
    // still open after the employee has already been disconnected.
    pendingConfirmations.delete(employeeId);

    io.emit("confirmation:timeout", {
      employeeId,
    });

    void Promise.resolve()
      .then(() => onConfirmationTimeout?.(employeeId))
      .catch((error) => {
        logger.error(
          { err: error, employeeId },
          "could not resolve a missed activity confirmation"
        );
      });
  }, timeoutMs);

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
