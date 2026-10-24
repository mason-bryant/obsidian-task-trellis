import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuickAdd } from '../src/obsidian/QuickAdd.ts';
import { buildBoard } from '../src/core/board.ts';
import { parseBoardConfig } from '../src/core/boardConfig.ts';
import { Events, notices, TFile } from './mocks/obsidian.ts';
import type TaskTrellisPlugin from '../main.ts';

beforeEach(() => { notices.length = 0; });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it('cancels Templater recovery when disabled without writing the task again', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('window', globalThis);
  const file = new TFile('Inbox.md');
  const workspace = new Events();
  const offref = vi.spyOn(workspace, 'offref');
  const read = vi.fn(async () => '');
  const process = vi.fn(async () => undefined);
  let unload = () => {};
  const plugin = {
    register: (cleanup: () => void) => { unload = cleanup; },
    app: {
      workspace,
      plugins: { enabledPlugins: new Set(['templater-obsidian']) },
      vault: { configDir: '.obsidian', adapter: { read: async () => '{}' },
        getFileByPath: () => null, create: async () => file, process, read },
    },
    settings: { newTaskKind: 'note', newTaskNote: 'Inbox.md', newTaskHeading: '' },
  } as unknown as TaskTrellisPlugin;
  const config = parseBoardConfig('House', {}).config;
  await new QuickAdd(plugin).addFromBoard(buildBoard([], config, '2026-10-23', () => undefined),
    { rowId: 'now', columnId: 'backlog' }, 'New task', false);
  expect(process).toHaveBeenCalledTimes(1);
  unload();
  workspace.trigger('templater:overwrite-file', { file });
  await vi.runAllTimersAsync();
  expect(offref).toHaveBeenCalledTimes(1);
  expect(read).not.toHaveBeenCalled();
  expect(process).toHaveBeenCalledTimes(1);
});

describe('new-task filter feedback', () => {
  it.each([
    { rules: { 'include-tags': ['home'] }, pageTags: ['Home/Kitchen'], siblingTags: [], text: 'Call supplier', hidden: false },
    { rules: { 'include-tags': ['home'] }, pageTags: [], siblingTags: ['#home'], text: 'Call supplier', hidden: true },
    { rules: { 'exclude-tags': ['private'] }, pageTags: [], siblingTags: ['#private'], text: 'Call supplier', hidden: false },
    { rules: { 'exclude-tags': ['archive'] }, pageTags: ['Archive/2026'], siblingTags: [], text: 'Call supplier', hidden: true },
    { rules: { 'include-tags': ['home'] }, pageTags: [], siblingTags: [], text: 'Call supplier #home', hidden: false },
  ])('uses page and own-task tags for feedback: $text / $rules', async ({ rules, pageTags, siblingTags, text, hidden }) => {
    const file = new TFile('Inbox.md');
    let content = '';
    const position = { start: { line: 0 }, end: { line: 0 } };
    const plugin = {
      register: () => undefined,
      app: {
        vault: { configDir: '.obsidian', getFileByPath: () => file,
          adapter: { read: async () => '{}' }, process: async (_file: TFile, transform: (text: string) => string) => { content = transform(content); } },
        metadataCache: { getFileCache: () => ({ frontmatter: { tags: pageTags },
          tags: siblingTags.map((tag) => ({ tag, position })), listItems: [{ task: ' ', position }] }) },
      },
      settings: { newTaskKind: 'note', newTaskNote: 'Inbox.md', newTaskHeading: '' },
    } as unknown as TaskTrellisPlugin;
    const c = parseBoardConfig('House', rules).config;
    await new QuickAdd(plugin).addFromBoard(buildBoard([], c, '2026-10-23', () => undefined), { rowId: 'now', columnId: 'backlog' }, text, false);
    expect(content).toContain(text);
    expect(notices.some((notice) => notice.includes('filters hide'))).toBe(hidden);
  });

  it.each([['archived', true], ['active', false], [undefined, false]])('checks property exclusions for status %s', async (status, hidden) => {
    const file = new TFile('Inbox.md');
    let content = '';
    const plugin = {
      register: () => undefined,
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
