import { defaultLabels, parseLabels, type BoardLabel } from './labels.ts';
import { slugify } from './taskLine.ts';

export type BoardColumn = { id: string; label: string };

/** One front matter filter: the note's `key` must hold one of `values` (any value when empty). */
export type PropertyFilter = { key: string; values: string[] };

export type BoardConfig = {
  name: string;
  slug: string;
  columns: BoardColumn[];
  labels: BoardLabel[];
  doneColumn: string | null;
  /** Show at most `doneLimit` cards per Done cell, the rest behind a "more" toggle. */
  limitDone: boolean;
  doneLimit: number;
  /** Column that holds every open task with no due date, in place of the No due date row. */
  undatedColumn: string | null;
  /** Show at most `undatedLimit` cards in that column, the rest behind a "more" toggle. */
  limitUndated: boolean;
  undatedLimit: number;
  /** Due now runs through today + `dueNow` days, or to the end of the `dueNow`-th week (this week is 1). */
  dueNow: number;
  dueNowUnit: DueNowUnit;
  weekHorizon: number;
  /** 0 = Sunday, 1 = Monday. */
  weekStart: number;
  propertyFilters: PropertyFilter[];
  excludedPropertyFilters: PropertyFilter[];
  includeTags: string[];
  excludeTags: string[];
  includeFolders: string[];
  excludeFolders: string[];
  /** 0 hides completed tasks. */
  showCompletedDays: number;
  /** Where tasks added on this board go; `default` uses the plugin setting. */
  newTasks: 'default' | NewTaskKind;
  newTasksNote: string;
  /** Empty adds to the end of the note. */
  newTasksHeading: string;
};

export type NewTaskKind = 'daily' | 'note';

/** A note and the heading new tasks go under. */
export type NewTaskDestination = { kind: NewTaskKind; note: string; heading: string };

/** The board's override, or the plugin's destination when the board uses the default. */
export function destinationFor(config: BoardConfig | null, fallback: NewTaskDestination): NewTaskDestination {
  if (!config || config.newTasks === 'default') return fallback;
  return { kind: config.newTasks, note: config.newTasksNote, heading: config.newTasksHeading };
}

export type DueNowUnit = 'days' | 'weeks';

/** Board note front matter keys. */
export const FM = {
  slug: 'slug',
  labels: 'labels',
  columns: 'columns',
  doneColumn: 'done-column',
  limitDone: 'limit-done',
  doneLimit: 'done-limit',
  undatedColumn: 'undated-column',
  limitUndated: 'limit-undated',
  undatedLimit: 'undated-limit',
  dueNow: 'due-now',
  dueNowUnit: 'due-now-unit',
  weekHorizon: 'week-horizon',
  weekStart: 'week-start',
  filterProperties: 'filter-properties',
  excludeProperties: 'exclude-properties',
  includeTags: 'include-tags',
  excludeTags: 'exclude-tags',
  includeFolders: 'include-folders',
  excludeFolders: 'exclude-folders',
  showCompletedDays: 'show-completed-days',
  newTasks: 'new-tasks',
  newTasksNote: 'new-tasks-note',
  newTasksHeading: 'new-tasks-heading',
} as const;

/** Keys earlier versions wrote; read as fallbacks and removed when the settings form saves. */
export const LEGACY_FM = { dueNowDays: 'due-now-days' } as const;

export const DEFAULT_COLUMNS = ['Backlog', 'Doing', 'Waiting', 'Done'];

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** Front matter for a new board note. */
export function newBoardFrontmatter(slug: string): Record<string, unknown> {
  return {
    [FM.slug]: slug,
    [FM.labels]: defaultLabels(),
    [FM.columns]: [...DEFAULT_COLUMNS],
    [FM.doneColumn]: 'Done',
    [FM.limitDone]: true,
    [FM.doneLimit]: 5,
    [FM.undatedColumn]: '',
    [FM.limitUndated]: true,
    [FM.undatedLimit]: 10,
    [FM.dueNow]: 7,
    [FM.dueNowUnit]: 'days',
    [FM.weekHorizon]: 6,
    [FM.weekStart]: 'monday',
    [FM.filterProperties]: [],
    [FM.excludeProperties]: [],
    [FM.includeTags]: [],
    [FM.excludeTags]: [],
    [FM.includeFolders]: [],
    [FM.excludeFolders]: [],
    [FM.showCompletedDays]: 7,
    [FM.newTasks]: 'default',
  };
}

