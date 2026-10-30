import { joinEditedLines, replaceNoteLine } from '../core/lineEndings.ts';
import { recoverDraft } from './recoverDraft.ts';
import { notice } from './notice.ts';
import { setTaskLabels } from '../core/labels.ts';
import { TFile, type App, type WorkspaceLeaf } from 'obsidian';
import { applyEdit, taskId, type BoardTask, type TaskEdit } from '../core/board.ts';
import { todayISO } from '../core/dates.ts';
import { insertSubtaskAt, promoteSubtask } from '../core/subtasks.ts';
import { reorderSubtaskBlocks, type SubtaskReorder } from '../core/reorderSubtasks.ts';
import { dedupeFields, movePlacementsToEnd, parseTaskLine, setClosedFallback, normalizeRequestMarker } from '../core/taskLine.ts';

const TASKS_PLUGIN_ID = 'obsidian-tasks-plugin';

type TasksApiV1 = {
  createTaskLineModal(): Promise<string>;
  editTaskLineModal(line: string): Promise<string>;
  executeToggleTaskDoneCommand(line: string, path: string): string;
};

type PluginHost = {
  plugins?: {
    enabledPlugins?: Set<string>;
    plugins?: Record<string, { apiV1?: TasksApiV1 } | undefined>;
  };
};

/** A subtask leaving its card's list; see `promoteSubtask`. */
export type Promoting = { subtask: BoardTask; card: BoardTask };

type FileChange = { file: TFile; before: string; after: string };
export type UndoAction = { paths: string[]; undo(): Promise<boolean> };
export type EditResult = { action: UndoAction | null; appliedIds: string[]; skippedIds: string[]; failedPaths: string[]; writtenTasks?: BoardTask[] };

/** Writes task lines back to their notes, through the Tasks plugin when it is available. */
export class TaskWriter {
  constructor(private app: App) {}

  async reorderSubtask(move: SubtaskReorder): Promise<{ action: UndoAction | null; id: string }> {
    const { parent, siblings, taskId: sourceId, beforeId } = move;
    const file = this.app.vault.getAbstractFileByPath(parent.path);
    if (!(file instanceof TFile) || siblings.some(t => t.path !== parent.path || t.parentId !== parent.id)) {
      throw new Error('The parent or note changed. Refresh the board and try again.');
    }
    const changes: FileChange[] = [];
    let id = sourceId;
    await this.app.vault.process(file, content => {
      const lines = content.split(/\r?\n/);
      const parentLine = locate(lines, parent), positions = siblings.map(t => locate(lines, t));
      const from = siblings.findIndex(t => t.id === sourceId), to = siblings.findIndex(t => t.id === beforeId);
      if (parentLine < 0 || positions.some(i => i < 0) || from < 0 || (beforeId !== null && to < 0)) {
        throw new Error('A task changed since the board loaded. Refresh the board and try again.');
      }
      const next = reorderSubtaskBlocks(content, parentLine, positions, positions[from]!, beforeId === null ? null : positions[to]!);
      if (content !== next.content) changes.push({ file, before: content, after: next.content });
      id = taskId(parent.path, next.line);
      return next.content;
    });
    return { action: this.undoFor(changes), id };
  }

  tasksApi(): TasksApiV1 | null {
    const host = (this.app as unknown as PluginHost).plugins;
    if (!host?.enabledPlugins?.has(TASKS_PLUGIN_ID)) return null;
    return host.plugins?.[TASKS_PLUGIN_ID]?.apiV1 ?? null;
  }

  /**
   * Completes or reopens a line. Tasks handles done dates and recurrence; when it is missing,
   * or leaves the line unchanged (e.g. outside its global filter), the checkbox is flipped directly.
   */
  toggleLine(line: string, path: string): string[] {
    const wasClosed = parseTaskLine(line)?.closed ?? false;
    const api = this.tasksApi();
    if (api) {
      const out = api.executeToggleTaskDoneCommand(line, path).split('\n');
      if (out.some((l) => parseTaskLine(l)?.closed === !wasClosed)) return out;
    }
    return [setClosedFallback(line, !wasClosed, todayISO())];
  }

