import prisma from "../prisma/client";
import { hashPassword, verifyPassword } from "./auth.password";

export async function login(employeeNumber: number, password: string) {
  const employee = await prisma.employee.findUnique({
    where: { employeeNumber },
  });
  if (!employee || !employee.active) return null;

  const valid = await verifyPassword(password, employee.password);
  if (!valid) return null;
  return employee;
}

export async function register(name: string, email: string, password: string) {
  return prisma.$transaction(async (tx) => {
    const last = await tx.employee.findFirst({
      orderBy: { employeeNumber: "desc" },
    });
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

export async function requestPasswordReset(
  email: string,
  requestedPassword: string
) {
  const employee = await prisma.employee.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!employee?.active) return false;

  await prisma.$transaction([
    prisma.passwordChangeRequest.updateMany({
      where: { employeeId: employee.id, status: "PENDING" },
      data: { status: "REJECTED", resolvedAt: new Date() },
    }),
    prisma.passwordChangeRequest.create({
      data: {
        employeeId: employee.id,
        requestedPassword,
      },
    }),
  ]);

  return true;
}

export function publicEmployee<T extends { password: string }>(employee: T) {
  const { password: _password, ...safe } = employee;
  return safe;
}
