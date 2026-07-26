import prisma from "../prisma/client";
import { hashPassword, verifyPassword } from "./auth.password";

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

export function publicEmployee<T extends { password: string }>(employee: T) {
  const { password: _password, ...safe } = employee;
  return safe;
}
