// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { newBoardFrontmatter, parseBoardConfig } from '../src/core/boardConfig.ts';
import { changedFrontmatter, draftChanged, draftFromConfig, draftToFrontmatter } from '../src/core/boardDraft.ts';
import { renderBoardSettings } from '../src/ui/renderBoardSettings.ts';
import { renderBoard, type RenderHost } from '../src/ui/renderBoard.ts';
import { buildBoard } from '../src/core/board.ts';
import { parseTaskLine } from '../src/core/taskLine.ts';

it('defaults to note-order subtasks, all shown, with the overdue bar', () => {
  expect(parseBoardConfig('House', {}).config).toMatchObject({ sortCompletedSubtasks: false, hideCompletedSubtasks: false, overdueBar: true, openLinks: 'popup', labelShape: 'pill' });
  expect(parseBoardConfig('House', newBoardFrontmatter('house')).config).toMatchObject({ sortCompletedSubtasks: false, hideCompletedSubtasks: false, overdueBar: true, openLinks: 'popup', labelShape: 'pill' });
});

it('checks to hide, saves inverse visibility flags, and keeps spacing and order as choices', () => {
  const config = parseBoardConfig('House', { slug: 'house' }).config, draft = draftFromConfig(config);
  const root = document.createElement('div'); document.body.replaceChildren(root);
  renderBoardSettings(root, draft, config, {
    initialSection: 'appearance', icon: vi.fn(), attachKeySuggest: vi.fn(), attachValueSuggest: vi.fn(), attachTagSuggest: vi.fn(),
    attachFolderSuggest: vi.fn(), countTagged: () => 0, onSave: vi.fn(), onDiscard: vi.fn(), onOpenBoard: vi.fn(),
  });
  const box = (label: string) => [...root.querySelectorAll('label')].find((l) => l.textContent === label)!.querySelector('input')!;
  expect(draftChanged(draft, config)).toBe(false);
  const labels = [...root.querySelectorAll('input[type="checkbox"]')].map((input) => input.closest('label')!.textContent);
  expect(labels).toEqual(['Hide column selector', 'Hide completed subtasks', 'Hide overdue bars']);
  for (const label of labels) {
    expect(box(label!).checked).toBe(false);
    box(label!).click();
  }
  for (const [label, before, after] of [['Label shape', 'pill', 'circle'], ['Card spacing', 'comfortable', 'compact'], ['Subtask order', 'note', 'completed-last']] as const) {
    const choice = root.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;
    expect(choice.value).toBe(before);
    choice.value = after; choice.dispatchEvent(new Event('change'));
  }
  const opener = root.querySelector<HTMLSelectElement>('select[aria-label="Open notes and links in"]')!;
  expect(opener.value).toBe('popup');
  opener.value = 'tab'; opener.dispatchEvent(new Event('change'));
  const { frontmatter, errors } = draftToFrontmatter(draft, config);
  expect(errors).toEqual([]);
  expect(frontmatter).toMatchObject({ compact: true, 'show-column-selector': false, 'sort-completed-subtasks': true, 'hide-completed-subtasks': true, 'overdue-bar': false, 'open-links': 'tab', 'label-shape': 'circle' });
  expect(parseBoardConfig('House', { 'label-shape': 'Square' }).config.labelShape).toBe('square');
  expect(parseBoardConfig('House', { 'label-shape': 'star' }).config.labelShape).toBe('pill');
  expect(parseBoardConfig('House', { 'open-links': 'Tab' }).config.openLinks).toBe('tab');
  expect(parseBoardConfig('House', { 'open-links': 'other' }).config.openLinks).toBe('popup');
});

