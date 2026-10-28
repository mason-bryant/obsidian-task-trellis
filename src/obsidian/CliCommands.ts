import type { CliFlags } from 'obsidian';
import type TaskTrellisPlugin from '../../main.ts';
import { buildBoard, cardOfSubtask, columnOf, findSubtask, planDrop, taskId, workflowColumnOf, type BoardModel, type BoardTask, type TaskEdit } from '../core/board.ts';
import { destinationFor, type NewTaskDestination } from '../core/boardConfig.ts';
import { planBulk, triageCards, type BulkAction } from '../core/bulkTriage.ts';
import {
  boardJson, cardsJson, dateOption, flagOption, jsonListOption, labelsJson, listOption, option, plainText, positionIndex,
  positionOption, priorityOption, requiredOption, resolveColumn, resolveLabels, resolveQuickFilters, resolveRow, taskJson,
  type CliParams,
} from '../core/cli.ts';
import { todayISO } from '../core/dates.ts';
import { taskLabels, setTaskLabels } from '../core/labels.ts';
import { buildNewTaskLine } from '../core/newTask.ts';
import { shortcutColumn } from '../core/shortcut.ts';
import { parseTaskLine, replaceTaskText, setDueDate, setPriority } from '../core/taskLine.ts';
import type { BoardEntry } from './BoardRegistry.ts';
import { noteTags } from './noteTags.ts';
import type { UndoAction } from './TaskWriter.ts';

type Result = Record<string, unknown>;
type Command = { id: string; description: string; flags: CliFlags; run(params: CliParams): Promise<Result> | Result };

// Obsidian reads a bare word listed in a `format` value (`json|text`) as the format, which would turn
// `text=…` into `format=text`; so the value lists no choices.
const FORMAT = { format: { value: '<format>', description: 'json (the default) or text' } };
const BOARD = { board: { value: '<slug|path>', description: 'Board slug, note path or note name', required: true } };
const TASK = {
  id: { value: '<path:line>', description: 'Task id from show or task', required: true },
  expect: { value: '<line>', description: 'The line as you last read it; the write is refused if it changed' },
};
const DRY_RUN = { 'dry-run': { description: 'Show the lines that would be written without writing them' } };
const REQUEST_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
/** How long a write waits for Obsidian to re-read the notes it changed. */
const REREAD_TIMEOUT_MS = 2000;

/**
 * `obsidian task-trellis:<command>` for agents and scripts. Commands run one at a time, against the
 * same index and writer as the boards, and answer in JSON unless `format=text`.
 */
export class CliCommands {
  private queue: Promise<unknown> = Promise.resolve();
  private lastUndo: UndoAction | null = null;
  private stopped = false;
  /** Notes Obsidian re-read since the running command started. */
  private reread = new Set<string>();
  private onReread = (): void => undefined;

  constructor(private plugin: TaskTrellisPlugin) {
    plugin.register(() => { this.stopped = true; this.onReread(); });
    plugin.registerEvent(plugin.app.metadataCache.on('changed', (file) => {
      this.reread.add(file.path);
      this.onReread();
    }));
  }

  register(): void {
    for (const command of this.commands()) {
      this.plugin.registerCliHandler(command.id, command.description, command.flags, (params) => this.run(command.id, params));
    }
  }

  /** Runs a command after any still running, and formats its result or error. */
  run(id: string, params: CliParams): Promise<string> {
    const text = params.format === 'text';
    const run = this.queue.then(async () => {
      try {
        if (params.format !== undefined && params.format !== 'json' && !text) throw new Error('format must be json or text.');
        const command = this.commands().find((c) => c.id === id);
        if (!command) throw new Error(`Unknown command: ${id}.`);
        await this.plugin.indexed;
        if (this.stopped) throw new Error('Task Trellis was disabled.');
        this.reread.clear();
        const result = await command.run(params);
        return text ? plainText(result) : JSON.stringify({ ok: true, ...result }, null, 2);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return text ? `Error: ${message}` : JSON.stringify({ ok: false, error: message }, null, 2);
      }
    });
    this.queue = run;
    return run;
  }

