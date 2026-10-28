import { columnOf, type BoardModel, type BoardTask } from './board.ts';
import type { BoardConfig, NewTaskDestination } from './boardConfig.ts';
import { isISODate, type ISODate } from './dates.ts';
import { taskLabels } from './labels.ts';
import { PRIORITY_EMOJI, type Priority } from './taskLine.ts';

/** Options as the Obsidian CLI passes them: `key=value`, or `'true'` for a bare flag. */
export type CliParams = Record<string, string>;

/** A trimmed option, undefined when it wasn't given. */
export function option(params: CliParams, key: string): string | undefined {
  return params[key]?.trim();
}

export function requiredOption(params: CliParams, key: string): string {
  const value = option(params, key);
  if (!value) throw new Error(`Specify ${key}.`);
  return value;
}

/** A bare flag, or `key=true` / `key=false`. */
export function flagOption(params: CliParams, key: string, fallback = false): boolean {
  const value = option(params, key);
  if (value === undefined) return fallback;
  if (value === 'true' || value === '') return true;
  if (value === 'false') return false;
  throw new Error(`${key} must be true or false.`);
}

/** A comma-separated list; empty when given as `key=`. */
export function listOption(params: CliParams, key: string): string[] | undefined {
  const value = option(params, key);
  if (value === undefined) return undefined;
  return value.split(',').map((v) => v.trim()).filter(Boolean);
}

/** `YYYY-MM-DD`; empty or `none` clears the date. */
export function dateOption(params: CliParams, key: string): ISODate | null | undefined {
  const value = option(params, key);
  if (value === undefined) return undefined;
  if (value === '' || value === 'none') return null;
  if (!isISODate(value) || new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) !== value) {
    throw new Error(`${key} must be a date in YYYY-MM-DD format, or none.`);
  }
  return value;
}

const PRIORITIES = Object.keys(PRIORITY_EMOJI) as Priority[];

/** A priority name; empty or `none` clears it. */
export function priorityOption(params: CliParams, key: string): Priority | null | undefined {
  const value = option(params, key)?.toLowerCase();
  if (value === undefined) return undefined;
  if (value === '' || value === 'none') return null;
  if (!PRIORITIES.includes(value as Priority)) throw new Error(`${key} must be one of ${PRIORITIES.join(', ')} or none.`);
  return value as Priority;
}

