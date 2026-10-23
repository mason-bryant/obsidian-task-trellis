// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildBoard, subtasksKey, taskId, type BoardTask } from '../src/core/board.ts';
import { parseBoardConfig } from '../src/core/boardConfig.ts';
import { setSubtaskCollapse } from '../src/core/collapse.ts';
import { parseTaskLine } from '../src/core/taskLine.ts';
import { renderBoard, type RenderHost } from '../src/ui/renderBoard.ts';

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
const config = parseBoardConfig('House', { slug: 'house' }).config;

let root: HTMLElement;
let collapsed: Record<string, boolean>;
let persisted: string;
let host: RenderHost;
const draw = () => renderBoard(root, buildBoard(tasks, config, today, () => undefined), host, { warnings: [], info: [] });
const button = (label: string) => [...root.querySelectorAll<HTMLButtonElement>('button')]
  .find((b) => b.textContent === label)!;
const owner = (t: BoardTask) => [...root.querySelectorAll<HTMLElement>('[data-id]')].find((el) => el.dataset.id === t.id)!;
const toggle = (t: BoardTask) => owner(t).querySelector<HTMLButtonElement>(':scope > .tt-subtask-controls > .tt-subtask-toggle')!;
const click = (b: HTMLButtonElement) => { b.focus(); b.click(); };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'queueMicrotask'] });
  root = document.createElement('div'); document.body.append(root);
  collapsed = {}; persisted = '{}';
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
    expect(toggle(parent).title).toBe('Hide subtasks');
    expect(toggle(parent).getAttribute('aria-label')).toBe('Hide subtasks (1 of 2 done)');
    expect(toggle(parent).parentElement?.nextElementSibling?.className).toBe('tt-subtasks');
    expect(toggle(parent).parentElement?.querySelector('.tt-add-subtask')).not.toBeNull();
    click(toggle(parent));
    expect(toggle(parent).textContent).toBe('1/2');
    expect(toggle(parent).title).toBe('Show subtasks');
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
    click(toggle(parent)); click(button('Compact'));
    expect(root.classList.contains('tt-board--compact')).toBe(true);
    expect(owner(child)).toBeUndefined();
    click(toggle(parent)); click(toggle(child)); click(button('Compact'));
    expect(root.classList.contains('tt-board--compact')).toBe(false);
    expect(owner(child)).toBeDefined(); expect(owner(grandchild)).toBeUndefined();
    expect(JSON.parse(persisted)[subtasksKey(child)]).toBe(true);
  });

  it('bulk actions cover nested lists and hidden rows/columns in a single persisted update', () => {
    const picker = root.querySelector<HTMLSelectElement>('.tt-column-picker')!;
    picker.value = 'doing'; picker.dispatchEvent(new Event('change'));
    click(button('Collapse all subtasks'));
    expect(host.onSetSubtasksCollapsed).toHaveBeenCalledTimes(1);
    expect(JSON.parse(persisted)).toMatchObject({
      [subtasksKey(parent)]: true, [subtasksKey(child)]: true, [subtasksKey(laterParent)]: true,
    });
    expect(owner(child)).toBeUndefined();
    expect(document.activeElement).toBe(button('Collapse all subtasks'));
    click(button('Expand all subtasks'));
    expect(owner(grandchild)).toBeDefined();
    expect(host.isCollapsed(subtasksKey(laterParent))).toBe(false);
    expect(host.isCollapsed('later')).toBe(true);
  });

  it('restores individual and bulk choices after creating a new board view', () => {
    click(button('Collapse all subtasks')); click(toggle(parent));
    root.remove(); root = document.createElement('div'); document.body.append(root);
    collapsed = JSON.parse(persisted); draw();
    expect(owner(child)).toBeDefined(); expect(owner(grandchild)).toBeUndefined();
    expect(host.isCollapsed(subtasksKey(laterParent))).toBe(true);
  });

  it('reveals a collapsed list and focuses the add-subtask input, including in Compact', () => {
    click(button('Compact')); click(button('Collapse all subtasks'));
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
    click(button('Collapse all subtasks')); expect(root.querySelector('.tt-add-input')).toBeNull();
    click(button('Expand all subtasks')); vi.runAllTimers();
    expect(root.querySelector<HTMLTextAreaElement>('.tt-add-input')?.value).toBe('Unfinished');
    expect(document.activeElement).toBe(button('Expand all subtasks'));
  });

  it('handles quote characters in task paths while restoring focus', () => {
    const quoted = { ...parent, path: 'A"B.md', id: 'A"B.md:0' };
    const sub = { ...child, parentId: quoted.id };
    const m = buildBoard([quoted, sub], config, today, () => undefined);
    host.onToggleRow = (key) => { collapsed[key] = !host.isCollapsed(key); renderBoard(root, m, host, { warnings: [], info: [] }); };
    renderBoard(root, m, host, { warnings: [], info: [] });
    click(toggle(quoted)); expect(document.activeElement).toBe(toggle(quoted));
  });
});

it('bulk state changes preserve unrelated rows and do not mutate the previous settings', () => {
  const current = { later: false, 'week-2026-10-26': true, 'sub:other': true };
  const next = setSubtaskCollapse(current, ['sub:parent', 'later'], true);
  expect(next).toEqual({ ...current, 'sub:parent': true });
  expect(current).not.toHaveProperty('sub:parent');
  expect(setSubtaskCollapse(next, ['sub:parent'], false)).toEqual(current);
});