it('opens existing hidden preferences without changing them, and unchecks to show again', () => {
  const config = parseBoardConfig('House', { compact: true, 'show-column-selector': false,
    'hide-completed-subtasks': true, 'overdue-bar': false, 'sort-completed-subtasks': true }).config;
  const draft = draftFromConfig(config), root = document.createElement('div');
  document.body.replaceChildren(root);
  renderBoardSettings(root, draft, config, {
    initialSection: 'appearance', icon: vi.fn(), attachKeySuggest: vi.fn(), attachValueSuggest: vi.fn(), attachTagSuggest: vi.fn(),
    attachFolderSuggest: vi.fn(), countTagged: () => 0, onSave: vi.fn(), onDiscard: vi.fn(), onOpenBoard: vi.fn(),
  });
  expect(changedFrontmatter(draft, config)).toEqual({});
  expect(root.querySelector<HTMLSelectElement>('select[aria-label="Card spacing"]')!.value).toBe('compact');
  expect(root.querySelector<HTMLSelectElement>('select[aria-label="Subtask order"]')!.value).toBe('completed-last');
  for (const box of root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) {
    expect(box.checked).toBe(true); box.click();
  }
  expect(changedFrontmatter(draft, config)).toEqual({ 'show-column-selector': true, 'hide-completed-subtasks': false, 'overdue-bar': true });
  expect(config).toMatchObject({ showColumnSelector: false, hideCompletedSubtasks: true, overdueBar: false });
});

it('keeps appearance changes in the draft and saves only edited fields', () => {
  const plain = parseBoardConfig('House', {}).config;
  expect(plain.compact).toBe(false);
  expect(changedFrontmatter(draftFromConfig(plain), plain)).toEqual({});
  const config = parseBoardConfig('House', { compact: true }).config;
  const draft = draftFromConfig(config);
  draft.showColumnSelector = false;
  expect(config.showColumnSelector).toBe(true);
  expect(changedFrontmatter(draft, config)).toEqual({ 'show-column-selector': false });
  expect(draftFromConfig(config)).toMatchObject({ compact: true, showColumnSelector: true });
  expect(parseBoardConfig('House', { compact: 'false', 'show-column-selector': 'false' }).config)
    .toMatchObject({ compact: false, showColumnSelector: false });
});

it('removes Compact from the toolbar and clears a hidden column selector’s filter', () => {
  const root = document.createElement('div'); document.body.replaceChildren(root);
  const tasks = ['- [ ] First #tt/house/backlog/100', '- [ ] Second #tt/house/doing/100'].map((raw, line) =>
    ({ ...parseTaskLine(raw)!, raw, id: `Tasks.md:${line}`, path: 'Tasks.md', line }));
  const host: RenderHost = {
    renderText: (el, task) => { el.textContent = task.text; }, icon: vi.fn(), sourceLabel: () => 'Tasks',
    isCollapsed: () => false, onToggleRow: vi.fn(), onSetSubtasksCollapsed: vi.fn(), onDrop: vi.fn(),
    onToggle: vi.fn(), onEdit: vi.fn(), onOpenSource: vi.fn(), onDragEnd: vi.fn(), onAddTask: vi.fn(), onAddSubtask: vi.fn(),
    onSettings: vi.fn(), onBulkAction: vi.fn(), onSetQuickFilters: vi.fn(),
  };
  const draw = (show = true, compact = false) => renderBoard(root, buildBoard(tasks,
    parseBoardConfig('House', { slug: 'house', compact, 'show-column-selector': show }).config,
    '2026-10-28', () => undefined), host, { warnings: [], info: [] });
  draw();
  const expectSettingsLast = () => expect(root.querySelector('.tt-board-tools')!.lastElementChild?.textContent).toBe('Settings');
  expectSettingsLast();
  root.querySelector<HTMLButtonElement>('[data-board-focus="select"]')!.click();
  expect(root.querySelector('[data-board-focus="select"]')!.textContent).toBe('Done selecting');
  expectSettingsLast();
  root.querySelector<HTMLButtonElement>('[data-board-focus="select"]')!.click();
  expect(root.querySelector('[data-board-focus="compact"]')).toBeNull();
  const picker = root.querySelector<HTMLSelectElement>('.tt-column-picker')!;
  picker.value = 'doing'; picker.dispatchEvent(new Event('change'));
  expect(root.querySelectorAll('.tt-card')).toHaveLength(1);
  draw(false, true);
  expectSettingsLast();
  expect(root.querySelector('.tt-scroll-hint')!.textContent).not.toContain('above');
  expect(root.querySelector('.tt-column-picker')).toBeNull();
  expect(root.querySelectorAll('.tt-card')).toHaveLength(2);
  expect(root.classList.contains('tt-board--compact')).toBe(true);
  draw();
  expectSettingsLast();
  expect(root.querySelector<HTMLSelectElement>('.tt-column-picker')!.value).toBe('');
  expect(root.classList.contains('tt-board--compact')).toBe(false);
});
