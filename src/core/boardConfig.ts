import { parsePreviousScheme, type PreviousScheme } from './labelSchemes.ts';
import { parseColumnWidths, type ColumnWidths } from './columnWidths.ts';
import { parseLabels, starterLabels, type BoardLabel } from './labels.ts';
import { defaultQuickFilters, parseQuickFilters, quickFilterFrontmatter, type QuickFilter } from './quickFilters.ts';
import { slugify } from './taskLine.ts';
import { normalizeFolder, normalizeTag, propertyFilters, scalarText, stringList } from './frontmatterValues.ts';

export type BoardColumn = { id: string; label: string };

/** One front matter filter: the note's `key` must hold one of `values` (any value when empty). */
export type PropertyFilter = { key: string; values: string[] };

export type BoardConfig = {
  name: string;
  slug: string;
  columns: BoardColumn[];
  columnWidths: ColumnWidths;
  labels: BoardLabel[];
  /** The number the next new label gets; see `newLabelId`. */
  labelNext: number;
  quickFilters: QuickFilter[];
  quickFiltersMenu: boolean;
  quickFiltersVisible: number | null;
  quickFiltersVisibleMobile: number | null;
  previousLabelScheme: PreviousScheme;
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
  /** List completed subtasks after open ones, otherwise in note order. */
  sortCompletedSubtasks: boolean;
  hideCompletedSubtasks: boolean;
  /** The red edge on overdue cards. */
  overdueBar: boolean;
  /** How a card's note and the links in its text open. */
  openLinks: 'popup' | 'tab';
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
  labelNext: 'label-next',
  quickFilters: 'quick-filters',
  quickFiltersMenu: 'quick-filters-menu',
  quickFiltersVisible: 'quick-filters-visible',
  quickFiltersVisibleMobile: 'quick-filters-visible-mobile',
  previousLabelScheme: 'previous-label-scheme',
  columns: 'columns',
  columnWidths: 'column-widths',
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
  sortCompletedSubtasks: 'sort-completed-subtasks',
  hideCompletedSubtasks: 'hide-completed-subtasks',
  overdueBar: 'overdue-bar',
  openLinks: 'open-links',
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
    [FM.labels]: starterLabels(),
    [FM.labelNext]: starterLabels().length + 1,
    [FM.quickFilters]: defaultQuickFilters(starterLabels()).map(quickFilterFrontmatter),
    [FM.columns]: [...DEFAULT_COLUMNS],
    [FM.doneColumn]: 'Done',
    [FM.limitDone]: true,
    [FM.doneLimit]: 5,
    [FM.undatedColumn]: '',
    [FM.limitUndated]: true,
    [FM.undatedLimit]: 10,
    [FM.dueNow]: 7,
    [FM.dueNowUnit]: 'days',
    [FM.weekHorizon]: 2,
    [FM.weekStart]: 'monday',
    [FM.filterProperties]: [],
    [FM.excludeProperties]: [],
    [FM.includeTags]: [],
    [FM.excludeTags]: [],
    [FM.includeFolders]: [],
    [FM.excludeFolders]: [],
    [FM.showCompletedDays]: 7,
    [FM.sortCompletedSubtasks]: false,
    [FM.hideCompletedSubtasks]: false,
    [FM.overdueBar]: true,
    [FM.openLinks]: 'popup',
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
    if (id === 'label') { warnings.push('“Label” is reserved for label tags. Rename this column.'); continue; }
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

  const labels = parseLabels(f[FM.labels], warnings);
  return {
    config: {
      name,
      slug,
      columns,
      columnWidths: parseColumnWidths(f[FM.columnWidths], columns.map((c) => c.id)),
      labels,
      labelNext: intSetting(f[FM.labelNext], 1, 1, 1_000_000),
      quickFilters: parseQuickFilters(f[FM.quickFilters], labels, warnings),
      quickFiltersMenu: boolSetting(f[FM.quickFiltersMenu], false),
      quickFiltersVisible: optionalCount(f[FM.quickFiltersVisible]),
      quickFiltersVisibleMobile: optionalCount(f[FM.quickFiltersVisibleMobile]),
      previousLabelScheme: parsePreviousScheme(f[FM.previousLabelScheme]),
      doneColumn,
      limitDone: boolSetting(f[FM.limitDone], true),
      doneLimit: intSetting(f[FM.doneLimit], 5, 1, 100),
      undatedColumn,
      limitUndated: boolSetting(f[FM.limitUndated], true),
      undatedLimit: intSetting(f[FM.undatedLimit], 10, 1, 500),
      ...dueNowSetting(f, warnings),
      weekHorizon: intSetting(f[FM.weekHorizon], 2, 0, 52),
      weekStart: weekStartSetting(f[FM.weekStart], warnings),
      propertyFilters: propertyFilters(f[FM.filterProperties]),
      excludedPropertyFilters: propertyFilters(f[FM.excludeProperties]),
      includeTags: stringList(f[FM.includeTags]).map(normalizeTag).filter(Boolean),
      excludeTags: stringList(f[FM.excludeTags]).map(normalizeTag).filter(Boolean),
      includeFolders: stringList(f[FM.includeFolders]).map(normalizeFolder).filter(Boolean),
      excludeFolders: stringList(f[FM.excludeFolders]).map(normalizeFolder).filter(Boolean),
      showCompletedDays: intSetting(f[FM.showCompletedDays], 7, 0, 3650),
      sortCompletedSubtasks: boolSetting(f[FM.sortCompletedSubtasks], false),
      hideCompletedSubtasks: boolSetting(f[FM.hideCompletedSubtasks], false),
      overdueBar: boolSetting(f[FM.overdueBar], true),
      openLinks: scalarText(f[FM.openLinks])?.toLowerCase() === 'tab' ? 'tab' : 'popup',
      newTasks: newTasksSetting(f[FM.newTasks], warnings),
      newTasksNote: typeof f[FM.newTasksNote] === 'string' ? (f[FM.newTasksNote] as string).trim() : '',
      newTasksHeading: typeof f[FM.newTasksHeading] === 'string' ? (f[FM.newTasksHeading] as string).trim() : '',
    },
    warnings,
    slugMissing: !rawSlug,
  };
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

function optionalCount(raw: unknown): number | null {
  if (typeof raw !== "number" && typeof raw !== "string") return null;
  if (typeof raw === "string" && !raw.trim()) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}
