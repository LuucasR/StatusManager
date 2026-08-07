import {
  AutorenewRounded,
  CheckCircleRounded,
  RadioButtonUncheckedRounded,
} from "@mui/icons-material";
import type { SvgIconComponent } from "@mui/icons-material";
import type { CSSProperties } from "react";
import { canManageTasks } from "../roles";

// React.CSSProperties no admite claves --*, y el cast directo falla.
declare module "react" {
  interface CSSProperties {
    [key: `--${string}`]: string | number | undefined;
  }
}

export type TaskState = "PENDING" | "IN_PROGRESS" | "DONE";

export type TaskParticipant = {
  id: number;
  employeeNumber: number;
  name: string;
};

export type TaskComment = {
  id: number;
  body: string;
  createdAt: string;
  author: TaskParticipant;
};

export type Task = {
  id: number;
  title: string;
  description: string;
  state: TaskState;
  startsAt: string;
  endsAt: string;
  pinned: boolean;
  /** endsAt + 14 días. El backend es dueño de la constante. */
  archivesAt: string;
  /** Chat de la tarea: el hilo de comentarios y el del widget son el mismo. */
  conversationId: number | null;
  /** true cuando la tarea está Terminada o fue eliminada: solo lectura. */
  chatClosed: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: TaskParticipant | null;
  participants: TaskParticipant[];
  commentsCount: number;
  /** Solo viene en el detalle (GET /tasks/:id). */
  comments?: TaskComment[];
};

export const STATE_ORDER: TaskState[] = ["PENDING", "IN_PROGRESS", "DONE"];

export type StateMeta = {
  label: string;
  /** Barra lateral de la tarjeta, punto de la cabecera, borde de drop. */
  accent: string;
  /** Fondo de la cabecera de columna y del pill de estado. */
  soft: string;
  /** Hover de tarjeta y fondo de columna cuando es destino de drop. */
  tint: string;
  /** Texto sobre soft/tint. Contraste verificado >= 4.5:1. */
  ink: string;
  Icon: SvgIconComponent;
  empty: string;
};

/**
 * Los acentos son los mismos de .status-dot.offline/.working/.available en
 * index.css, para que la pizarra y el dashboard se lean como una sola app.
 */
export const STATE_META: Record<TaskState, StateMeta> = {
  PENDING: {
    label: "Pendiente",
    accent: "#8a8da0",
    soft: "#eef0f6",
    tint: "#f7f8fc",
    ink: "#4a4d63",
    Icon: RadioButtonUncheckedRounded,
    empty: "Nada pendiente por ahora",
  },
  IN_PROGRESS: {
    label: "En curso",
    accent: "#5b5ce2",
    soft: "#ecebff",
    tint: "#f6f5ff",
    ink: "#3c3ca8",
    Icon: AutorenewRounded,
    empty: "Nadie arrancó ninguna tarea",
  },
  DONE: {
    label: "Terminada",
    accent: "#2eae70",
    soft: "#e2f6eb",
    tint: "#f2fbf6",
    ink: "#1a7048",
    Icon: CheckCircleRounded,
    empty: "Todavía no terminaron ninguna",
  },
};

/** Custom properties para que el CSS estático pinte según el estado. */
export function stateVars(state: TaskState): CSSProperties {
  const meta = STATE_META[state];
  return {
    "--accent": meta.accent,
    "--soft": meta.soft,
    "--tint": meta.tint,
    "--ink": meta.ink,
  };
}

/**
 * Hues sin la banda amarillo-lima (40-110) y ordenados para que ids
 * consecutivos caigan lejos entre sí. Con S 55% / L 32% y texto blanco el peor
 * caso (cian 168) da 4.7:1 → AA. No subir la lightness: a 36% cae a 3.8:1.
 */
const AVATAR_HUES = [231, 350, 168, 292, 24, 200, 322, 145, 262, 12];

export function participantColor(id: number) {
  return `hsl(${AVATAR_HUES[Math.abs(id) % AVATAR_HUES.length]} 55% 32%)`;
}

/** Quien gestiona el tablero mueve y fija cualquier tarea; el resto solo si participa. */
export function canMoveTask(task: Task, meId?: number, role?: string) {
  if (canManageTasks(role)) return true;
  if (!meId) return false;
  return task.participants.some((participant) => participant.id === meId);
}

/** Días antes del corte en que la tarjeta empieza a avisar. */
export const ARCHIVE_WARNING_DAYS = 3;

/** Días enteros que faltan para que se archive. Negativo = ya pasó el corte. */
export function daysUntilArchive(task: Task, now = Date.now()) {
  return Math.ceil((new Date(task.archivesAt).getTime() - now) / 86_400_000);
}
