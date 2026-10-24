import { Component, FileView, MarkdownRenderer, Menu, Notice, setIcon, type TFile, type WorkspaceLeaf } from 'obsidian';
import { buildBoard, planDrop, type BoardModel, type BoardTask, type DropTarget, type MoveChoice } from '../core/board.ts';
import { missingRequiredPropertyKeys } from '../core/filters.ts';
import { todayISO } from '../core/dates.ts';
import { parseTaskLine } from '../core/taskLine.ts';
import { isDragging, renderBoard, type RenderHost } from '../ui/renderBoard.ts';
import type { BoardEntry } from './BoardRegistry.ts';
import { BoardSettingsModal } from './BoardSettingsModal.ts';
import { noteTags } from './noteTags.ts';
import type { UndoAction } from './TaskWriter.ts';
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
  private cancelRender: (() => void) | null = null;
  private stopped = false;
  /** Index version the board was last drawn from. */
  private renderedVersion = -1;
  /** Owns the markdown rendered into cards; replaced on every redraw. */
  private textScope: Component | null = null;
  private undoAction: { label: string; action: UndoAction } | null = null;
  private highlightIds = new Set<string>();
  private highlightUntil = 0;

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
    this.stopped = false;
    this.register(() => {
      this.stopped = true;
      this.cancelRender?.();
      this.cancelRender = null;
      this.renderQueued = false;
    });
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
    this.undoAction = null;
    this.pending.clear();
  }

  async onRename(): Promise<void> {
    this.render();
  }

  queueRender(): void {
    if (this.stopped || this.renderQueued) return;
    this.renderQueued = true;
    // The board's own window: the main window's frames pause while it is hidden, which would
    // stall a board in another window.
    const win = this.containerEl.win;
    const frame = win.requestAnimationFrame(() => {
      this.cancelRender = null;
      this.renderQueued = false;
      // Redrawing mid-drag would drop the dragged element; onDragEnd catches up.
      if (!isDragging()) this.render();
    });
    this.cancelRender = () => win.cancelAnimationFrame(frame);
  }

  private render(): void {
    if (this.stopped || !this.file) return;
    this.today = todayISO();
    this.board = this.plugin.boards.entry(this.file);
    this.renderedVersion = this.plugin.index.version;
    if (this.textScope) this.removeChild(this.textScope);
    this.textScope = this.addChild(new Component());
    const tasks = this.plugin.index.all().map((t) => this.withPending(t));
    this.model = buildBoard(tasks, this.board.config, this.today,
      (path) => this.app.metadataCache.getCache(path)?.frontmatter,
      (path) => noteTags(this.app.metadataCache.getCache(path)));

    const info: string[] = [];
    if (!this.plugin.writer.tasksApi()) {
      info.push('The Tasks plugin is not enabled: clicking a card opens its source line instead of the Tasks editor.');
    }
    if (this.model.total === 0) {
      info.push('No tasks match this board yet. Open Settings to change its filters.');
      const missing = this.missingFilterKeys();
      if (missing.length > 0) {
        this.board.warnings.push(`No note has a property named ${missing.map((k) => `"${k}"`).join(', ')}, so filter-properties matches nothing.`);
      }
    }
    renderBoard(this.contentEl, this.model, this.host(), { warnings: this.board.warnings, info });
  }

  /** Filter keys no note in the vault has; only checked when the board is empty. */
  private missingFilterKeys(): string[] {
    return this.board ? missingRequiredPropertyKeys(this.board.config, this.app.vault.getMarkdownFiles()
      .map((file) => this.app.metadataCache.getFileCache(file)?.frontmatter)) : [];
  }

  private withPending(task: BoardTask): BoardTask {
    const entry = this.pending.get(task.id);
    const parsed = entry ? parseTaskLine(entry.raw) : null;
    return entry && parsed ? { ...task, ...parsed, raw: entry.raw } : task;
  }

  private host(): RenderHost {
    return {
      onSettings: () => { if (this.file) new BoardSettingsModal(this.app, this.plugin, this.file, this.plugin.boards.entry(this.file).config).open(); },
      highlightIds: Date.now() < this.highlightUntil ? this.highlightIds : undefined,
      undo: this.undoAction ? { label: this.undoAction.label, run: () => void this.undo() } : undefined,
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
      onSetSubtasksCollapsed: (keys, collapsed) => {
        if (!this.board) return;
        void this.plugin.setSubtasksCollapsed(this.board.config.slug, keys, collapsed);
        this.render();
      },
      onDrop: (taskId, target) => void this.drop(taskId, target),
      onToggle: (task) => void this.plugin.writer.toggle(task, (action) => {
        this.undoAction = { label: task.closed ? 'Task reopened' : 'Task completed', action };
        this.highlightIds = new Set([task.id]); this.highlightUntil = Date.now() + 1000;
      }).then((lines) => this.showWritten(task, lines)).catch((error) => { console.error(error); new Notice('Task Trellis: could not update the task.'); }),
      onEdit: (task) => void this.plugin.writer.editInModal(task).then((lines) => this.showWritten(task, lines)),
      onOpenSource: (task, newTab) => void this.plugin.writer.openSource(task, newTab),
      onDragEnd: () => this.queueRender(),
      onAddTask: (target, text, detailed) => {
        if (this.model) void this.plugin.quickAdd.addFromBoard(this.model, target, text, detailed);
      },
      onAddSubtask: (parent, text, detailed) => void this.plugin.quickAdd.addSubtask(parent, text, detailed),
      // A bottom sheet on phones.
      onMoveMenu: (task, choices, evt) => {
        const menu = new Menu();
        const section = (title: string, list: MoveChoice[]) => {
          menu.addItem((item) => item.setTitle(title).setIsLabel(true));
          for (const choice of list) {
            menu.addItem((item) => {
              item.setTitle(createFragment((f) => {
                f.appendText(choice.label);
                if (choice.detail) f.createSpan({ cls: 'tt-menu-detail', text: choice.detail });
              }));
              if (choice.current) item.setChecked(true).setDisabled(true);
              else item.onClick(() => void this.drop(task.id, choice.target));
            });
          }
        };
        section('Move to column', choices.columns);
        menu.addSeparator();
        section('Move to row', choices.rows);
        menu.showAtMouseEvent(evt);
      },
    };
  }

  /** Redraws with lines just written, before the index re-reads the note. Ids are line positions, so the first line keeps the task's id. */
  private showWritten(task: BoardTask, lines: string[] | null): void {
    const raw = lines?.[0];
    if (raw === undefined || raw === task.raw) return;
    this.pending.set(task.id, { raw, from: task.raw });
    this.render();
  }

  private async undo(): Promise<void> {
    const entry = this.undoAction;
    if (!entry) return;
    this.undoAction = null;
    try {
      await entry.action.undo();
      this.pending.clear();
      await this.plugin.index.rebuild();
    } catch (error) {
      console.error('[Task Trellis] undo failed', error);
      new Notice('Task Trellis: could not undo the action.');
    }
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
      const action = await this.plugin.writer.applyEdits(tasks, edits, slug);
      if (action) {
        this.undoAction = { label: 'Task moved', action };
        this.highlightIds = new Set([taskId]); this.highlightUntil = Date.now() + 1000;
      }
      if (!action) for (const id of edits.keys()) this.pending.delete(id);
      this.render();
    } catch (err) {
      console.error('[Task Trellis] write failed', err);
      new Notice('Task Trellis: could not update the task. See the console for details.');
      this.pending.clear();
      this.render();
    }
  }
}
