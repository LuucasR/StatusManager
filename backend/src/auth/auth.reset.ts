import { createHash } from "node:crypto";
import jwt from "jsonwebtoken";

type ResetPayload = {
  employeeId: number;
  passwordVersion: string;
  purpose: "password-reset";
};

function resetSecret() {
  const value = process.env.RESET_PASSWORD_SECRET ?? process.env.JWT_SECRET;
  if (!value) throw new Error("RESET_PASSWORD_SECRET or JWT_SECRET is required");
  return value;
}

export function passwordVersion(passwordHash: string) {
  return createHash("sha256").update(passwordHash).digest("hex");
}

export function generatePasswordResetToken(
  employeeId: number,
  passwordHash: string
) {
  const payload: ResetPayload = {
    employeeId,
    passwordVersion: passwordVersion(passwordHash),
    purpose: "password-reset",
  };

  return jwt.sign(payload, resetSecret(), { expiresIn: "15m" });
}

export function verifyPasswordResetToken(token: string) {
  const payload = jwt.verify(token, resetSecret()) as ResetPayload;
  if (payload.purpose !== "password-reset") {
    throw new Error("Invalid reset token purpose");
  }
  return payload;
}
