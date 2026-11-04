import { fold } from "./checklistFilter";

/**
 * Checklist labels: an optional free-text group per item ("Cinematic", "UI"...).
 * Items sharing one are shown together in a box.
 *
 * Two spellings of the same word are the same label - "Cinemática" and
 * "cinematica" land in one box - so labels compare folded (no case, no
 * accents). The box shows the spelling of its first item.
 */

/** null when the item has no label. */
export function labelKey(label: string | null | undefined) {
  const trimmed = label?.trim();
  return trimmed ? fold(trimmed) : null;
}

export type ChecklistBlock<T> =
  | { kind: "item"; item: T }
  | { kind: "group"; key: string; label: string; items: T[] };

/**
 * The list as it is shown: an item without a label stays where it is, and the
 * items of a label are gathered into one block at the place of the first one.
 * The author's order holds inside each block.
 */
export function groupChecklist<T extends { label?: string | null }>(items: T[]): ChecklistBlock<T>[] {
  const blocks: ChecklistBlock<T>[] = [];
  const groups = new Map<string, Extract<ChecklistBlock<T>, { kind: "group" }>>();
  for (const item of items) {
    const key = labelKey(item.label);
    if (!key) {
      blocks.push({ kind: "item", item });
      continue;
    }
    const group = groups.get(key);
    if (group) {
      group.items.push(item);
    } else {
      const created = { kind: "group" as const, key, label: item.label!.trim(), items: [item] };
      groups.set(key, created);
      blocks.push(created);
    }
  }
  return blocks;
}

/** The items in the order the grouped list shows them. */
export function regroupByLabel<T extends { label?: string | null }>(items: T[]): T[] {
  return groupChecklist(items).flatMap((block) => (block.kind === "item" ? [block.item] : block.items));
}

/** Every label in use, first spelling of each, in order of appearance. */
export function labelsOf(items: { label?: string | null }[]) {
  return groupChecklist(items)
    .filter((block) => block.kind === "group")
    .map((block) => (block as { label: string }).label);
}

/** Stable colour per label, so a box keeps its colour across tasks. */
export function labelHue(label: string) {
  const key = labelKey(label) ?? "";
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.codePointAt(0)!) | 0;
  return Math.abs(hash) % 360;
}

// Comma syntax: MUI's alpha() does not parse the space-separated form.
export const labelColor = (label: string) => `hsl(${labelHue(label)}, 60%, 45%)`;
