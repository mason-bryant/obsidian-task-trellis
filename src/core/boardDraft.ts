import { columnOf } from './board.ts';
import { FM, parseBoardConfig, type BoardConfig, type DueNowUnit } from './boardConfig.ts';
import type { FilterGroup, FilterMatch, FilterNode } from './filters.ts';
import { filterFrontmatter } from './filterTree.ts';
import { quickFilterFrontmatter, type QuickDue, type QuickPriority } from './quickFilters.ts';
import { slugify, type ParsedTask } from './taskLine.ts';

/** A column being edited; `originalId` ties it to the column it was, so a rename can retag its tasks. */
export type DraftColumn = { label: string; originalId?: string };
export type DraftFilter = { key: string; condition: 'exists' | 'matches'; values: string[] };
/** A rule as typed: tag or folder values, or a property's key, condition and values. */
export type DraftRule = { kind: 'tags' | 'folders'; values: string[] } | ({ kind: 'property' } & DraftFilter);
export type DraftGroup = { kind: 'group'; match: FilterMatch; items: DraftNode[] };
export type DraftNode = DraftRule | DraftGroup;

/** The rules as edited, for the board or one quick filter. */
export type DraftFilterSet = { filter: DraftGroup };

export type DraftQuickFilter = DraftFilterSet & {
  id: string;
  name: string;
  show: boolean;
  priorities: QuickPriority[];
  labels: string[];
  noLabels: boolean;
  matchSubtasks: boolean;
  due: QuickDue[];
};

/** The board settings form's state: what the user typed, before validation. */
export type BoardDraft = DraftFilterSet & {
  columns: DraftColumn[];
  /** Index into `columns`, or -1 for no Done column. */
  doneIndex: number;
  limitDone: boolean;
  doneLimit: string;
  /** Index into `columns`, or -1 for a No due date row instead of a column. */
  undatedIndex: number;
  limitUndated: boolean;
  undatedLimit: string;
  dueNow: string;
  dueNowUnit: DueNowUnit;
  weekHorizon: string;
  weekStart: number;
  showCompletedDays: string;
  compact: boolean;
  showColumnSelector: boolean;
  sortCompletedSubtasks: boolean;
  hideCompletedSubtasks: boolean;
  overdueBar: boolean;
  openLinks: BoardConfig['openLinks'];
  labelShape: BoardConfig['labelShape'];
  quickFilters: DraftQuickFilter[];
  quickFiltersMenu: boolean;
  quickFiltersVisible: string;
  quickFiltersVisibleMobile: string;
  newTasks: BoardConfig['newTasks'];
  newTasksNote: string;
  newTasksHeading: string;
};

export type DraftResult = {
  frontmatter: Record<string, unknown>;
  errors: string[];
  /** Old column id → new id, for columns that were renamed. */
  renames: Map<string, string>;
  /** Ids of columns that were removed. */
  removed: string[];
};

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function draftFromConfig(config: BoardConfig): BoardDraft {
  return {
    columns: config.columns.map((c) => ({ label: c.label, originalId: c.id })),
    doneIndex: config.columns.findIndex((c) => c.id === config.doneColumn),
    limitDone: config.limitDone,
    doneLimit: String(config.doneLimit),
    undatedIndex: config.columns.findIndex((c) => c.id === config.undatedColumn),
    limitUndated: config.limitUndated,
    undatedLimit: String(config.undatedLimit),
    dueNow: String(config.dueNow),
    dueNowUnit: config.dueNowUnit,
    weekHorizon: String(config.weekHorizon),
    weekStart: config.weekStart,
    showCompletedDays: String(config.showCompletedDays),
    compact: config.compact,
    showColumnSelector: config.showColumnSelector,
    sortCompletedSubtasks: config.sortCompletedSubtasks,
    hideCompletedSubtasks: config.hideCompletedSubtasks,
    overdueBar: config.overdueBar,
    openLinks: config.openLinks,
    labelShape: config.labelShape,
    filter: filterDraft(config.filter),
    quickFiltersMenu: config.quickFiltersMenu,
    quickFiltersVisible: config.quickFiltersVisible?.toString() ?? "",
    quickFiltersVisibleMobile: config.quickFiltersVisibleMobile?.toString() ?? "",
    quickFilters: config.quickFilters.map((f) => ({
      id: f.id, name: f.name, show: f.show, priorities: [...f.priorities], labels: [...f.labels], noLabels: f.noLabels, matchSubtasks: f.matchSubtasks, due: [...f.due], filter: filterDraft(f.filter),
    })),
    newTasks: config.newTasks,
    newTasksNote: config.newTasksNote,
    newTasksHeading: config.newTasksHeading,
  };
}

