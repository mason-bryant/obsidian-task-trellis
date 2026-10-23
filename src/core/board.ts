import { diffDays, type ISODate } from './dates.ts';
import type { BoardColumn, BoardConfig } from './boardConfig.ts';
import { taskMatchesBoard, type Frontmatter } from './filters.ts';
import { computeRows, rowForDue, type RowDef } from './rows.ts';
import { planReorder } from './sort.ts';
import { parseTaskLine, priorityRank, setDueDate, setPlacement, type ParsedTask } from './taskLine.ts';

/** A task line found in the vault. `raw` is the line as last read, used to check it before writing. */
export type BoardTask = ParsedTask & {
  id: string;
  path: string;
  line: number;
  raw: string;
  /** Id of the nearest task this one is indented under, if any. */
  parentId?: string;
  /** How many other lines in the note had exactly this text when it was read. */
  twins?: number;
  /** Note snapshot for duplicate lines, whose identity cannot be inferred after the note changes. */
  duplicateSource?: string;
};

export type BoardModel = {
  config: BoardConfig;
  today: ISODate;
  rows: RowDef[];
  columns: BoardColumn[];
  /** rowId → columnId → cards in display order. */
  cells: Record<string, Record<string, BoardTask[]>>;
  /** taskId → rowId, for the cards on the board. */
  rowOf: Record<string, string>;
  /** taskId → its subtasks in note order. Subtasks show inside their parent's card, not in cells. */
  subtasks: Record<string, BoardTask[]>;
  total: number;
};

export type DropTarget = { rowId: string; columnId: string; index: number };

/** Changes to one task line. `column` rewrites this board's placement tag, with `sort` when given. */
export type TaskEdit = {
  due?: ISODate | null;
  column?: string;
  sort?: number;
  closed?: boolean;
};

export function taskId(path: string, line: number): string {
  return `${path}:${line}`;
}

/**
 * Column a task shows in. Closed tasks always show in the Done column, and on a board with a
 * No due date column, other tasks without a due date always show there. Otherwise it's the
 * task's workflow column.
 */
export function columnOf(task: ParsedTask, config: BoardConfig): string {
  if (task.closed && config.doneColumn) return config.doneColumn;
  if (config.undatedColumn && !task.dueDate) return config.undatedColumn;
  return workflowColumnOf(task, config);
}

/**
 * The column a task's tag names, or the first column that isn't Done or No due date: those two
 * follow the task's state, so a tag for one of them (a reopened task, the next occurrence of a
 * recurring one, a task given a date) doesn't hold it there. So does a tag for a removed column.
 */
export function workflowColumnOf(task: ParsedTask, config: BoardConfig): string {
  const stateColumn = (id: string) => id === config.doneColumn || id === config.undatedColumn;
  const first = config.columns.find((c) => !stateColumn(c.id))?.id ?? config.columns[0]!.id;
  const tagged = task.placements[config.slug]?.column;
  if (!tagged || stateColumn(tagged) || !config.columns.some((c) => c.id === tagged)) return first;
  return tagged;
}

export function isOverdue(task: ParsedTask, today: ISODate): boolean {
  return !task.closed && task.dueDate !== undefined && task.dueDate < today;
}

/** Completed tasks show for `showCompletedDays` after their done date; undated ones stay hidden. */
export function isShown(task: ParsedTask, config: BoardConfig, today: ISODate): boolean {
  if (!task.closed) return true;
  if (config.showCompletedDays === 0 || !task.closedDate) return false;
  return diffDays(today, task.closedDate) < config.showCompletedDays;
}

