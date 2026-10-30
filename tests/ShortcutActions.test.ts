import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShortcutActions } from '../src/obsidian/ShortcutActions.ts';
import { QuickAdd } from '../src/obsidian/QuickAdd.ts';
import { parseBoardConfig } from '../src/core/boardConfig.ts';
import { parseTaskLine } from '../src/core/taskLine.ts';
import { Events, TFile, notices } from './mocks/obsidian.ts';
import type TaskTrellisPlugin from '../main.ts';

function fixture(options: { filtered?: boolean; created?: boolean; daily?: boolean; templater?: boolean; frontmatter?: Record<string, unknown>; indexed?: boolean } = {}) {
  vi.stubGlobal('window', globalThis);
  const file = new TFile('Inbox.md');
  const boardFile = new TFile('Boards/House.md');
  const config = parseBoardConfig('House', {
    slug: 'house', columns: ['Doing', 'Backlog', 'Done'],
    ...(options.filtered ? { 'include-tags': ['home'] } : {}),
    ...(!options.daily ? { 'new-tasks': 'note', 'new-tasks-note': 'Inbox.md', 'new-tasks-heading': 'Tasks' } : {}),
  }).config;
  let content = '# Inbox\n\n## Tasks\n- [ ] Existing task\n\n## Other\nKeep this\n';
  let exists = !options.created;
  const cleanups: Array<() => void> = [];
  const getDailyNote = vi.fn(async () => file);
  const cache = { frontmatter: options.frontmatter ?? {} };
  // Like Obsidian, a new note has no metadata until it has been indexed.
  let indexed = options.created ? null : cache;
  const metadataCache = Object.assign(new Events(), { getFileCache: () => indexed });
  const plugin = {
    register: (fn: () => void) => cleanups.push(fn),
    isExcludedFromIndex: vi.fn(() => false),
    boards: { boards: () => [{ file: boardFile, config }] },
    openBoard: vi.fn(async () => undefined),
    settings: { newTaskKind: 'daily', newTaskNote: '', newTaskHeading: 'Tasks' },
    app: {
      workspace: new Events(),
      plugins: { enabledPlugins: new Set(options.templater ? ['templater-obsidian'] : []) },
      metadataCache,
      internalPlugins: { getEnabledPluginById: () => ({ getDailyNote }) },
      vault: {
        configDir: '.obsidian', adapter: { read: async () => '{"setCreatedDate":true}' },
        getFileByPath: vi.fn(() => exists ? file : null),
        create: vi.fn(async () => { exists = true; return file; }),
        // Like Obsidian, index the note a moment after each write.
        process: vi.fn(async (_file: TFile, transform: (value: string) => string) => {
          const written = content = transform(content);
          if (options.indexed !== false) setTimeout(() => { indexed = cache; metadataCache.trigger('changed', file, written, cache); }, 5);
        }),
        read: vi.fn(async () => content),
        on: vi.fn(), offref: vi.fn(),
      },
    },
  } as unknown as TaskTrellisPlugin;
  plugin.quickAdd = new QuickAdd(plugin);
  const actions = new ShortcutActions(plugin);
  return { plugin, config, file, boardFile, actions, getDailyNote,
    content: () => content, setContent: (value: string) => { content = value; }, unload: () => cleanups.forEach(fn => fn()) };
}
const request = { board: 'house', text: 'Call supplier', due: '2026-10-25', column: 'Doing' };
beforeEach(() => { notices.length = 0; });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('shortcut creation', () => {
  it('writes the exact date and placement under the board destination heading, then reports local save', async () => {
    const f = fixture();
    await f.actions.handle(request);
    const line = f.content().split('\n').find(line => line.includes('Call supplier'))!;
    expect(parseTaskLine(line)).toMatchObject({ text: 'Call supplier', dueDate: '2026-10-25', placements: { house: { column: 'doing' } } });
    expect(f.content().indexOf('Call supplier')).toBeLessThan(f.content().indexOf('## Other'));
    expect(f.content()).toContain('Existing task');
    expect(notices.join(' ')).toContain('Task saved on this device.');
    expect(f.plugin.openBoard).not.toHaveBeenCalled();
    expect(f.getDailyNote).not.toHaveBeenCalled();
  });
  it('uses Backlog and removes embedded dates when due is omitted', async () => {
    const f = fixture();
    await f.actions.handle({ board: 'House', text: 'No deadline 📅 2026-12-01' });
    const line = f.content().split('\n').find(line => line.includes('No deadline'))!;
    const task = parseTaskLine(line)!;
    expect(task.dueDate).toBeUndefined();
    expect(task.placements.house?.column).toBe('backlog');
  });
  it('overrides an embedded date and accepts the full board path', async () => {
    const f = fixture();
    await f.actions.handle({ ...request, board: 'Boards/House.md', text: 'Call 📅 2027-01-01', 'open-board': 'true' });
    expect(f.content()).toContain('📅 2026-10-25');
    expect(f.content()).not.toContain('2027-01-01');
    expect(f.plugin.openBoard).toHaveBeenCalledWith(f.boardFile);
  });
  it('uses the daily-note destination when configured', async () => {
    const f = fixture({ daily: true });
    await f.actions.handle(request);
    expect(f.getDailyNote).toHaveBeenCalledOnce();
    expect(f.content()).toContain('Call supplier');
  });
  it.each([
    { ...request, due: '2026-02-30' }, { ...request, board: 'missing' },
    { ...request, column: 'missing' }, { ...request, column: 'Done' },
  ])('rejects invalid requests before creating or changing notes', async params => {
    const f = fixture({ created: true });
    await f.actions.handle(params);
    expect(f.plugin.app.vault.create).not.toHaveBeenCalled();
    expect(f.plugin.app.vault.process).not.toHaveBeenCalled();
    expect(notices.join(' ')).not.toContain('Task saved');
  });
  it('rejects ambiguous board identifiers', async () => {
    const f = fixture();
    const entry = f.plugin.boards.boards()[0]!;
    f.plugin.boards.boards = () => [entry, { ...entry, file: new TFile('Other/House.md') } as never];
    await f.actions.handle(request);
    expect(f.plugin.app.vault.process).not.toHaveBeenCalled();
    expect(notices.join(' ')).toContain('ambiguous');
  });
  it('rejects a hidden task before writing and allows matching task tags', async () => {
    const f = fixture({ filtered: true });
    await f.actions.handle(request);
    expect(f.plugin.app.vault.process).not.toHaveBeenCalled();
    expect(notices.join(' ')).toContain('filters would hide');
    await f.actions.handle({ ...request, text: 'Call supplier #home' });
    expect(f.content()).toContain('Call supplier #home');
  });
  it('warns when a newly created destination’s tags don’t match the board’s filters', async () => {
    const f = fixture({ created: true, filtered: true });
    await f.actions.handle(request);
    expect(f.content()).toContain('Call supplier');
    expect(notices.join(' ')).toContain('may be hidden');
    expect(notices.join(' ')).toContain('Sync is not confirmed');
  });
  it('reports a save without a filter warning once Obsidian has indexed a new destination whose tags match', async () => {
    const f = fixture({ created: true, filtered: true, frontmatter: { tags: ['home'] } });
    await f.actions.handle(request);
    expect(f.content()).toContain('Call supplier');
    expect(notices.join(' ')).toContain('Task saved on this device. Keep Obsidian open');
    expect(notices.join(' ')).not.toContain('may be hidden');
  });
  it('warns when Obsidian hasn’t indexed a new destination after a short wait', async () => {
    vi.useFakeTimers();
    const f = fixture({ created: true, filtered: true, frontmatter: { tags: ['home'] }, indexed: false });
    const pending = f.actions.handle(request);
    await vi.advanceTimersByTimeAsync(1999);
    expect(notices).toEqual([]);
    await vi.advanceTimersByTimeAsync(1); await pending;
    expect(f.content()).toContain('Call supplier');
    expect(notices.join(' ')).toContain('may be hidden');
  });
  it('blocks excluded destinations', async () => {
    const f = fixture();
    vi.mocked(f.plugin.isExcludedFromIndex).mockReturnValue(true);
    await f.actions.handle(request);
    expect(f.plugin.app.vault.process).not.toHaveBeenCalled();
    expect(notices.join(' ')).toContain('excluded');
  });
  it('suppresses retries even after recreating the handler, but allows separate requests', async () => {
    const f = fixture();
    const params = { ...request, 'request-id': 'unique-1' };
    await Promise.all([f.actions.handle(params), f.actions.handle(params)]);
    await new ShortcutActions(f.plugin).handle(params);
    expect(f.content().match(/Call supplier/g)).toHaveLength(1);
    expect(notices.join(' ')).toContain('no duplicate');
    await f.actions.handle({ ...params, 'request-id': 'unique-2' });
    expect(f.content().match(/Call supplier/g)).toHaveLength(2);
  });
  it('allows identical tasks when no request ID was provided', async () => {
    const f = fixture();
    await f.actions.handle(request); await f.actions.handle(request);
    expect(f.content().match(/Call supplier/g)).toHaveLength(2);
  });
  it('reports a failed write without claiming success and permits retry', async () => {
    const f = fixture();
    vi.mocked(f.plugin.app.vault.process).mockRejectedValueOnce(new Error('Disk error'));
    await f.actions.handle(request);
    expect(notices.join(' ')).not.toContain('Task saved');
    await f.actions.handle(request);
    expect(f.content()).toContain('Call supplier');
  });
  it('does not write queued requests after the plugin is unloaded', async () => {
    const f = fixture();
    const pending = f.actions.handle(request);
    f.unload();
    await pending;
    expect(f.plugin.app.vault.process).not.toHaveBeenCalled();
  });
  it('keeps the success result if opening the board fails after saving', async () => {
    const f = fixture();
    vi.mocked(f.plugin.openBoard).mockRejectedValueOnce(new Error('Cannot open'));
    await f.actions.handle({ ...request, 'open-board': 'true' });
    expect(f.content()).toContain('Call supplier');
    expect(notices.join(' ')).toContain('task is saved, but the board');
  });
  it('waits for new-note template recovery before reporting local save', async () => {
    vi.useFakeTimers();
    const f = fixture({ created: true, templater: true });
    const pending = f.actions.handle({ ...request, 'request-id': 'template-1' });
    await vi.advanceTimersByTimeAsync(0);
    expect(f.content()).toContain('Call supplier');
    expect(notices.join(' ')).not.toContain('Task saved');
    f.setContent('# Template rewrote this note\n');
    await vi.runAllTimersAsync(); await pending;
    expect(f.content()).toContain('Call supplier');
    expect(f.content()).toContain('task-trellis-request:template-1');
    expect(notices.join(' ')).toContain('Task saved on this device.');
  });
  it('does not claim verified local save if template recovery fails', async () => {
    vi.useFakeTimers();
    const f = fixture({ created: true, templater: true });
    vi.mocked(f.plugin.app.vault.read).mockRejectedValueOnce(new Error('Read failed'));
    const pending = f.actions.handle(request);
    await vi.runAllTimersAsync(); await pending;
    expect(notices.join(' ')).not.toContain('Task saved on this device');
    expect(notices.join(' ')).toContain('template processing could not be verified');
  });
});
