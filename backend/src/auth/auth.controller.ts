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
    message: "La contraseña nueva tiene que ser distinta de la actual",
  });

export async function loginController(req: Request, res: Response) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Datos de acceso inválidos" });
  }
  const employee = await login(
    parsed.data.employeeNumber,
    parsed.data.password
  );
  if (!employee) {
    return res.status(401).json({ message: "Credenciales inválidas" });
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
    return res.status(400).json({ message: "Revisá los datos ingresados" });
  }
  try {
    const employee = await register(
      parsed.data.name,
      parsed.data.email,
      parsed.data.password
    );
    res.status(201).json({
      employee: toEmployeeDto(employee),
      message: "Solicitud pendiente de aprobación",
    });
  } catch {
    res.status(409).json({ message: "El email ya está registrado" });
  }
}

export async function forgotPasswordController(req: Request, res: Response) {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Ingresá un email válido" });
  }

  try {
    const created = await requestPasswordReset(parsed.data.email);
    if (!created) {
      console.warn(
        "[password-reset] No se encontró una cuenta activa para la solicitud"
      );
    }
  } catch (error) {
    console.error("[password-reset] No se pudo crear la solicitud:", error);
  }

  // Deliberately the same answer either way: telling the caller whether the
  // address exists would turn this into an account-enumeration oracle.
  res.json({
    message:
      "Si existe una cuenta activa con ese email, la solicitud será revisada por un administrador.",
  });
}

export async function changePasswordController(req: Request, res: Response) {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      message:
        parsed.error.issues[0]?.message ??
        "La contraseña nueva tiene que tener entre 8 y 72 caracteres",
    });
  }

  const changed = await changeOwnPassword(
    req.auth!.employeeId,
    parsed.data.currentPassword,
    parsed.data.newPassword
  );

  if (!changed) {
    return res.status(400).json({ message: "La contraseña actual no coincide" });
  }

  // The change stamps `passwordChangedAt`, which invalidates every token issued
  // before it, including the one used for this very request. Handing back a
  // fresh one keeps the employee logged in instead of bouncing them to /.
  res.json({
    token: generateToken({
      employeeId: req.auth!.employeeId,
      role: req.auth!.role,
    }),
    message: "Contraseña actualizada",
  });
}
