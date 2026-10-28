import { columnOf, workflowColumnOf, type BoardModel, type BoardTask, type TaskEdit } from './board.ts';
import type { BoardConfig } from './boardConfig.ts';
import { isISODate } from './dates.ts';
import { dueNowEnd } from './rows.ts';
import type { Priority } from './taskLine.ts';

export type BulkKind = 'move' | 'due' | 'labels' | 'priority';
export type BulkAction =
  | { kind: 'move'; column: string }
  | { kind: 'due'; date: string | null }
  | { kind: 'labels'; mode: 'add' | 'remove'; ids: string[] }
  | { kind: 'priority'; priority: Priority | null };
export type BulkResult = { tasks: BoardTask[]; message: string };

/** Only independently editable main cards, including cards beyond a collapsed row or a limit. */
export function triageCards(model: BoardModel, column = ''): BoardTask[] {
  return model.rows.flatMap((row) => model.columns.filter((c) => !column || c.id === column)
    .flatMap((c) => model.cells[row.id]?.[c.id] ?? [])).filter((task) => !task.parentId);
}

export function planBulk(tasks: BoardTask[], config: BoardConfig, today: string, action: BulkAction): Map<string, TaskEdit> {
  if (action.kind === 'move' && !config.columns.some((c) => c.id === action.column)) throw new Error('That column no longer exists.');
  if (action.kind === 'due' && action.date !== null && (!isISODate(action.date) ||
    new Date(`${action.date}T12:00:00Z`).toISOString().slice(0, 10) !== action.date)) throw new Error('Choose a valid due date.');
  if (action.kind === 'labels' && (!action.ids.length || action.ids.some((id) => !config.labels.some((l) => l.id === id)))) throw new Error('Choose existing board labels.');
  return new Map(tasks.filter((task) => !task.parentId).map((task): [string, TaskEdit] => {
    switch (action.kind) {
      case 'due': return [task.id, { due: action.date }];
      case 'priority': return [task.id, { priority: action.priority }];
      case 'labels': return [task.id, { labels: { mode: action.mode, ids: action.ids } }];
      case 'move': {
        const edit: TaskEdit = {};
        if (action.column !== columnOf(task, config)) {
          edit.column = action.column === config.undatedColumn ? workflowColumnOf(task, config) : action.column;
          if (action.column === config.undatedColumn) edit.due = null;
          else if (config.undatedColumn && !task.dueDate && action.column !== config.doneColumn) edit.due = dueNowEnd(config, today);
          if (config.doneColumn) edit.closed = action.column === config.doneColumn;
        }
        return [task.id, edit];
      }
    }
  }));
}

const key = (task: BoardTask) => `${task.id}\0${task.raw}`;
/** Selection owns snapshots; index refreshes must never retarget a selected line onto another task. */
export class BulkSelection {
  active = false;
  busy = false;
  message = '';
  scope = '';
  private selected = new Map<string, BoardTask>();
  private anchor: string | null = null;
  get tasks(): BoardTask[] { return [...this.selected.values()]; }
  has(task: BoardTask): boolean { return this.selected.has(key(task)); }
  resetScope(scope: string): void {
    if (this.scope !== scope) { this.clear(); this.scope = scope; }
  }
  clear(): void { this.selected.clear(); this.anchor = null; this.message = ''; }
  replace(tasks: BoardTask[]): void { this.selected = new Map(tasks.map((task) => [key(task), task])); }
  add(tasks: BoardTask[]): void { for (const task of tasks) this.selected.set(key(task), task); }
  toggle(task: BoardTask, ordered: BoardTask[], range: boolean): void {
    if (this.busy) return;
    const at = ordered.findIndex((t) => key(t) === key(task));
    const from = ordered.findIndex((t) => key(t) === this.anchor);
    if (range && from >= 0 && at >= 0) this.add(ordered.slice(Math.min(at, from), Math.max(at, from) + 1));
    else if (this.has(task)) this.selected.delete(key(task));
    else this.selected.set(key(task), task);
    if (!range || from < 0) this.anchor = key(task);
    this.message = '';
  }
}
