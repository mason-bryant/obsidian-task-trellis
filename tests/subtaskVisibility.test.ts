// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildBoard, subtasksKey, taskId, type BoardTask } from '../src/core/board.ts';
import { parseBoardConfig } from '../src/core/boardConfig.ts';
import { setSubtaskCollapse } from '../src/core/collapse.ts';
import { parseTaskLine } from '../src/core/taskLine.ts';
import { renderBoard, type ArrangeChoice, type RenderHost } from '../src/ui/renderBoard.ts';

const today = '2026-10-23';
function task(raw: string, line: number, parentLine?: number): BoardTask {
  return { ...parseTaskLine(raw)!, raw, path: 'Projects/House.md', line,
    id: taskId('Projects/House.md', line),
    ...(parentLine === undefined ? {} : { parentId: taskId('Projects/House.md', parentLine) }) };
}
const parent = task('- [ ] Paint the kitchen #tt/house/doing', 0);
const child = task('  - [ ] Prepare walls', 1, 0);
const grandchild = task('    - [ ] Fill holes', 2, 1);
const completed = task('  - [x] Buy paint ✅ 2026-10-22', 3, 0);
const laterParent = task('- [ ] Garden 📅 2027-01-01', 4);
const laterChild = task('  - [ ] Order seeds', 5, 4);
const tasks = [parent, child, grandchild, completed, laterParent, laterChild];
let config = parseBoardConfig('House', { slug: 'house' }).config;

let root: HTMLElement;
let collapsed: Record<string, boolean>;
let persisted: string;
let host: RenderHost;
let chooseArrange: (choice: ArrangeChoice) => void;
let closeArrange: () => void;
let offered: ArrangeChoice[];
const setCompact = (compact: boolean) => { config = { ...config, compact }; draw(); };
const draw = () => renderBoard(root, buildBoard(tasks, config, today, () => undefined), host, { warnings: [], info: [] });
const button = (label: string) => [...root.querySelectorAll<HTMLButtonElement>('button')]
  .find((b) => b.textContent === label || b.getAttribute('aria-label') === label)!;
const owner = (t: BoardTask) => [...root.querySelectorAll<HTMLElement>('[data-id]')].find((el) => el.dataset.id === t.id)!;
const toggle = (t: BoardTask) => owner(t).querySelector<HTMLButtonElement>(':scope > .tt-subtask-controls > .tt-subtask-toggle')!;
const click = (b: HTMLButtonElement) => { b.focus(); b.click(); };
const chooseSubtasks = (collapsed: boolean) => { click(button('Arrange')); chooseArrange(collapsed ? 'collapse' : 'expand'); closeArrange(); };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'queueMicrotask'] });
  root = document.createElement('div'); document.body.append(root);
  collapsed = {}; persisted = '{}';
  config = parseBoardConfig('House', { slug: 'house' }).config;
  host = {
    renderText: (el, t) => { el.textContent = t.text; }, icon: () => undefined,
    sourceLabel: () => 'House',
    isCollapsed: (key) => collapsed[key] ?? (key === 'later' || key.startsWith('more:')),
    onToggleRow: vi.fn((key) => {
      collapsed[key] = !host.isCollapsed(key);
      persisted = JSON.stringify(collapsed); draw();
    }),
    onSetSubtasksCollapsed: vi.fn((keys, value) => {
      collapsed = setSubtaskCollapse(collapsed, keys, value);
      persisted = JSON.stringify(collapsed); draw();
    }),
    onArrangeMenu: vi.fn((_anchor, choices, choose, close) => { offered = choices; chooseArrange = choose; closeArrange = close; }),
    onDrop: vi.fn(), onToggle: vi.fn(), onEdit: vi.fn(), onOpenSource: vi.fn(),
    onDragEnd: vi.fn(), onAddTask: vi.fn(), onAddSubtask: vi.fn(),

  };
  draw();
});
afterEach(() => {
  root.querySelector<HTMLButtonElement>('.tt-add-cancel')?.click();
  document.body.replaceChildren(); vi.clearAllTimers(); vi.useRealTimers();
});

