import prisma from "../prisma/client";
import {
  generateTemporaryPassword,
  hashPassword,
  verifyPassword,
} from "./auth.password";

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

/**
 * Records that someone wants their password reset. Takes NO password on
 * purpose.
 *
 * The previous version accepted the password the employee wanted and stored it
 * unhashed, so it sat in the database and in every backup and was shown to the
 * admin on screen. Nothing reversible is stored now: the actual password is
 * minted at approval time by `approvePasswordReset`.
 */
export async function requestPasswordReset(email: string) {
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
      data: { employeeId: employee.id },
    }),
  ]);

  return true;
}

/**
 * Mints a temporary password for `employeeId`, stores only its hash and returns
 * the cleartext to the caller ONCE. The caller (the admin approval route) shows
 * it to the admin and must not persist or log it.
 *
 * `mustChangePassword` forces the employee to pick their own on next login, and
 * `passwordChangedAt` invalidates any token they still had.
 */
export async function approvePasswordReset(employeeId: number) {
  const temporaryPassword = generateTemporaryPassword();

  await prisma.employee.update({
    where: { id: employeeId },
    data: {
      password: await hashPassword(temporaryPassword),
      mustChangePassword: true,
      passwordChangedAt: new Date(),
    },
  });

  return temporaryPassword;
}

/**
 * Self-service change, used both for the forced change after a reset and for a
 * voluntary one. Requires the current password so a stolen token alone cannot
 * take over the account.
 */
export async function changeOwnPassword(
  employeeId: number,
  currentPassword: string,
  newPassword: string
) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
  });
  if (!employee?.active) return false;

  const valid = await verifyPassword(currentPassword, employee.password);
  if (!valid) return false;

  await prisma.employee.update({
    where: { id: employeeId },
    data: {
      password: await hashPassword(newPassword),
      mustChangePassword: false,
      passwordChangedAt: new Date(),
    },
  });

  return true;
}

export function publicEmployee<T extends { password: string }>(employee: T) {
  const { password: _password, ...safe } = employee;
  return safe;
}
