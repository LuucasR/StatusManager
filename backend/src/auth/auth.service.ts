import prisma from "../prisma/client";
import { sendMail } from "../email";
import { hashPassword, verifyPassword } from "./auth.password";
import {
  generatePasswordResetToken,
  passwordVersion,
  verifyPasswordResetToken,
} from "./auth.reset";

export async function login(employeeNumber: number, password: string) {
  const employee = await prisma.employee.findUnique({ where: { employeeNumber } });
 if (!employee || !employee.active) return null;

const valid = await verifyPassword(password, employee.password);

if (!valid) return null;
  return employee;
}

export async function register(name: string, email: string, password: string) {
  return prisma.$transaction(async (tx) => {
    const last = await tx.employee.findFirst({ orderBy: { employeeNumber: "desc" } });
    return tx.employee.create({
      data: {
        employeeNumber: (last?.employeeNumber ?? 999) + 1,
        name,
        email: email.toLowerCase(),
        password: await hashPassword(password),
        active: false,
      },
    });
  });
}

export async function requestPasswordReset(email: string) {
  const employee = await prisma.employee.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!employee?.active) return false;

  const token = generatePasswordResetToken(employee.id, employee.password);
  const frontendUrl = (process.env.FRONTEND_URL ?? "http://localhost:5173").replace(
    /\/$/,
    ""
  );
  const resetUrl = `${frontendUrl}/restablecer-clave?token=${encodeURIComponent(token)}`;

  const sent = await sendMail(employee.email, {
    subject: "Recuperá tu contraseña de Status Manager",
    text: `Usá este enlace para crear una nueva contraseña. Vence en 15 minutos: ${resetUrl}`,
    html: `
      <p>Hola,</p>
      <p>Recibimos una solicitud para cambiar tu contraseña de Status Manager.</p>
      <p><a href="${resetUrl}">Crear una nueva contraseña</a></p>
      <p>El enlace vence en 15 minutos. Si no solicitaste el cambio, ignorá este correo.</p>
    `,
  });

  if (!sent) {
    throw new Error("SMTP configuration is incompleteeeee");
  }


  return true;
}

export async function resetPassword(token: string, newPassword: string) {
  try {
    const payload = verifyPasswordResetToken(token);
    const employee = await prisma.employee.findUnique({
      where: { id: payload.employeeId },
    });

    if (
      !employee?.active ||
      passwordVersion(employee.password) !== payload.passwordVersion
    ) {
      return false;
    }

    await prisma.employee.update({
      where: { id: employee.id },
      data: { password: await hashPassword(newPassword) },
    });

    return true;
  } catch {
    return false;
  }
}

export function publicEmployee<T extends { password: string }>(employee: T) {
  const { password: _password, ...safe } = employee;
  return safe;
}