describe('subtask visibility controls', () => {
  it('labels the action and progress, hides only descendants, and restores keyboard focus', () => {
    expect(toggle(parent).textContent).toBe('1/2');
    expect(toggle(parent).getAttribute('aria-label')).toBe('Hide subtasks (1 of 2 done)');
    expect(toggle(parent).parentElement?.nextElementSibling?.className).toBe('tt-subtasks');
    expect(toggle(parent).parentElement?.querySelector('.tt-add-subtask')).not.toBeNull();
    click(toggle(parent));
    expect(toggle(parent).textContent).toBe('1/2');
    expect(toggle(parent).getAttribute('aria-label')).toBe('Show subtasks (1 of 2 done)');
    expect(toggle(parent).getAttribute('aria-expanded')).toBe('false');
    expect(owner(parent)).toBeDefined(); expect(owner(child)).toBeUndefined();
    expect(document.activeElement).toBe(toggle(parent));
    expect(host.onEdit).not.toHaveBeenCalled();
    click(toggle(parent));
    expect(owner(completed)).toBeDefined();
    expect(toggle(parent).getAttribute('aria-expanded')).toBe('true');
  });

  it('keeps nested choices when the parent is hidden and shown', () => {
    click(toggle(child)); click(toggle(parent)); click(toggle(parent));
    expect(owner(child)).toBeDefined(); expect(owner(grandchild)).toBeUndefined();
    expect(toggle(child).getAttribute('aria-label')).toBe('Show subtasks (0 of 1 done)');
    click(toggle(child)); expect(owner(grandchild)).toBeDefined();
  });

  it('preserves the same visibility when Compact is switched in either direction', () => {
    click(toggle(parent)); setCompact(!(config.compact));
    expect(root.classList.contains('tt-board--compact')).toBe(true);
    expect(owner(child)).toBeUndefined();
    click(toggle(parent)); click(toggle(child)); setCompact(!(config.compact));
    expect(root.classList.contains('tt-board--compact')).toBe(false);
    expect(owner(child)).toBeDefined(); expect(owner(grandchild)).toBeUndefined();
    expect(JSON.parse(persisted)[subtasksKey(child)]).toBe(true);
  });

  it('bulk actions cover nested lists and hidden rows/columns in a single persisted update', () => {
    const picker = root.querySelector<HTMLSelectElement>('.tt-column-picker')!;
    picker.value = 'doing'; picker.dispatchEvent(new Event('change'));
    chooseSubtasks(true);
    expect(host.onSetSubtasksCollapsed).toHaveBeenCalledTimes(1);
    expect(JSON.parse(persisted)).toMatchObject({
      [subtasksKey(parent)]: true, [subtasksKey(child)]: true, [subtasksKey(laterParent)]: true,
    });
    expect(owner(child)).toBeUndefined();
    expect(document.activeElement).toBe(button('Arrange'));
    chooseSubtasks(false);
    expect(owner(grandchild)).toBeDefined();
    expect(host.isCollapsed(subtasksKey(laterParent))).toBe(false);
    expect(host.isCollapsed('later')).toBe(true);
  });

  it('restores individual and bulk choices after creating a new board view', () => {
    chooseSubtasks(true); click(toggle(parent));
    root.remove(); root = document.createElement('div'); document.body.append(root);
    collapsed = JSON.parse(persisted); draw();
    expect(owner(child)).toBeDefined(); expect(owner(grandchild)).toBeUndefined();
    expect(host.isCollapsed(subtasksKey(laterParent))).toBe(true);
  });

  it('reveals a collapsed list and focuses the add-subtask input, including in Compact', () => {
    setCompact(!(config.compact)); chooseSubtasks(true);
    click(owner(parent).querySelector<HTMLButtonElement>('.tt-add-subtask')!);
    vi.runAllTimers();
    const input = root.querySelector<HTMLTextAreaElement>('.tt-add-input')!;
    expect(input).not.toBeNull(); expect(document.activeElement).toBe(input);
    expect(owner(child)).toBeDefined(); expect(owner(grandchild)).toBeUndefined();
    input.value = 'Wash brushes'; input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(host.onAddSubtask).toHaveBeenCalledWith(parent, 'Wash brushes', false);
  });

  it('preserves an unfinished subtask draft through collapse and expand', () => {
    click(owner(parent).querySelector<HTMLButtonElement>('.tt-add-subtask')!);
    vi.runAllTimers();
    const input = root.querySelector<HTMLTextAreaElement>('.tt-add-input')!;
    input.value = 'Unfinished'; input.dispatchEvent(new Event('input'));
    chooseSubtasks(true); expect(root.querySelector('.tt-add-input')).toBeNull();
    chooseSubtasks(false); vi.runAllTimers();
    expect(root.querySelector<HTMLTextAreaElement>('.tt-add-input')?.value).toBe('Unfinished');
    expect(document.activeElement).toBe(button('Arrange'));
  });

  it('handles quote characters in task paths while restoring focus', () => {
    const quoted = { ...parent, path: 'A"B.md', id: 'A"B.md:0' };
    const sub = { ...child, parentId: quoted.id };
    const m = buildBoard([quoted, sub], config, today, () => undefined);
    host.onToggleRow = (key) => { collapsed[key] = !host.isCollapsed(key); renderBoard(root, m, host, { warnings: [], info: [] }); };
    renderBoard(root, m, host, { warnings: [], info: [] });
    click(toggle(quoted)); expect(document.activeElement).toBe(toggle(quoted));
  });

  it('honors the hide-completed setting without a duplicate toolbar toggle', () => {
    renderBoard(root, buildBoard(tasks, { ...config, hideCompletedSubtasks: true }, today, () => undefined), host, { warnings: [], info: [] });
    expect(button('Hide completed subtasks')).toBeUndefined();
    expect(owner(completed)).toBeUndefined();
    expect(owner(child)).toBeDefined();
    expect(toggle(parent).textContent).toBe('1/2');
  });

  it('offers an Arrange icon without Compact and supports keyboard opening and cancellation', () => {
    const menu = button('Arrange');
    expect(button('Compact')).toBeUndefined();
    expect(menu.parentElement?.firstElementChild).toBe(menu);
    expect(menu.textContent).toBe('');
    expect(menu.getAttribute('aria-haspopup')).toBe('menu');
    expect(button('Collapse all subtasks')).toBeUndefined();
    expect(button('Expand all subtasks')).toBeUndefined();
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(menu.getAttribute('aria-expanded')).toBe('true');
    expect(host.onArrangeMenu).toHaveBeenCalledTimes(1);
    menu.click();
    expect(host.onArrangeMenu).toHaveBeenCalledTimes(1);
    closeArrange();
    expect(menu.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(menu);
    expect(host.onSetSubtasksCollapsed).not.toHaveBeenCalled();
  });

  it('omits the menu when there are no subtask lists', () => {
    renderBoard(root, buildBoard([parent], config, today, () => undefined), host, { warnings: [], info: [] });
    expect(button('Arrange')).toBeUndefined();
  });

  it('offers Sort by due date in Arrange, after the subtask choices or on its own', () => {
    host.onSortByDueDate = vi.fn(); draw();
    click(button('Arrange'));
    expect(offered).toEqual(['collapse', 'expand', 'sort']);
    chooseArrange('sort'); closeArrange();
    expect(host.onSortByDueDate).toHaveBeenCalledTimes(1);
    expect(host.onSetSubtasksCollapsed).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button('Arrange'));
    renderBoard(root, buildBoard([parent], config, today, () => undefined), host, { warnings: [], info: [] });
    click(button('Arrange'));
    expect(offered).toEqual(['sort']);
  });

  it('keeps a completed subtask that still has open subtasks', () => {
    const done = task('- [ ] Paint #tt/house/doing', 10), doneChild = task('  - [x] Prime ✅ 2026-10-22', 11, 10),
      open = task('    - [ ] Touch up', 12, 11);
    renderBoard(root, buildBoard([done, doneChild, open], { ...config, hideCompletedSubtasks: true }, today, () => undefined), host, { warnings: [], info: [] });
    expect(owner(doneChild)).toBeDefined();
    expect(owner(open)).toBeDefined();
  });

  it('sorts completed subtasks last when the board asks', () => {
    const first = task('- [ ] Paint #tt/house/doing', 20), a = task('  - [x] Prime ✅ 2026-10-22', 21, 20),
      b = task('  - [ ] Roll', 22, 20), c = task('  - [ ] Edge', 23, 20);
    const order = (sortCompletedSubtasks: boolean) =>
      buildBoard([first, a, b, c], { ...config, sortCompletedSubtasks }, today, () => undefined).subtasks[first.id]!.map((t) => t.text);
    expect(order(false)).toEqual(['Prime', 'Roll', 'Edge']);
    expect(order(true)).toEqual(['Roll', 'Edge', 'Prime']);
  });

  it('drops the overdue bar when the board turns it off', () => {
    const late = task('- [ ] Fix gutter 📅 2026-10-01 #tt/house/doing', 30);
    renderBoard(root, buildBoard([late], { ...config, overdueBar: false }, today, () => undefined), host, { warnings: [], info: [] });
    expect(root.classList.contains('tt-board--no-overdue-bar')).toBe(true);
    renderBoard(root, buildBoard([late], config, today, () => undefined), host, { warnings: [], info: [] });
    expect(root.classList.contains('tt-board--no-overdue-bar')).toBe(false);
  });

  it('takes Compact only from the board, ignoring the old per-device choice', () => {
    collapsed['view:compact'] = true; draw();
    expect(root.classList.contains('tt-board--compact')).toBe(false);
    setCompact(true);
    expect(root.classList.contains('tt-board--compact')).toBe(true);
  });
});

it('bulk state changes preserve unrelated rows and do not mutate the previous settings', () => {
  const current = { later: false, 'week-2026-10-26': true, 'sub:other': true };
  const next = setSubtaskCollapse(current, ['sub:parent', 'later'], true);
  expect(next).toEqual({ ...current, 'sub:parent': true });
  expect(current).not.toHaveProperty('sub:parent');
  expect(setSubtaskCollapse(next, ['sub:parent'], false)).toEqual(current);
});
