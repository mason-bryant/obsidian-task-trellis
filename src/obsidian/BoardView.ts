import { applyLabelScheme, parsePreviousScheme, type LabelSchemeState } from '../core/labelSchemes.ts';
import { isColumnResizing } from '../ui/columnResize.ts';
import { parseColumnWidths } from '../core/columnWidths.ts';
import { FM } from '../core/boardConfig.ts';
import { parseLabels, taskLabels, type BoardLabel } from '../core/labels.ts';
import { LabelPickerModal } from './LabelPickerModal.ts';
import { Component, FileView, MarkdownRenderer, Menu, Notice, parseLinktext, setIcon, type TFile, type WorkspaceLeaf } from 'obsidian';
import { buildBoard, planDrop, type BoardModel, type BoardTask, type DropTarget, type MoveChoice } from '../core/board.ts';
import { missingRequiredPropertyKeys } from '../core/filters.ts';
import { todayISO } from '../core/dates.ts';
import { parseTaskLine } from '../core/taskLine.ts';
import { isDragging, renderBoard, type RenderHost } from '../ui/renderBoard.ts';
import type { BoardEntry } from './BoardRegistry.ts';
import { BoardSettingsModal } from './BoardSettingsModal.ts';
import { RenameBoardModal } from './RenameBoardModal.ts';
import { noteTags } from './noteTags.ts';
import { openInPopup } from './NotePopup.ts';
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

  async onRename(file: TFile): Promise<void> {
    await super.onRename(file);
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
      if (!isDragging() && !isColumnResizing(this.contentEl)) this.render();
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
      (path) => noteTags(this.app.metadataCache.getCache(path)),
      this.plugin.activeQuickFilters(this.board.config.slug));

    const info: string[] = [];
    if (!this.plugin.writer.tasksApi()) {
      info.push('The Tasks plugin is not enabled: clicking a card opens its source line instead of the Tasks editor.');
    }
    if (this.model.total === 0) {
      const missing = this.missingFilterKeys();
      if (missing.length > 0) {
        this.board.warnings.push(`No note has a property named ${missing.map((k) => `"${k}"`).join(', ')}, so filter-properties matches nothing.`);
      }
    }
    renderBoard(this.contentEl, this.model, this.host(), { warnings: this.board.warnings, info });
  }

  /** The card's note in the pop-up editor at its line, or in a tab, as Settings say. */
  private openSource(task: BoardTask, newTab: boolean): void {
    const navigate = () => void this.plugin.writer.openSource(task, newTab);
    if (newTab || this.board?.config.openLinks === 'tab') { navigate(); return; }
    openInPopup(this.app, this.app.vault.getFileByPath(task.path), { line: task.line }, navigate);
  }

  /** Filter keys no note in the vault has; only checked when the board is empty. */
  private missingFilterKeys(): string[] {
    return this.board ? missingRequiredPropertyKeys(this.board.config, this.app.vault.getMarkdownFiles()
      .map((file) => this.app.metadataCache.getFileCache(file)?.frontmatter)) : [];
  }

  private moveQueue: Promise<void> = Promise.resolve();

  private withPending(task: BoardTask): BoardTask {
    const entry = this.pending.get(task.id);
    const parsed = entry ? parseTaskLine(entry.raw) : null;
    return entry && parsed ? { ...task, ...parsed, raw: entry.raw } : task;
  }

  private host(): RenderHost {
    return {
      onLabels: (task) => this.openLabels(task),
      onColumnWidthsChange: async (widths) => {
        const file = this.file;
        if (!file) return;
        try {
          await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
            const columns = this.plugin.boards.entry(file).config.columns.map((c) => c.id);
            const next = parseColumnWidths(widths, columns);
            if (Object.keys(next).length) fm[FM.columnWidths] = next;
            else delete fm[FM.columnWidths];
          });
        } catch (error) {
          new Notice('Task Trellis: could not save column widths. The previous widths have been restored.');
          throw error;
        }
      },
      onSettings: (section) => { if (this.file) new BoardSettingsModal(this.app, this.plugin, this.file, this.plugin.boards.entry(this.file).config, section).open(); },
      onRename: () => { if (this.file) new RenameBoardModal(this.app, this.file, this.plugin.boardRenames).open(); },
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
          // Always a new tab: in this one the board view would take the note as its board.
          const navigate = () => void this.app.workspace.openLinkText(href, task.path, true);
          if (e.ctrlKey || e.metaKey || this.board?.config.openLinks === 'tab') { navigate(); return; }
          const { path, subpath } = parseLinktext(href);
          openInPopup(this.app, this.app.metadataCache.getFirstLinkpathDest(path, task.path), subpath ? { subpath } : {}, navigate);
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
      isViewOn: (option) => this.plugin.isViewOn(this.board?.config.slug ?? '', option),
      onToggleView: (option) => {
        if (!this.board) return;
        void this.plugin.toggleView(this.board.config.slug, option);
        this.render();
      },
      onSetHideCompletedSubtasks: (hide) => {
        const file = this.file;
        if (!file) return;
        void this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => { fm[FM.hideCompletedSubtasks] = hide; })
          .catch((error: unknown) => { console.error('[Task Trellis] saving board setting failed', error); new Notice('Task Trellis: could not save the board setting.'); });
      },
      onSetQuickFilters: (ids) => {
        if (!this.board) return;
        void this.plugin.setActiveQuickFilters(this.board.config.slug, ids);
        this.render();
      },
      onDrop: (taskId, target) => void this.drop(taskId, target),
      onToggle: (task) => void this.plugin.writer.toggle(this.plugin.index.currentSnapshot(task), (action) => {
        this.undoAction = { label: task.closed ? 'Task reopened' : 'Task completed', action };
        this.highlightIds = new Set([task.id]); this.highlightUntil = Date.now() + 1000;
      }).then((lines) => this.showWritten(task, lines)).catch((error) => { console.error(error); new Notice('Task Trellis: could not update the task.'); }),
      onEdit: (task) => this.plugin.writer.tasksApi() ? void this.plugin.writer.editInModal(this.plugin.index.currentSnapshot(task)).then((lines) => this.showWritten(task, lines)).catch((error: unknown) => { console.error('[Task Trellis] editor failed', error); new Notice('Task Trellis: could not open the task editor.'); }) : this.openSource(task, false),
      onOpenSource: (task, newTab) => this.openSource(task, newTab),
      onDragEnd: () => this.queueRender(),
      onAddTask: async (target, text, detailed) => {
        try { return this.model ? await this.plugin.quickAdd.addFromBoard(this.model, target, text, detailed) : false; }
        catch (error) { console.error('[Task Trellis] add failed', error); new Notice('Task Trellis: could not save the task. Your text has been kept; check the destination and try again.'); return false; }
      },
      onAddSubtask: async (parent, text, detailed) => {
        try { return await this.plugin.quickAdd.addSubtask(this.plugin.index.currentSnapshot(parent), text, detailed); }
        catch (error) { console.error('[Task Trellis] subtask failed', error); new Notice('Task Trellis: could not save the subtask. Your text has been kept; try again.'); return false; }
      },
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
        const anchor = evt.currentTarget as HTMLElement | null;
        if (evt.detail === 0 && anchor) {
          const bounds = anchor.getBoundingClientRect();
          menu.showAtPosition({ x: bounds.left, y: bounds.bottom });
        } else menu.showAtMouseEvent(evt);
      },
    };
  }

  private openLabels(task: BoardTask): void {
    if (!this.file || !this.board) return;
    const file = this.file;
    const { slug, labels } = this.board.config;
    let current = this.plugin.index.currentSnapshot(task);
    new LabelPickerModal(this.app, labels, taskLabels(task.raw, slug), {
      showSearch: this.plugin.settings.showLabelSearch,
      previousScheme: this.board.config.previousLabelScheme,
      saveScheme: async (id) => {
        let updated!: LabelSchemeState;
        await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
          const current = { labels: parseLabels(fm[FM.labels], []), previous: parsePreviousScheme(fm[FM.previousLabelScheme]) };
          updated = applyLabelScheme(current, id);
          if (updated !== current) {
            fm[FM.labels] = updated.labels;
            fm[FM.previousLabelScheme] = updated.previous;
          }
        });
        this.queueRender();
        return updated;
      },
      onClose: () => {
        [...this.contentEl.querySelectorAll<HTMLElement>('[data-board-focus]')]
          .find((el) => el.dataset.boardFocus === `labels:${current.id}`)?.focus({ preventScroll: true });
      },
      icon: (el, name) => setIcon(el, name),
      saveSelection: async (ids) => {
        const written = await this.plugin.writer.setLabels(current, slug, ids, (action) => {
          this.undoAction = { label: 'Task labels updated', action };
        });
        this.showWritten(current, [written.raw]);
        current = written;
      },
      saveLabel: async (label) => {
        let updated: BoardLabel[] = [];
        await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
          const palette = parseLabels(fm[FM.labels], []);
          updated = palette.some((l) => l.id === label.id)
            ? palette.map((l) => l.id === label.id ? label : l) : [...palette, label];
          fm[FM.labels] = updated;
        });
        this.queueRender();
        return updated;
      },
    }).open();
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
      const paths = new Set(entry.action.paths);
      for (const task of this.plugin.index.all()) if (paths.has(task.path)) this.pending.delete(task.id);
      await this.plugin.index.refresh(entry.action.paths);
    } catch (error) {
      console.error('[Task Trellis] undo failed', error);
      new Notice('Task Trellis: could not undo the action.');
    }
    this.render();
  }

  private drop(taskId: string, target: DropTarget): Promise<void> {
    // Plan each move after the previous write/index refresh, including duplicate source snapshots.
    const slug = this.board?.config.slug;
    const move = this.moveQueue.then(() => this.board?.config.slug === slug ? this.performDrop(taskId, target) : undefined);
    this.moveQueue = move.catch((error: unknown) => { console.error('[Task Trellis] move failed', error); });
    return this.moveQueue;
  }

  private async performDrop(taskId: string, target: DropTarget): Promise<void> {
    if (this.stopped || !this.model || !this.board) return;
    const edits = planDrop(this.model, taskId, target);
    if (edits.size === 0) return;
    // The lines the board shows, so a drop right after another one edits what that one wrote.
    const tasks = Object.values(this.model.cells).flatMap((columns) => Object.values(columns).flat())
      .filter((t) => edits.has(t.id))
      .map((t) => this.withPending(this.plugin.index.currentSnapshot(t)));
    const slug = this.board.config.slug;
    // Show the result right away; the index catches up once the files are written.
    for (const [id, raw] of this.plugin.writer.preview(tasks, edits, slug)) {
      const from = tasks.find((t) => t.id === id)?.raw;
      if (from !== undefined) this.pending.set(id, { raw, from });
    }
    const owned = new Map([...edits.keys()].map((id) => [id, this.pending.get(id)]));
    this.render();
    try {
      const result = await this.plugin.writer.applyEdits(tasks, edits, slug);
      const action = result.action;
      if (action) {
        this.undoAction = { label: 'Task moved', action };
        this.highlightIds = new Set([taskId]); this.highlightUntil = Date.now() + 1000;
      }
      for (const id of result.skippedIds) if (this.pending.get(id) === owned.get(id)) this.pending.delete(id);
      await this.plugin.index.refresh(tasks.map((task) => task.path));
      for (const id of result.appliedIds) if (this.pending.get(id) === owned.get(id)) this.pending.delete(id);
      this.render();
    } catch (err) {
      console.error('[Task Trellis] write failed', err);
      new Notice('Task Trellis: could not update the task. See the console for details.');
      for (const id of edits.keys()) if (this.pending.get(id) === owned.get(id)) this.pending.delete(id);
      this.render();
    }
  }
}
