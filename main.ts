import { NotePopups } from './src/obsidian/NotePopup.ts';
import { BoardTagRename, RENAME_RECOVERY_FOLDER } from './src/obsidian/BoardTagRename.ts';
import { markSettingsBackupRestored, readSettingsBackup, writeSettingsBackup, type SettingsBackup } from './src/obsidian/settingsBackup.ts';
import { boardFoldersElsewhere, type FoundBoards } from './src/core/boardFolders.ts';
import { RestoreBoardRenameModal } from './src/obsidian/RestoreBoardRenameModal.ts';
import { BoardNameTaken, boardNameError, siblingPath } from './src/core/boardName.ts';
import { parseColumnWidths, remapColumnWidths } from './src/core/columnWidths.ts';
import { BoardSettingsModal } from './src/obsidian/BoardSettingsModal.ts';
import { around } from 'monkey-around';
import {
  FuzzySuggestModal,
  Plugin,
  TFile,
  WorkspaceLeaf,
  normalizePath,
  stringifyYaml,
  type App,
  type ViewCreator,
  type ViewState,
} from 'obsidian';
import { BOARD_NOTE_TEXT, duplicateBoardFrontmatter, FM, parseBoardConfig, type BoardConfig } from './src/core/boardConfig.ts';
import { BOARD_TEMPLATES, EXAMPLES_FOLDER, exampleNote, templateFrontmatter, type BoardTemplateId } from './src/core/boardTemplates.ts';
import { todayISO } from './src/core/dates.ts';
import { NewBoardModal } from './src/obsidian/NewBoardModal.ts';
import { unseenFeatures } from './src/core/whatsNew.ts';
import { notice } from './src/obsidian/notice.ts';
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
  /** Turned on just now in a vault where it has never saved settings. */
  private firstRun = false;
  /** Loaded with no settings and no saved copy of them: a new install, or a reinstall from before the copy was kept. */
  private settingsMissing = false;
  /** The copy the settings were just restored from, if they were and that hasn't been said yet. */
  private restoredFrom: SettingsBackup | null = null;
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
    await this.loadSettings();
    if (this.stopped) return;
    this.index = new TaskIndex(this.app, (path) => this.isExcludedFromIndex(path));
    this.writer = new TaskWriter(this.app);
    this.boards = new BoardRegistry(this);
    this.boardRenames = new BoardTagRename(this.app, {
      boardsFolder: () => this.settings.boardsFolder,
      collapsed: () => this.settings.collapsed,
      saveSettings: () => this.saveData(this.settings),
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
        if (!checking) this.openBoardOrSay(file, leaf);
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
            .onClick(() => this.openBoardOrSay(file, leaf ?? undefined)),
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
        await this.adoptBoardsFolder();
        this.boards.syncCommands();
        await this.ensureBoardList();
        if (this.restoredFrom) {
          const { savedAt } = this.restoredFrom;
          const when = savedAt ? ` saved ${new Date(savedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}` : '';
          notice(this.app, `Task Trellis: its settings were missing, as they are after reinstalling, so it restored the copy${when} in ${RENAME_RECOVERY_FOLDER}.`, { duration: 10000 });
          void markSettingsBackupRestored(this.app, this.restoredFrom).catch((error: unknown) => console.error('[Task Trellis] noting the restored settings copy failed', error));
        }
        await this.welcomeFirstRun();
        // The metadata cache may still be filling at layout-ready: look for the boards again once it settles.
        const resolved = this.app.metadataCache.on('resolved', () => {
          this.app.metadataCache.offref(resolved);
          void this.adoptBoardsFolder().then(() => this.renderBoardLists());
        });
        this.registerEvent(resolved);
        try {
          const { entries, unreadable } = await this.boardRenames.recovery();
          if (unreadable.length) notice(this.app, `Task Trellis: could not read ${unreadable.join(', ')}, so ${unreadable.length === 1 ? 'it' : 'they'} can’t be restored. Other recovery copies still can, with Task Trellis: Restore board rename. Nothing was changed.`, { alert: true });
          const pending = entries.some(({record}) => record.status === 'prepared' || record.status === 'needs-recovery');
          if (pending) notice(this.app, 'Task Trellis: an interrupted board rename has a recovery copy. Run Task Trellis: Restore board rename from the command palette to review it.', { duration: 12000 });
        } catch { notice(this.app, 'Task Trellis: a board rename recovery record could not be read, so nothing was restored. Check the Task Trellis recovery folder.', { alert: true }); }
        // After an update, the first board shown says what the update added.
        this.registerEvent(this.app.workspace.on('active-leaf-change', (leaf) => { if (leaf?.view instanceof BoardView) this.showWhatsNew(leaf.view); }));
        const active = this.app.workspace.getActiveViewOfType(BoardView);
        if (active) this.showWhatsNew(active);
      }
    });
  }

  /**
   * Turned on for the first time, in a vault with no boards: brings the boards sidebar, with its
   * templates, to the front, and says so, since Obsidian’s settings are usually still open over it.
   * A vault that already has boards, such as one synced from another device, is left as it is.
   */
  private async welcomeFirstRun(): Promise<void> {
    if (!this.firstRun || this.stopped || this.boards.boards().length) return;
    const elsewhere = this.boardsElsewhere().length > 0;
    try {
      await this.showBoardList();
    } catch (error) {
      console.error('[Task Trellis] showing the boards sidebar failed', error);
      return;
    }
    notice(this.app, elsewhere
      ? 'Task Trellis: the boards folder has no boards, but other folders do. Choose one in the boards sidebar.'
      : 'Task Trellis: pick a template in the boards sidebar to make your first board.', { duration: 10000 });
  }

  /**
   * Reads the settings. Uninstalling deletes them, on every synced device, so with none saved it
   * uses the copy kept outside the plugin's folder. It doesn't write them back yet: Sync may still
   * be bringing newer ones, which onExternalSettingsChange then takes up.
   */
  private async loadSettings(): Promise<void> {
    const saved: unknown = await this.loadData();
    const missing = saved === null || saved === undefined;
    const backup = missing ? await readSettingsBackup(this.app) : null;
    this.settings = normalizeSettings(missing ? backup?.settings : saved);
    // Said once: until something is saved, later starts restore the same copy quietly.
    this.restoredFrom = backup && !backup.restoredAt ? backup : null;
    this.settingsMissing = missing && !backup;
    // A new install has nothing to catch up on: What’s new starts from this version.
    if (this.settingsMissing) this.settings.whatsNewSeen = this.manifest.version;
    // Loading after the layout is ready means someone just turned it on, rather than Obsidian starting.
    this.firstRun = this.settingsMissing && this.app.workspace.layoutReady;
  }

  /** Every save also keeps a copy outside the plugin's folder; see settingsBackup.ts. A failed copy doesn't fail the save. */
  async saveData(data: unknown): Promise<void> {
    await super.saveData(data);
    try {
      await writeSettingsBackup(this.app, data);
    } catch (error) {
      console.error('[Task Trellis] saving the copy of the plugin settings failed', error);
    }
  }

  /**
   * Sync replaced the settings file: use what it brought, so the next save here doesn't put the old
   * settings back. A deleted file, as uninstalling on another device leaves, keeps the settings in
   * use, and the next save writes them again.
   */
  async onExternalSettingsChange(): Promise<void> {
    if (this.stopped) return;
    const data: unknown = await this.loadData();
    if (data === null || data === undefined || this.stopped) return;
    const before = { folder: this.settings.boardsFolder, excluded: this.settings.excludedFolders.join('\n') };
    // In place, since the settings tab and other parts hold on to this object.
    Object.assign(this.settings, normalizeSettings(data));
    if (before.folder !== this.settings.boardsFolder || before.excluded !== this.settings.excludedFolders.join('\n')) this.onConfigChanged();
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_BOARD)) if (leaf.view instanceof BoardView) leaf.view.queueRender();
    this.renderBoardLists();
  }

  /** Folders outside the boards folder that hold board notes, the most boards first. */
  boardsElsewhere(): FoundBoards[] {
    const { vault, metadataCache } = this.app;
    return boardFoldersElsewhere(vault.getMarkdownFiles().map((f) => ({ path: f.path, frontmatter: metadataCache.getFileCache(f)?.frontmatter })), this.settings.boardsFolder);
  }

  /**
   * With no settings and no copy of them, as after reinstalling, the boards folder is the default.
   * When that has no boards and they're all in one other folder, that folder is the boards folder.
   */
  private async adoptBoardsFolder(): Promise<void> {
    if (!this.settingsMissing || this.stopped || this.boards.boards().length) return;
    const elsewhere = this.boardsElsewhere();
    if (elsewhere.length !== 1) return;
    const { folder, count } = elsewhere[0]!;
    this.settingsMissing = false;
    if (!await this.useBoardsFolder(folder)) return;
    notice(this.app, `Task Trellis: found ${count === 1 ? 'a board' : `${count} boards`} in ${folder}, so that’s the boards folder now. Change it in Settings → Task Trellis.`, { duration: 10000 });
  }

  /** Makes `folder` the boards folder, as typing it in the plugin settings does. Says whether that was saved. */
  async useBoardsFolder(folder: string): Promise<boolean> {
    const was = this.settings.boardsFolder;
    this.settings.boardsFolder = folder;
    if (!await this.saveSettings()) {
      this.settings.boardsFolder = was;
      return false;
    }
    this.onConfigChanged();
    this.renderBoardLists();
    return true;
  }

  /** Once per update with new features, unless Don’t show this again was checked. */
  private showWhatsNew(view: BoardView): void {
    const features = unseenFeatures(this.settings.whatsNewSeen, this.manifest.version);
    if (this.stopped || this.settings.whatsNewHidden || !features.length) return;
    this.settings.whatsNewSeen = this.manifest.version;
    void this.saveSettings();
    view.openWhatsNew(features, {
      version: this.manifest.version, hidden: this.settings.whatsNewHidden,
      setHidden: async (hidden) => {
        const was = this.settings.whatsNewHidden;
        this.settings.whatsNewHidden = hidden;
        const saved = await this.saveSettings();
        if (!saved) this.settings.whatsNewHidden = was;
        return saved;
      },
    });
  }

  /** Says so if saving fails, and whether it worked. */
  async saveSettings(): Promise<boolean> {
    try {
      await this.saveData(this.settings);
      return true;
    } catch (error) {
      console.error('[Task Trellis] saving the plugin settings failed', error);
      notice(this.app, 'Task Trellis: could not save the plugin settings, so your last change may be lost when Obsidian closes. Check that the vault can be written, then try again.', { alert: true });
      return false;
    }
  }

  /** For a command or menu, where nothing else would say that opening the board failed. */
  private openBoardOrSay(file: TFile, leaf?: WorkspaceLeaf): void {
    void (leaf ? this.openAsBoard(leaf, file) : this.openBoard(file)).catch((error: unknown) => {
      console.error('[Task Trellis] opening a board failed', error);
      notice(this.app, `Task Trellis: could not open the ${file.basename} board. Check that its note still exists, then try again.`, { alert: true });
    });
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
    if (retagUndo === 'failed') return ['Some tasks could not be retagged. The board configuration was not changed. Check the affected notes and try again.'];
    try {
      await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
        // Only this save's own columns: another window or Sync may have added one since the form opened.
        const widths = fm[FM.columnWidths];
        if (widths && typeof widths === 'object' && (renames.size || removed.length)) {
          fm[FM.columnWidths] = remapColumnWidths(parseColumnWidths(widths, Object.keys(widths)), renames, removed);
        }
        // Undefined removes a property, such as `filter` once the rules fit the plain lists again.
        for (const [key, value] of Object.entries(frontmatter)) {
          if (value === undefined) delete fm[key]; else fm[key] = value;
        }
      });
    } catch (error) {
      await retagUndo?.undo();
      throw error;
    }
    return [];
  }

  private async retagColumns(slug: string, renames: Map<string, string>): Promise<UndoAction | 'failed' | null> {
    const tasks = this.index.all().filter((t) => renames.has(t.placements[slug]?.column ?? ''));
    const edits = new Map<string, TaskEdit>();
    for (const task of tasks) {
      const placement = task.placements[slug]!;
      edits.set(task.id, { column: renames.get(placement.column)!, sort: placement.sort });
    }
    const result = await this.writer.applyEdits(tasks, edits, slug);
    if (result.skippedIds.length) {
      await result.action?.undo();
      return 'failed';
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
      this.renderBoardLists();
    }, 300);
  }

  private renderBoardLists(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_BOARD_LIST)) {
      if (leaf.view instanceof BoardListView) leaf.view.render();
    }
  }

  private pickBoard(): void {
    const boards = this.boards.boards();
    if (boards.length === 0) {
      this.promptNewBoard();
      return;
    }
    new BoardPicker(this.app, boards.map((b) => b.file), (file) => this.openBoardOrSay(file)).open();
  }

  promptNewBoard(template?: BoardTemplateId): void {
    new NewBoardModal(this.app, { examplesPath: (name) => this.examplesPath(name), template, today: todayISO() }, (name, chosen) => this.createBoard(name, chosen)).open();
  }

  /** A free path for the example board's sample tasks, named after the board. */
  private examplesPath(name: string): string {
    const base = normalizePath(`${EXAMPLES_FOLDER}/${name.trim() || 'Example board'}`);
    let path = `${base}.md`;
    for (let i = 2; this.app.vault.getAbstractFileByPath(path); i++) path = `${base} ${i}.md`;
    return path;
  }

  /**
   * Makes a board from a template in a single write, then opens it and its New tasks settings. The
   * example board writes its sample tasks first, so the board never shows without them.
   */
  private async createBoard(name: string, templateId: BoardTemplateId): Promise<void> {
    const template = BOARD_TEMPLATES.find((t) => t.id === templateId)!;
    const folder = normalizePath(this.settings.boardsFolder);
    const path = normalizePath(`${folder}/${name}.md`);
    if (this.app.vault.getAbstractFileByPath(path)) throw new BoardNameTaken(`${path} already exists. Choose another board name.`);
    const slug = this.freeSlug(name);
    let examples = '';
    if (template.examples) {
      examples = this.examplesPath(name);
      try {
        if (!this.app.vault.getFolderByPath(EXAMPLES_FOLDER)) await this.app.vault.createFolder(EXAMPLES_FOLDER);
        await this.app.vault.create(examples, exampleNote(slug, name, todayISO()));
      } catch (error) {
        console.error('[Task Trellis] writing the sample tasks failed', error);
        throw new Error('Could not write the sample tasks, so no board was made. Check the folder and try again.');
      }
    }
    let file: TFile;
    try {
      if (!this.app.vault.getFolderByPath(folder)) await this.app.vault.createFolder(folder);
      file = await this.app.vault.create(path, `---\n${stringifyYaml(templateFrontmatter(templateId, slug, examples))}---\n${BOARD_NOTE_TEXT}`);
    } catch (error) {
      console.error('[Task Trellis] board creation failed', error);
      throw new Error(examples
        ? `Could not create the board. The sample tasks were saved in ${examples}; delete that note, or try again.`
        : 'Could not create the board, so nothing was made. Your name has been kept; check the folder and try again.');
    }
    // The board exists from here on, so a later failure must not suggest creating it again.
    try {
      await this.openBoard(file);
    } catch (error) {
      console.error('[Task Trellis] opening the new board failed', error);
      notice(this.app, `Task Trellis: created ${path}, but the board could not be opened. Open it from the boards sidebar.`, { alert: true });
      return;
    }
    if (examples) notice(this.app, `Task Trellis: the example board’s sample tasks are in ${examples}. Delete the note and the board when you’re done with them.`);
    else new BoardSettingsModal(this.app, this, file, parseBoardConfig(name, templateFrontmatter(templateId, slug)).config, 'destination').open();
  }

  /** A slug from the board's name that no other board uses: house, or house-2 when that's taken. */
  private freeSlug(name: string): string {
    const taken = new Set(this.boards.boards().map((b) => b.config.slug));
    const base = slugify(name) || 'board';
    let slug = base;
    for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;
    return slug;
  }

  /**
   * Makes a board next to `file` with its settings, under `name` and a slug of its own, in a single
   * write, so a failure leaves nothing behind. No task changes: the copy shows the tasks its
   * filters match, without the original's tags placing or labeling them.
   */
  async duplicateBoard(file: TFile, name: string): Promise<TFile> {
    const invalid = boardNameError(name);
    if (invalid) throw new Error(invalid);
    const path = siblingPath(file.path, name.trim());
    if (this.app.vault.getAbstractFileByPath(path)) throw new BoardNameTaken('A note or folder with that name already exists. Choose another board name.');
    const settings = duplicateBoardFrontmatter(this.app.metadataCache.getFileCache(file)?.frontmatter ?? {}, this.freeSlug(name));
    try {
      return await this.app.vault.create(path, `---\n${stringifyYaml(settings)}---\n${BOARD_NOTE_TEXT}`);
    } catch (error) {
      console.error('[Task Trellis] duplicating the board failed', error);
      throw new Error('Could not create the new board, so nothing was changed. Your name has been kept; check the folder and try again.');
    }
  }
}

class BoardPicker extends FuzzySuggestModal<TFile> {
  constructor(
    app: App,
    private files: TFile[],
    private onPick: (file: TFile) => void,
  ) {
    super(app);
    this.setPlaceholder('Open a board…');
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