/** A JSON array of strings, such as `["Buy paint","Tape the edges"]`. */
export function jsonListOption(params: CliParams, key: string): string[] | undefined {
  const value = option(params, key);
  if (value === undefined) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${key} must be a JSON array of strings, such as ["First","Second"].`);
  }
  if (!Array.isArray(parsed) || parsed.some((v) => typeof v !== 'string' || !v.trim())) {
    throw new Error(`${key} must be a JSON array of non-empty strings.`);
  }
  return parsed as string[];
}

export type Position = { kind: 'top' } | { kind: 'bottom' } | { kind: 'before' | 'after'; id: string };

/** `top`, `bottom` (the default), `before:<id>` or `after:<id>`. */
export function positionOption(params: CliParams): Position {
  const value = option(params, 'position');
  if (!value || value === 'bottom') return { kind: 'bottom' };
  if (value === 'top') return { kind: 'top' };
  const m = /^(before|after):(.+)$/.exec(value);
  if (!m) throw new Error('position must be top, bottom, before:<id> or after:<id>.');
  return { kind: m[1] as 'before' | 'after', id: m[2]!.trim() };
}

/** Where `position` puts a card among `cards`, the target cell without the card being moved. */
export function positionIndex(position: Position, cards: BoardTask[]): number {
  if (position.kind === 'top') return 0;
  if (position.kind === 'bottom') return cards.length;
  const at = cards.findIndex((t) => t.id === position.id);
  if (at < 0) throw new Error(`${position.id} is not in the target cell; position must name a card there.`);
  return position.kind === 'before' ? at : at + 1;
}

/** One item by id, or by name ignoring case; for columns, labels, rows and quick filters. */
function pick<T extends { id: string }>(items: T[], value: string, nameOf: (item: T) => string, kind: string): T {
  const byId = items.filter((item) => item.id === value);
  const matches = byId.length ? byId : items.filter((item) => nameOf(item).toLowerCase() === value.toLowerCase());
  if (matches.length === 1) return matches[0]!;
  const known = items.map((item) => item.id).join(', ') || 'none';
  throw new Error(`${matches.length ? 'Ambiguous' : 'Unknown'} ${kind}: ${value}. This board has: ${known}.`);
}

export function resolveColumn(config: BoardConfig, value: string): string {
  return pick(config.columns, value, (c) => c.label, 'column').id;
}

export function resolveLabels(config: BoardConfig, values: string[]): string[] {
  return [...new Set(values.map((v) => pick(config.labels, v, (l) => l.name, 'label').id))];
}

/** Only filters shown on the toolbar: the board never applies a hidden one. */
export function resolveQuickFilters(config: BoardConfig, values: string[]): string[] {
  return [...new Set(values.map((v) => {
    const filter = pick(config.quickFilters, v, (f) => f.name, 'quick filter');
    if (!filter.show) throw new Error(`The ${filter.name} quick filter is hidden from the board’s toolbar, so it can’t be applied. Show it in the board’s settings first.`);
    return filter.id;
  }))];
}

export function resolveRow(model: BoardModel, value: string): string {
  return pick(model.rows, value, (r) => r.label, 'row').id;
}

export type TaskJson = {
  id: string;
  text: string;
  /** The line as last read; pass it back as `expect` to guard a write. */
  raw: string;
  path: string;
  /** Zero-based, like the line part of `id`. */
  line: number;
  closed: boolean;
  due: ISODate | null;
  priority: Priority | null;
  /** The task's own tags, without Task Trellis placement and label tags. */
  tags: string[];
  subtasks: TaskJson[];
};

export type LabelJson = { id: string; name: string; color: string };
export type CardJson = TaskJson & { row: string; column: string; labels: LabelJson[] };

export function taskJson(task: BoardTask, subtasksOf: (task: BoardTask) => BoardTask[]): TaskJson {
  return {
    id: task.id,
    text: task.text,
    raw: task.raw,
    path: task.path,
    line: task.line,
    closed: task.closed,
    due: task.dueDate ?? null,
    priority: task.priority ?? null,
    tags: task.tags.filter((tag) => !tag.startsWith('tt/')),
    subtasks: subtasksOf(task).map((sub) => taskJson(sub, subtasksOf)),
  };
}

export function labelsJson(task: BoardTask, config: BoardConfig): LabelJson[] {
  return taskLabels(task.raw, config.slug).map((id) => {
    const label = config.labels.find((l) => l.id === id);
    return { id, name: label?.name ?? '', color: label?.color ?? '' };
  });
}

/** The board's cards in display order: row by row, then column by column. */
export function cardsJson(model: BoardModel): CardJson[] {
  const subtasksOf = (task: BoardTask) => model.subtasks[task.id] ?? [];
  return model.rows.flatMap((row) => model.columns.flatMap((column) =>
    (model.cells[row.id]?.[column.id] ?? []).map((task) => ({
      ...taskJson(task, subtasksOf),
      row: row.id,
      column: columnOf(task, model.config),
      labels: labelsJson(task, model.config),
    }))));
}

export function boardJson(path: string, config: BoardConfig, newTasks: NewTaskDestination, warnings: string[]) {
  return {
    slug: config.slug,
    name: config.name,
    path,
    columns: config.columns,
    doneColumn: config.doneColumn,
    undatedColumn: config.undatedColumn,
    labels: config.labels,
    quickFilters: config.quickFilters.filter((f) => f.show).map((f) => ({ id: f.id, name: f.name })),
    newTasks,
    ...(warnings.length ? { warnings } : {}),
  };
}

/** `format=text`: one `key: value` per line, nested by indentation, lists as `-` items. */
export function plainText(value: unknown, indent = ''): string {
  if (Array.isArray(value)) {
    if (!value.length) return `${indent}(none)`;
    return value.map((item) => {
      if (item === null || typeof item !== 'object') return `${indent}- ${scalar(item)}`;
      const body = plainText(item, `${indent}  `);
      return `${indent}- ${body.slice(indent.length + 2)}`;
    }).join('\n');
  }
  if (value === null || typeof value !== 'object') return `${indent}${scalar(value)}`;
  return Object.entries(value).filter(([, v]) => v !== undefined).map(([key, v]) =>
    v !== null && typeof v === 'object' && (!Array.isArray(v) || v.length)
      ? `${indent}${key}:\n${plainText(v, `${indent}  `)}`
      : `${indent}${key}: ${Array.isArray(v) ? '(none)' : scalar(v)}`).join('\n');
}

function scalar(value: unknown): string {
  if (value === null) return 'none';
  return typeof value === 'string' ? value : JSON.stringify(value);
}
