import {
  AutorenewRounded,
  CheckCircleRounded,
  RadioButtonUncheckedRounded,
} from "@mui/icons-material";
import type { SvgIconComponent } from "@mui/icons-material";
import type { CSSProperties } from "react";
import { canManageTasks } from "../roles";
import { t, type TranslationKey } from "../../i18n";

// React.CSSProperties does not accept --* keys, and a direct cast fails.
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
  /** endsAt + 14 days. The backend owns the constant. */
  archivesAt: string;
  /** Task chat: the comment thread and the widget thread are the same one. */
  conversationId: number | null;
  /** true when the task is Done or was deleted: read only. */
  chatClosed: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: TaskParticipant | null;
  participants: TaskParticipant[];
  commentsCount: number;
  /** Only present in the detail response (GET /tasks/:id). */
  comments?: TaskComment[];
};

export const STATE_ORDER: TaskState[] = ["PENDING", "IN_PROGRESS", "DONE"];

export type StateMeta = {
  label: string;
  /** Card side bar, column header dot, drop border. */
  accent: string;
  /** Column header background and state pill background. */
  soft: string;
  /** Card hover, and column background when it is the drop target. */
  tint: string;
  /** Text on soft/tint. Contrast verified >= 4.5:1. */
  ink: string;
  Icon: SvgIconComponent;
  empty: string;
};

/**
 * The accents are the same ones used by .status-dot.offline/.working/.available
 * in index.css, so the board and the dashboard read as a single app.
 */
/**
 * Only the accent is a fixed hue; soft/tint/ink are DERIVED from it against
 * the theme surface at paint time.
 *
 * They used to be hardcoded pale hexes, which meant the board stayed white
 * under a dark theme. color-mix() against var(--surface)/var(--text) - both
 * published on :root by ThemeModeProvider - makes them follow light and dark
 * with no extra JS and without touching the call sites that read .soft/.ink
 * as inline style values.
 */
const STATE_ACCENTS: Record<TaskState, { accent: string; Icon: SvgIconComponent }> = {
  PENDING: { accent: "#8a8da0", Icon: RadioButtonUncheckedRounded },
  IN_PROGRESS: { accent: "#5b5ce2", Icon: AutorenewRounded },
  DONE: { accent: "#2eae70", Icon: CheckCircleRounded },
};

/** Header and pill background: a light wash of the accent over the surface. */
export const softOf = (accent: string) =>
  `color-mix(in srgb, ${accent} 16%, var(--surface))`;
/** Hover / drop-target background: a fainter wash still. */
export const tintOf = (accent: string) =>
  `color-mix(in srgb, ${accent} 8%, var(--surface))`;
/** Text sitting on soft/tint: the accent pulled towards the body text colour. */
export const inkOf = (accent: string) =>
  `color-mix(in srgb, ${accent} 72%, var(--text))`;

/** `label` and `empty` follow the active language; the styling does not. */
export const STATE_META = STATE_ORDER.reduce((all, state) => {
  const { accent, Icon } = STATE_ACCENTS[state];
  all[state] = {
    accent,
    Icon,
    soft: softOf(accent),
    tint: tintOf(accent),
    ink: inkOf(accent),
    get label() {
      return t(`taskState.${state}` as TranslationKey);
    },
    get empty() {
      return t(`taskState.${state}.empty` as TranslationKey);
    },
  };
  return all;
}, {} as Record<TaskState, StateMeta>);

/**
 * Custom properties so the static CSS can paint according to the state.
 *
 * --soft/--tint/--ink are color-mix() expressions referencing var(--surface)
 * and var(--text), so they re-resolve on their own when the theme flips.
 */
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
 * Paper tones for the notes on the board.
 *
 * Purely decorative: the PIN carries the state colour, so the paper is free to
 * vary per task and make the wall look physical. It must never be what tells
 * the states apart. All five are light, because a note is paper on cork in both
 * themes - it does not flip with the theme, and the note ink is fixed to match.
 */
const NOTE_PAPERS = ["#fdf3bf", "#fde3c4", "#e4f2d4", "#dbeaf8", "#f3e4f7"];

/**
 * Tilt in degrees, derived from the id rather than drawn at random.
 *
 * The board re-renders on every task:changed and status:changed socket event,
 * so a random angle would make every note on the wall twitch each time anyone
 * changed their status. Derived from the id, a note keeps its angle for life.
 */
function noteTilt(id: number) {
  return ((id * 37) % 5) - 2;
}

export function noteVars(task: Task): CSSProperties {
  const id = Math.abs(task.id);
  return {
    ...stateVars(task.state),
    "--paper": NOTE_PAPERS[id % NOTE_PAPERS.length],
    "--tilt": `${noteTilt(id)}deg`,
  };
}

/**
 * Hues without the yellow-lime band (40-110), ordered so consecutive ids land
 * far apart. At S 55% / L 32% with white text the worst case (cyan 168) gives
 * 4.7:1 -> AA. Do not raise the lightness: at 36% it drops to 3.8:1.
 */
const AVATAR_HUES = [231, 350, 168, 292, 24, 200, 322, 145, 262, 12];

export function participantColor(id: number) {
  return `hsl(${AVATAR_HUES[Math.abs(id) % AVATAR_HUES.length]} 55% 32%)`;
}

/** Board managers move and pin any task; everyone else only their own. */
export function canMoveTask(task: Task, meId?: number, role?: string) {
  if (canManageTasks(role)) return true;
  if (!meId) return false;
  return task.participants.some((participant) => participant.id === meId);
}

/** Days before the cutoff at which the card starts warning. */
export const ARCHIVE_WARNING_DAYS = 3;

/** Whole days left before it is archived. Negative = past the cutoff. */
export function daysUntilArchive(task: Task, now = Date.now()) {
  return Math.ceil((new Date(task.archivesAt).getTime() - now) / 86_400_000);
}