/** Validates the draft and turns it into board front matter (everything except the slug). */
export function draftToFrontmatter(draft: BoardDraft, original: BoardConfig): DraftResult {
  const errors: string[] = [];

  const columns = draft.columns.map((c) => ({ ...c, label: c.label.trim(), id: slugify(c.label) }));
  if (columns.length === 0) errors.push('Add at least one column.');
  const seen = new Set<string>();
  for (const c of columns) {
    if (!c.id) errors.push(`Column "${c.label || '(empty)'}" needs a name with letters or numbers.`);
    else if (c.id === 'label') errors.push('“Label” is reserved for label tags. Choose another column name.');
    else if (seen.has(c.id)) errors.push(`Two columns are both named "${c.label}".`);
    seen.add(c.id);
  }

  const renames = new Map<string, string>();
  for (const c of columns) if (c.originalId && c.id && c.id !== c.originalId) renames.set(c.originalId, c.id);
  const kept = new Set(columns.flatMap((c) => (c.originalId ? [c.originalId] : [])));
  const removed = original.columns.map((c) => c.id).filter((id) => !kept.has(id));

  const rules = filterFrontmatter(filterFromDraft(draft.filter, '', errors));
  const quickFilters = draft.quickFilters.map((q, i) => {
    const name = q.name.trim();
    if (!name) errors.push(`Quick filter ${i + 1} needs a name.`);
    return quickFilterFrontmatter(
      { id: q.id, name, show: q.show, priorities: q.priorities, labels: q.labels, noLabels: q.noLabels, matchSubtasks: q.matchSubtasks, due: q.due },
      filterFrontmatter(filterFromDraft(q.filter, `Quick filter ${i + 1}`, errors)));
  });

  if (draft.newTasks === 'note' && !draft.newTasksNote.trim()) errors.push('Choose the note new tasks go to.');

  const done = columns[draft.doneIndex];
  const undated = columns[draft.undatedIndex];
  if (undated && draft.undatedIndex === draft.doneIndex) errors.push('Done and No due date can’t be the same column.');
  else if (undated && columns.length - (done ? 1 : 0) < 2) errors.push('The No due date column needs another column beside it, other than Done.');
  const frontmatter: Record<string, unknown> = {
    [FM.columns]: columns.map((c) => c.label),
    [FM.doneColumn]: done ? done.label : '',
    [FM.limitDone]: draft.limitDone,
    [FM.doneLimit]: intField('Completed cards per row', draft.doneLimit, 1, 100, errors),
    [FM.undatedColumn]: undated ? undated.label : '',
    [FM.limitUndated]: draft.limitUndated,
    [FM.undatedLimit]: intField('Cards without a due date', draft.undatedLimit, 1, 500, errors),
    [FM.dueNow]:
      draft.dueNowUnit === 'weeks'
        ? intField('Due now window', draft.dueNow, 1, 52, errors)
        : intField('Due now window', draft.dueNow, 0, 365, errors),
    [FM.dueNowUnit]: draft.dueNowUnit,
    [FM.weekHorizon]: intField('Week rows', draft.weekHorizon, 0, 52, errors),
    [FM.weekStart]: (WEEKDAY_NAMES[draft.weekStart] ?? 'Monday').toLowerCase(),
    ...rules,
    [FM.quickFilters]: quickFilters,
    [FM.quickFiltersMenu]: draft.quickFiltersMenu,
    [FM.quickFiltersVisible]: optionalCountField("Filters to keep visible", draft.quickFiltersVisible, errors),
    [FM.quickFiltersVisibleMobile]: optionalCountField("Filters to keep visible in single-column view", draft.quickFiltersVisibleMobile, errors),
    [FM.showCompletedDays]: intField('Show completed', draft.showCompletedDays, 0, 3650, errors),
    [FM.compact]: draft.compact,
    [FM.showColumnSelector]: draft.showColumnSelector,
    [FM.sortCompletedSubtasks]: draft.sortCompletedSubtasks,
    [FM.hideCompletedSubtasks]: draft.hideCompletedSubtasks,
    [FM.overdueBar]: draft.overdueBar,
    [FM.openLinks]: draft.openLinks,
    [FM.labelShape]: draft.labelShape,
    [FM.newTasks]: draft.newTasks,
    [FM.newTasksNote]: draft.newTasks === 'note' ? draft.newTasksNote.trim() : '',
    [FM.newTasksHeading]: draft.newTasks === 'default' ? '' : draft.newTasksHeading.trim(),
  };
  return { frontmatter, errors, renames, removed };
}

