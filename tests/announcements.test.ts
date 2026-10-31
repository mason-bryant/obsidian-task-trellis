// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { buildBoard, taskId, type BoardTask } from '../src/core/board.ts';
import { parseBoardConfig } from '../src/core/boardConfig.ts';
import { draftFromConfig } from '../src/core/boardDraft.ts';
import { parseTaskLine } from '../src/core/taskLine.ts';
import { notice } from '../src/obsidian/notice.ts';
import { QuickAdd } from '../src/obsidian/QuickAdd.ts';
import { ANNOUNCE_DELAY_MS } from '../src/ui/announce.ts';
import { renderBoard, type RenderHost } from '../src/ui/renderBoard.ts';
import { renderBoardSettings, type SettingsFormHost } from '../src/ui/renderBoardSettings.ts';
import { TFile, Workspace } from './mocks/obsidian.ts';
import type TaskTrellisPlugin from '../main.ts';

// VoiceOver speaks a live region only when it already exists and its text changes later.
const today = '2026-10-28';
const config = parseBoardConfig('House', { slug: 'house' }).config;
const paint = { ...parseTaskLine('- [ ] Paint the kitchen #tt/house/doing')!, raw: '- [ ] Paint the kitchen #tt/house/doing', path: 'House.md', line: 0, id: taskId('House.md', 0) } as BoardTask;

let root: HTMLElement;
let host: RenderHost;
const draw = () => renderBoard(root, buildBoard([paint], config, today, () => undefined), host, { warnings: [], info: [] });
const region = (owner: HTMLElement, kind = 'status') => owner.querySelector<HTMLElement>(`.tt-live [role="${kind}"]`)!;
const click = (label: string) => [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === label || b.getAttribute('aria-label') === label)!.click();
const later = async () => { await vi.advanceTimersByTimeAsync(ANNOUNCE_DELAY_MS); };
const activeBoard = (board: HTMLElement | null) => ({ workspace: Object.assign(new Workspace(), { getActiveViewOfType: () => board && { contentEl: board } }) });

beforeEach(() => {
  vi.useFakeTimers();
  root = document.createElement('div'); document.body.replaceChildren(root);
  host = {
    renderText: (el, t) => { el.textContent = t.text; }, icon: () => undefined, sourceLabel: () => 'House',
    isCollapsed: () => false, onToggleRow: vi.fn(), onSetSubtasksCollapsed: vi.fn(), onDrop: vi.fn(), onToggle: vi.fn(),
    onEdit: vi.fn(), onOpenSource: vi.fn(), onDragEnd: vi.fn(), onAddTask: vi.fn(), onAddSubtask: vi.fn(),
  };
  draw();
});
afterEach(() => { vi.useRealTimers(); });

it('says a new Undo after the redraw, from a region the redraw keeps, once per action', async () => {
  const status = region(root);
  host.undo = { label: 'Task moved', run: vi.fn() }; draw();
  expect(region(root)).toBe(status); expect(status.isConnected).toBe(true);
  expect(status.textContent).toBe('');
  await later(); expect(status.textContent).toBe('Task moved');
  // Redrawing for the same action doesn't say it again; another action with the same words does.
  draw(); expect(status.textContent).toBe('Task moved');
  host.undo = { label: 'Task moved', run: vi.fn() }; draw();
  expect(status.textContent).toBe('');
  await later(); expect(status.textContent).toBe('Task moved');
  expect(root.querySelectorAll('[role="status"]')).toEqual(root.querySelectorAll('.tt-live [role="status"]'));
});

it('says the selection count and a bulk result as they change', async () => {
  host.onBulkAction = vi.fn(async (tasks) => ({ tasks, message: '1 updated' })); draw();
  const status = region(root);
  click('Select'); await later(); expect(status.textContent).toBe('');
  click('Select Paint the kitchen'); await later(); expect(status.textContent).toBe('1 selected.');
  click('Move'); await later(); expect(status.textContent).toBe('1 updated.');
  click('Clear selection'); await later(); expect(status.textContent).toBe('0 selected.');
  expect(root.querySelector('.tt-bulk-count')!.getAttribute('role')).toBeNull();
});

function settings(properties: Record<string, unknown>) {
  Element.prototype.scrollIntoView = vi.fn();
  const original = parseBoardConfig('Filters', properties).config;
  const form = document.createElement('div'); document.body.replaceChildren(form);
  const formHost: SettingsFormHost = {
    initialSection: 'filters', icon: vi.fn(), attachKeySuggest: vi.fn(), attachValueSuggest: vi.fn(), attachTagSuggest: vi.fn(),
    attachFolderSuggest: vi.fn(), taggedTasks: () => [], onSave: vi.fn(), onDiscard: vi.fn(),
  };
  renderBoardSettings(form, draftFromConfig(original), original, formHost);
  const control = <T extends HTMLElement>(label: string) => form.querySelector<T>(`[aria-label="${label}"]`)!;
  return { form, control };
}

it('says a new filter warning from the settings dialog, but not one already showing', async () => {
  const shown = settings({ 'filter-properties': ['status'], 'exclude-properties': ['status'] });
  expect(shown.form.querySelector('.tt-filter-warning')).not.toBeNull();
  await later(); expect(region(shown.form).textContent).toBe('');

  const { form, control } = settings({ 'filter-properties': ['status'] });
  const status = region(form);
  const choose = (label: string, value: string) => { const node = control<HTMLSelectElement>(label); node.value = value; node.dispatchEvent(new Event('change')); };
  control<HTMLButtonElement>('Filters: Add filter group').click();
  choose('Group 2: Match', 'none');
  choose('Filter 2.1: Field', 'property');
  expect(region(form)).toBe(status);
  const key = control<HTMLInputElement>('Filter 2.1: Property'); key.value = 'status'; key.dispatchEvent(new Event('input'));
  await later();
  expect(status.textContent).toBe('“status” is required and its existence is excluded. No note can satisfy both rules.');
  expect(form.querySelector('.tt-filter-warnings')!.getAttribute('role')).toBeNull();
});

it('says a notice from the active board, as an alert for an error, and adds nothing without one', async () => {
  notice(activeBoard(root) as unknown as App, 'Task Trellis: could not move the task. Check that its note can be edited, then try again.', { alert: true });
  await later();
  expect(region(root, 'alert').textContent).toBe('Task Trellis: could not move the task. Check that its note can be edited, then try again.');
  expect(region(root).textContent).toBe('');

  notice(activeBoard(null) as unknown as App, 'Task Trellis: added to Inbox.');
  await later();
  expect(document.querySelectorAll('.tt-live')).toHaveLength(1);
});

it('says when a task added from the board is hidden by its filters', async () => {
  const file = new TFile('Inbox.md');
  const plugin = {
    register: () => undefined,
    app: {
      ...activeBoard(root),
      vault: { configDir: '.obsidian', getFileByPath: () => file, adapter: { read: async () => '{}' }, process: async () => undefined },
      metadataCache: { getFileCache: () => ({ frontmatter: {} }) },
    },
    settings: { newTaskKind: 'note', newTaskNote: 'Inbox.md', newTaskHeading: '' },
  } as unknown as TaskTrellisPlugin;
  const hidden = parseBoardConfig('House', { 'include-tags': ['home'] }).config;
  await new QuickAdd(plugin).addFromBoard(buildBoard([], hidden, today, () => undefined), { rowId: 'now', columnId: 'backlog' }, 'Call supplier', false);
  await later();
  expect(region(root).textContent).toBe('Task Trellis: added to Inbox, but this board’s filters hide tasks from that note.');
});
