import { workflowColumnOf, type BoardModel, type BoardTask, type TaskEdit } from './board.ts';
import { SORT_STEP } from './sort.ts';

/** Undated cards go after dated ones. */
const NO_DATE = '￿';

/**
 * Puts every dated row's cells in due-date order, sooner first, moving as few cards as possible.
 * Each cell keeps its longest run of cards already in order where they are; only the others get a
 * new order number, or lose it when they belong among the unnumbered cards at the end, which the
 * board already orders by date. Same-date cards keep their order. Done keeps its newest-completed
 * order, and the No due date row has nothing to sort. Only this board's placement tags change.
 */
export function planDueDateSort(model: BoardModel): Map<string, TaskEdit> {
  const { config } = model;
  const edits = new Map<string, TaskEdit>();
  for (const row of model.rows) {
    if (row.kind === 'none') continue;
    for (const column of config.columns) {
      if (column.id === config.doneColumn) continue;
      for (const [task, sort] of sortCell(model.cells[row.id]?.[column.id] ?? [], config.slug)) {
        edits.set(task.id, sort === undefined ? { column: workflowColumnOf(task, config) } : { column: workflowColumnOf(task, config), sort });
      }
    }
  }
  return edits;
}

/** The cards in one cell that need a new order number, or none (`undefined`), in display order. */
function sortCell(cell: BoardTask[], slug: string): Array<[BoardTask, number | undefined]> {
  const keys = cell.map((task) => task.dueDate ?? NO_DATE);
  const kept = longestOrderedRun(keys);
  if (kept.size === cell.length) return [];
  // The finished order: by date, and otherwise as they are now. Kept cards stay in their order.
  const order = cell.map((_, i) => i).sort((a, b) => (keys[a]! < keys[b]! ? -1 : keys[a]! > keys[b]! ? 1 : a - b));
  const rankOf = (i: number) => cell[i]!.placements[slug]?.sort;
  // A numbered card must come before the first kept numbered card after it; past the last one,
  // a moved card can go unnumbered, since unnumbered cards follow numbered ones, in date order.
  let lastNumbered = -1;
  order.forEach((i, at) => { if (kept.has(i) && rankOf(i) !== undefined) lastNumbered = at; });

  const changes: Array<[BoardTask, number | undefined]> = [];
  let previous = 0;
  for (let at = 0; at < order.length;) {
    const i = order[at]!;
    if (kept.has(i)) { previous = rankOf(i) ?? previous; at++; continue; }
    if (at > lastNumbered) {
      if (rankOf(i) !== undefined) changes.push([cell[i]!, undefined]);
      at++; continue;
    }
    // A run of moved cards before the next kept numbered card shares the gap below its number.
    let end = at;
    while (!kept.has(order[end]!)) end++;
    const next = rankOf(order[end]!)!;
    const step = Math.floor((next - previous) / (end - at + 1));
    if (step < 1) return renumber(cell, order, lastNumbered, rankOf);
    for (let j = at; j < end; j++) { previous += step; changes.push([cell[order[j]!]!, previous]); }
    at = end;
  }
  return changes;
}

/** Hand-edited numbers can leave no room between neighbours; then number the cell afresh. */
function renumber(cell: BoardTask[], order: number[], lastNumbered: number, rankOf: (i: number) => number | undefined): Array<[BoardTask, number | undefined]> {
  return order.flatMap((i, at): Array<[BoardTask, number | undefined]> => {
    const rank = at <= lastNumbered ? SORT_STEP * (at + 1) : undefined;
    return rankOf(i) === rank ? [] : [[cell[i]!, rank]];
  });
}

/**
 * The positions of a longest run of keys in non-decreasing order (patience sorting, O(n log n)).
 * Ties count as in order, so same-date cards never need to move.
 */
export function longestOrderedRun(keys: string[]): Set<number> {
  const tails: number[] = [];
  const previous: number[] = [];
  keys.forEach((key, i) => {
    // The first run end whose key is greater than this one; equal keys extend a run.
    let low = 0, high = tails.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (keys[tails[mid]!]! <= key) low = mid + 1; else high = mid;
    }
    previous[i] = low > 0 ? tails[low - 1]! : -1;
    tails[low] = i;
  });
  const run = new Set<number>();
  for (let i = tails.length ? tails[tails.length - 1]! : -1; i >= 0; i = previous[i]!) run.add(i);
  return run;
}
