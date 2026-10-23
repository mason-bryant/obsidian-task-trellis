import { beforeEach, describe, expect, it } from 'vitest';
import { QuickAdd } from '../src/obsidian/QuickAdd.ts';
import { buildBoard } from '../src/core/board.ts';
import { parseBoardConfig } from '../src/core/boardConfig.ts';
import { notices, TFile } from './mocks/obsidian.ts';
import type TaskTrellisPlugin from '../main.ts';

beforeEach(() => { notices.length = 0; });
describe('new-task filter feedback', () => {
  it.each([['archived', true], ['active', false], [undefined, false]])('checks property exclusions for status %s', async (status, hidden) => {
    const file = new TFile('Inbox.md');
    let content = '';
    const plugin = {
      app: {
        vault: { configDir: '.obsidian', getFileByPath: () => file,
          adapter: { read: async () => '{}' }, process: async (_file: TFile, transform: (text: string) => string) => { content = transform(content); } },
        metadataCache: { getFileCache: () => ({ frontmatter: status === undefined ? {} : { status } }) },
      },
      settings: { newTaskKind: 'note', newTaskNote: 'Inbox.md', newTaskHeading: '' },
    } as unknown as TaskTrellisPlugin;
    const c = parseBoardConfig('House', { 'exclude-properties': ['status: archived'] }).config;
    await new QuickAdd(plugin).addFromBoard(buildBoard([], c, '2026-10-23', () => undefined), { rowId: 'now', columnId: 'backlog' }, 'Call supplier', false);
    expect(content).toContain('Call supplier');
    expect(notices.some((notice) => notice.includes('filters hide'))).toBe(hidden);
  });
});