export function parseBoardConfig(
  name: string,
  fm: Record<string, unknown> | undefined,
): { config: BoardConfig; warnings: string[]; slugMissing: boolean } {
  const warnings: string[] = [];
  const f = fm ?? {};

  const rawSlug = typeof f[FM.slug] === 'string' ? slugify(f[FM.slug] as string) : '';
  const slug = rawSlug || slugify(name) || 'board';

  const columns: BoardColumn[] = [];
  for (const label of stringList(f[FM.columns])) {
    const id = slugify(label);
    if (id === 'label') { warnings.push('"Label" is reserved for label tags. Rename this column.'); continue; }
    if (id && !columns.some((c) => c.id === id)) columns.push({ id, label });
  }
  if (columns.length === 0) {
    if (FM.columns in f) warnings.push('No usable columns listed; showing the default columns.');
    columns.push(...DEFAULT_COLUMNS.map((label) => ({ id: slugify(label), label })));
  }

  let doneColumn: string | null;
  if (FM.doneColumn in f) {
    const raw = f[FM.doneColumn];
    const id = typeof raw === 'string' ? slugify(raw) : '';
    doneColumn = id && columns.some((c) => c.id === id) ? id : null;
    if (id && !doneColumn) warnings.push(`done-column "${String(raw)}" is not one of the columns.`);
  } else {
    doneColumn = columns.some((c) => c.id === 'done') ? 'done' : null;
  }

  const undatedRaw = f[FM.undatedColumn];
  const undatedId = typeof undatedRaw === 'string' ? slugify(undatedRaw) : '';
  let undatedColumn = undatedId && columns.some((c) => c.id === undatedId) ? undatedId : null;
  if (undatedId && !undatedColumn) warnings.push(`undated-column "${String(undatedRaw)}" is not one of the columns.`);
  if (undatedColumn && undatedColumn === doneColumn) {
    warnings.push('undated-column and done-column are the same column; ignoring undated-column.');
    undatedColumn = null;
  }
  if (undatedColumn && columns.every((c) => c.id === undatedColumn || c.id === doneColumn)) {
    warnings.push('undated-column needs another column beside it (other than Done); ignoring it.');
    undatedColumn = null;
  }

  return {
    config: {
      name,
      slug,
      columns,
      labels: parseLabels(f[FM.labels], warnings),
      doneColumn,
      limitDone: boolSetting(f[FM.limitDone], true),
      doneLimit: intSetting(f[FM.doneLimit], 5, 1, 100),
      undatedColumn,
      limitUndated: boolSetting(f[FM.limitUndated], true),
      undatedLimit: intSetting(f[FM.undatedLimit], 10, 1, 500),
      ...dueNowSetting(f, warnings),
      weekHorizon: intSetting(f[FM.weekHorizon], 6, 0, 52),
      weekStart: weekStartSetting(f[FM.weekStart], warnings),
      propertyFilters: propertyFilters(f[FM.filterProperties]),
      excludedPropertyFilters: propertyFilters(f[FM.excludeProperties]),
      includeTags: stringList(f[FM.includeTags]).map(normalizeTag).filter(Boolean),
      excludeTags: stringList(f[FM.excludeTags]).map(normalizeTag).filter(Boolean),
      includeFolders: stringList(f[FM.includeFolders]).map(normalizeFolder).filter(Boolean),
      excludeFolders: stringList(f[FM.excludeFolders]).map(normalizeFolder).filter(Boolean),
      showCompletedDays: intSetting(f[FM.showCompletedDays], 7, 0, 3650),
      newTasks: newTasksSetting(f[FM.newTasks], warnings),
      newTasksNote: typeof f[FM.newTasksNote] === 'string' ? (f[FM.newTasksNote] as string).trim() : '',
      newTasksHeading: typeof f[FM.newTasksHeading] === 'string' ? (f[FM.newTasksHeading] as string).trim() : '',
    },
    warnings,
    slugMissing: !rawSlug,
  };
}

