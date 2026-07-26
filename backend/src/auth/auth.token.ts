import jwt from "jsonwebtoken";

export type AuthPayload = { employeeId: number; role: "EMPLOYEE" | "ADMIN" };

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
