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

/** The plugin's board creation, with a vault that records what it creates. */
function newBoardPlugin(create: (path: string, data: string) => Promise<TFile>, openBoard: () => Promise<void> = async () => undefined) {
  const plugin = Object.create(TaskTrellisPlugin.prototype) as TaskTrellisPlugin;
  Object.assign(plugin, {
    settings: { boardsFolder: 'Boards' }, boards: { boards: () => [] },
    app: { workspace: new Workspace(), vault: { getFolderByPath: () => ({}), getAbstractFileByPath: () => null, create } },
    openBoard,
  });
  return (plugin as unknown as { createBoard(name: string, template: string): Promise<void> }).createBoard.bind(plugin);
}

it('makes a new board from its template in one write, and reports a board that can’t open as created', async () => {
  const { notices } = await import('./mocks/obsidian.ts');
  const create = vi.fn(async (path: string, _data: string) => new TFile(path));
  const createBoard = newBoardPlugin(create, async () => { throw new Error('No leaf'); });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  await expect(createBoard('House', 'project')).resolves.toBeUndefined();
  expect(create).toHaveBeenCalledOnce();
  expect(create.mock.calls[0]![0]).toBe('Boards/House.md');
  expect(JSON.parse(create.mock.calls[0]![1].split('\n')[1]!)).toMatchObject({ slug: 'house', columns: ['Backlog', 'Ready', 'In progress', 'Review', 'Done'] });
  expect(notices.at(-1)).toBe('Task Trellis: created Boards/House.md, but the board could not be opened. Open it from the boards sidebar.');
});

it('keeps the dialog open with a reason when the board can’t be written', async () => {
  const createBoard = newBoardPlugin(vi.fn(async (_path: string, _data: string): Promise<TFile> => { throw new Error('Disk full'); }));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  await expect(createBoard('House', 'kanban')).rejects.toThrow('Could not create the board, so nothing was made. Your name has been kept; check the folder and try again.');
});

it('writes the example board’s sample tasks before the board, and says where they are', async () => {
  const { notices } = await import('./mocks/obsidian.ts');
  const create = vi.fn(async (path: string, _data: string) => new TFile(path));
  await newBoardPlugin(create)('Sandbox', 'example');
  expect(create.mock.calls.map(([path]) => path)).toEqual(['Task Trellis examples/Sandbox.md', 'Boards/Sandbox.md']);
  expect(create.mock.calls[0]![1]).toMatch(/^---\ntask-trellis-example: sandbox\n---\n/);
  expect(JSON.parse(create.mock.calls[1]![1].split('\n')[1]!)).toMatchObject({ 'filter-properties': ['task-trellis-example: sandbox'], 'new-tasks': 'note', 'new-tasks-note': 'Task Trellis examples/Sandbox.md' });
  expect(notices.at(-1)).toBe('Task Trellis: the example board’s sample tasks are in Task Trellis examples/Sandbox.md. Delete the note and the board when you’re done with them.');

  // A board that fails after its sample tasks were written says where they were left.
  const failing = vi.fn(async (path: string, _data: string) => { if (path.startsWith('Boards/')) throw new Error('Disk full'); return new TFile(path); });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  await expect(newBoardPlugin(failing)('Sandbox', 'example')).rejects.toThrow('Could not create the board. The sample tasks were saved in Task Trellis examples/Sandbox.md; delete that note, or try again.');
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
