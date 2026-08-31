import type { NextFunction, Request, Response } from "express";
import prisma from "../prisma/client";
import { verifyToken, type AuthPayload } from "./auth.token";
import { canManageTasks, isAdmin, isStaff } from "./roles";

declare global {
  namespace Express {
    interface Request { auth?: AuthPayload }
  }
}

type Authenticated = {
  employeeId: number;
  role: AuthPayload["role"];
  mustChangePassword: boolean;
};

/**
 * Resolves the caller against the DATABASE, not against the token claims.
 *
 * The token carries `role`, but it was signed up to a day ago. Trusting it meant
 * that demoting, deactivating or deleting someone had no effect until it
 * expired: a fired employee kept full access for up to 24h. So the signature
 * only proves *who* is calling; what they are allowed to do is read fresh, on
 * every request. One extra query per request is the right trade at this size.
 *
 * Returns null when the caller must be rejected.
 */
async function authenticate(req: Request): Promise<Authenticated | null> {
  const token = req.headers.authorization?.replace(/^Bearer /, "");
  if (!token) return null;

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return null;
  }

  const employee = await prisma.employee.findUnique({
    where: { id: payload.employeeId },
    select: {
      id: true,
      role: true,
      active: true,
      mustChangePassword: true,
      passwordChangedAt: true,
    },
  });

  // Deleted or deactivated: the token is still cryptographically valid, which is
  // exactly why the signature alone is not enough.
  if (!employee || !employee.active) return null;

  // Tokens minted before the last password change are dead. Compared in whole
  // seconds because that is the resolution of the JWT `iat` claim; a token
  // issued in the same second as the change (the one handed back by
  // /auth/change-password) must still pass.
  if (
    employee.passwordChangedAt &&
    payload.iat < Math.floor(employee.passwordChangedAt.getTime() / 1000)
  ) {
    return null;
  }

  return {
    employeeId: employee.id,
    role: employee.role,
    mustChangePassword: employee.mustChangePassword,
  };
}

/**
 * Standard guard for every authenticated route. Also refuses to let an employee
 * who owes a password change do anything else, so a temporary password cannot
 * be used as a working credential.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const caller = await authenticate(req);
  if (!caller) return res.status(401).json({ code: "AUTH_REQUIRED", message: "Sign-in required" });

  if (caller.mustChangePassword) {
    return res.status(403).json({
      // Machine-readable so the client never has to match on the message text.
      code: "PASSWORD_CHANGE_REQUIRED",
      message: "You have to change your password to continue",
    });
  }

  req.auth = { employeeId: caller.employeeId, role: caller.role };
  next();
}

/**
 * Only for POST /auth/change-password: the one route that has to stay reachable
 * while `mustChangePassword` is set, otherwise the forced change is unreachable.
 */
export async function requireAuthForPasswordChange(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const caller = await authenticate(req);
  if (!caller) return res.status(401).json({ code: "AUTH_REQUIRED", message: "Sign-in required" });

  req.auth = { employeeId: caller.employeeId, role: caller.role };
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!isAdmin(req.auth?.role)) return res.status(403).json({ code: "ADMIN_ONLY", message: "Administrators only" });
  next();
}

/** Admin or supervisor: team visibility (history, reports, chats). */
export function requireStaff(req: Request, res: Response, next: NextFunction) {
  if (!isStaff(req.auth?.role)) {
    return res
      .status(403)
      .json({ code: "STAFF_ONLY", message: "Supervisors and administrators only" });
  }
  next();
}

/**
 * Task board management. Named after the capability and not the role on
 * purpose: ADMIN and SUPERVISOR pass too, not just TASK_MANAGER.
 */
export function requireTaskManagement(req: Request, res: Response, next: NextFunction) {
  if (!canManageTasks(req.auth?.role)) {
    return res
      .status(403)
      .json({ code: "TASK_MANAGEMENT_REQUIRED", message: "You need task management permissions" });
  }
  next();
}