  private commands(): Command[] {
    return [
      {
        id: 'task-trellis', description: 'List the Task Trellis commands', flags: FORMAT,
        run: () => ({ commands: this.commands().slice(1).map(({ id, description }) => ({ command: id, description })) }),
      },
      {
        id: 'task-trellis:boards', description: 'List boards with their columns, labels and quick filters', flags: FORMAT,
        run: () => ({
          boards: this.plugin.boards.boards().map(({ file, config, warnings }) =>
            boardJson(file.path, config, destinationFor(config, this.plugin.quickAdd.defaultDestination()), warnings)),
        }),
      },
      {
        id: 'task-trellis:show', description: 'Show a board’s cards, as the board shows them',
        flags: {
          ...BOARD,
          filter: { value: '<ids>', description: 'Comma-separated quick filter ids to apply' },
          column: { value: '<id>', description: 'Only cards in this column' },
          row: { value: '<id>', description: 'Only cards in this row, such as now or later' },
          ...FORMAT,
        },
        run: (params) => this.show(params),
      },
      {
        id: 'task-trellis:task', description: 'Show one task with its subtasks and the boards it is on',
        flags: { ...TASK, ...FORMAT }, run: (params) => this.taskDetail(params),
      },
      {
        id: 'task-trellis:add', description: 'Add a task, with optional subtasks, to a board or under a task',
        flags: {
          board: { value: '<slug|path>', description: 'Board the task goes on; not used with parent' },
          text: { value: '<text>', description: 'Task text', required: true },
          column: { value: '<id>', description: 'Column; the board’s first workflow column by default' },
          due: { value: '<YYYY-MM-DD>', description: 'Due date' },
          priority: { value: '<priority>', description: 'highest, high, medium, low or lowest' },
          labels: { value: '<ids>', description: 'Comma-separated label ids or names' },
          note: { value: '<path>', description: 'Note to add the task to, instead of the board’s new-task note' },
          heading: { value: '<heading>', description: 'Heading to add the task under; added if missing' },
          subtasks: { value: '<json>', description: 'JSON array of subtask texts' },
          parent: { value: '<path:line>', description: 'Add as a subtask of this task instead' },
          expect: { value: '<line>', description: 'With parent: the parent’s line as you last read it' },
          'request-id': { value: '<id>', description: 'Skip the add if a task with this id was already added' },
          ...DRY_RUN, ...FORMAT,
        },
        run: (params) => this.add(params),
      },
      {
        id: 'task-trellis:move', description: 'Move a card to another column, row or position on a board',
        flags: {
          ...BOARD, ...TASK,
          column: { value: '<id>', description: 'Target column; the card’s column by default' },
          row: { value: '<id>', description: 'Target row, which sets the due date; the card’s row by default' },
          position: { value: '<top|bottom|before:id|after:id>', description: 'Where in the cell; bottom by default' },
          ...DRY_RUN, ...FORMAT,
        },
        run: (params) => this.move(params),
      },
      {
        id: 'task-trellis:set', description: 'Change a task’s due date, priority, text or labels',
        flags: {
          ...TASK,
          due: { value: '<YYYY-MM-DD|none>', description: 'Due date; none removes it' },
          priority: { value: '<priority|none>', description: 'highest, high, medium, low, lowest or none' },
          text: { value: '<text>', description: 'New task text; fields and tags are kept' },
          board: { value: '<slug|path>', description: 'Board whose labels to change' },
          labels: { value: '<ids>', description: 'Replace the board’s labels on the task; empty removes all' },
          'labels-add': { value: '<ids>', description: 'Labels to add' },
          'labels-remove': { value: '<ids>', description: 'Labels to remove' },
          ...DRY_RUN, ...FORMAT,
        },
        run: (params) => this.set(params),
      },
      {
        id: 'task-trellis:complete', description: 'Complete or reopen a task, through the Tasks plugin when installed',
        flags: { ...TASK, done: { value: '<true|false>', description: 'false reopens the task; true by default' }, ...DRY_RUN, ...FORMAT },
        run: (params) => this.complete(params),
      },
      {
        id: 'task-trellis:bulk', description: 'Apply one change to several cards on a board',
        flags: {
          ...BOARD,
          ids: { value: '<ids>', description: 'Comma-separated card ids' },
          filter: { value: '<ids>', description: 'Every card these quick filters show' },
          column: { value: '<id>', description: 'Every card in this column' },
          move: { value: '<column>', description: 'Move the cards to this column' },
          due: { value: '<YYYY-MM-DD|none>', description: 'Set or remove the due date' },
          priority: { value: '<priority|none>', description: 'Set or remove the priority' },
          'labels-add': { value: '<ids>', description: 'Add these labels' },
          'labels-remove': { value: '<ids>', description: 'Remove these labels' },
          ...DRY_RUN, ...FORMAT,
        },
        run: (params) => this.bulk(params),
      },
      {
        id: 'task-trellis:undo', description: 'Undo the last change made through the CLI', flags: FORMAT,
        run: () => this.undo(),
      },
    ];
  }

