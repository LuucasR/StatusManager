export type Role = "EMPLOYEE" | "SUPERVISOR" | "ADMIN";

export const ROLE_ORDER: Role[] = ["EMPLOYEE", "SUPERVISOR", "ADMIN"];

export const ROLE_META: Record<Role, { label: string; help: string; color: string; soft: string }> = {
  EMPLOYEE: {
    label: "Empleado",
    help: "Ve la pizarra, su historial y chatea. Solo mueve las tareas donde participa.",
    color: "#4a4d63",
    soft: "#eef0f6",
  },
  SUPERVISOR: {
    label: "Supervisor",
    help: "Además gestiona tareas, ve el historial y los reportes del equipo, y pide confirmación de actividad.",
    color: "#16738b",
    soft: "#e2f5f8",
  },
  ADMIN: {
    label: "Administrador",
    help: "Todo lo anterior más crear cuentas, cambiar roles, aprobar altas y cambiar el estado de otros.",
    color: "#4c4dc9",
    soft: "#ecebff",
  },
};

/** Gestiona tareas y ve al equipo. Espeja isStaff del backend. */
export function isStaff(role?: string) {
  return role === "ADMIN" || role === "SUPERVISOR";
}

/** Solo el admin: cuentas, roles y estados ajenos. */
export function isAdminRole(role?: string) {
  return role === "ADMIN";
}
