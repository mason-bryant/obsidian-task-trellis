import { FM, type BoardConfig, type DueNowUnit } from './boardConfig.ts';
import { slugify } from './taskLine.ts';

/** A column being edited; `originalId` ties it to the column it was, so a rename can retag its tasks. */
export type DraftColumn = { label: string; originalId?: string };
export type DraftFilter = { key: string; values: string };

/** The board settings form's state: what the user typed, before validation. */
export type BoardDraft = {
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
  filters: DraftFilter[];
  includeTags: string;
  excludeTags: string;
  includeFolders: string;
  excludeFolders: string;
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
    filters: config.propertyFilters.map((f) => ({ key: f.key, values: f.values.join(', ') })),
    includeTags: config.includeTags.join(', '),
    excludeTags: config.excludeTags.join(', '),
    includeFolders: config.includeFolders.join('\n'),
    excludeFolders: config.excludeFolders.join('\n'),
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
    else if (seen.has(c.id)) errors.push(`Two columns are both named "${c.label}".`);
    seen.add(c.id);
  }

  const renames = new Map<string, string>();
  for (const c of columns) if (c.originalId && c.id && c.id !== c.originalId) renames.set(c.originalId, c.id);
  const kept = new Set(columns.flatMap((c) => (c.originalId ? [c.originalId] : [])));
  const removed = original.columns.map((c) => c.id).filter((id) => !kept.has(id));

  const filters: string[] = [];
  for (const f of draft.filters) {
    const key = f.key.trim();
    const values = splitList(f.values, ',');
    if (!key) {
      if (values.length > 0) errors.push('A property filter has values but no property name.');
      continue;
    }
    if (key.includes(':')) errors.push(`Property name "${key}" can't contain a colon.`);
    filters.push(values.length > 0 ? `${key}: ${values.join(', ')}` : key);
  }

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
    [FM.filterProperties]: filters,
    [FM.includeTags]: splitList(draft.includeTags, ',').map(cleanTag).filter(Boolean),
    [FM.excludeTags]: splitList(draft.excludeTags, ',').map(cleanTag).filter(Boolean),
    [FM.includeFolders]: splitList(draft.includeFolders, '\n').map(cleanFolder).filter(Boolean),
    [FM.excludeFolders]: splitList(draft.excludeFolders, '\n').map(cleanFolder).filter(Boolean),
    [FM.showCompletedDays]: intField('Show completed', draft.showCompletedDays, 0, 3650, errors),
    [FM.newTasks]: draft.newTasks,
    [FM.newTasksNote]: draft.newTasks === 'note' ? draft.newTasksNote.trim() : '',
    [FM.newTasksHeading]: draft.newTasks === 'default' ? '' : draft.newTasksHeading.trim(),
  };
  return { frontmatter, errors, renames, removed };
}

/** True when saving the draft would change the board note (opening and closing the form writes nothing). */
export function draftChanged(draft: BoardDraft, original: BoardConfig): boolean {
  const before = draftToFrontmatter(draftFromConfig(original), original).frontmatter;
  return JSON.stringify(draftToFrontmatter(draft, original).frontmatter) !== JSON.stringify(before);
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

function splitList(text: string, separator: string): string[] {
  return text
    .split(separator)
    .map((s) => s.trim())
    .filter(Boolean);
}

function cleanTag(tag: string): string {
  return tag.replace(/^#/, '').replace(/\/+$/, '');
}

function cleanFolder(folder: string): string {
  return folder.replace(/^\/+|\/+$/g, '');
}
