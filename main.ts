import { NotePopups } from './src/obsidian/NotePopup.ts';
import { BoardTagRename } from './src/obsidian/BoardTagRename.ts';
import { RestoreBoardRenameModal } from './src/obsidian/RestoreBoardRenameModal.ts';
import { boardNameError } from './src/core/boardName.ts';
import { isComposing } from './src/ui/dom.ts';
import type { ViewOption } from './src/ui/renderBoard.ts';
import { parseColumnWidths, remapColumnWidths } from './src/core/columnWidths.ts';
import { BoardSettingsModal } from './src/obsidian/BoardSettingsModal.ts';
import { editorBusy, prepareEditorModal, renderEditorHeader, type EditorHeader } from './src/ui/editorHeader.ts';
import { around } from 'monkey-around';
import {
  setIcon,
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
import { FM, LEGACY_FM, newBoardFrontmatter, parseBoardConfig, type BoardConfig } from './src/core/boardConfig.ts';
import { changedFrontmatter, draftToFrontmatter, type BoardDraft } from './src/core/boardDraft.ts';
import type { TaskEdit } from './src/core/board.ts';
import { activeQuickFilterIds, setActiveQuickFilterIds, setSubtaskCollapse } from './src/core/collapse.ts';
import { inFolder } from './src/core/filters.ts';
import { slugify } from './src/core/taskLine.ts';
import { BoardRegistry } from './src/obsidian/BoardRegistry.ts';
import { BoardView, VIEW_TYPE_BOARD } from './src/obsidian/BoardView.ts';
import { BoardListView, VIEW_TYPE_BOARD_LIST } from './src/obsidian/BoardListView.ts';
import { BoardNavigation } from './src/obsidian/BoardNavigation.ts';
import { TaskIndex } from './src/obsidian/TaskIndex.ts';
import { TaskWriter, type UndoAction } from './src/obsidian/TaskWriter.ts';
import { QuickAdd } from './src/obsidian/QuickAdd.ts';
import { ShortcutActions } from './src/obsidian/ShortcutActions.ts';
import { CliCommands } from './src/obsidian/CliCommands.ts';
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
  boardRenames!: BoardTagRename;
  notePopups!: NotePopups;
  quickAdd!: QuickAdd;
  private boardNavigation!: BoardNavigation;
  private openingBoardList: Promise<void> | null = null;
  /** Leaves showing a board note as markdown on purpose, with the path they were switched for. */
  private syncTimer: number | null = null;
  private configTimer: number | null = null;
  private stopped = false;
  private markIndexed = (): void => undefined;
  /** Settles once the first index rebuild has read the vault, or the plugin unloads. */
  readonly indexed = new Promise<void>((resolve) => { this.markIndexed = resolve; });

  async onload(): Promise<void> {
    this.stopped = false;
    this.notePopups = new NotePopups(this.app);
    this.register(() => this.notePopups.destroy());
    this.register(() => {
      this.stopped = true;
      if (this.configTimer !== null) window.clearTimeout(this.configTimer);
      if (this.syncTimer !== null) window.clearTimeout(this.syncTimer);
      this.markIndexed();
    });
    this.settings = normalizeSettings(await this.loadData());
    if (this.stopped) return;
    this.index = new TaskIndex(this.app, (path) => this.isExcludedFromIndex(path));
    this.writer = new TaskWriter(this.app);
    this.boards = new BoardRegistry(this);
    this.boardRenames = new BoardTagRename(this.app, {
      boardsFolder: () => this.settings.boardsFolder,
      collapsed: () => this.settings.collapsed,
      saveSettings: () => this.saveSettings(),
    });
    this.quickAdd = new QuickAdd(this);
    const shortcuts = new ShortcutActions(this);
    this.registerObsidianProtocolHandler('task-trellis-create', (params) => {
      this.app.workspace.onLayoutReady(() => { void shortcuts.handle(params); });
    });
    new CliCommands(this).register();
    this.boardNavigation = new BoardNavigation(this.app.workspace, VIEW_TYPE_BOARD);

    this.registerBoardView();
    this.patchBoardNoteOpening();

    this.addRibbonIcon('kanban', 'Show Task Trellis boards', () => void this.showBoardList());
    this.addCommand({ id: 'show-board-list', name: 'Show boards sidebar', callback: () => void this.showBoardList() });
    this.addCommand({ id: 'open-board', name: 'Open board…', callback: () => this.pickBoard() });
    this.addCommand({ id: 'restore-board-rename', name: 'Restore board rename', callback: () => new RestoreBoardRenameModal(this.app, this.boardRenames).open() });
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
      this.markIndexed();
      if (!this.stopped) {
        this.boards.syncCommands();
        await this.ensureBoardList();
        try {
          const pending = (await this.boardRenames.history()).some(({record}) => record.status === 'prepared' || record.status === 'needs-recovery');
          if (pending) new Notice('Task Trellis: an interrupted board rename has a recovery copy. Run Task Trellis: Restore board rename from the command palette to review it.', 12000);
        } catch { new Notice('Task Trellis: a board rename recovery record could not be read. Check the Task Trellis recovery folder.'); }
      }
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

  /** Legacy Compact choices, used until the board has an explicit Appearance setting. */
  isViewOn(slug: string, option: ViewOption): boolean {
    return this.settings.collapsed[slug]?.[`view:${option}`] === true;
  }

  activeQuickFilters(slug: string): string[] {
    return activeQuickFilterIds(this.settings.collapsed[slug] ?? {});
  }

  async setActiveQuickFilters(slug: string, ids: string[]): Promise<void> {
    this.settings.collapsed[slug] = setActiveQuickFilterIds(this.settings.collapsed[slug] ?? {}, ids);
    await this.saveSettings();
  }

  async openBoard(file: TFile): Promise<void> {
    await this.boardNavigation.open(file.path);
  }

  private ensureBoardList(): Promise<void> {
    if (this.openingBoardList) return this.openingBoardList;
    this.openingBoardList = (async () => {
      const { workspace } = this.app;
      if (workspace.getLeavesOfType(VIEW_TYPE_BOARD_LIST).length > 0) return;
      const leaf = workspace.getLeftLeaf(false);
      if (leaf) await leaf.setViewState({ type: VIEW_TYPE_BOARD_LIST, active: false });
    })().finally(() => { this.openingBoardList = null; });
    return this.openingBoardList;
  }

  private async showBoardList(): Promise<void> {
    await this.ensureBoardList();
    const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_BOARD_LIST)[0];
    if (leaf) await this.app.workspace.revealLeaf(leaf);
  }

  /** Writes the settings form to the board note and retags tasks in renamed columns. Returns validation errors. */
  async saveBoardSettings(file: TFile, config: BoardConfig, draft: BoardDraft): Promise<string[]> {
    const { errors, renames, removed } = draftToFrontmatter(draft, config);
    if (errors.length > 0) return errors;
    const frontmatter = changedFrontmatter(draft, config);
    const retagUndo = renames.size ? await this.retagColumns(config.slug, renames) : null;
    try {
      await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
        if (fm[FM.columnWidths] !== undefined) {
          fm[FM.columnWidths] = remapColumnWidths(
            parseColumnWidths(fm[FM.columnWidths], config.columns.map((c) => c.id)), renames, removed);
        }
        Object.assign(fm, frontmatter);
        for (const key of Object.values(LEGACY_FM)) delete fm[key];
      });
    } catch (error) {
      await retagUndo?.undo();
      throw error;
    }
    return [];
  }

  private async retagColumns(slug: string, renames: Map<string, string>): Promise<UndoAction | null> {
    const tasks = this.index.all().filter((t) => renames.has(t.placements[slug]?.column ?? ''));
    const edits = new Map<string, TaskEdit>();
    for (const task of tasks) {
      const placement = task.placements[slug]!;
      edits.set(task.id, { column: renames.get(placement.column)!, sort: placement.sort });
    }
    const result = await this.writer.applyEdits(tasks, edits, slug);
    if (result.skippedIds.length) {
      await result.action?.undo();
      throw new Error('Some tasks could not be retagged. The board configuration was not changed. Check the affected notes and try again.');
    }
    return result.action;
  }

  async openAsBoard(leaf: WorkspaceLeaf, file: TFile): Promise<void> {
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
    this.registerPersistentView(VIEW_TYPE_BOARD, (leaf) => new BoardView(leaf, this));
    this.registerPersistentView(VIEW_TYPE_BOARD_LIST, (leaf) => new BoardListView(leaf, this));
  }

  private registerPersistentView(type: string, creator: ViewCreator): void {
    const registry = (this.app as unknown as ViewRegistryHost).viewRegistry;
    if (!registry) {
      this.registerView(type, creator);
      return;
    }
    registry.registerView(type, creator);
    this.register(() => registry.unregisterView(type));
  }

  /** Board notes open as boards wherever Obsidian would open them as markdown. */
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
              plugin.boards.isBoardPath(file)
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
    const touchesBoards = (path: string) => inFolder(path, this.settings.boardsFolder) || inFolder(this.settings.boardsFolder, path);
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
      for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_BOARD_LIST)) {
        if (leaf.view instanceof BoardListView) leaf.view.render();
      }
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

  promptNewBoard(): void {
    new NewBoardModal(this.app, (name) => this.createBoard(name)).open();
  }

  private async createBoard(name: string): Promise<boolean> {
    const folder = normalizePath(this.settings.boardsFolder);
    if (!this.app.vault.getFolderByPath(folder)) await this.app.vault.createFolder(folder);
    const path = normalizePath(`${folder}/${name}.md`);
    if (this.app.vault.getAbstractFileByPath(path)) {
      new Notice(`Task Trellis: ${path} already exists.`);
      return false;
    }
    const taken = new Set(this.boards.boards().map((b) => b.config.slug));
    const base = slugify(name) || 'board';
    let slug = base;
    for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;

    const file = await this.app.vault.create(
      path,
      'This note is a Task Trellis board. Its properties are the board settings; open Board settings (the gear icon) in the board view to change them.\n',
    );
    // The note exists from here on, so a later failure must not suggest creating it again.
    try {
      await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
        Object.assign(fm, newBoardFrontmatter(slug));
      });
    } catch (error) {
      console.error('[Task Trellis] board settings failed', error);
      new Notice(`Task Trellis: created ${path}, but its board settings could not be saved. Open it from the boards sidebar and check its settings.`);
      return true;
    }
    try {
      await this.openBoard(file);
    } catch (error) {
      console.error('[Task Trellis] opening the new board failed', error);
      new Notice(`Task Trellis: created ${path}, but the board could not be opened. Open it from the boards sidebar.`);
      return true;
    }
    new BoardSettingsModal(this.app, this, file, parseBoardConfig(name, newBoardFrontmatter(slug)).config, 'destination').open();
    return true;
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
  private chrome: ReturnType<typeof prepareEditorModal> | null = null;
  private name = '';

  constructor(
    app: App,
    private onSubmit: (name: string) => Promise<boolean>,
  ) {
    super(app);
  }

  onOpen(): void {
    this.setTitle('New Task Trellis board');
    let header: EditorHeader | null = null;
    const submit = async () => {
      if (editorBusy(this.modalEl)) return;
      const name = this.name.trim();
      const error = boardNameError(this.name);
      if (error) { new Notice(error); return; }
      header?.setBusy(true, 'Creating board…');
      let created = false;
      try { created = await this.onSubmit(name); }
      catch (error) { console.error('[Task Trellis] board creation failed', error); new Notice('Task Trellis: could not create the board. Your name has been kept; check the folder and try again.'); }
      finally { header?.setBusy(false); }
      if (created) this.close();
    };
    new Setting(this.contentEl).setName('Board name').addText((text) => {
      text.setPlaceholder('House projects').onChange((v) => (this.name = v));
      text.inputEl.addEventListener('keydown', (e) => {
        if (!isComposing(e) && e.key === 'Enter') { e.preventDefault(); void submit(); }
      });
      window.setTimeout(() => text.inputEl.focus(), 0);
    });
    this.chrome = prepareEditorModal(this.modalEl);
    header = renderEditorHeader(this.chrome.header, 'New board', setIcon, () => void submit(), () => this.close(), 'Create board');
  }

  /** Escape and clicks outside wait until the board is created. */
  close(): void {
    if (!editorBusy(this.modalEl)) super.close();
  }

  onClose(): void {
    this.chrome?.destroy(); this.chrome = null;
    this.contentEl.empty();
  }
}
