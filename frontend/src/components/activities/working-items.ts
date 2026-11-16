/** An item declared on someone's open Working segment, as /activities/me and /team send it. */
export type WorkingItem = {
  /** null once the item was deleted from the checklist. */
  id: number | null;
  text: string;
  /** Ticked off while the segment is still open on it. */
  done: boolean;
};

/** The declared items still worth carrying over: not ticked, not deleted. */
export function pendingItemIds(items: WorkingItem[] | undefined): number[] {
  return (items ?? []).flatMap((item) => (item.id != null && !item.done ? [item.id] : []));
}
