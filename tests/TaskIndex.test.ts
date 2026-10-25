import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App, CachedMetadata, Plugin } from 'obsidian';
import { Events, TFile } from './mocks/obsidian.ts';
import { TaskIndex } from '../src/obsidian/TaskIndex.ts';

const file = new TFile('Daily/Today.md');

function fakeApp(read: () => Promise<string> = async () => '') {
  const metadataCache = Object.assign(new Events(), { offref: () => undefined, getFileCache: () => cache() });
  const vault = Object.assign(new Events(), { getMarkdownFiles: () => [file], cachedRead: read });
  const app = { metadataCache, vault } as unknown as App;
  const index = new TaskIndex(app, () => false);
  const cleanups: (() => void)[] = [];
  index.attach({ registerEvent: () => undefined, register: (cleanup: () => void) => cleanups.push(cleanup) } as unknown as Plugin);
  const change = (content: string, c = cache()) => metadataCache.trigger('changed', file, content, c);
  return { index, change, metadataCache, vault, unload: () => cleanups.forEach((cleanup) => cleanup()) };
}

/** A cache with top-level tasks on lines 1 and 2. */
function cache(frontmatter?: Record<string, unknown>): CachedMetadata {
  const item = (line: number) => ({ position: { start: { line, col: 0, offset: 0 }, end: { line, col: 0, offset: 0 } }, parent: -1, task: ' ' });
  return { listItems: [item(1), item(2)], ...(frontmatter && { frontmatter }) } as CachedMetadata;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('window', globalThis);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('TaskIndex', () => {
  it('cancels pending notifications on unload', () => {
    const { index, change, unload } = fakeApp();
    const updated = vi.fn();
    index.on('updated', updated);
    change('# Today\n- [ ] Pending task\n');
    unload();
    vi.runAllTimers();
    expect(updated).not.toHaveBeenCalled();
    expect(index.all()).toEqual([]);
  });

  it('stops an in-flight rebuild on unload', async () => {
    let finishRead = (_content: string) => undefined as void;
    const { index, unload } = fakeApp(() => new Promise((resolve) => (finishRead = resolve)));
    const rebuilt = index.rebuild();
    unload();
    finishRead('# Today\n- [ ] Stale task\n');
    await rebuilt;
    vi.runAllTimers();
    expect(index.all()).toEqual([]);
    expect(index.version).toBe(0);
  });
  it('only tells boards about edits that change a task line or the front matter', () => {
    const { index, change } = fakeApp();
    let updates = 0;
    index.on('updated', () => updates++);
    const settle = (content: string, c = cache()) => {
      change(content, c);
      vi.advanceTimersByTime(200);
    };

    settle('# Today\n- [ ] call the roofer\n');
    expect(updates).toBe(1);
    expect(index.all().map((t) => t.text)).toEqual(['call the roofer']);

    settle('# Today, edited\n- [ ] call the roofer\n');
    expect(updates).toBe(1);

    settle('# Today, edited\n- [ ] call the roofer 📅 2026-10-22\n');
    expect(updates).toBe(2);
    expect(index.all()[0]!.dueDate).toBe('2026-10-22');

    settle('# Today, edited\n- [ ] call the roofer 📅 2026-10-22\n', cache({ context: 'house' }));
    expect(updates).toBe(3);
  });

  it('notes which tasks share their text with another in the note', () => {
    const { index, change } = fakeApp();
    change('# Today\n- [ ] call the vendor\n- [ ] call the vendor\n');
    expect(index.all().map((t) => t.twins)).toEqual([1, 1]);
    change('# Today\n- [ ] call the vendor\n- [ ] call the vendor about tile\n');
    expect(index.all().map((t) => t.twins)).toEqual([undefined, undefined]);
  });

  it('refreshes when inline note tags change, even if all task lines stay the same', () => {
    const { index, change } = fakeApp();
    const content = '# Today\n- [ ] call the roofer\n';
    const settle = (tags: string[]) => {
      const c = cache();
      c.tags = tags.map((tag) => ({ tag, position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: tag.length, offset: tag.length } } }));
      change(content, c);
      vi.advanceTimersByTime(200);
    };
    settle([]);
    const initial = index.version;
    settle(['#work']);
    expect(index.version).toBe(initial + 1);
    settle(['#WORK', '#work', '#tt/house/doing']);
    expect(index.version).toBe(initial + 1);
    settle([]);
    expect(index.version).toBe(initial + 2);
  });

  it('keeps an edit that arrives while a rebuild is reading the vault', async () => {
    let finishRead = (_content: string) => undefined as void;
    const { index, change } = fakeApp(() => new Promise((resolve) => (finishRead = resolve)));
    const rebuilt = index.rebuild();
    change('# Today\n- [ ] new text\n');
    finishRead('# Today\n- [ ] old text\n');
    await rebuilt;
    expect(index.all().map((t) => t.text)).toEqual(['new text']);
  });

  it('refreshes duplicate snapshots when only surrounding prose changes', () => {
    const { index, change } = fakeApp();
    change('# Before\n- [ ] call the vendor\n- [ ] call the vendor\n');
    const updated = '# After\n- [ ] call the vendor\n- [ ] call the vendor\n';
    change(updated);
    expect(index.all().map((t) => t.duplicateSource)).toEqual([updated, updated]);
  });

  it('does not resurrect a file deleted while a rebuild reads it', async () => {
    let finishRead = (_content: string) => undefined as void;
    const { index, change, metadataCache } = fakeApp(() => new Promise((resolve) => (finishRead = resolve)));
    change('# Today\n- [ ] old text\n');
    const rebuilt = index.rebuild();
    metadataCache.trigger('deleted', file);
    finishRead('# Today\n- [ ] old text\n');
    await rebuilt;
    expect(index.all()).toEqual([]);
  });

  it('keeps task removal that arrives during a rebuild', async () => {
    let finishRead = (_content: string) => undefined as void;
    const { index, change } = fakeApp(() => new Promise((resolve) => (finishRead = resolve)));
    change('# Today\n- [ ] old text\n');
    const rebuilt = index.rebuild();
    change('# Today\nNo tasks left\n', { listItems: [] });
    finishRead('# Today\n- [ ] old text\n');
    await rebuilt;
    expect(index.all()).toEqual([]);
  });

  it('keeps updates to a file already scanned while later files are being read', async () => {
    let finishRead = (_content: string) => undefined as void;
    const { index, change, vault } = fakeApp(() => new Promise((resolve) => (finishRead = resolve)));
    const other = new TFile('other.md');
    vault.getMarkdownFiles = () => [file, other];
    const rebuilt = index.rebuild();
    finishRead('# Today\n- [ ] old text\n');
    await Promise.resolve();
    change('# Today\n- [ ] new text\n');
    finishRead('# Other\n- [ ] another task\n');
    await rebuilt;
    expect(index.all().map((t) => t.text)).toEqual(['new text', 'another task']);
  });

  it('lets the latest of two overlapping rebuilds decide', async () => {
    const reads: ((content: string) => void)[] = [];
    const { index } = fakeApp(() => new Promise((resolve) => reads.push(resolve)));
    const first = index.rebuild();
    const second = index.rebuild();
    reads[1]!('# Today\n- [ ] newer read\n');
    await second;
    reads[0]!('# Today\n- [ ] older read\n');
    await first;
    expect(index.all().map((t) => t.text)).toEqual(['newer read']);
  });
});

it('refreshes duplicate snapshots after prose edits without redrawing, but never refreshes a changed identity', () => {
  const { index, change } = fakeApp();
  change('First prose\n- [ ] same\n- [ ] same\n'); vi.advanceTimersByTime(200);
  const old = index.all()[0]!; const version = index.version;
  change('New prose\n- [ ] same\n- [ ] same\n'); vi.advanceTimersByTime(200);
  expect(index.version).toBe(version);
  expect(index.currentSnapshot(old).duplicateSource).toContain('New prose');
  change('New prose\n- [ ] different\n- [ ] same\n');
  expect(index.currentSnapshot(old)).toBe(old);
});
it('notifies removal of the old path when a renamed file disappears during its read', async () => {
  const { index, change, vault } = fakeApp(async () => { throw new Error('Deleted'); });
  Object.assign(vault, { getAbstractFileByPath: () => null });
  change('Heading\n- [ ] old\n'); vi.advanceTimersByTime(200);
  vault.trigger('rename', new TFile('Renamed.md'), file.path);
  await vi.runAllTimersAsync();
  expect(index.all()).toEqual([]); expect(index.version).toBe(2);
});