export function buildBoard(
  tasks: BoardTask[],
  config: BoardConfig,
  today: ISODate,
  frontmatterOf: (path: string) => Frontmatter,
): BoardModel {
  const rows = computeRows(config, today);
  const cells: BoardModel['cells'] = {};
  for (const row of rows) {
    cells[row.id] = Object.fromEntries(config.columns.map((c) => [c.id, [] as BoardTask[]]));
  }

  // A task under a parent that is on the board goes with the parent, whatever its own date, column
  // or done date; otherwise it's a card of its own if it passes the board's filters.
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const placement = new Map<string, 'card' | 'subtask' | 'off'>();
  const place = (task: BoardTask): 'card' | 'subtask' | 'off' => {
    const known = placement.get(task.id);
    if (known) return known;
    placement.set(task.id, 'off'); // a cycle reads as "not on the board"
    if (!task.text) return 'off';
    const parent = task.parentId === undefined ? undefined : byId.get(task.parentId);
    let result: 'card' | 'subtask' | 'off' = 'off';
    if (parent && place(parent) !== 'off') result = 'subtask';
    else if (isShown(task, config, today) && taskMatchesBoard(task, config, frontmatterOf(task.path))) result = 'card';
    placement.set(task.id, result);
    return result;
  };

  const nowRow = rows.find((r) => r.kind === 'now')!;
  const rowOf: Record<string, string> = {};
  const subtasks: Record<string, BoardTask[]> = {};
  let total = 0;
  for (const task of tasks) {
    const where = place(task);
    if (where === 'subtask') {
      (subtasks[task.parentId!] ??= []).push(task);
    } else if (where === 'card') {
      const column = columnOf(task, config);
      // The No due date column replaces the No due date row, so undated tasks outside it
      // (completed ones in Done) sit in Due now.
      const row = !task.dueDate && config.undatedColumn && column !== config.undatedColumn ? nowRow : rowForDue(rows, task.dueDate);
      cells[row.id]![column]!.push(task);
      rowOf[task.id] = row.id;
      total++;
    }
  }
  for (const list of Object.values(subtasks)) list.sort((a, b) => a.line - b.line);

  const compare = cardComparator(config.slug);
  const compareDone = doneComparator(compare);
  for (const row of rows) {
    for (const column of config.columns) {
      cells[row.id]![column.id]!.sort(column.id === config.doneColumn ? compareDone : compare);
    }
  }

  return { config, today, rows, columns: config.columns, cells, rowOf, subtasks, total };
}

/** Sort-numbered cards first, then by due date, priority and location. */
export function cardComparator(slug: string): (a: BoardTask, b: BoardTask) => number {
  return (a, b) => {
    const sa = a.placements[slug]?.sort;
    const sb = b.placements[slug]?.sort;
    if (sa !== undefined || sb !== undefined) {
      if (sa === undefined) return 1;
      if (sb === undefined) return -1;
      if (sa !== sb) return sa - sb;
    }
    if (a.dueDate !== b.dueDate) {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate < b.dueDate ? -1 : 1;
    }
    const pr = priorityRank(a.priority) - priorityRank(b.priority);
    if (pr !== 0) return pr;
    return a.path === b.path ? a.line - b.line : a.path < b.path ? -1 : 1;
  };
}

/** The Done column lists the most recently completed first, so a capped list shows the latest. */
export function doneComparator(fallback: (a: BoardTask, b: BoardTask) => number): (a: BoardTask, b: BoardTask) => number {
  return (a, b) => {
    if (a.closedDate !== b.closedDate) {
      if (!a.closedDate) return 1;
      if (!b.closedDate) return -1;
      return a.closedDate > b.closedDate ? -1 : 1;
    }
    return fallback(a, b);
  };
}

/** Key for a Done cell's "more" toggle, stored with the row collapse state. */
export function moreKey(rowId: string): string {
  return `more:${rowId}`;
}

/** Collapse key for a card's subtask list. By text rather than line, so it survives lines moving. */
export function subtasksKey(task: BoardTask): string {
  return `sub:${task.path}:${task.text}`;
}

/**
 * Edits for dropping `draggedId` at `target`. Changing rows sets the row's drop date; moving
 * into or out of the Done column completes or reopens the task; the sort plan may renumber
 * neighbours in the target cell. Done orders by completion date, so a drop there renumbers nothing.
 */
