import { Events, TFile, type App, type CachedMetadata, type ListItemCache, type Plugin } from 'obsidian';
import { taskId, type BoardTask } from '../core/board.ts';
import { indentWidth } from '../core/subtasks.ts';
import { parseTaskLine } from '../core/taskLine.ts';

const NOTIFY_DELAY_MS = 150;

/** Every task line in the vault, kept current from metadata cache events. Fires `updated`. */
export class TaskIndex extends Events {
  private byFile = new Map<string, BoardTask[]>();
  private notifyTimer: number | null = null;
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
        if (this.byFile.delete(file.path)) this.notify();
      }),
    );
    plugin.registerEvent(
      vault.on('rename', (file, oldPath) => {
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
    const next = new Map<string, BoardTask[]>();
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (this.isExcluded(file.path)) continue;
      const cache = this.app.metadataCache.getFileCache(file);
      if (!hasTasks(cache)) continue;
      next.set(file.path, tasksFromContent(file.path, await this.app.vault.cachedRead(file), cache!));
    }
    this.byFile = next;
    this.notify();
  }

  all(): BoardTask[] {
    return [...this.byFile.values()].flat();
  }

  private updateFile(file: TFile, data: string, cache: CachedMetadata): void {
    if (this.isExcluded(file.path) || !hasTasks(cache)) {
      if (this.byFile.delete(file.path)) this.notify();
      return;
    }
    this.byFile.set(file.path, tasksFromContent(file.path, data, cache));
    this.notify();
  }

  private async readFile(file: TFile): Promise<void> {
    const cache = this.app.metadataCache.getFileCache(file);
    if (file.extension !== 'md' || this.isExcluded(file.path) || !hasTasks(cache)) return;
    this.byFile.set(file.path, tasksFromContent(file.path, await this.app.vault.cachedRead(file), cache!));
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

/** Uses the cache's task positions, so tasks in code blocks are skipped the way Obsidian skips them. */
function tasksFromContent(path: string, content: string, cache: CachedMetadata): BoardTask[] {
  const lines = content.split(/\r?\n/);
  const items = new Map((cache.listItems ?? []).map((li) => [li.position.start.line, li]));
  const tasks: BoardTask[] = [];
  for (const [line, li] of items) {
    if (li.task === undefined) continue;
    const raw = lines[line];
    if (raw === undefined) continue;
    const parsed = parseTaskLine(raw);
    const parent = parentTaskLine(li, items, lines);
    if (parsed) tasks.push({ ...parsed, id: taskId(path, line), path, line, raw, ...(parent !== undefined && { parentId: taskId(path, parent) }) });
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