  private show(params: CliParams): Result {
    const entry = this.board(params);
    const model = this.model(entry, resolveQuickFilters(entry.config, listOption(params, 'filter') ?? []));
    const column = option(params, 'column');
    const row = option(params, 'row');
    const columnId = column ? resolveColumn(entry.config, column) : undefined;
    const rowId = row ? resolveRow(model, row) : undefined;
    return {
      board: { slug: entry.config.slug, name: entry.config.name, path: entry.file.path },
      today: model.today,
      filters: model.activeQuickFilters,
      columns: model.columns,
      rows: model.rows.map(({ id, label, detail }) => ({ id, label, detail })),
      cards: cardsJson(model).filter((card) => (!columnId || card.column === columnId) && (!rowId || card.row === rowId)),
    };
  }

  private taskDetail(params: CliParams): Result {
    const task = this.task(params);
    const all = this.plugin.index.all();
    const subtasksOf = (parent: BoardTask) => all.filter((t) => t.parentId === parent.id);
    const boards = this.plugin.boards.boards().flatMap((entry): Result[] => {
      const model = this.model(entry);
      const rowId = model.rowOf[task.id];
      const board = { slug: entry.config.slug, name: entry.config.name };
      if (rowId !== undefined) {
        return [{ ...board, column: columnOf(task, entry.config), row: rowId, labels: labelsJson(task, entry.config) }];
      }
      const subtask = findSubtask(model, task.id);
      const card = subtask && cardOfSubtask(model, subtask);
      return card ? [{ ...board, subtaskOf: card.id }] : [];
    });
    return { task: { ...taskJson(task, subtasksOf), parentId: task.parentId ?? null }, boards };
  }

