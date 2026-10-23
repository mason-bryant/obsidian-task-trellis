import { Events, TFile, type App, type CachedMetadata, type ListItemCache, type Plugin } from 'obsidian';
import { taskId, type BoardTask } from '../core/board.ts';
import { indentWidth } from '../core/subtasks.ts';
import { parseTaskLine } from '../core/taskLine.ts';
import { noteTags } from './noteTags.ts';

const NOTIFY_DELAY_MS = 150;

/** One note's tasks, with a key for what boards read from the note, so edits that change none of it are skipped. */
type FileTasks = { tasks: BoardTask[]; key: string };

/** Every task line in the vault, kept current from metadata cache events. Fires `updated`. */
export class TaskIndex extends Events {
  private byFile = new Map<string, FileTasks>();
  private notifyTimer: number | null = null;
  /**
   * While a rebuild reads the vault: notes that events updated since it began. Their state in the
   * index is newer than what the rebuild read, so it keeps them.
   */
  private rebuilding: { touched: Set<string> } | null = null;
  /** Bumped on every `updated`, so a view can tell whether it is showing the latest tasks. */
  version = 0;

  constructor(
    private app: App,
    private isExcluded: (path: string) => boolean,
  ) {
    super();
  }

  attach(plugin: Plugin): void {
    const { metadataCache, vault } = this.app;
    plugin.registerEvent(metadataCache.on('changed', (file, data, cache) => this.updateFile(file, data, cache)));
    plugin.registerEvent(
      metadataCache.on('deleted', (file) => {
        this.rebuilding?.touched.add(file.path);
        if (this.byFile.delete(file.path)) this.notify();
      }),
    );
    plugin.registerEvent(
      vault.on('rename', (file, oldPath) => {
        this.rebuilding?.touched.add(oldPath).add(file.path);
        this.byFile.delete(oldPath);
        if (file instanceof TFile) void this.readFile(file).then(() => this.notify());
        else this.notify();
      }),
    );
    // The cache may still be filling at layout-ready; rebuild once when it settles.
    const ref = metadataCache.on('resolved', () => {
      metadataCache.offref(ref);
      void this.rebuild();
    });
    plugin.registerEvent(ref);
  }

  async rebuild(): Promise<void> {
    const run = { touched: new Set<string>() };
    this.rebuilding = run;
    const next = new Map<string, FileTasks>();
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (this.isExcluded(file.path)) continue;
      const cache = this.app.metadataCache.getFileCache(file);
      if (!hasTasks(cache)) continue;
      let content: string;
      try {
        content = await this.app.vault.cachedRead(file);
      } catch {
        continue; // Deleted while the rebuild ran; its delete event updates the index.
      }
      next.set(file.path, fileTasks(file.path, content, cache!));
    }
    // A rebuild that started later read the vault later; it decides.
    if (this.rebuilding !== run) return;
    this.rebuilding = null;
    for (const path of run.touched) {
      const current = this.byFile.get(path);
      if (current) next.set(path, current);
      else next.delete(path);
    }
    this.byFile = next;
    this.notify();
  }

  all(): BoardTask[] {
    return [...this.byFile.values()].flatMap((f) => f.tasks);
  }

  private updateFile(file: TFile, data: string, cache: CachedMetadata): void {
    this.rebuilding?.touched.add(file.path);
    if (this.isExcluded(file.path) || !hasTasks(cache)) {
      if (this.byFile.delete(file.path)) this.notify();
      return;
    }
    const next = fileTasks(file.path, data, cache);
    // Ordinary prose edits do not change the board; note tags and properties can affect filters.
    if (this.byFile.get(file.path)?.key === next.key) return;
    this.byFile.set(file.path, next);
    this.notify();
  }

  private async readFile(file: TFile): Promise<void> {
    const cache = this.app.metadataCache.getFileCache(file);
    if (file.extension !== 'md' || this.isExcluded(file.path) || !hasTasks(cache)) return;
    this.byFile.set(file.path, fileTasks(file.path, await this.app.vault.cachedRead(file), cache!));
  }

  private notify(): void {
    if (this.notifyTimer !== null) window.clearTimeout(this.notifyTimer);
    this.notifyTimer = window.setTimeout(() => {
      this.notifyTimer = null;
      this.version++;
      this.trigger('updated');
    }, NOTIFY_DELAY_MS);
  }
}

function hasTasks(cache: CachedMetadata | null | undefined): boolean {
  return !!cache?.listItems?.some((li) => li.task !== undefined);
}

/** The note's tasks, keyed by their content, nesting, properties and tags used by filters. */
function fileTasks(path: string, content: string, cache: CachedMetadata): FileTasks {
  const tasks = tasksFromContent(path, content, cache);
  const key = JSON.stringify([
    cache.frontmatter ?? null,
    noteTags(cache),
    tasks.map((t) => [t.line, t.raw, t.parentId ?? null, t.twins ?? 0]),
    // Duplicate task identities depend on the surrounding note, so refresh their snapshot too.
    tasks.some((t) => t.twins) ? content : null,
  ]);
  return { tasks, key };
}

/** Uses the cache's task positions, so tasks in code blocks are skipped the way Obsidian skips them. */
function tasksFromContent(path: string, content: string, cache: CachedMetadata): BoardTask[] {
  const lines = content.split(/\r?\n/);
  const snapshot = lines.join('\n');
  const items = new Map((cache.listItems ?? []).map((li) => [li.position.start.line, li]));
  // Lines with the same text as a task, which a writer must not mistake for it if the task moves.
  const copies = new Map<string, number>();
  for (const l of lines) copies.set(l, (copies.get(l) ?? 0) + 1);
  const tasks: BoardTask[] = [];
  for (const [line, li] of items) {
    if (li.task === undefined) continue;
    const raw = lines[line];
    if (raw === undefined) continue;
    const parsed = parseTaskLine(raw);
    const parent = parentTaskLine(li, items, lines);
    const twins = (copies.get(raw) ?? 1) - 1;
    if (parsed) {
      tasks.push({
        ...parsed,
        id: taskId(path, line),
        path,
        line,
        raw,
        ...(parent !== undefined && { parentId: taskId(path, parent) }),
        ...(twins > 0 && { twins, duplicateSource: snapshot }),
      });
    }
  }
  return tasks;
}

/** Line of the nearest task `li` is nested under, through any plain bullets in between. */
function parentTaskLine(li: ListItemCache, items: Map<number, ListItemCache>, lines: string[]): number | undefined {
  const width = indentWidth(lines[li.position.start.line] ?? '');
  let at = li.parent;
  // A root item's parent is minus the list's first line, which is 0 for a list at the top of the
  // note; the indent check tells that apart from a real parent on line 0.
  while (at >= 0) {
    const item = items.get(at);
    if (!item || indentWidth(lines[at] ?? '') >= width) return undefined;
    if (item.task !== undefined) return at;
    at = item.parent;
  }
  return undefined;
}
