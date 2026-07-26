import type { Request, Response } from "express";
import { z } from "zod";
import { login, register } from "./auth.service";
import { generateToken } from "./auth.token";
import { notifyAdmin } from "../email";
import { toEmployeeDto } from "./auth.dto";

const loginSchema = z.object({ employeeNumber: z.coerce.number().int().positive(), password: z.string().min(6) });
const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(8).max(72),
});

export async function loginController(req: Request, res: Response) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Datos de acceso inválidos" });
  const employee = await login(parsed.data.employeeNumber, parsed.data.password);
  if (!employee) return res.status(401).json({ message: "Credenciales inválidas" });
  res.json({ token: generateToken({ employeeId: employee.id, role: employee.role }), employee: toEmployeeDto(employee) });
}

export async function registerController(req: Request, res: Response) {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Revisá los datos ingresados" });
  try {
    const employee = await register(parsed.data.name, parsed.data.email, parsed.data.password);
    void notifyAdmin({
      subject: `Nueva solicitud de alta #${employee.employeeNumber}`,
      text: `${employee.name} (${employee.email}) solicitó acceso a Status Manager.`,
    });
    res.status(201).json({ employee: toEmployeeDto(employee), message: "Solicitud pendiente de aprobación" });
  } catch {
    res.status(409).json({ message: "El email ya está registrado" });
  }
}
