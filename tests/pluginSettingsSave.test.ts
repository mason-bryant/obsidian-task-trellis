import { expect, it, vi } from 'vitest';
vi.mock('../src/obsidian/BoardSettingsModal.ts', () => ({ BoardSettingsModal: class {} }));
vi.mock('../src/obsidian/BoardView.ts', () => ({ BoardView: class {}, VIEW_TYPE_BOARD: 'board' }));
vi.mock('../src/obsidian/BoardListView.ts', () => ({ BoardListView: class {}, VIEW_TYPE_BOARD_LIST: 'board-list' }));
import TaskTrellisPlugin from '../main.ts';
import { TaskWriter } from '../src/obsidian/TaskWriter.ts';
import { parseTaskLine } from '../src/core/taskLine.ts';
import { taskId } from '../src/core/board.ts';
import { parseBoardConfig } from '../src/core/boardConfig.ts';
import { draftFromConfig } from '../src/core/boardDraft.ts';
import { TFile, Workspace } from './mocks/obsidian.ts';
import type { App } from 'obsidian';

it.each(['partial', 'board-write', 'success'])('column rename handles %s without silently leaving an inconsistent board', async (mode) => {
  const raw = '- [ ] One #tt/house/doing/10';
  const file = new TFile('Tasks.md'); const board = new TFile('House.md'); let content = raw + '\n';
  const task = { ...parseTaskLine(raw)!, raw, id: taskId(file.path, 0), path: file.path, line: 0 };
  const config = parseBoardConfig('House', { slug: 'house', columns: ['Backlog', 'Doing', 'Done'] }).config;
  const draft = draftFromConfig(config); draft.columns[1]!.label = 'In progress';
  const writeBoard = vi.fn(async (_file: unknown, fn: (fm: Record<string, unknown>) => void) => {
    if (mode === 'board-write') throw new Error('Cannot save board'); fn({});
  });
  const app = { workspace: new Workspace(), vault: { getAbstractFileByPath: () => file,
    process: async (_file: unknown, fn: (s: string) => string) => { content = fn(content); return content; } },
    fileManager: { processFrontMatter: writeBoard } } as unknown as App;
  const plugin = Object.create(TaskTrellisPlugin.prototype) as TaskTrellisPlugin;
  Object.assign(plugin, { app, writer: new TaskWriter(app), index: { all: () => mode === 'partial' ? [task, { ...task, id: 'missing', raw: '- [ ] Gone #tt/house/doing/20', line: 1 }] : [task] } });
  if (mode === 'success') {
    expect(await plugin.saveBoardSettings(board as never, config, draft)).toEqual([]);
    expect(content).toContain('#tt/house/in-progress/10'); expect(writeBoard).toHaveBeenCalledOnce();
  } else {
    await expect(plugin.saveBoardSettings(board as never, config, draft)).rejects.toThrow();
    expect(content).toBe(raw + '\n');
    if (mode === 'partial') expect(writeBoard).not.toHaveBeenCalled();
  }
});

it.each([
  ['settings', 'Task Trellis: created Boards/House.md, but its board settings could not be saved. Open it from the boards sidebar and check its settings.'],
  ['open', 'Task Trellis: created Boards/House.md, but the board could not be opened. Open it from the boards sidebar.'],
])('a new board that fails to finish (%s) is reported as created, not as a failure to retry', async (step, message) => {
  const { notices } = await import('./mocks/obsidian.ts');
  const create = vi.fn(async (path: string) => new TFile(path));
  const plugin = Object.create(TaskTrellisPlugin.prototype) as TaskTrellisPlugin;
  Object.assign(plugin, {
    settings: { boardsFolder: 'Boards' }, boards: { boards: () => [] },
    app: { workspace: new Workspace(), vault: { getFolderByPath: () => ({}), getAbstractFileByPath: () => null, create },
      fileManager: { processFrontMatter: async () => { if (step === 'settings') throw new Error('Disk full'); } } },
    openBoard: async () => { throw new Error('No leaf'); },
  });
  const createBoard = (plugin as unknown as { createBoard(name: string): Promise<boolean> }).createBoard.bind(plugin);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  await expect(createBoard('House')).resolves.toBe(true);
  expect(create).toHaveBeenCalledOnce(); expect(notices.at(-1)).toBe(message);
});

it('removes the filter group from the board note once its rules fit the plain lists again', async () => {
  const note: Record<string, unknown> = { slug: 'house', filter: { or: [{ tags: ['work'] }, { folders: ['Clients'] }] }, 'include-folders': ['Update Task Trellis to use this filter'] };
  const config = parseBoardConfig('House', note).config;
  const draft = draftFromConfig(config); draft.filter.match = 'all';
  const app = { workspace: new Workspace(), vault: {}, fileManager: { processFrontMatter: async (_file: unknown, fn: (fm: Record<string, unknown>) => void) => fn(note) } } as unknown as App;
  const plugin = Object.create(TaskTrellisPlugin.prototype) as TaskTrellisPlugin;
  Object.assign(plugin, { app, index: { all: () => [] } });
  expect(await plugin.saveBoardSettings(new TFile('House.md') as never, config, draft)).toEqual([]);
  expect('filter' in note).toBe(false);
  expect(note).toMatchObject({ 'include-tags': ['work'], 'include-folders': ['Clients'] });
});