  /** New lines for each task after `edits`, without writing; used to redraw before the files change. */
  preview(tasks: BoardTask[], edits: Map<string, TaskEdit>, slug: string): Map<string, string> {
    const out = new Map<string, string>();
    for (const task of tasks) {
      const edit = edits.get(task.id);
      if (!edit) continue;
      const lines = applyEdit(task.raw, edit, slug, (l) => this.toggleLine(l, task.path));
      const kept = lines.find((l) => parseTaskLine(l)?.closed === (edit.closed ?? task.closed)) ?? lines[0];
      if (kept !== undefined) out.set(task.id, kept);
    }
    return out;
  }

  /** `promote` also moves that subtask out of its card's list in the note, in the same write. */
  async applyEdits(tasks: BoardTask[], edits: Map<string, TaskEdit>, slug: string, promote?: Promoting, captureSnapshots = false): Promise<EditResult> {
    const byPath = new Map<string, BoardTask[]>();
    for (const task of tasks) {
      if (edits.has(task.id)) byPath.set(task.path, [...(byPath.get(task.path) ?? []), task]);
    }
    const writtenTasks: BoardTask[] = [];
    const result: EditResult = { action: null, appliedIds: [], skippedIds: [], failedPaths: [], ...(captureSnapshots ? { writtenTasks } : {}) };
    const changes: FileChange[] = [];
    for (const [path, fileTasks] of byPath) {
      const applied: string[] = [];
      try {
        await this.rewrite(path, fileTasks, (task, _at, current) => {
          applied.push(task.id);
          return applyEdit(current, edits.get(task.id)!, slug, (l) => this.toggleLine(l, path));
        }, changes, promote?.subtask.path === path ? promote : undefined, captureSnapshots ? writtenTasks : undefined);
        result.appliedIds.push(...applied);
      } catch (error) {
        console.error('[Task Trellis] write failed', error);
        result.failedPaths.push(path);
      }
    }
    const applied = new Set(result.appliedIds);
    result.skippedIds = [...edits.keys()].filter((id) => !applied.has(id));
    // BoardView explains a subtask that couldn't move out.
    if (result.skippedIds.length && !(promote && result.failedPaths.includes(promote.subtask.path))) notice(this.app, `Task Trellis: ${result.skippedIds.length === 1 ? '1 task' : `${result.skippedIds.length} tasks`} could not be updated. Check the affected notes and try again.`, { alert: true });
    result.action = this.undoFor(changes);
    return result;
  }

  /** Returns the lines written in place of the task, or null if nothing was written. */
  async toggle(task: BoardTask, onUndo?: (action: UndoAction) => void): Promise<string[] | null> {
    let written: string[] | null = null;
    const changes: FileChange[] = [];
    const missed = await this.rewrite(task.path, [task], (t) => (written = this.toggleLine(t.raw, t.path)), changes);
    const undo = this.undoFor(changes);
    if (undo) onUndo?.(undo);
    if (missed > 0) notice(this.app, 'Task Trellis: that task changed since the board loaded. Try again.', { alert: true });
    return missed > 0 ? null : written;
  }

  async setLabels(task: BoardTask, slug: string, ids: string[], onUndo: (action: UndoAction) => void): Promise<BoardTask> {
    const raw = setTaskLabels(task.raw, slug, ids);
    const changes: FileChange[] = [];
    let line = task.line;
    const missed = await this.rewrite(task.path, [task], (_task, at) => { line = at; return [raw]; }, changes);
    if (missed) throw new Error('This task changed since the picker opened. Close it and try again.');
    const undo = this.undoFor(changes);
    if (undo) onUndo(undo);
    const source = changes[0]?.after.replace(/\r\n/g, '\n');
    const twins = source !== undefined ? source.split('\n').filter((l) => l === raw).length - 1 : task.twins;
    return { ...task, ...parseTaskLine(raw)!, raw, line, twins, duplicateSource: source ?? task.duplicateSource };
  }

