/** Apply a bulk subtask choice without changing row state or another board's settings. */
export function setSubtaskCollapse(
  current: Record<string, boolean>, keys: string[], collapsed: boolean,
): Record<string, boolean> {
  const next = { ...current };
  for (const key of keys) {
    if (!key.startsWith('sub:')) continue;
    if (collapsed) next[key] = true;
    else delete next[key]; // Subtask lists default to expanded.
  }
  return next;
}

/** Switched-on quick filters live in the board's view state as `quick:<id>`, so a board rename carries them. */
export function activeQuickFilterIds(current: Record<string, boolean>): string[] {
  return Object.keys(current).filter((key) => key.startsWith('quick:') && current[key]).map((key) => key.slice('quick:'.length));
}

export function setActiveQuickFilterIds(current: Record<string, boolean>, ids: string[]): Record<string, boolean> {
  const next = Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith('quick:')));
  for (const id of ids) next[`quick:${id}`] = true;
  return next;
}
