import type { CSSProperties } from "react";

/**
 * The shared look of a pinned paper note.
 *
 * Used by the task board and by the dashboard's team panel. It lives here rather
 * than in tasks/types.ts because the employee notes are not tasks, and a second
 * copy of the palette would drift the moment one of them was tweaked.
 */

/**
 * Paper tones.
 *
 * Purely decorative: the PIN carries the meaning - task state on the board,
 * activity status on the team panel - so the paper is free to vary per item and
 * make the wall look physical. It must never be the thing that distinguishes
 * one state from another.
 *
 * All five are light, because a note is paper on cork in both themes. It does
 * not flip with the theme, which is why the note ink is fixed in CSS rather than
 * taken from the theme tokens.
 */
export const NOTE_PAPERS = ["#fdf3bf", "#fde3c4", "#e4f2d4", "#dbeaf8", "#f3e4f7"];

/**
 * Tilt in degrees, derived from an id rather than drawn at random.
 *
 * Both walls re-render on socket events - every task:changed, every
 * status:changed - so a random angle would make every note twitch each time
 * anybody did anything. Derived from the id, a note keeps its angle for life.
 */
export function noteTilt(id: number) {
  return ((id * 37) % 5) - 2;
}

/** The paper and tilt custom properties for one note. */
export function paperVars(id: number): CSSProperties {
  const safe = Math.abs(id);
  return {
    "--paper": NOTE_PAPERS[safe % NOTE_PAPERS.length],
    "--tilt": `${noteTilt(safe)}deg`,
  };
}