/** True when saving the draft would change the board note (opening and closing the form writes nothing). */
export function draftChanged(draft: BoardDraft, original: BoardConfig): boolean {
  return Object.keys(changedFrontmatter(draft, original)).length > 0;
}

/**
 * Only the settings edited in the form, so a save doesn't overwrite what changed in the note while
 * it was open, such as a toolbar toggle or a Properties edit.
 */
export function changedFrontmatter(draft: BoardDraft, original: BoardConfig): Record<string, unknown> {
  const before = draftToFrontmatter(draftFromConfig(original), original).frontmatter;
  return Object.fromEntries(Object.entries(draftToFrontmatter(draft, original).frontmatter)
    .filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(before[key])));
}

/** Keeps roughly the same window when the unit changes: 7 days ↔ 1 week. */
export function convertDueNow(value: string, to: DueNowUnit): string {
  const n = Number(value.trim());
  if (!Number.isFinite(n)) return to === 'weeks' ? '1' : '7';
  return String(to === 'weeks' ? Math.max(1, Math.round(n / 7)) : Math.round(n * 7));
}

function intField(name: string, raw: string, min: number, max: number, errors: string[]): number {
  const n = Number(raw.trim());
  if (raw.trim() === '' || !Number.isInteger(n) || n < min || n > max) {
    errors.push(`${name} must be a whole number from ${min} to ${max}.`);
    return min;
  }
  return n;
}

