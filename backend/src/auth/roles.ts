import type { Role } from "@prisma/client";

/**
 * Matriz de permisos, en un solo lugar.
 *
 * - EMPLOYEE   : su jornada, su historial, las tareas donde participa.
 * - SUPERVISOR : ademas gestiona tareas, ve el historial y los reportes del
 *                equipo, pide confirmacion de actividad y lee el chat de
 *                cualquier tarea. NO toca cuentas ni estados ajenos.
 * - ADMIN      : todo lo anterior mas la gestion de cuentas (alta, rol, baja,
 *                aprobacion de altas, cambios de contrasena) y cambiar el
 *                estado de otro empleado.
 */
export const STAFF_ROLES: readonly Role[] = ["ADMIN", "SUPERVISOR"];

/** Gestiona tareas y ve al equipo: admin o supervisor. */
export function isStaff(role: Role | undefined) {
  return role === "ADMIN" || role === "SUPERVISOR";
}

/** Solo el admin: cuentas, roles y estados ajenos. */
export function isAdmin(role: Role | undefined) {
  return role === "ADMIN";
}

export const ROLE_LABELS: Record<Role, string> = {
  EMPLOYEE: "Empleado",
  SUPERVISOR: "Supervisor",
  ADMIN: "Administrador",
};
