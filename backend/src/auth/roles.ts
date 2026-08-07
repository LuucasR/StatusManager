import type { Role } from "@prisma/client";

/**
 * Matriz de permisos, en un solo lugar.
 *
 * - EMPLOYEE     : su jornada, su historial, las tareas donde participa.
 * - TASK_MANAGER : ademas gestiona el tablero (crea, edita, borra, mueve y fija
 *                  cualquier tarea). NO ve el historial ni los reportes del
 *                  equipo, no pide confirmaciones y no lee el chat de las
 *                  tareas donde no participa.
 * - SUPERVISOR   : gestion de tareas mas la visibilidad del equipo: historial,
 *                  reportes, confirmacion de actividad y el chat de cualquier
 *                  tarea. NO toca cuentas ni estados ajenos.
 * - ADMIN        : todo lo anterior mas la gestion de cuentas (alta, rol, baja,
 *                  aprobacion de altas, cambios de contrasena) y cambiar el
 *                  estado de otro empleado.
 *
 * Son DOS capacidades distintas, no una escalera: `canManageTasks` (el tablero)
 * e `isStaff` (ver al equipo). TASK_MANAGER tiene la primera sin la segunda.
 */

/** Gestiona el tablero de tareas: admin, supervisor o gestor de tareas. */
export function canManageTasks(role: Role | undefined) {
  return role === "ADMIN" || role === "SUPERVISOR" || role === "TASK_MANAGER";
}

/** Ve al equipo: historial, reportes y chats ajenos. Admin o supervisor. */
export function isStaff(role: Role | undefined) {
  return role === "ADMIN" || role === "SUPERVISOR";
}

/** Solo el admin: cuentas, roles y estados ajenos. */
export function isAdmin(role: Role | undefined) {
  return role === "ADMIN";
}

export const ROLE_LABELS: Record<Role, string> = {
  EMPLOYEE: "Empleado",
  TASK_MANAGER: "Gestor de tareas",
  SUPERVISOR: "Supervisor",
  ADMIN: "Administrador",
};