function cleanTag(tag: string): string {
  return tag.replace(/^#/, '').replace(/\/+$/, '');
}

function cleanFolder(folder: string): string {
  return folder.replace(/^\/+|\/+$/g, '');
}

function filterDraft(group: FilterGroup): DraftGroup {
  return { kind: 'group', match: group.match, items: group.items.map((item): DraftNode => {
    if (item.kind === 'group') return filterDraft(item);
    if (item.kind === 'property') return { kind: 'property', key: item.key, condition: item.values.length ? 'matches' : 'exists', values: [...item.values] };
    return { kind: item.kind, values: [...item.values] };
  }) };
}

/** Where an item is in its group, counting from 1 at each level: filter 2.1 is the first filter in the second item. */
export function filterItemName(item: DraftNode, path: number[]): string {
  return `${item.kind === 'group' ? 'group' : 'filter'} ${path.map((i) => i + 1).join('.')}`;
}

/**
 * The filters to save. Each unfinished property filter is an error, named by its place, such as
 * “Filter 2.1: Add at least one value to match.”, after `label` for a quick filter's.
 */
export function filterFromDraft(group: DraftGroup, label: string, errors: string[], path: number[] = []): FilterGroup {
  return { kind: 'group', match: group.match, items: group.items.map((item, i): FilterNode => {
    const at = [...path, i];
    if (item.kind === 'group') return filterFromDraft(item, label, errors, at);
    if (item.kind === 'property') {
      const error = filterError(item);
      const name = filterItemName(item, at);
      if (error) errors.push(`${label ? `${label}, ${name}` : name.charAt(0).toUpperCase() + name.slice(1)}: ${error}`);
      return { kind: 'property', key: item.key.trim(), values: item.condition === 'exists' ? [] : item.values.map((v) => v.trim()).filter(Boolean) };
    }
    return { kind: item.kind, values: item.values.map((v) => (item.kind === 'tags' ? cleanTag : cleanFolder)(v.trim())).filter(Boolean) };
  }) };
}

export function filterError(rule: DraftFilter): string | null {
  if (!rule.key.trim()) return 'Enter a property name or remove this filter.';
  if (rule.condition === 'matches' && !rule.values.some((v) => v.trim())) return 'Add at least one value to match.';
  return null;
}

/**
 * Conflicts are warnings; repeated and partially overlapping rules remain valid. A property that every
 * match needs, while a None group beside it excludes any note that has it, can't be satisfied.
 */
export function filterWarnings(draft: DraftFilterSet): string[] {
  const root = draft.filter;
  if (root.match !== 'all') return [];
  const keys = (items: DraftNode[], exists: boolean) => items.flatMap((item) =>
    item.kind === 'property' && (!exists || item.condition === 'exists') ? [item.key.trim()] : []).filter(Boolean);
  const excludesExistence = new Set(root.items.flatMap((item) => item.kind === 'group' && item.match === 'none' ? keys(item.items, true) : []));
  return [...new Set(keys(root.items, false).filter((key) => excludesExistence.has(key)))]
    .map((key) => `“${key}” is required and its existence is excluded. No note can satisfy both rules.`);
}

/**
 * Where the open tasks shown in each column the draft removes will show once it's saved. Removing
 * a column leaves their tags alone, so the saved board places them as it places any tag for a
 * missing column: in the first workflow column, or the No due date column when they have no date.
 * Tasks the column's tag doesn't hold there, such as undated ones in a No due date column, don't move.
 */
export function removedColumnNotes(draft: BoardDraft, original: BoardConfig, tagged: (columnId: string) => ParsedTask[]): string[] {
  const { frontmatter, removed } = draftToFrontmatter(draft, original);
  if (!removed.length) return [];
  const config = parseBoardConfig(original.name, { slug: original.slug, ...frontmatter }).config;
  const label = (id: string) => config.columns.find((c) => c.id === id)?.label ?? id;
  return removed.flatMap((id) => {
    const counts = new Map<string, number>();
    for (const task of tagged(id)) {
      if (task.closed || columnOf(task, original) !== id) continue;
      const to = columnOf(task, config);
      if (to !== id) counts.set(to, (counts.get(to) ?? 0) + 1);
    }
    if (!counts.size) return [];
    const undatedLast = [...counts].sort(([a], [b]) => Number(a === config.undatedColumn) - Number(b === config.undatedColumn));
    const parts = undatedLast.map(([to, n], i) => {
      const undated = to === config.undatedColumn ? ' without a due date' : '';
      return i === 0 ? `${n} open ${n === 1 ? 'task' : 'tasks'}${undated} will show in ${label(to)}` : `${n}${undated} in ${label(to)}`;
    });
    const name = original.columns.find((c) => c.id === id)?.label ?? id;
    return [`Removing ${name}: ${parts.join(', and ')}. Their tags aren’t changed, so adding ${name} back returns them.`];
  });
}

function optionalCountField(name: string, raw: string, errors: string[]): number | null {
  if (!raw.trim()) return null;
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < 0) { errors.push(`${name} must be a whole number of 0 or more, or blank.`); return null; }
  return n;
}
