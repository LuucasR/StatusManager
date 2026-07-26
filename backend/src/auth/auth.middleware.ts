import type { NextFunction, Request, Response } from "express";
import { verifyToken, type AuthPayload } from "./auth.token";

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
  if (req.auth?.role !== "ADMIN") return res.status(403).json({ message: "Acceso exclusivo para administradores" });
  next();
}
