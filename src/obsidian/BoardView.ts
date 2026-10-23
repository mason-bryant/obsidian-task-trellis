import { Component, FileView, MarkdownRenderer, Notice, setIcon, type TFile, type WorkspaceLeaf } from 'obsidian';
import { buildBoard, planDrop, type BoardModel, type BoardTask, type DropTarget } from '../core/board.ts';
import { todayISO } from '../core/dates.ts';
import { parseTaskLine } from '../core/taskLine.ts';
import { isDragging, renderBoard, type RenderHost } from '../ui/renderBoard.ts';
import type { BoardEntry } from './BoardRegistry.ts';
import { BoardSettingsModal } from './BoardSettingsModal.ts';
import type TaskTrellisPlugin from '../../main.ts';

export const VIEW_TYPE_BOARD = 'task-trellis-board';

const STALENESS_CHECK_MS = 2_000;

/** A board note shown as a board. The note's front matter is the board's configuration. */
export class BoardView extends FileView {
  allowNoFile = false;
  private board: BoardEntry | null = null;
  private model: BoardModel | null = null;
  private today = todayISO();
  /** Lines a drop is writing, keyed by task id, until the index re-reads the line (`from` is the line before). */
  private pending = new Map<string, { raw: string; from: string }>();
  private renderQueued = false;
  /** Index version the board was last drawn from. */
  private renderedVersion = -1;
  /** Owns the markdown rendered into cards; replaced on every redraw. */
  private textScope: Component | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private plugin: TaskTrellisPlugin,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_BOARD;
  }

  getIcon(): string {
    return 'kanban';
  }

  getDisplayText(): string {
    return this.file?.basename ?? 'Task Trellis';
  }

  canAcceptExtension(extension: string): boolean {
    return extension === 'md';
  }

  onload(): void {
    super.onload();
    this.contentEl.addClass('task-trellis-view');
    this.addAction('settings', 'Board settings', () => {
      if (this.file) new BoardSettingsModal(this.app, this.plugin, this.file, this.plugin.boards.entry(this.file).config).open();
    });
    this.registerEvent(
      this.plugin.index.on('updated', () => {
        const current = new Map(this.plugin.index.all().map((t) => [t.id, t.raw]));
        for (const [id, entry] of this.pending) if (current.get(id) !== entry.from) this.pending.delete(id);
        this.queueRender();
      }),
    );
    this.registerEvent(
      this.app.metadataCache.on('changed', (file) => {
        if (file === this.file) this.queueRender();
      }),
    );
    // Safety net for a missed redraw, and the midnight rollover. Only compares numbers; changes
    // themselves (including edits made outside Obsidian) arrive through the index's events.
    this.registerInterval(
      window.setInterval(() => {
        if (this.plugin.index.version !== this.renderedVersion || todayISO() !== this.today) this.queueRender();
      }, STALENESS_CHECK_MS),
    );
  }

  async onLoadFile(file: TFile): Promise<void> {
    const entry = this.plugin.boards.entry(file);
    // The slug is fixed once so placement tags and hotkeys keep working after a rename.
    if (entry.slugMissing) {
      await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
        fm.slug = entry.config.slug;
      });
    }
    this.render();
  }

  async onUnloadFile(): Promise<void> {
    this.contentEl.empty();
    this.board = null;
    this.model = null;
  }

  async onRename(): Promise<void> {
    this.render();
  }

  queueRender(): void {
    if (this.renderQueued) return;
    this.renderQueued = true;
    // The board's own window: the main window's frames pause while it is hidden, which would
    // stall a board in another window.
    this.containerEl.win.requestAnimationFrame(() => {
      this.renderQueued = false;
      // Redrawing mid-drag would drop the dragged element; onDragEnd catches up.
      if (!isDragging()) this.render();
    });
  }

  private render(): void {
    if (!this.file) return;
    this.today = todayISO();
    this.board = this.plugin.boards.entry(this.file);
    this.renderedVersion = this.plugin.index.version;
    if (this.textScope) this.removeChild(this.textScope);
    this.textScope = this.addChild(new Component());
    const tasks = this.plugin.index.all().map((t) => this.withPending(t));
    this.model = buildBoard(tasks, this.board.config, this.today, (path) => this.app.metadataCache.getCache(path)?.frontmatter);

    const info: string[] = [];
    if (!this.plugin.writer.tasksApi()) {
      info.push('The Tasks plugin is not enabled: clicking a card opens its source line instead of the Tasks editor.');
    }
    if (this.model.total === 0) {
      info.push('No tasks match this board yet. Open Board settings (gear icon) to change its filters.');
      const missing = this.missingFilterKeys();
      if (missing.length > 0) {
        this.board.warnings.push(`No note has a property named ${missing.map((k) => `"${k}"`).join(', ')}, so filter-properties matches nothing.`);
      }
    }
    renderBoard(this.contentEl, this.model, this.host(), { warnings: this.board.warnings, info });
  }

  /** Filter keys no note in the vault has; only checked when the board is empty. */
  private missingFilterKeys(): string[] {
    const keys = new Set(this.board?.config.propertyFilters.map((f) => f.key) ?? []);
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (keys.size === 0) break;
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
      if (fm) for (const key of Object.keys(fm)) keys.delete(key);
    }
    return [...keys];
  }

  private withPending(task: BoardTask): BoardTask {
    const entry = this.pending.get(task.id);
    const parsed = entry ? parseTaskLine(entry.raw) : null;
    return entry && parsed ? { ...task, ...parsed, raw: entry.raw } : task;
  }

  private host(): RenderHost {
    return {
      renderText: (el, task) => {
        void MarkdownRenderer.render(this.app, task.text, el, task.path, this.textScope ?? this).then(() => {
          // A rendered task text is one paragraph; unwrap it so it sits beside the checkbox.
          const p = el.querySelector(':scope > p');
          if (p && el.childElementCount === 1) p.replaceWith(...p.childNodes);
        });
        el.addEventListener('click', (e) => {
          const link = (e.target as HTMLElement).closest<HTMLAnchorElement>('a.internal-link, a.tag');
          if (!link) return;
          e.preventDefault();
          if (link.classList.contains('tag')) {
            this.plugin.searchTag(link.textContent ?? '');
            return;
          }
          const href = link.dataset.href ?? link.getAttribute('href') ?? '';
          void this.app.workspace.openLinkText(href, task.path, e.ctrlKey || e.metaKey);
        });
      },
      icon: (el, name) => setIcon(el, name),
      sourceLabel: (task) => task.path.split('/').pop()?.replace(/\.md$/, '') ?? task.path,
      isCollapsed: (rowId) => this.plugin.isRowCollapsed(this.board?.config.slug ?? '', rowId),
      onToggleRow: (rowId) => {
        if (!this.board || !this.model) return;
        void this.plugin.toggleRow(this.board.config.slug, rowId, this.model.rows.map((r) => r.id));
        this.render();
      },
      onDrop: (taskId, target) => void this.drop(taskId, target),
      onToggle: (task) => void this.plugin.writer.toggle(task).then((lines) => this.showWritten(task, lines)),
      onEdit: (task) => void this.plugin.writer.editInModal(task).then((lines) => this.showWritten(task, lines)),
      onOpenSource: (task, newTab) => void this.plugin.writer.openSource(task, newTab),
      onDragEnd: () => this.queueRender(),
      onAddTask: (target, text, detailed) => {
        if (this.model) void this.plugin.quickAdd.addFromBoard(this.model, target, text, detailed);
      },
      onAddSubtask: (parent, text, detailed) => void this.plugin.quickAdd.addSubtask(parent, text, detailed),
    };
  }

  /** Redraws with lines just written, before the index re-reads the note. Ids are line positions, so the first line keeps the task's id. */
  private showWritten(task: BoardTask, lines: string[] | null): void {
    const raw = lines?.[0];
    if (raw === undefined || raw === task.raw) return;
    this.pending.set(task.id, { raw, from: task.raw });
    this.render();
  }

  private async drop(taskId: string, target: DropTarget): Promise<void> {
    if (!this.model || !this.board) return;
    const edits = planDrop(this.model, taskId, target);
    if (edits.size === 0) return;
    // The lines the board shows, so a drop right after another one edits what that one wrote.
    const tasks = this.plugin.index
      .all()
      .filter((t) => edits.has(t.id))
      .map((t) => this.withPending(t));
    const slug = this.board.config.slug;
    // Show the result right away; the index catches up once the files are written.
    for (const [id, raw] of this.plugin.writer.preview(tasks, edits, slug)) {
      const from = tasks.find((t) => t.id === id)?.raw;
      if (from !== undefined) this.pending.set(id, { raw, from });
    }
    this.render();
    try {
      await this.plugin.writer.applyEdits(tasks, edits, slug);
    } catch (err) {
      console.error('[Task Trellis] write failed', err);
      new Notice('Task Trellis: could not update the task. See the console for details.');
      this.pending.clear();
      this.render();
    }
  }
}