  /**
   * Edits in the Tasks modal, then moves placement tags back to the end of the line and drops field
   * copies Tasks kept in the description (it only reads fields at the end). Returns the
   * lines written in place of the task, or null if the edit was cancelled or not saved.
   */
  async editInModal(task: BoardTask): Promise<string[] | null> {
    const api = this.tasksApi();
    if (!api) {
      await this.openSource(task);
      return null;
    }
    const result = await api.editTaskLineModal(task.raw);
    if (!result) return null;
    const lines = result.split('\n').map((l) => movePlacementsToEnd(dedupeFields(l)));
    const save = async (draft: string): Promise<boolean> => {
      const missed = await this.rewrite(task.path, [task], () => draft.split('\n').map((l) => movePlacementsToEnd(dedupeFields(l))));
      if (missed) notice(this.app, 'Task Trellis: that task changed while you were editing. Copy your draft and reopen the task.', { alert: true });
      return missed === 0;
    };
    try {
      if (await save(lines.join('\n'))) return lines;
    } catch (error) {
      console.error('[Task Trellis] edit failed', error);
      notice(this.app, 'Task Trellis: could not save the edit. Your draft has been kept.', { alert: true });
    }
    recoverDraft(this.app, lines.join('\n'), save);
    return null;
  }

  /** Adds `line` as the parent's last subtask, indented the way the editor would (Settings → Editor → Indent using tabs). */
  async insertSubtask(parent: BoardTask, line: string): Promise<boolean> {
    const found = (await this.insertSubtasks(parent, [line])).at >= 0;
    if (!found) notice(this.app, 'Task Trellis: that task changed since the board loaded, so the subtask was not added. Try again.', { alert: true });
    return found;
  }

  /**
   * Adds `lines[0]` as the parent's last subtask and the rest as its own subtasks, in one write. `at`
   * is the first added line, or -1 when the parent changed and nothing was written.
   */
  async insertSubtasks(parent: BoardTask, lines: string[]): Promise<{ at: number; action: UndoAction | null }> {
    const file = this.app.vault.getAbstractFileByPath(parent.path);
    let at = -1;
    const changes: FileChange[] = [];
    if (file instanceof TFile) {
      await this.app.vault.process(file, (content) => {
        const parentAt = locate(content.split(/\r?\n/), parent);
        if (parentAt < 0) return content;
        let after: string;
        ({ content: after, at } = insertSubtaskAt(content, parentAt, lines[0]!, this.indentUnit()));
        for (let i = 1; i < lines.length; i++) after = insertSubtaskAt(after, at, lines[i]!, this.indentUnit()).content;
        changes.push({ file, before: content, after });
        return after;
      });
    }
    return { at, action: this.undoFor(changes) };
  }

  /** Undo for a write made outside the writer, such as a new task; see `undoFor`. */
  undoWrite(file: TFile, before: string, after: string): UndoAction | null {
    return before === after ? null : this.undoFor([{ file, before, after }]);
  }

  indentUnit(): string {
    const vault = this.app.vault as unknown as { getConfig?(key: string): unknown };
    const size = vault.getConfig?.('tabSize');
    return vault.getConfig?.('useTab') === false ? ' '.repeat(typeof size === 'number' ? size : 4) : '\t';
  }

  /**
   * Goes to the task's line in a tab that already shows its note, in this window or any other,
   * and only opens a new tab when there is none (or `newTab` asks for one).
   */
  async openSource(task: BoardTask, newTab = false): Promise<void> {
    const file = this.app.vault.getFileByPath(task.path);
    if (!file) return;
    const { workspace } = this.app;
    const existing = newTab ? null : this.leafShowing(task.path);
    if (!existing) {
      await workspace.getLeaf('tab').openFile(file, { active: true, eState: { line: task.line } });
      return;
    }
    // Also loads a tab Obsidian hasn't rendered yet (background tabs are deferred).
    await workspace.revealLeaf(existing);
    existing.view.containerEl.win.focus();
    workspace.setActiveLeaf(existing, { focus: true });
    existing.setEphemeralState({ line: task.line });
  }

  /** A markdown tab showing `path`, preferring the current window. */
  private leafShowing(path: string): WorkspaceLeaf | null {
    const matches: WorkspaceLeaf[] = [];
    this.app.workspace.iterateAllLeaves((leaf) => {
      const state = leaf.getViewState();
      if (state.type === 'markdown' && state.state?.file === path) matches.push(leaf);
    });
    return matches.find((leaf) => leaf.view.containerEl.win === activeWindow) ?? matches[0] ?? null;
  }