  private async add(params: CliParams): Promise<Result> {
    const text = requiredOption(params, 'text');
    const due = dateOption(params, 'due');
    const priority = priorityOption(params, 'priority');
    const dryRun = flagOption(params, 'dry-run');
    const created = await this.plugin.quickAdd.createdDate();
    const fields = (line: string) => {
      if (due !== undefined) line = setDueDate(line, due);
      return priority !== undefined ? setPriority(line, priority) : line;
    };
    const subtasks = (jsonListOption(params, 'subtasks') ?? []).map((sub) => buildNewTaskLine(sub, { created }));

    const parentId = option(params, 'parent');
    if (parentId) {
      for (const key of ['board', 'column', 'labels', 'note', 'heading', 'request-id']) {
        if (params[key] !== undefined) throw new Error(`${key} can't be used with parent: a subtask goes under its parent, with no column or labels of its own.`);
      }
      const parent = this.task({ id: parentId, ...(params.expect !== undefined ? { expect: params.expect } : {}) });
      const lines = [fields(buildNewTaskLine(text, { created })), ...subtasks];
      if (dryRun) return { dryRun: true, path: parent.path, parent: parent.id, lines };
      const { at, action } = await this.plugin.writer.insertSubtasks(parent, lines);
      if (at < 0) throw new Error('The parent task changed since it was read, so nothing was added. Run task-trellis:task again.');
      this.lastUndo = action;
      await this.settle([parent.path]);
      return { added: await this.addedLines(parent.path, at, lines.length) };
    }

    const entry = this.board(params);
    const { config } = entry;
    const requestId = option(params, 'request-id');
    if (requestId !== undefined && !REQUEST_ID_RE.test(requestId)) throw new Error('request-id must contain 1–128 letters, numbers, hyphens or underscores.');
    const requested = option(params, 'column');
    // Shortcut rules: an open workflow column, and the No due date column only without a date.
    const column = shortcutColumn(config, requested && resolveColumn(config, requested),
      due !== undefined ? due : parseTaskLine(buildNewTaskLine(text, {}))?.dueDate ?? null);
    let line = fields(buildNewTaskLine(text, { created, placement: { slug: config.slug, column } }));
    const labels = resolveLabels(config, listOption(params, 'labels') ?? []);
    if (labels.length) line = setTaskLabels(line, config.slug, labels);
    const indent = this.plugin.writer.indentUnit();
    const lines = [line, ...subtasks.map((sub) => indent + sub)];
    const base = destinationFor(config, this.plugin.quickAdd.defaultDestination());
    const note = option(params, 'note');
    const heading = params.heading ?? base.heading;
    const destination: NewTaskDestination = note ? { kind: 'note', note, heading } : { ...base, heading };
    if (dryRun) return { dryRun: true, destination, lines };
    const added = await this.plugin.quickAdd.addLines(config, destination, lines, requestId);
    // A retried request writes nothing, so the last change stays the one to undo.
    if (!added.duplicate) this.lastUndo = this.plugin.writer.undoWrite(added.file, added.before, added.after);
    await this.settle(added.duplicate ? [] : [added.file.path]);
    return {
      added: added.at < 0 ? [] : await this.addedLines(added.file.path, added.at, added.duplicate ? 1 : lines.length),
      ...(added.duplicate ? { duplicate: true } : {}),
      ...(added.warning ? { warning: added.warning } : {}),
    };
  }

  /** Ids and lines of `count` lines from `at`, as the note now reads. */
  private async addedLines(path: string, at: number, count: number): Promise<{ id: string; raw: string }[]> {
    const file = this.plugin.app.vault.getFileByPath(path);
    const lines = file ? (await this.plugin.app.vault.read(file)).split(/\r?\n/) : [];
    return lines.slice(at, at + count).map((raw, i) => ({ id: taskId(path, at + i), raw }));
  }

  private async move(params: CliParams): Promise<Result> {
    const entry = this.board(params);
    const { config } = entry;
    const model = this.model(entry);
    const task = this.task(params);
    const fromRow = model.rowOf[task.id];
    if (fromRow === undefined) {
      throw new Error(findSubtask(model, task.id) ? 'That is a subtask; it moves with its card.' : `That task is not on the ${config.name} board.`);
    }
    const fromColumn = columnOf(task, config);
    const column = option(params, 'column');
    const row = option(params, 'row');
    const undated = fromColumn === config.undatedColumn;
    const nowId = model.rows.find((r) => r.kind === 'now')!.id;
    // As "Move to…" picks them: the No due date column has its own row, and leaving it goes to Due now.
    const columnId = column ? resolveColumn(config, column) : row && undated ? workflowColumnOf(task, config) : fromColumn;
    const rowId = row ? resolveRow(model, row)
      : !column ? fromRow
      : columnId === config.undatedColumn ? 'none' : undated ? nowId : fromRow;
    const cell = (model.cells[rowId]?.[columnId] ?? []).filter((t) => t.id !== task.id);
    const index = positionIndex(positionOption(params), cell);
    const edits = planDrop(model, task.id, { rowId, columnId, index });
    if (!edits.size) return { changed: [] };
    const cards = Object.values(model.cells).flatMap((columns) => Object.values(columns).flat()).filter((t) => edits.has(t.id));
    return this.write(cards.map((t) => t.id === task.id ? task : t), edits, config.slug, flagOption(params, 'dry-run'));
  }

