// The reorder plan is adapted from 4D Eisenhower Matrix's manual sort (MIT, Jaroslav Krčál).

export const SORT_STEP = 100;

/**
 * New sort numbers for dropping `dragged` at `index` of `list` (the target cell as displayed,
 * without `dragged`). Numbered cards always precede unnumbered ones. Usually only `dragged`
 * changes (midpoint of its neighbours); when there is no gap, or it lands among unnumbered
 * cards, the cell is renumbered in steps of SORT_STEP up to the last numbered card.
 */
export function planReorder<T>(
  list: T[],
  dragged: T,
  index: number,
  sortOf: (item: T) => number | undefined,
): Map<T, number> {
  const prev = list[index - 1];
  const next = list[index];
  const prevSort = prev === undefined ? undefined : sortOf(prev);
  if (prev === undefined || prevSort !== undefined) {
    const lo = prevSort ?? 0;
    const hi = next === undefined ? undefined : sortOf(next);
    if (hi === undefined) return new Map([[dragged, lo + SORT_STEP]]);
    if (hi - lo >= 2) return new Map([[dragged, Math.floor((lo + hi) / 2)]]);
  }

  const ordered = [...list.slice(0, index), dragged, ...list.slice(index)];
  let last = index;
  ordered.forEach((item, i) => {
    if (sortOf(item) !== undefined) last = Math.max(last, i);
  });
  const changes = new Map<T, number>();
  for (let i = 0; i <= last; i++) {
    const item = ordered[i]!;
    const value = (i + 1) * SORT_STEP;
    if (item === dragged || sortOf(item) !== value) changes.set(item, value);
  }
  return changes;
}
