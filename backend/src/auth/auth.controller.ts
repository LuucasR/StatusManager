import type { Request, Response } from "express";
import { z } from "zod";
import {
  changeOwnPassword,
  login,
  register,
  requestPasswordReset,
} from "./auth.service";
import { generateToken } from "./auth.token";
import { toEmployeeDto } from "./auth.dto";
import { logger } from "../logger";

const loginSchema = z.object({
  employeeNumber: z.coerce.number().int().positive(),
  password: z.string().min(6),
});
const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(8).max(72),
});
// Email only. The employee no longer proposes a password: see requestPasswordReset.
const forgotPasswordSchema = z.object({
  email: z.string().trim().email(),
});
const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8).max(72),
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    path: ["newPassword"],
    message: "The new password has to be different from the current one",
  });

export async function loginController(req: Request, res: Response) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ code: "INVALID_SIGN_IN_INPUT", message: "Invalid sign-in details" });
  }
  const employee = await login(
    parsed.data.employeeNumber,
    parsed.data.password
  );
  if (!employee) {
    return res.status(401).json({ code: "INVALID_CREDENTIALS", message: "Invalid credentials" });
  }
  res.json({
    token: generateToken({
      employeeId: employee.id,
      role: employee.role,
    }),
    // The client needs this to route straight to the forced-change screen: every
    // other endpoint will refuse the token until the password is replaced.
    mustChangePassword: employee.mustChangePassword,
    employee: toEmployeeDto(employee),
  });
}

export async function registerController(req: Request, res: Response) {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ code: "INVALID_INPUT", message: "Check the details you entered" });
  }
  try {
    const employee = await register(
      parsed.data.name,
      parsed.data.email,
      parsed.data.password
    );
    res.status(201).json({
      employee: toEmployeeDto(employee),
      code: "REGISTRATION_PENDING", message: "Request pending approval",
    });
  } catch {
    res.status(409).json({ code: "EMAIL_TAKEN", message: "That email is already registered" });
  }
}

export async function forgotPasswordController(req: Request, res: Response) {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ code: "INVALID_EMAIL", message: "Enter a valid email address" });
  }

  try {
    const created = await requestPasswordReset(parsed.data.email);
    if (!created) {
      // Not an error: this is the enumeration-proof path for an address that
      // has no active account. Logged so a confused user can be traced.
      logger.info("password reset requested for an unknown or inactive email");
    }
  } catch (error) {
    logger.error({ err: error }, "could not create password reset request");
  }

  // Deliberately the same answer either way: telling the caller whether the
  // address exists would turn this into an account-enumeration oracle.
  res.json({
    code: "PASSWORD_RESET_REQUESTED",
    message:
      "If an active account exists for that email, an administrator will review the request.",
  });
}

export async function changePasswordController(req: Request, res: Response) {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      code: "INVALID_NEW_PASSWORD",
      message:
        parsed.error.issues[0]?.message ??
        "The new password has to be between 8 and 72 characters",
    });
  }

  const changed = await changeOwnPassword(
    req.auth!.employeeId,
    parsed.data.currentPassword,
    parsed.data.newPassword
  );

  if (!changed) {
    return res.status(400).json({ code: "CURRENT_PASSWORD_MISMATCH", message: "The current password does not match" });
  }

  // The change stamps `passwordChangedAt`, which invalidates every token issued
  // before it, including the one used for this very request. Handing back a
  // fresh one keeps the employee logged in instead of bouncing them to /.
  res.json({
    token: generateToken({
      employeeId: req.auth!.employeeId,
      role: req.auth!.role,
    }),
    code: "PASSWORD_UPDATED", message: "Password updated",
  });
}
