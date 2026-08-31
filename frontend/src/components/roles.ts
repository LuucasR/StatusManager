import { t, type TranslationKey } from "../i18n";

export type Role = "EMPLOYEE" | "TASK_MANAGER" | "SUPERVISOR" | "ADMIN";

/**
 * PRESENTATION order (role pickers), by perceived privilege. It does not have
 * to match the enum order in Postgres, which appends new values at the end
 * because of how ALTER TYPE ... ADD VALUE works.
 */
export const ROLE_ORDER: Role[] = ["EMPLOYEE", "TASK_MANAGER", "SUPERVISOR", "ADMIN"];

/**
 * Only the hue is fixed. `soft` is mixed against var(--surface) at paint time
 * so the role chips stay legible in dark mode instead of keeping a pale
 * hardcoded background.
 */
const ROLE_COLORS: Record<Role, string> = {
  EMPLOYEE: "#4a4d63",
  TASK_MANAGER: "#a35b12",
  SUPERVISOR: "#16738b",
  ADMIN: "#4c4dc9",
};

/**
 * `label` and `help` are getters so they follow the active language while
 * call sites keep reading ROLE_META[role].label unchanged.
 */
export const ROLE_META = ROLE_ORDER.reduce((all, role) => {
  all[role] = {
    color: ROLE_COLORS[role],
    soft: `color-mix(in srgb, ${ROLE_COLORS[role]} 16%, var(--surface))`,
    get label() {
      return t(`role.${role}` as TranslationKey);
    },
    get help() {
      return t(`role.${role}.help` as TranslationKey);
    },
  };
  return all;
}, {} as Record<Role, { label: string; help: string; color: string; soft: string }>);

/**
 * Forgiving lookup. `Role` is a hand-written union rather than one derived from
 * Prisma, so a new role in the backend does not break the frontend build:
 * without this fallback, a single employee with an unknown role took down
 * EVERYONE's dashboard with "Cannot read properties of undefined".
 */
export function roleMeta(role?: string) {
  return (role && ROLE_META[role as Role]) || ROLE_META.EMPLOYEE;
}

/** Runs the task board. Mirrors canManageTasks in the backend. */
export function canManageTasks(role?: string) {
  return role === "ADMIN" || role === "SUPERVISOR" || role === "TASK_MANAGER";
}

/** Sees the team: history, reports and other people's chats. Mirrors isStaff. */
export function isStaff(role?: string) {
  return role === "ADMIN" || role === "SUPERVISOR";
}

/** Admin only: accounts, roles and other people's statuses. */
export function isAdminRole(role?: string) {
  return role === "ADMIN";
}
