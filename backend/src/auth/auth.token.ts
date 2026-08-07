import jwt from "jsonwebtoken";

import type { Role } from "@prisma/client";

// El rol sale del enum de Prisma y no de una union escrita a mano: agregar un
// rol nuevo al schema obliga a revisar los chequeos, en vez de pasar en silencio.
export type AuthPayload = { employeeId: number; role: Role };

function secret() {
  const value = process.env.JWT_SECRET;
  if (!value) throw new Error("JWT_SECRET is required");
  return value;
}

export function generateToken(payload: AuthPayload) {
  return jwt.sign(payload, secret(), { expiresIn: "1d" });
}

export function verifyToken(token: string) {
  return jwt.verify(token, secret()) as AuthPayload;
}
