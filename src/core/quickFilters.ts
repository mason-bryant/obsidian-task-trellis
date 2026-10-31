import type { BoardConfig } from './boardConfig.ts';
import type { ISODate } from './dates.ts';
import { noFilter, taskMatchesBoard, type FilterSet, type Frontmatter } from './filters.ts';
import { stringList } from './frontmatterValues.ts';
import { FILTER_FM, readFilter } from './filterTree.ts';
import { labelDescription, taskLabels, type BoardLabel } from './labels.ts';
import { dueNowEnd } from './rows.ts';
import { slugify, type ParsedTask, type Priority } from './taskLine.ts';

/** `none` is a task without a priority. */
export type QuickPriority = Priority | 'none';
export type QuickDue = 'overdue' | 'today' | 'due-now' | 'none';

export const QUICK_PRIORITIES: [QuickPriority, string][] = [
  ['highest', 'Highest'], ['high', 'High'], ['medium', 'Medium'], ['none', 'No priority'], ['low', 'Low'], ['lowest', 'Lowest'],
];
export const QUICK_DUES: [QuickDue, string][] = [
  ['overdue', 'Overdue'], ['today', 'Due today'], ['due-now', 'Due now'], ['none', 'No due date'],
];

/**
 * A toolbar toggle that narrows the board. Its own criteria all must match; within one, any listed
 * value can. Its tag, folder and property rules work like the board's.
 */
export type QuickFilter = FilterSet & {
  /** Stable, so the remembered on/off state survives a rename. */
  id: string;
  name: string;
  /** Shown as a toolbar button; a hidden filter is never applied. */
  show: boolean;
  priorities: QuickPriority[];
  /** Board label ids. */
  labels: string[];
  /** Also match tasks with no label assignments for this board. */
  noLabels: boolean;
  /** Allow a subtask to satisfy this filter while keeping its parent as context. */
  matchSubtasks: boolean;
  due: QuickDue[];
};

export const QUICK_FM = {
  id: 'id',
  name: 'name',
  show: 'show',
  priority: 'priority',
  labels: 'labels',
  noLabels: 'no-labels',
  matchSubtasks: 'match-subtasks',
  due: 'due',
  ...FILTER_FM,
} as const;

export function emptyQuickFilter(id: string, name: string): QuickFilter {
  return {
    id, name, show: true, priorities: [], labels: [], noLabels: false, matchSubtasks: false, due: [], filter: noFilter(),
  };
}

/** High priority, Overdue, then the board's first label. */
export function defaultQuickFilters(labels: BoardLabel[]): QuickFilter[] {
  const filters = [
    { ...emptyQuickFilter('high-priority', 'High priority'), priorities: ['highest', 'high'] as QuickPriority[] },
    { ...emptyQuickFilter('overdue', 'Overdue'), due: ['overdue'] as QuickDue[] },
  ];
  const first = labels[0];
  if (first) filters.push({ ...emptyQuickFilter(`label-${first.id}`, `🏷️ ${first.name || labelDescription(first)}`), labels: [first.id] });
  return filters;
}

export function newQuickFilterId(filters: { id: string }[]): string {
  let id: string;
  do { id = `q${crypto.randomUUID().replace(/-/g, '').slice(0, 6)}`; }
  while (filters.some((f) => f.id === id));
  return id;
}

