import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/obsidian/BoardSettingsModal.ts', () => ({ BoardSettingsModal: class {} }));
vi.mock('../src/obsidian/BoardView.ts', () => ({ BoardView: class { queueRender = vi.fn(); }, VIEW_TYPE_BOARD: 'board' }));
vi.mock('../src/obsidian/BoardListView.ts', () => ({ BoardListView: class { render = vi.fn(); }, VIEW_TYPE_BOARD_LIST: 'board-list' }));
import TaskTrellisPlugin from '../main.ts';
import { BoardView } from '../src/obsidian/BoardView.ts';
import { markSettingsBackupRestored, readSettingsBackup } from '../src/obsidian/settingsBackup.ts';
import { DEFAULT_SETTINGS, normalizeSettings } from '../src/settings.ts';
import { notices, Plugin, Workspace } from './mocks/obsidian.ts';

const COPY = 'Task Trellis recovery/plugin-settings.json';

/** A vault folder in memory, as the adapter sees it. */
function adapter(files: Record<string, string> = {}) {
  const folders = new Set<string>();
  return {
    files, folders,
    exists: vi.fn(async (path: string) => path in files || folders.has(path)),
    mkdir: vi.fn(async (path: string) => { folders.add(path); }),
    read: vi.fn(async (path: string) => { if (!(path in files)) throw new Error('Missing'); return files[path]!; }),
    write: vi.fn(async (path: string, data: string) => { files[path] = data; }),
  };
}

/** The plugin with what it loads: `data` is its own settings file, `files` the vault. */
function plugin(data: unknown, files: Record<string, string> = {}, layoutReady = false) {
  const p = Object.create(TaskTrellisPlugin.prototype) as TaskTrellisPlugin;
  const vault = adapter(files);
  const workspace = Object.assign(new Workspace(), { layoutReady, getLeavesOfType: (_type: string): unknown[] => [] });
  let stored = data;
  Object.assign(p, {
    app: { vault: { adapter: vault }, workspace },
    manifest: { version: '1.4.1' },
    stopped: false,
    loadData: async () => stored,
  });
  const saveData = vi.spyOn(Plugin.prototype, 'saveData').mockImplementation(async (next: unknown) => { stored = next; });
  const internals = p as unknown as {
    loadSettings(): Promise<void>; adoptBoardsFolder(): Promise<void>;
    settingsMissing: boolean; restoredFrom: { savedAt: string } | null; firstRun: boolean;
  };
  return { p, internals, vault, workspace, saveData, stored: () => stored, setStored: (next: unknown) => { stored = next; } };
}

afterEach(() => { vi.restoreAllMocks(); notices.length = 0; });

