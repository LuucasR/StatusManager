import jwt from "jsonwebtoken";

import type { Role } from "@prisma/client";

// The role comes from the Prisma enum rather than a hand-written union: adding
// a new role to the schema forces the checks to be revisited instead of
// slipping through silently.
export type AuthPayload = { employeeId: number; role: Role };

/**
 * What `verifyToken` actually hands back. `iat` (seconds since epoch, added by
 * jsonwebtoken) is what lets `requireAuth` reject tokens minted before the
 * employee's last password change.
 *
 * The `role` claim here is only a hint. It was signed up to a day ago and may
 * be stale, so it is NOT the value the guards read: `requireAuth` replaces it
 * with the role currently in the database.
 */
export type VerifiedToken = AuthPayload & { iat: number };

function secret() {
  const value = process.env.JWT_SECRET;
  if (!value) throw new Error("JWT_SECRET is required");
  return value;
}

export function generateToken(payload: AuthPayload) {
  return jwt.sign(payload, secret(), { expiresIn: "1d" });
}

export function verifyToken(token: string) {
  return jwt.verify(token, secret()) as VerifiedToken;
}
