import { Notice, TFile, type App, type WorkspaceLeaf } from 'obsidian';
import { applyEdit, type BoardTask, type TaskEdit } from '../core/board.ts';
import { todayISO } from '../core/dates.ts';
import { insertSubtask } from '../core/subtasks.ts';
import { dedupeFields, movePlacementsToEnd, parseTaskLine, setClosedFallback } from '../core/taskLine.ts';

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

type FileChange = { file: TFile; before: string; after: string };
export type UndoAction = { undo(): Promise<boolean> };

/** Writes task lines back to their notes, through the Tasks plugin when it is available. */
export class TaskWriter {
  constructor(private app: App) {}

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

  async applyEdits(tasks: BoardTask[], edits: Map<string, TaskEdit>, slug: string): Promise<UndoAction | null> {
    const byPath = new Map<string, BoardTask[]>();
    for (const task of tasks) {
      if (!edits.has(task.id)) continue;
      byPath.set(task.path, [...(byPath.get(task.path) ?? []), task]);
    }
    let missed = 0;
    const changes: FileChange[] = [];
    for (const [path, fileTasks] of byPath) {
      missed += await this.rewrite(path, fileTasks, (task) =>
        applyEdit(task.raw, edits.get(task.id)!, slug, (l) => this.toggleLine(l, path)), changes,
      );
    }
    if (missed > 0) new Notice(`Task Trellis: ${missed} task(s) changed since the board loaded and were not updated.`);
    return this.undoFor(changes);
  }

  /** Returns the lines written in place of the task, or null if nothing was written. */
  async toggle(task: BoardTask, onUndo?: (action: UndoAction) => void): Promise<string[] | null> {
    let written: string[] | null = null;
    const changes: FileChange[] = [];
    const missed = await this.rewrite(task.path, [task], (t) => (written = this.toggleLine(t.raw, t.path)), changes);
    const undo = this.undoFor(changes);
    if (undo) onUndo?.(undo);
    if (missed > 0) new Notice('Task Trellis: that task changed since the board loaded. Try again.');
    return missed > 0 ? null : written;
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
    const missed = await this.rewrite(task.path, [task], () => lines);
    if (missed > 0) new Notice('Task Trellis: that task changed while you were editing it, so the edit was not saved.');
    return missed > 0 ? null : lines;
  }

  /** Adds `line` as the parent's last subtask, indented the way the editor would (Settings → Editor → Indent using tabs). */
  async insertSubtask(parent: BoardTask, line: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(parent.path);
    let found = false;
    if (file instanceof TFile) {
      await this.app.vault.process(file, (content) => {
        const at = locate(content.split(/\r?\n/), parent);
        found = at >= 0;
        return found ? insertSubtask(content, at, line, this.indentUnit()) : content;
      });
    }
    if (!found) new Notice('Task Trellis: that task changed since the board loaded, so the subtask was not added. Try again.');
  }

  private indentUnit(): string {
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
    return { undo: async () => {
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
      if (skipped) new Notice(`Task Trellis: ${skipped} note(s) changed after this action and were not undone.`);
      return skipped === 0;
    } };
  }

  /**
   * Replaces each task's line in one atomic write per file, bottom-up so inserted lines don't shift
   * the rest. A line that moved is followed when that's unambiguous (see `locate`); otherwise it is
   * skipped. Returns how many tasks were skipped.
   */
  private async rewrite(path: string, tasks: BoardTask[], linesFor: (task: BoardTask) => string[], changes?: FileChange[]): Promise<number> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return tasks.length;
    let missed = 0;
    let change: FileChange | undefined;
    await this.app.vault.process(file, (content) => {
      const eol = content.includes('\r\n') ? '\r\n' : '\n';
      const lines = content.split(/\r?\n/);
      const located = tasks
        .map((task) => ({ task, at: locate(lines, task) }))
        .sort((a, b) => b.at - a.at);
      for (const { task, at } of located) {
        if (at < 0) {
          missed++;
          continue;
        }
        lines.splice(at, 1, ...linesFor(task));
      }
      const after = lines.join(eol);
      if (after !== content) change = { file, before: content, after };
      return after;
    });
    if (change) changes?.push(change);
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