describe('the copy of the plugin settings', () => {
  it('is saved beside the rename records with every save, in a folder made for it', async () => {
    const t = plugin(null);
    const settings = { ...DEFAULT_SETTINGS, boardsFolder: 'Work/Boards', excludedFolders: ['Archive'] };
    await t.p.saveData(settings);
    expect(t.saveData).toHaveBeenCalledWith(settings);
    expect(t.vault.folders.has('Task Trellis recovery')).toBe(true);
    const copy = JSON.parse(t.vault.files[COPY]!);
    expect(copy).toMatchObject({ version: 1, settings });
    expect(Number.isNaN(Date.parse(copy.savedAt))).toBe(false);
  });

  it('doesn’t fail the save when it can’t be written', async () => {
    const t = plugin(null);
    t.vault.write.mockRejectedValue(new Error('Read-only'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(t.p.saveData(DEFAULT_SETTINGS)).resolves.toBeUndefined();
    expect(t.saveData).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledOnce();
  });

  it('brings the settings back when they’re missing, as after reinstalling, without writing them yet', async () => {
    const saved = { ...DEFAULT_SETTINGS, boardsFolder: 'Work/Boards', excludedFolders: ['Archive'], newTaskHeading: '## Inbox', whatsNewSeen: '1.4.0', collapsed: { clients: { later: false } } };
    const t = plugin(null, { [COPY]: JSON.stringify({ version: 1, savedAt: '2026-11-07T20:00:00.000Z', settings: saved }) }, true);
    await t.internals.loadSettings();
    expect(t.p.settings).toEqual(normalizeSettings(saved));
    expect(t.internals.restoredFrom?.savedAt).toBe('2026-11-07T20:00:00.000Z');
    // Not a new install: no welcome, no fresh What’s new, no guessing at the boards folder.
    expect([t.internals.settingsMissing, t.internals.firstRun, t.p.settings.whatsNewSeen]).toEqual([false, false, '1.4.0']);
    expect(t.saveData).not.toHaveBeenCalled();
  });

  it('is restored quietly once it has been said, until something is saved', async () => {
    const saved = { ...DEFAULT_SETTINGS, boardsFolder: 'Work/Boards' };
    const t = plugin(null, { [COPY]: JSON.stringify({ version: 1, savedAt: '2026-11-07T20:00:00.000Z', settings: saved }) });
    const app = t.p.app as unknown as Parameters<typeof readSettingsBackup>[0];
    await markSettingsBackupRestored(app, (await readSettingsBackup(app))!, new Date('2026-11-08T09:00:00.000Z'));
    await t.internals.loadSettings();
    expect([t.p.settings.boardsFolder, t.internals.restoredFrom, t.internals.settingsMissing]).toEqual(['Work/Boards', null, false]);
    // The next save writes a fresh copy, so a later reinstall says so again.
    await t.p.saveData(t.p.settings);
    expect(JSON.parse(t.vault.files[COPY]!).restoredAt).toBeUndefined();
  });

  it('isn’t read when the settings are there, and a damaged one counts as none', async () => {
    const t = plugin({ ...DEFAULT_SETTINGS, boardsFolder: 'Boards' }, { [COPY]: JSON.stringify({ settings: { boardsFolder: 'Old' } }) });
    await t.internals.loadSettings();
    expect(t.p.settings.boardsFolder).toBe('Boards');
    expect(t.vault.read).not.toHaveBeenCalled();
    expect(t.internals.restoredFrom).toBeNull();

    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const damaged = plugin(null, { [COPY]: '{"settings": ' }, true);
    await damaged.internals.loadSettings();
    expect([damaged.internals.settingsMissing, damaged.internals.firstRun, damaged.internals.restoredFrom]).toEqual([true, true, null]);
    expect(damaged.p.settings).toEqual({ ...DEFAULT_SETTINGS, whatsNewSeen: '1.4.1' });
    expect(error).toHaveBeenCalledOnce();
  });
});

describe('settings changed by Sync', () => {
  it('are used in place, so the next save here doesn’t put the old ones back', async () => {
    const t = plugin({ ...DEFAULT_SETTINGS, collapsed: { house: { later: false } } });
    await t.internals.loadSettings();
    const settings = t.p.settings;
    const board = Object.assign(new (BoardView as unknown as new () => { queueRender: () => void })(), {});
    t.workspace.getLeavesOfType = (type: string) => (type === 'board' ? [{ view: board }] : []);
    const onConfigChanged = vi.spyOn(t.p, 'onConfigChanged').mockImplementation(() => undefined);

    t.setStored({ ...DEFAULT_SETTINGS, collapsed: { house: { later: true } } });
    await t.p.onExternalSettingsChange();
    expect(t.p.settings).toBe(settings);
    expect(t.p.settings.collapsed).toEqual({ house: { later: true } });
    expect(onConfigChanged).not.toHaveBeenCalled();
    expect(board.queueRender).toHaveBeenCalledOnce();

    t.setStored({ ...DEFAULT_SETTINGS, boardsFolder: 'Work/Boards' });
    await t.p.onExternalSettingsChange();
    expect([t.p.settings.boardsFolder, onConfigChanged.mock.calls.length]).toEqual(['Work/Boards', 1]);
  });

  it('keep the ones in use when the file was deleted, as uninstalling on another device does', async () => {
    const t = plugin({ ...DEFAULT_SETTINGS, boardsFolder: 'Work/Boards' });
    await t.internals.loadSettings();
    const onConfigChanged = vi.spyOn(t.p, 'onConfigChanged').mockImplementation(() => undefined);
    t.setStored(null);
    await t.p.onExternalSettingsChange();
    expect(t.p.settings.boardsFolder).toBe('Work/Boards');
    expect(onConfigChanged).not.toHaveBeenCalled();
  });
});

describe('the boards folder after its setting was lost', () => {
  function lost(elsewhere: Array<{ folder: string; count: number }>, settings: unknown = null, boards = 0) {
    const t = plugin(settings);
    Object.assign(t.p, { boards: { boards: () => Array.from({ length: boards }, () => ({})) }, boardsElsewhere: () => elsewhere });
    const onConfigChanged = vi.spyOn(t.p, 'onConfigChanged').mockImplementation(() => undefined);
    return { ...t, onConfigChanged };
  }

  it('is the one folder holding boards, saved, and said so', async () => {
    const t = lost([{ folder: 'Work/Boards', count: 3 }]);
    await t.internals.loadSettings();
    await t.internals.adoptBoardsFolder();
    expect(t.p.settings.boardsFolder).toBe('Work/Boards');
    expect((t.stored() as { boardsFolder: string }).boardsFolder).toBe('Work/Boards');
    expect(t.onConfigChanged).toHaveBeenCalledOnce();
    expect(notices).toEqual(['Task Trellis: found 3 boards in Work/Boards, so that’s the boards folder now. Change it in Settings → Task Trellis.']);
    // Once is enough: looking again after the metadata cache settles changes nothing.
    await t.internals.adoptBoardsFolder();
    expect(notices).toHaveLength(1);
  });

  it('is left for the sidebar to offer when several folders hold boards, or the settings were there', async () => {
    const several = lost([{ folder: 'Work/Boards', count: 2 }, { folder: 'Home', count: 1 }]);
    await several.internals.loadSettings();
    await several.internals.adoptBoardsFolder();
    const kept = lost([{ folder: 'Work/Boards', count: 3 }], { ...DEFAULT_SETTINGS });
    await kept.internals.loadSettings();
    await kept.internals.adoptBoardsFolder();
    const hasBoards = lost([{ folder: 'Work/Boards', count: 3 }], null, 1);
    await hasBoards.internals.loadSettings();
    await hasBoards.internals.adoptBoardsFolder();
    expect([several, kept, hasBoards].map((t) => t.p.settings.boardsFolder)).toEqual(['Task Trellis', 'Task Trellis', 'Task Trellis']);
    expect(notices).toEqual([]);
  });

  it('can be chosen, and goes back if it couldn’t be saved', async () => {
    const t = lost([]);
    await t.internals.loadSettings();
    expect(await t.p.useBoardsFolder('Home')).toBe(true);
    expect([t.p.settings.boardsFolder, t.onConfigChanged.mock.calls.length]).toEqual(['Home', 1]);
    t.saveData.mockRejectedValue(new Error('Read-only'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await t.p.useBoardsFolder('Work')).toBe(false);
    expect(t.p.settings.boardsFolder).toBe('Home');
  });
});
