export type Role = "EMPLOYEE" | "TASK_MANAGER" | "SUPERVISOR" | "ADMIN";

/**
 * Orden de PRESENTACION (selectores de rol), por privilegio percibido. No tiene
 * por qué coincidir con el orden del enum en Postgres, que appendea los valores
 * nuevos al final por como funciona ALTER TYPE ... ADD VALUE.
 */
export const ROLE_ORDER: Role[] = ["EMPLOYEE", "TASK_MANAGER", "SUPERVISOR", "ADMIN"];

export const ROLE_META: Record<Role, { label: string; help: string; color: string; soft: string }> = {
  EMPLOYEE: {
    label: "Empleado",
    help: "Ve la pizarra, su historial y chatea. Solo mueve las tareas donde participa.",
    color: "#4a4d63",
    soft: "#eef0f6",
  },
  TASK_MANAGER: {
    label: "Gestor de tareas",
    help: "Además crea, edita, borra y mueve cualquier tarea. No ve el historial del equipo ni los chats de las tareas donde no participa: para seguir su propia tarea, tiene que agregarse como participante.",
    color: "#a35b12",
    soft: "#fdf0e0",
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

/**
 * Lookup tolerante. `Role` es una union escrita a mano y no derivada de Prisma,
 * asi que un rol nuevo en el backend no rompe la compilacion del frontend: sin
 * este fallback, un solo empleado con un rol desconocido tumbaba el dashboard
 * de TODOS con "Cannot read properties of undefined".
 */
export function roleMeta(role?: string) {
  return (role && ROLE_META[role as Role]) || ROLE_META.EMPLOYEE;
}

/** Gestiona el tablero de tareas. Espeja canManageTasks del backend. */
export function canManageTasks(role?: string) {
  return role === "ADMIN" || role === "SUPERVISOR" || role === "TASK_MANAGER";
}

/** Ve al equipo: historial, reportes y chats ajenos. Espeja isStaff. */
export function isStaff(role?: string) {
  return role === "ADMIN" || role === "SUPERVISOR";
}

/** Solo el admin: cuentas, roles y estados ajenos. */
export function isAdminRole(role?: string) {
  return role === "ADMIN";
}