  /** Restores only unchanged written files, so Undo never overwrites subsequent editor or sync changes. */
  private undoFor(changes: FileChange[]): UndoAction | null {
    if (!changes.length) return null;
    let used = false;
    return { paths: changes.map((change) => change.file.path), undo: async () => {
      if (used) return false;
      used = true;
      let skipped = 0;
      for (const change of [...changes].reverse()) {
        if (this.app.vault.getAbstractFileByPath(change.file.path) !== change.file) { skipped++; continue; }
        await this.app.vault.process(change.file, (current) => {
          if (current !== change.after) { skipped++; return current; }
          return change.before;
        });
      }
      if (skipped) notice(this.app, `Task Trellis: ${skipped === 1 ? '1 note' : `${skipped} notes`} changed after this action and ${skipped === 1 ? 'was' : 'were'} not undone.`, { alert: true });
      return skipped === 0;
    } };
  }

  /**
   * Replaces each task's line in one atomic write per file, bottom-up so inserted lines don't shift
   * the rest. A line that moved is followed when that's unambiguous (see `locate`); otherwise it is
   * skipped. Returns how many tasks were skipped.
   */
  private async rewrite(
    path: string, tasks: BoardTask[], linesFor: (task: BoardTask, at: number, current: string) => string[],
    changes?: FileChange[], promote?: Promoting, written?: BoardTask[],
  ): Promise<number> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return tasks.length;
    let missed = 0;
    let change: FileChange | undefined;
    let unmovable = false;
    const refreshed: BoardTask[] = [];
    await this.app.vault.process(file, (content) => {
      refreshed.length = 0;
      const read = content.split(/\r?\n/);
      let lines = read, after = content, moved = (i: number) => i;
      if (promote) {
        const sub = locate(read, promote.subtask), card = locate(read, promote.card);
        const result = sub < 0 || card < 0 ? null : promoteSubtask(read, sub, card);
        if (!result) { unmovable = true; return content; }
        lines = result.lines; after = joinEditedLines(content, lines); moved = result.at;
      }
      const located = tasks
        .map((task) => { const at = locate(read, task); return { task, at: at < 0 ? at : moved(at) }; })
        .sort((a, b) => b.at - a.at);
      for (const { task, at } of located) {
        if (at < 0) {
          missed++;
          continue;
        }
        const replacement = linesFor(task, at, lines[at]!).map(normalizeRequestMarker);
        if (written) {
          for (const previous of refreshed) {
            previous.line += replacement.length - 1;
            previous.id = taskId(path, previous.line);
          }
          const original = parseTaskLine(task.raw);
          const keep = replacement.findIndex((raw) => parseTaskLine(raw)?.closed !== original?.closed);
          const offset = keep >= 0 ? keep : 0;
          const raw = replacement[offset];
          const parsed = raw === undefined ? null : parseTaskLine(raw);
          if (parsed && raw !== undefined) refreshed.push({ ...parsed, path, id: taskId(path, at + offset), line: at + offset, raw, ...(task.parentId ? { parentId: task.parentId } : {}) });
        }
        after = replaceNoteLine(after, at, replacement);
      }
      if (written) {
        const source = after.replace(/\r\n/g, '\n');
        const counts = new Map<string, number>();
        for (const line of source.split('\n')) counts.set(line, (counts.get(line) ?? 0) + 1);
        for (const task of refreshed) { task.twins = (counts.get(task.raw) ?? 1) - 1; task.duplicateSource = source; }
      }
      if (after !== content) change = { file, before: content, after };
      return after;
    });
    if (unmovable) throw new Error(`could not move the subtask out of its card in ${path}`);
    if (change) changes?.push(change);
    written?.push(...refreshed);
    return missed;
  }
}

/**
 * The task's line: where it was read, or where it moved to. A line is only followed when its text was
 * unique in the note when read and still is, since text is all that identifies it; otherwise an edit
 * meant for a changed task could land on another task that reads the same.
 */
function locate(lines: string[], task: BoardTask): number {
  // A duplicate can shift into the old line number after a deletion. Even an exact-position
  // match is unsafe once that note changes; wait for the index to provide a fresh snapshot.
  if (task.twins && task.duplicateSource !== lines.join('\n')) return -1;
  if (lines[task.line] === task.raw) return task.line;
  if (task.twins) return -1;
  const at = lines.indexOf(task.raw);
  return at >= 0 && lines.indexOf(task.raw, at + 1) < 0 ? at : -1;
}
