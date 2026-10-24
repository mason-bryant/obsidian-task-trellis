import { around } from 'monkey-around';
import {
  FuzzySuggestModal,
  Modal,
  Notice,
  Plugin,
  Setting,
  TFile,
  WorkspaceLeaf,
  normalizePath,
  type App,
  type ViewCreator,
  type ViewState,
} from 'obsidian';
import { LEGACY_FM, newBoardFrontmatter, type BoardConfig } from './src/core/boardConfig.ts';
import { draftToFrontmatter, type BoardDraft } from './src/core/boardDraft.ts';
import type { TaskEdit } from './src/core/board.ts';
import { setSubtaskCollapse } from './src/core/collapse.ts';
import { inFolder } from './src/core/filters.ts';
import { slugify } from './src/core/taskLine.ts';
import { BoardRegistry } from './src/obsidian/BoardRegistry.ts';
import { BoardView, VIEW_TYPE_BOARD } from './src/obsidian/BoardView.ts';
import { TaskIndex } from './src/obsidian/TaskIndex.ts';
import { TaskWriter } from './src/obsidian/TaskWriter.ts';
import { QuickAdd } from './src/obsidian/QuickAdd.ts';
import { DEFAULT_SETTINGS, normalizeSettings, TaskTrellisSettingTab, type TaskTrellisSettings } from './src/settings.ts';

type ViewRegistryHost = {
  viewRegistry?: {
    registerView(type: string, creator: ViewCreator): void;
    unregisterView(type: string): void;
  };
};

type SearchHost = {
  internalPlugins?: {
    getPluginById?(id: string): { instance?: { openGlobalSearch?(query: string): void } } | null;
  };
};

export default class TaskTrellisPlugin extends Plugin {
  settings: TaskTrellisSettings = DEFAULT_SETTINGS;
  index!: TaskIndex;
  writer!: TaskWriter;
  boards!: BoardRegistry;
  quickAdd!: QuickAdd;
  /** Leaves showing a board note as markdown on purpose, with the path they were switched for. */
  private markdownLeaves = new WeakMap<WorkspaceLeaf, string>();
  private syncTimer: number | null = null;
  private configTimer: number | null = null;
  private stopped = false;

