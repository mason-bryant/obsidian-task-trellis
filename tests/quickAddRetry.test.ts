import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../src/obsidian/recoverDraft.ts', () => ({ recoverDraft: vi.fn() }));
import { buildBoard } from '../src/core/board.ts';
import { parseBoardConfig } from '../src/core/boardConfig.ts';
import { QuickAdd } from '../src/obsidian/QuickAdd.ts';
import { recoverDraft } from '../src/obsidian/recoverDraft.ts';
import type TaskTrellisPlugin from '../main.ts';
import { Workspace } from './mocks/obsidian.ts';

const config = parseBoardConfig('House', { slug: 'house', columns: ['Backlog', 'Doing', 'Done'], 'done-column': 'Done' }).config;
const line = '- [ ] Call the roofer #tt/house/doing';

/** The first save fails, so Task not saved opens; `retry` is what its check does. */
function setup() {
  const plugin = {
    register: () => undefined,
    app: { workspace: new Workspace(), metadataCache: { getCache: () => ({}), getFileCache: () => ({}) }, vault: { configDir: '.obsidian' } },
    index: { all: () => [] },
    settings: { newTaskKind: 'note', newTaskNote: 'Inbox.md', newTaskHeading: '' },
  } as unknown as TaskTrellisPlugin;
  const quick = new QuickAdd(plugin);
  const internals = quick as unknown as Record<string, unknown>;
  internals.compose = vi.fn(async () => line);
  internals.createdDate = vi.fn(async () => null);
  const add = vi.fn(async (..._args: unknown[]) => true).mockResolvedValueOnce(false);
  internals.add = add;
  const retry = () => vi.mocked(recoverDraft).mock.lastCall![2](line);
  return { quick, add, retry };
}

beforeEach(() => { vi.mocked(recoverDraft).mockClear(); });

it('says where a retried task went, from a column’s command', async () => {
  const { quick, add, retry } = setup();
  await quick.addToColumn(config, 'doing', 'House');
  expect(recoverDraft).toHaveBeenCalledOnce();
  await retry();
  expect(add.mock.calls[1]![4]).toBe('Task Trellis: added to House: Doing.');
});

it('says where a retried task went, from the boards sidebar', async () => {
  const { quick, add, retry } = setup();
  await quick.addToBacklog(config, 'Call the roofer', true);
  await retry();
  expect(add.mock.calls[0]![4]).toBeUndefined();
  expect(add.mock.calls[1]![4]).toBe('Task Trellis: added to House: Backlog, No due date.');
});

it('retries from the board as it is then, not as it was on the first try', async () => {
  for (const start of ['command', 'board'] as const) {
    const { quick, add, retry } = setup();
    const drawn = buildBoard([], config, '2026-11-05', () => undefined);
    if (start === 'command') await quick.addToColumn(config, 'doing', 'House');
    else await quick.addFromBoard(drawn, { rowId: 'none', columnId: 'doing' }, 'Call the roofer', true);
    await retry();
    expect(add).toHaveBeenCalledTimes(2);
    expect(add.mock.calls[1]![3]).not.toBe(add.mock.calls[0]![3]);
    if (start === 'board') expect(add.mock.calls[0]![3]).toBe(drawn);
  }
});
