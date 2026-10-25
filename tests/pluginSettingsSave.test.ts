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
import { TFile } from './mocks/obsidian.ts';
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
  const app = { vault: { getAbstractFileByPath: () => file,
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
