import type { BoardTask } from './board.ts';
import type { QuickFilter } from './quickFilters.ts';

/** Presentation metadata only: no task, placement or saved collapse preference is changed. */
export type QuickFilterContext = {
  contextOnly: Set<string>;
  matches: Set<string>;
  branches: Set<string>;
  filteredParents: Set<string>;
  /** Ancestors outside the board are headings, never editable cards. */
  parents: Record<string, BoardTask[]>;
};

/** Filter existing board families, preserving the board's inclusion rules and normal placement. */
export function filterTaskFamilies(
  cards: BoardTask[], subtasks: Record<string, BoardTask[]>, byId: Map<string, BoardTask>,
  filters: QuickFilter[], matches: (task: BoardTask, filter: QuickFilter) => boolean,
  isShown: (task: BoardTask) => boolean,
): { keep: Set<string>; context: QuickFilterContext } {
  const context: QuickFilterContext = {
    contextOnly: new Set(), matches: new Set(), branches: new Set(), filteredParents: new Set(), parents: {},
  };
  const keep = new Set<string>();
  const canMatchSubtasks = filters.some((f) => f.matchSubtasks);
  for (const card of cards) {
    const parentMatches = filters.map((filter) => !card.parentId && matches(card, filter));
    const direct = parentMatches.every(Boolean);
    const familyBranches = new Set<string>();
    // Every enabled filter must match the parent or the SAME descendant. Never mix siblings.
    const pending = canMatchSubtasks ? [card] : [];
    const visited = new Set<string>();
    while (pending.length) {
      const child = pending.pop()!;
      if (visited.has(child.id)) continue;
      visited.add(child.id);
      pending.push(...subtasks[child.id] ?? []);
      if (!child.parentId || !isShown(child) || !filters.some((filter) => filter.matchSubtasks && matches(child, filter)) || !filters.every((filter, i) =>
        parentMatches[i] || (filter.matchSubtasks && matches(child, filter)))) continue;
      context.matches.add(child.id);
      let ancestor: BoardTask | undefined = child;
      const seen = new Set<string>();
      while (ancestor && !seen.has(ancestor.id)) {
        seen.add(ancestor.id); familyBranches.add(ancestor.id);
        if (ancestor.id === card.id) break;
        ancestor = ancestor.parentId ? byId.get(ancestor.parentId) : undefined;
      }
    }
    if (!direct && !familyBranches.size) continue;
    keep.add(card.id);
    if (!direct && !context.matches.has(card.id)) context.contextOnly.add(card.id);
    for (const id of familyBranches) {
      context.branches.add(id);
      if (!direct) context.filteredParents.add(id);
    }
    const ancestors: BoardTask[] = [];
    let parent = card.parentId ? byId.get(card.parentId) : undefined;
    const seen = new Set([card.id]);
    while (parent && !seen.has(parent.id)) {
      seen.add(parent.id); ancestors.unshift(parent);
      parent = parent.parentId ? byId.get(parent.parentId) : undefined;
    }
    if (ancestors.length) context.parents[card.id] = ancestors;
  }
  return { keep, context };
}