  private async set(params: CliParams): Promise<Result> {
    const task = this.task(params);
    const edit: TaskEdit = {};
    const due = dateOption(params, 'due');
    const priority = priorityOption(params, 'priority');
    const text = option(params, 'text');
    if (due !== undefined) edit.due = due;
    if (priority !== undefined) edit.priority = priority;
    if (text !== undefined) {
      if (replaceTaskText(task.raw, text) === null) {
        throw new Error('The text can\'t be replaced safely: it must be non-empty with no #tt/ tags, and the task\'s text must come before its fields. Edit the note instead.');
      }
      edit.text = text;
    }
    let slug = '';
    const labels = listOption(params, 'labels');
    const add = listOption(params, 'labels-add');
    const remove = listOption(params, 'labels-remove');
    if (labels || add || remove) {
      if (!option(params, 'board')) throw new Error('Specify board: labels belong to a board.');
      if (task.parentId) throw new Error('Labels go on cards, not subtasks.');
      const { config } = this.board(params);
      slug = config.slug;
      const removed = new Set(resolveLabels(config, remove ?? []));
      const ids = [...new Set([...(labels ? resolveLabels(config, labels) : taskLabels(task.raw, slug)), ...resolveLabels(config, add ?? [])])];
      edit.labels = { mode: 'set', ids: ids.filter((id) => !removed.has(id)) };
    }
    if (!Object.keys(edit).length) throw new Error('Nothing to change: specify due, priority, text or labels.');
    return this.write([task], new Map([[task.id, edit]]), slug, flagOption(params, 'dry-run'));
  }

  private async complete(params: CliParams): Promise<Result> {
    const task = this.task(params);
    const done = flagOption(params, 'done', true);
    if (task.closed === done) return { changed: [], message: done ? 'The task is already complete.' : 'The task is already open.' };
    return this.write([task], new Map([[task.id, { closed: done }]]), '', flagOption(params, 'dry-run'));
  }

  private async bulk(params: CliParams): Promise<Result> {
    const entry = this.board(params);
    const { config } = entry;
    const ids = listOption(params, 'ids');
    const filter = listOption(params, 'filter');
    const column = option(params, 'column');
    if (!ids && !filter && !column) throw new Error('Choose the cards with ids, filter or column.');
    const model = this.model(entry, resolveQuickFilters(config, filter ?? []));
    let cards = triageCards(model, column ? resolveColumn(config, column) : '');
    if (ids) {
      const missing = ids.filter((id) => !cards.some((t) => t.id === id));
      if (missing.length) throw new Error(`Not cards on this board (or hidden by the filter or column): ${missing.join(', ')}.`);
      cards = cards.filter((t) => ids.includes(t.id));
    }
    const actions: BulkAction[] = [];
    const move = option(params, 'move');
    const due = dateOption(params, 'due');
    const priority = priorityOption(params, 'priority');
    const add = listOption(params, 'labels-add');
    const remove = listOption(params, 'labels-remove');
    if (move) actions.push({ kind: 'move', column: resolveColumn(config, move) });
    if (due !== undefined) actions.push({ kind: 'due', date: due });
    if (priority !== undefined) actions.push({ kind: 'priority', priority });
    if (add) actions.push({ kind: 'labels', mode: 'add', ids: resolveLabels(config, add) });
    if (remove) actions.push({ kind: 'labels', mode: 'remove', ids: resolveLabels(config, remove) });
    if (actions.length !== 1) throw new Error('Specify exactly one change: move, due, priority, labels-add or labels-remove.');
    if (!cards.length) return { changed: [], message: 'No cards matched.' };
    const edits = planBulk(cards, config, model.today, actions[0]!);
    return this.write(cards, edits, config.slug, flagOption(params, 'dry-run'));
  }

