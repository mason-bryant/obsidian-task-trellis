import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuickAdd } from '../src/obsidian/QuickAdd.ts';
import { buildBoard, type BoardTask } from '../src/core/board.ts';
import { parseTaskLine } from '../src/core/taskLine.ts';
import { TaskWriter } from '../src/obsidian/TaskWriter.ts';
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


describe('new cards appear first', () => {
  it.each([undefined, 0, 1, 100])('prepends repeatedly ahead of a first sort of %s, preserving other task fields', async (sort) => {
    const existing = `- [ ] Existing ⏫ 📅 2026-10-25 #tt/house/label/l123abc #tt/other/doing/9${sort === undefined ? '' : ` #tt/house/backlog/${sort}`} ^keep`;
    const files = new Map([['Existing.md', existing], ['Inbox.md', '## Tasks']]);
    const refs = new Map([...files.keys()].map((path) => [path, new TFile(path)]));
    const plugin = {
      register: () => undefined,
      app: {
        vault: { configDir: '.obsidian', getFileByPath: (path: string) => refs.get(path),
          getAbstractFileByPath: (path: string) => refs.get(path),
          adapter: { read: async () => '{}' },
          process: async (file: TFile, transform: (text: string) => string) => { files.set(file.path, transform(files.get(file.path)!)); } },
        metadataCache: { getFileCache: () => ({}) },
      },
      settings: { newTaskKind: 'note', newTaskNote: 'Inbox.md', newTaskHeading: '## Tasks' },
    } as unknown as TaskTrellisPlugin;
    plugin.writer = new TaskWriter(plugin.app);
    const config = parseBoardConfig('House', {}).config;
    const model = () => {
      const tasks: BoardTask[] = [];
      for (const [path, content] of files) content.split('\n').forEach((raw, line) => {
        const parsed = parseTaskLine(raw);
        if (parsed) tasks.push({ ...parsed, raw, path, line, id: `${path}:${line}` });
      });
      return buildBoard(tasks, config, '2026-10-25', () => undefined);
    };
    const quick = new QuickAdd(plugin);
    for (let n = 0; n < 20; n++) {
      await quick.addFromBoard(model(), { rowId: 'now', columnId: 'backlog' }, `New ${n}`, false);
      expect(model().cells.now!.backlog!.map((task) => task.text)).toEqual([
        ...Array.from({ length: n + 1 }, (_, i) => `New ${n - i}`), 'Existing',
      ]);
    }
    const after = parseTaskLine(files.get('Existing.md')!)!;
    expect(after.dueDate).toBe('2026-10-25');
    expect(after.priority).toBe(parseTaskLine(existing)!.priority);
    expect(after.tags).toContain('tt/house/label/l123abc');
    expect(after.placements.other).toEqual({ column: 'doing', sort: 9 });
    expect(files.get('Existing.md')).toContain('^keep');
  });
});

it('reports a missing destination as failure without pretending the task was saved', async () => {
  const plugin = { register: () => {}, app: { vault: { adapter: { read: async () => '{}' } } },
    settings: { newTaskKind: 'daily', newTaskHeading: '' } } as unknown as TaskTrellisPlugin;
  const config = parseBoardConfig('Review', {}).config;
  expect(await new QuickAdd(plugin).addFromBoard(buildBoard([], config, '2026-10-25', () => undefined), { rowId: 'now', columnId: 'backlog' }, 'Keep me', false)).toBe(false);
  expect(notices.at(-1)).toContain('Daily notes');
});