/** List values arrive as YAML lists, or as one comma-separated string from the Properties editor. */
function stringList(raw: unknown): string[] {
  if (raw === undefined || raw === null) return [];
  if (typeof raw === 'object' && !Array.isArray(raw)) return [];
  const items = Array.isArray(raw) ? raw : scalarText(raw).split(',');
  return items
    .filter((v) => v !== null && v !== undefined && typeof v !== 'object')
    .map((v) => String(v).trim())
    .filter((v) => v !== '');
}

/** YAML objects are not valid scalar settings; avoid interpreting them as "[object Object]". */
function scalarText(raw: unknown): string {
  return typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean' ? String(raw) : '<non-scalar value>';
}

function newTasksSetting(raw: unknown, warnings: string[]): BoardConfig['newTasks'] {
  if (raw === undefined || raw === null || raw === '') return 'default';
  const v = scalarText(raw).trim().toLowerCase();
  if (v === 'default' || v === 'daily' || v === 'note') return v;
  warnings.push(`new-tasks "${scalarText(raw)}" should be default, daily or note; using default.`);
  return 'default';
}

function boolSetting(raw: unknown, fallback: boolean): boolean {
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'string' && /^(true|false)$/i.test(raw.trim())) return raw.trim().toLowerCase() === 'true';
  return fallback;
}

function dueNowSetting(f: Record<string, unknown>, warnings: string[]): { dueNow: number; dueNowUnit: DueNowUnit } {
  const rawUnit = f[FM.dueNowUnit];
  let dueNowUnit: DueNowUnit = 'days';
  if (typeof rawUnit === 'string' && /^weeks?$/i.test(rawUnit.trim())) dueNowUnit = 'weeks';
  else if (rawUnit !== undefined && rawUnit !== null && !/^days?$/i.test(scalarText(rawUnit).trim())) {
    warnings.push(`due-now-unit "${scalarText(rawUnit)}" should be days or weeks; using days.`);
  }
  const raw = FM.dueNow in f ? f[FM.dueNow] : f[LEGACY_FM.dueNowDays];
  return {
    dueNowUnit,
    dueNow: dueNowUnit === 'weeks' ? intSetting(raw, 1, 1, 52) : intSetting(raw, 7, 0, 365),
  };
}

function intSetting(raw: unknown, fallback: number, min: number, max: number): number {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() ? Number(raw) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
}

function weekStartSetting(raw: unknown, warnings: string[]): number {
  if (raw === undefined || raw === null || raw === '') return 1;
  const i = WEEKDAYS.indexOf(scalarText(raw).trim().toLowerCase());
  if (i >= 0) return i;
  warnings.push(`week-start "${scalarText(raw)}" is not a weekday; using Monday.`);
  return 1;
}

/** Accepts `["context: house, garden"]` or a YAML mapping `{ context: [house, garden] }`. */
function propertyFilters(raw: unknown): PropertyFilter[] {
  const filters: PropertyFilter[] = [];
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [key, values] of Object.entries(raw as Record<string, unknown>)) {
      if (key.trim()) filters.push({ key: key.trim(), values: stringList(values) });
    }
    return filters;
  }
  const items = Array.isArray(raw) ? raw : raw === undefined || raw === null ? [] : [raw];
  for (const item of items) {
    // Unquoted `- context: house` in YAML arrives as a one-key mapping.
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      filters.push(...propertyFilters(item));
      continue;
    }
    if (typeof item !== 'string') continue;
    const text = unquote(item);
    const colon = text.indexOf(':');
    const key = unquote(colon >= 0 ? text.slice(0, colon) : text);
    const values = colon >= 0 ? stringList(text.slice(colon + 1)).map(unquote).filter(Boolean) : [];
    if (key) filters.push({ key, values });
  }
  return filters;
}

/** The Properties editor stores typed quotes literally, so `"context: house"` keeps its quotes. */
function unquote(text: string): string {
  return text.trim().replace(/^(["'])(.*)\1$/, '$2').trim();
}

function normalizeTag(tag: string): string {
  return tag.replace(/^#/, '').replace(/\/+$/, '').toLowerCase();
}

function normalizeFolder(folder: string): string {
  return folder.replace(/^\/+|\/+$/g, '');
}