  async onload(): Promise<void> {
    this.stopped = false;
    this.register(() => {
      this.stopped = true;
      if (this.configTimer !== null) window.clearTimeout(this.configTimer);
      if (this.syncTimer !== null) window.clearTimeout(this.syncTimer);
    });
    this.settings = normalizeSettings(await this.loadData());
    if (this.stopped) return;
    this.index = new TaskIndex(this.app, (path) => this.isExcludedFromIndex(path));
    this.writer = new TaskWriter(this.app);
    this.boards = new BoardRegistry(this);
    this.quickAdd = new QuickAdd(this);

    this.registerBoardView();
    this.patchBoardNoteOpening();

    this.addRibbonIcon('kanban', 'Open Task Trellis board', () => this.pickBoard());
    this.addCommand({ id: 'open-board', name: 'Open board…', callback: () => this.pickBoard() });
    this.addCommand({ id: 'create-board', name: 'Create board', callback: () => this.promptNewBoard() });
    this.addCommand({ id: 'add-task', name: 'Add task', callback: () => void this.quickAdd.addFromCommand() });
    this.addCommand({
      id: 'open-current-as-board',
      name: 'Open current note as board',
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        const leaf = this.app.workspace.getMostRecentLeaf();
        if (!file || !leaf || !this.boards.isBoardPath(file.path)) return false;
        if (!checking) void this.openAsBoard(leaf, file);
        return true;
      },
    });
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file, _source, leaf) => {
        if (!(file instanceof TFile) || !this.boards.isBoardPath(file.path)) return;
        if (leaf?.view.getViewType() === VIEW_TYPE_BOARD) return;
        menu.addItem((item) =>
          item
            .setTitle('Open as board')
            .setIcon('kanban')
            .onClick(() => (leaf ? this.openAsBoard(leaf, file) : this.openBoard(file))),
        );
      }),
    );

    this.addSettingTab(new TaskTrellisSettingTab(this.app, this));

    this.app.workspace.onLayoutReady(async () => {
      if (this.stopped) return;
      this.index.attach(this);
      this.registerBoardWatchers();
      await this.index.rebuild();
      if (!this.stopped) this.boards.syncCommands();
    });
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /** Boards folder or excluded folders changed. Waits for typing in the settings to pause before re-reading the vault. */
  onConfigChanged(): void {
    if (this.stopped) return;
    if (this.configTimer !== null) window.clearTimeout(this.configTimer);
    this.configTimer = window.setTimeout(() => {
      this.configTimer = null;
      void this.index.rebuild();
      this.queueCommandSync();
    }, 500);
  }

  isExcludedFromIndex(path: string): boolean {
    return (
      this.boards.isBoardPath(path) ||
      this.settings.excludedFolders.some((f) => inFolder(path, f)) ||
      path.startsWith(this.app.vault.configDir + '/')
    );
  }

  /** Later and the Done "more" lists start collapsed; every other row, and every subtask list, starts open. */
  isRowCollapsed(slug: string, rowId: string): boolean {
    return this.settings.collapsed[slug]?.[rowId] ?? (rowId === 'later' || rowId.startsWith('more:'));
  }

  /** Flips a row, a Done "more" list or a card's subtasks, and forgets week rows that have scrolled off the board. */
  async toggleRow(slug: string, rowId: string, currentRowIds: string[]): Promise<void> {
    const rows = { ...(this.settings.collapsed[slug] ?? {}) };
    rows[rowId] = !this.isRowCollapsed(slug, rowId);
    for (const id of Object.keys(rows)) {
      const row = id.replace(/^more:/, '');
      if (row.startsWith('week-') && !currentRowIds.includes(row)) delete rows[id];
      // Subtask lists start open, so only the collapsed ones need remembering.
      if (id.startsWith('sub:') && !rows[id]) delete rows[id];
    }
    this.settings.collapsed[slug] = rows;
    await this.saveSettings();
  }

  /** Persist a board-wide subtask action once, instead of toggling and saving every card. */
  async setSubtasksCollapsed(slug: string, keys: string[], collapsed: boolean): Promise<void> {
    this.settings.collapsed[slug] = setSubtaskCollapse(this.settings.collapsed[slug] ?? {}, keys, collapsed);
    await this.saveSettings();
  }

  async openBoard(file: TFile): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace
      .getLeavesOfType(VIEW_TYPE_BOARD)
      .find((leaf) => (leaf.view as BoardView).file?.path === file.path);
    if (existing) {
      await workspace.revealLeaf(existing);
      return;
    }
    const leaf = workspace.getLeaf('tab');
    await leaf.setViewState({ type: VIEW_TYPE_BOARD, state: { file: file.path }, active: true });
  }

  /** Opens the board note itself in a new tab, leaving the board where it is. */
  async openNoteBesideBoard(file: TFile): Promise<void> {
    const leaf = this.app.workspace.getLeaf('tab');
    this.markdownLeaves.set(leaf, file.path);
    await leaf.setViewState({ type: 'markdown', state: { file: file.path }, active: true });
  }

  /** Writes the settings form to the board note and retags tasks in renamed columns. Returns validation errors. */
  async saveBoardSettings(file: TFile, config: BoardConfig, draft: BoardDraft): Promise<string[]> {
    const { frontmatter, errors, renames } = draftToFrontmatter(draft, config);
    if (errors.length > 0) return errors;
    await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
      Object.assign(fm, frontmatter);
      for (const key of Object.values(LEGACY_FM)) delete fm[key];
    });
    if (renames.size > 0) await this.retagColumns(config.slug, renames);
    return [];
  }

  private async retagColumns(slug: string, renames: Map<string, string>): Promise<void> {
    const tasks = this.index.all().filter((t) => renames.has(t.placements[slug]?.column ?? ''));
    const edits = new Map<string, TaskEdit>();
    for (const task of tasks) {
      const placement = task.placements[slug]!;
      edits.set(task.id, { column: renames.get(placement.column)!, sort: placement.sort });
    }
    await this.writer.applyEdits(tasks, edits, slug);
  }

  async openAsBoard(leaf: WorkspaceLeaf, file: TFile): Promise<void> {
    this.markdownLeaves.delete(leaf);
    await leaf.setViewState({ type: VIEW_TYPE_BOARD, state: { file: file.path }, active: true });
  }

  searchTag(tag: string): void {
    const search = (this.app as unknown as SearchHost).internalPlugins?.getPluginById?.('global-search');
    search?.instance?.openGlobalSearch?.(`tag:${tag.startsWith('#') ? tag : `#${tag}`}`);
  }

  /**
   * Plugin.registerView closes every board tab when the user disables the plugin. Registering with the
   * view registry directly skips that, so Obsidian keeps the tabs as placeholders and restores them in
   * place when the plugin is enabled again, as it does for any other plugin reload.
   */
  private registerBoardView(): void {
    const creator: ViewCreator = (leaf) => new BoardView(leaf, this);
    const registry = (this.app as unknown as ViewRegistryHost).viewRegistry;
    if (!registry) {
      this.registerView(VIEW_TYPE_BOARD, creator);
      return;
    }
    registry.registerView(VIEW_TYPE_BOARD, creator);
    this.register(() => registry.unregisterView(VIEW_TYPE_BOARD));
  }

  /** Board notes open as boards wherever Obsidian would open them as markdown, unless switched back on purpose. */
  private patchBoardNoteOpening(): void {
    // The wrapper's `this` is a WorkspaceLeaf; capture the separate plugin instance.
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- The wrapper binds this to a leaf, not the plugin.
    const plugin = this;
    this.register(
      around(WorkspaceLeaf.prototype, {
        setViewState(next) {
          return function (this: WorkspaceLeaf, state: ViewState, ...rest: unknown[]) {
            const file = state.state?.file;
            if (
              state.type === 'markdown' &&
              typeof file === 'string' &&
              plugin.boards.isBoardPath(file) &&
              plugin.markdownLeaves.get(this) !== file
            ) {
              return next.call(this, { ...state, type: VIEW_TYPE_BOARD }, ...rest);
            }
            return next.call(this, state, ...rest);
          };
        },
      }),
    );
  }

  private registerBoardWatchers(): void {
    const { vault, metadataCache } = this.app;
    const touchesBoards = (path: string) => this.boards.isBoardPath(path);
    this.registerEvent(vault.on('create', (f) => touchesBoards(f.path) && this.queueCommandSync()));
    this.registerEvent(vault.on('delete', (f) => touchesBoards(f.path) && this.queueCommandSync()));
    this.registerEvent(
      vault.on('rename', (f, oldPath) => (touchesBoards(f.path) || touchesBoards(oldPath)) && this.queueCommandSync()),
    );
    this.registerEvent(metadataCache.on('changed', (f) => touchesBoards(f.path) && this.queueCommandSync()));
  }

  private queueCommandSync(): void {
    if (this.stopped) return;
    if (this.syncTimer !== null) window.clearTimeout(this.syncTimer);
    this.syncTimer = window.setTimeout(() => {
      this.syncTimer = null;
      this.boards.syncCommands();
    }, 300);
  }

  private pickBoard(): void {
    const boards = this.boards.boards();
    if (boards.length === 0) {
      this.promptNewBoard();
      return;
    }
    new BoardPicker(this.app, boards.map((b) => b.file), (file) => void this.openBoard(file)).open();
  }

  private promptNewBoard(): void {
    new NewBoardModal(this.app, (name) => void this.createBoard(name)).open();
  }

  private async createBoard(name: string): Promise<void> {
    const folder = normalizePath(this.settings.boardsFolder);
    if (!this.app.vault.getFolderByPath(folder)) await this.app.vault.createFolder(folder);
    const path = normalizePath(`${folder}/${name}.md`);
    if (this.app.vault.getAbstractFileByPath(path)) {
      new Notice(`Task Trellis: ${path} already exists.`);
      return;
    }
    const taken = new Set(this.boards.boards().map((b) => b.config.slug));
    const base = slugify(name) || 'board';
    let slug = base;
    for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;

    const file = await this.app.vault.create(
      path,
      'This note is a Task Trellis board. Its properties are the board settings; open Board settings (the gear icon) in the board view to change them.\n',
    );
    await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
      Object.assign(fm, newBoardFrontmatter(slug));
    });
    await this.openBoard(file);
  }
}

class BoardPicker extends FuzzySuggestModal<TFile> {
  constructor(
    app: App,
    private files: TFile[],
    private onPick: (file: TFile) => void,
  ) {
    super(app);
    this.setPlaceholder('Open a board');
  }

  getItems(): TFile[] {
    return this.files;
  }

  getItemText(file: TFile): string {
    return file.basename;
  }

  onChooseItem(file: TFile): void {
    this.onPick(file);
  }
}

class NewBoardModal extends Modal {
  private name = '';

  constructor(
    app: App,
    private onSubmit: (name: string) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.setTitle('New Task Trellis board');
    const submit = () => {
      const name = this.name.trim().replace(/[\\/:]/g, '-');
      if (!name) return;
      this.close();
      this.onSubmit(name);
    };
    new Setting(this.contentEl).setName('Board name').addText((text) => {
      text.setPlaceholder('House projects').onChange((v) => (this.name = v));
      text.inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submit();
      });
      window.setTimeout(() => text.inputEl.focus(), 0);
    });
    new Setting(this.contentEl).addButton((b) => b.setButtonText('Create').setCta().onClick(submit));
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