export function planDrop(model: BoardModel, draggedId: string, target: DropTarget): Map<string, TaskEdit> {
  const { config } = model;
  const fromRowId = model.rowOf[draggedId];
  if (fromRowId === undefined) return new Map();
  const dragged = findCard(model, draggedId);
  const targetRow = model.rows.find((r) => r.id === target.rowId);
  const cell = model.cells[target.rowId]?.[target.columnId];
  if (!dragged || !targetRow || !cell) return new Map();

  const fromColumn = columnOf(dragged, config);
  const list = cell.filter((t) => t.id !== draggedId);
  const index = Math.max(0, Math.min(target.index, list.length));
  const sortOf = (t: BoardTask) => t.placements[config.slug]?.sort;

  const edits = new Map<string, TaskEdit>();
  // A card in the No due date column keeps its workflow column in its tag: it goes back there once
  // it has a date, and its arrow sends it there. So does a neighbour that is only renumbered.
  const draggedColumn = target.columnId === config.undatedColumn ? workflowColumnOf(dragged, config) : target.columnId;
  if (target.columnId !== config.doneColumn) {
    for (const [task, sort] of planReorder(list, dragged, index, sortOf)) {
      edits.set(task.id, { column: task === dragged ? draggedColumn : workflowColumnOf(task, config), sort });
    }
  }

  const draggedEdit = edits.get(draggedId) ?? { column: draggedColumn };
  // With a No due date column, an undated task gets a date wherever it lands outside that column,
  // except Done in Due now, where completed undated tasks sit.
  const setsDue =
    config.undatedColumn && !dragged.dueDate
      ? target.rowId !== 'none' && !(target.columnId === config.doneColumn && targetRow.kind === 'now')
      : target.rowId !== fromRowId;
  if (setsDue) draggedEdit.due = targetRow.dropDate;
  if (config.doneColumn) {
    if (target.columnId === config.doneColumn && !dragged.closed) draggedEdit.closed = true;
    if (fromColumn === config.doneColumn && target.columnId !== config.doneColumn && dragged.closed) {
      draggedEdit.closed = false;
    }
  }
  edits.set(draggedId, draggedEdit);
  return edits;
}

/**
 * Where a card's move button sends it, as a drop at the end of its cell: Due now → the next row,
 * any other row → Due now. Completed cards have none.
 */
export function quickMoveTarget(model: BoardModel, task: BoardTask): DropTarget | null {
  const rowId = model.rowOf[task.id];
  if (rowId === undefined || task.closed) return null;
  const to = rowId === 'now' ? model.rows[model.rows.findIndex((r) => r.id === rowId) + 1] : model.rows.find((r) => r.kind === 'now');
  if (!to) return null;
  // Its tagged column, so a card leaving the No due date column goes back to where it was.
  const columnId = workflowColumnOf(task, model.config);
  return { rowId: to.id, columnId, index: model.cells[to.id]?.[columnId]?.length ?? 0 };
}

/**
 * Applies `edit` to one line. `toggle` completes or reopens a line and may return two lines
 * (Tasks adds the next occurrence of a recurring task); the remaining edits go on the line that
 * ends up in the requested state, so a new occurrence keeps its old column.
 */
export function applyEdit(raw: string, edit: TaskEdit, slug: string, toggle: (line: string) => string[]): string[] {
  let lines = [raw];
  let index = 0;
  const parsed = parseTaskLine(raw);
  if (edit.closed !== undefined && parsed && parsed.closed !== edit.closed) {
    lines = toggle(raw);
    const found = lines.findIndex((l) => parseTaskLine(l)?.closed === edit.closed);
    index = found >= 0 ? found : lines.length - 1;
  }
  let line = lines[index] ?? raw;
  if (edit.due !== undefined) line = setDueDate(line, edit.due);
  if (edit.column !== undefined) line = setPlacement(line, slug, edit.column, edit.sort);
  lines[index] = line;
  return lines;
}

function findCard(model: BoardModel, id: string): BoardTask | undefined {
  const rowId = model.rowOf[id];
  if (rowId === undefined) return undefined;
  for (const cards of Object.values(model.cells[rowId] ?? {})) {
    const card = cards.find((t) => t.id === id);
    if (card) return card;
  }
  return undefined;
}