export function parseQuickFilters(raw: unknown, labels: BoardLabel[], warnings: string[]): QuickFilter[] {
  if (raw === undefined) return defaultQuickFilters(labels);
  if (raw === null) return [];
  if (!Array.isArray(raw)) {
    warnings.push('quick-filters must be a list; showing the default quick filters.');
    return defaultQuickFilters(labels);
  }
  const filters: QuickFilter[] = [];
  for (const item of raw as unknown[]) {
    const f = item && typeof item === 'object' && !Array.isArray(item) ? item as Record<string, unknown> : null;
    const name = typeof f?.[QUICK_FM.name] === 'string' ? (f[QUICK_FM.name] as string).trim() : '';
    if (!f || !name) { warnings.push('A quick filter without a name was ignored.'); continue; }
    const rawId = typeof f[QUICK_FM.id] === 'string' ? (f[QUICK_FM.id] as string).trim().toLowerCase() : '';
    let id = /^[a-z0-9_-]+$/.test(rawId) ? rawId : slugify(name) || 'quick';
    for (let n = 2; filters.some((other) => other.id === id); n++) id = `${rawId || slugify(name) || 'quick'}-${n}`;
    const show = f[QUICK_FM.show];
    filters.push({
      id,
      name,
      show: show === false || (typeof show === 'string' && show.trim().toLowerCase() === 'false') ? false : true,
      priorities: known(stringList(f[QUICK_FM.priority]), QUICK_PRIORITIES),
      labels: stringList(f[QUICK_FM.labels]).map((v) => v.toLowerCase()),
      noLabels: f[QUICK_FM.noLabels] === true || (typeof f[QUICK_FM.noLabels] === 'string' && (f[QUICK_FM.noLabels] as string).trim().toLowerCase() === 'true'),
      matchSubtasks: f[QUICK_FM.matchSubtasks] === true || (typeof f[QUICK_FM.matchSubtasks] === 'string' && (f[QUICK_FM.matchSubtasks] as string).trim().toLowerCase() === 'true'),
      due: known(stringList(f[QUICK_FM.due]), QUICK_DUES),
      filter: readFilter(f, warnings, `The ${name} quick filter’s rules`),
    });
  }
  return filters;
}

function known<T extends string>(values: string[], choices: [T, string][]): T[] {
  const ids = choices.map(([id]) => id);
  return [...new Set(values.map((v) => v.toLowerCase().replace(/\s+/g, '-')))].filter((v): v is T => (ids as string[]).includes(v));
}

/** Front matter for one quick filter, with its rules as `filterFrontmatter` writes them; empty criteria are left out. */
export function quickFilterFrontmatter(filter: Omit<QuickFilter, 'filter'>, rules: Record<string, unknown>): Record<string, unknown> {
  const fm: Record<string, unknown> = { [QUICK_FM.id]: filter.id, [QUICK_FM.name]: filter.name, [QUICK_FM.show]: filter.show };
  if (filter.noLabels) fm[QUICK_FM.noLabels] = true;
  if (filter.matchSubtasks) fm[QUICK_FM.matchSubtasks] = true;
  const lists: [string, unknown[]][] = [[QUICK_FM.priority, filter.priorities], [QUICK_FM.labels, filter.labels], [QUICK_FM.due, filter.due]];
  for (const [key, values] of lists) if (values.length) fm[key] = values;
  for (const [key, value] of Object.entries(rules)) if (Array.isArray(value) ? value.length : value !== undefined) fm[key] = value;
  return fm;
}

export function hasCriteria(filter: QuickFilter): boolean {
  return filter.noLabels || filter.filter.items.length > 0 || [filter.priorities, filter.labels, filter.due].some((list: unknown[]) => list.length > 0);
}

/** The board's quick filters that are shown and switched on. */
export function activeQuickFilters(config: BoardConfig, activeIds: string[]): QuickFilter[] {
  return config.quickFilters.filter((f) => f.show && activeIds.includes(f.id));
}

export function taskMatchesQuickFilter(
  task: ParsedTask & { path: string; raw: string },
  filter: QuickFilter,
  config: BoardConfig,
  today: ISODate,
  fm: Frontmatter,
  noteTags: string[] = [],
): boolean {
  if (filter.priorities.length && !filter.priorities.includes(task.priority ?? 'none')) return false;
  if (filter.labels.length || filter.noLabels) {
    const assigned = taskLabels(task.raw, config.slug);
    if (!(filter.noLabels && assigned.length === 0) && !filter.labels.some((id) => assigned.includes(id))) return false;
  }
  if (filter.due.length && !filter.due.some((due) => dueMatches(due, task, config, today))) return false;
  return taskMatchesBoard(task, filter, fm, noteTags);
}

function dueMatches(due: QuickDue, task: ParsedTask, config: BoardConfig, today: ISODate): boolean {
  const date = task.dueDate;
  switch (due) {
    case 'none': return !date;
    case 'overdue': return !!date && !task.closed && date < today;
    case 'today': return date === today;
    case 'due-now': return !!date && date <= dueNowEnd(config, today);
  }
}
