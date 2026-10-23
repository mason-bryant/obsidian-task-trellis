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
