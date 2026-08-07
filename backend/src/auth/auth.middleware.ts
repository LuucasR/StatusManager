import type { NextFunction, Request, Response } from "express";
import { verifyToken, type AuthPayload } from "./auth.token";
import { canManageTasks, isAdmin, isStaff } from "./roles";

declare global {
  namespace Express {
    interface Request { auth?: AuthPayload }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace(/^Bearer /, "");
  if (!token) return res.status(401).json({ message: "Sesión requerida" });
  try {
    req.auth = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ message: "Sesión inválida o vencida" });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!isAdmin(req.auth?.role)) return res.status(403).json({ message: "Acceso exclusivo para administradores" });
  next();
}

/** Admin o supervisor: visibilidad del equipo (historial, reportes, chats). */
export function requireStaff(req: Request, res: Response, next: NextFunction) {
  if (!isStaff(req.auth?.role)) {
    return res
      .status(403)
      .json({ message: "Acceso exclusivo para supervisores y administradores" });
  }
  next();
}

/**
 * Gestion del tablero de tareas. Nombrado por capacidad y no por rol a
 * proposito: ADMIN y SUPERVISOR tambien pasan, no solo TASK_MANAGER.
 */
export function requireTaskManagement(req: Request, res: Response, next: NextFunction) {
  if (!canManageTasks(req.auth?.role)) {
    return res
      .status(403)
      .json({ message: "Necesitás permisos de gestión de tareas" });
  }
  next();
}