  private async undo(): Promise<Result> {
    const action = this.lastUndo;
    if (!action) throw new Error('Nothing to undo: no CLI change since Task Trellis started, or it was already undone.');
    this.lastUndo = null;
    const complete = await action.undo();
    await this.settle(action.paths);
    return { undone: complete, paths: action.paths, ...(complete ? {} : { warning: 'Some notes changed after that change and were not undone.' }) };
  }

  /** Writes `edits`, or with `dryRun` only shows the lines they would write. Refuses when every task changed. */
  private async write(tasks: BoardTask[], edits: Map<string, TaskEdit>, slug: string, dryRun: boolean): Promise<Result> {
    if (dryRun) {
      return { dryRun: true, changes: [...this.plugin.writer.preview(tasks, edits, slug)].map(([id, raw]) => ({ id, raw })) };
    }
    const result = await this.plugin.writer.applyEdits(tasks, edits, slug, undefined, true);
    if (result.action) this.lastUndo = result.action;
    await this.settle(result.action?.paths ?? []);
    if (!result.appliedIds.length && result.skippedIds.length) {
      throw new Error('The task changed since it was read, so nothing was written. Run task-trellis:show or task-trellis:task again.');
    }
    return {
      changed: (result.writtenTasks ?? []).sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line).map(({ id, raw }) => ({ id, raw })),
      ...(result.skippedIds.length ? { skipped: result.skippedIds } : {}),
    };
  }

  /**
   * Waits until Obsidian has re-read the notes a command wrote (or a timeout), then refreshes them in
   * the index, so the next command sees the new lines and ids. The index reads Obsidian's list
   * positions, which lag a write.
   */
  private async settle(paths: string[]): Promise<void> {
    if (!paths.length) return;
    await new Promise<void>((resolve) => {
      const timer = window.setTimeout(done, REREAD_TIMEOUT_MS);
      function done() {
        window.clearTimeout(timer);
        resolve();
      }
      this.onReread = () => { if (this.stopped || paths.every((path) => this.reread.has(path))) done(); };
      this.onReread();
    });
    this.onReread = () => undefined;
    await this.plugin.index.refresh(paths);
  }

  /** By slug, note path or note name, as the iOS shortcut accepts it. */
  private board(params: CliParams): BoardEntry {
    const value = requiredOption(params, 'board');
    const matches = this.plugin.boards.boards().filter(({ file, config }) =>
      config.slug === value || file.path === value || file.basename === value);
    if (matches.length !== 1) throw new Error(`Unknown or ambiguous board: ${value}. Use its slug or full path from task-trellis:boards.`);
    return matches[0]!;
  }

  /**
   * The task with this id. With `expect`, the line must still read that way; if the note shifted,
   * the only task in it that reads that way is used instead.
   */
  private task(params: CliParams): BoardTask {
    const id = requiredOption(params, 'id');
    const all = this.plugin.index.all();
    let task = all.find((t) => t.id === id);
    const expect = params.expect;
    if (expect !== undefined && task?.raw.trimEnd() !== expect.trimEnd()) {
      const path = id.slice(0, id.lastIndexOf(':'));
      const same = all.filter((t) => t.path === path && t.raw.trimEnd() === expect.trimEnd());
      if (same.length !== 1) throw new Error(`${id} no longer reads as expected. Run task-trellis:show or task-trellis:task again.`);
      task = same[0];
    }
    if (!task) throw new Error(`No task with id ${id}. Ids are path:line and change when lines move; run task-trellis:show again.`);
    return this.plugin.index.currentSnapshot(task);
  }

  private model(entry: BoardEntry, filters: string[] = []): BoardModel {
    const cache = this.plugin.app.metadataCache;
    const model = buildBoard(this.plugin.index.all(), entry.config, todayISO(),
      (path) => cache.getCache(path)?.frontmatter, (path) => noteTags(cache.getCache(path)), filters);
    // A filter the board didn't apply would let show and bulk reach every card.
    if (model.activeQuickFilters.length !== filters.length) throw new Error('Some of those quick filters can’t be applied on this board.');
    return model;
  }
}
