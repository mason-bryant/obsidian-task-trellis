// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildBoard, taskId, type BoardTask } from '../src/core/board.ts';
import { parseBoardConfig } from '../src/core/boardConfig.ts';
import { parseTaskLine } from '../src/core/taskLine.ts';
import { renderBoard, type RenderHost } from '../src/ui/renderBoard.ts';

const today = '2026-10-23';
const task = (raw: string, line: number): BoardTask => ({ ...parseTaskLine(raw)!, raw, path: 'House.md', line, id: taskId('House.md', line) });
const open = task('- [ ] Paint the kitchen 📅 2026-10-24 #tt/house/doing', 0);
const done = task('- [x] Buy paint ✅ 2026-10-22', 1);

let root: HTMLElement;
let host: RenderHost;
const draw = (fm: Record<string, unknown> = {}) =>
  renderBoard(root, buildBoard([open, done], parseBoardConfig('House', { slug: 'house', ...fm }).config, today, () => undefined), host, { warnings: [], info: [] });
const card = (t: BoardTask) => root.querySelector<HTMLElement>(`.tt-card[data-id="${t.id}"]`)!;

beforeEach(() => {
  root = document.createElement('div');
  document.body.replaceChildren(root);
  host = {
    renderText: (el, t) => { el.textContent = t.text; }, icon: () => undefined, sourceLabel: () => 'House',
    isCollapsed: () => false, onToggleRow: vi.fn(), onSetSubtasksCollapsed: vi.fn(), onDrop: vi.fn(), onToggle: vi.fn(),
    onEdit: vi.fn(), onOpenSource: vi.fn(), onDragEnd: vi.fn(), onAddTask: vi.fn(), onAddSubtask: vi.fn(),
    onMoveMenu: vi.fn(),
  };
});

describe('Move to…', () => {
  it('passes an open card’s choices to the host without opening the card', () => {
    draw();
    card(open).querySelector<HTMLButtonElement>('.tt-card-more')!.click();
    expect(host.onMoveMenu).toHaveBeenCalledTimes(1);
    const [moved, choices] = vi.mocked(host.onMoveMenu!).mock.calls[0]!;
    expect(moved.id).toBe(open.id);
    expect(choices.columns.find((c) => c.current)?.label).toBe('Doing');
    expect(choices.rows.find((r) => r.current)?.label).toBe('Due now');
    expect(host.onEdit).not.toHaveBeenCalled();
  });

  it('is left off completed cards, and when the host has no menu', () => {
    draw();
    expect(card(done).querySelector('.tt-card-more')).toBeNull();
    delete host.onMoveMenu;
    draw();
    expect(card(open).querySelector('.tt-card-more')).toBeNull();
  });
});

describe('one column at a time', () => {
  it('keeps Obsidian swipe exclusion on task targets after redraws, without excluding the toolbar', () => {
    // Obsidian's mobile recognizer walks ancestors looking for a truthy ignoreSwipe.
    // Verify the integration boundary for nested hits and rebuilt board content.
    const check = () => {
      for (const selector of ['.tt-card', '.tt-card-drag-handle', '.tt-row-toggle', '.tt-col-header', '.tt-add']) {
        const target = root.querySelector<HTMLElement>(selector)!;
        expect(target.closest<HTMLElement>('[data-ignore-swipe]')?.dataset.ignoreSwipe).toBe('true');
      }
      expect(root.querySelector('.tt-board-toolbar')!.closest('[data-ignore-swipe]')).toBeNull();
    };
    draw(); check();
    root.querySelector<HTMLButtonElement>('[data-board-focus="compact"]')!.click(); check();
    const picker = root.querySelector<HTMLSelectElement>('.tt-column-picker')!;
    picker.value = 'doing'; picker.dispatchEvent(new Event('change')); check();
    draw(); check();
  });

  it('numbers the columns for the indicator, and leaves it off a single column', () => {
    draw();
    expect([...root.querySelectorAll<HTMLElement>('.tt-col-header')].map((h) => h.dataset.column)).toEqual(['backlog', 'doing', 'waiting', 'done']);
    expect(root.querySelectorAll('.tt-pager-dot')).toHaveLength(4);
    expect(root.querySelector('.tt-pager-text')?.textContent).toBe('1 / 4');
    expect(root.querySelector('.tt-pager')?.nextElementSibling?.className).toBe('tt-scroll');
    const picker = root.querySelector<HTMLSelectElement>('.tt-column-picker')!;
    picker.value = 'doing';
    picker.dispatchEvent(new Event('change'));
    expect(root.querySelector('.tt-pager')).toBeNull();
  });

  it('repeats a row’s label right of a No due date column, where it also toggles the row', () => {
    draw({ columns: ['Backlog', 'Someday', 'Doing', 'Done'], 'undated-column': 'Someday' });
    const rest = root.querySelector<HTMLElement>('.tt-row-bar--rest.tt-row-bar--now')!;
    expect(rest.querySelector('.tt-row-title')?.textContent).toBe('Due now');
    rest.querySelector<HTMLButtonElement>('.tt-row-toggle')!.click();
    expect(host.onToggleRow).toHaveBeenCalledWith('now');
  });
});

describe('touch card placement', () => {
  function pointer(target: HTMLElement, type: string, y: number) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, Object.fromEntries(Object.entries({
      pointerId: 1, isPrimary: true, pointerType: 'touch', button: 0, clientX: 250, clientY: y,
    }).map(([key, value]) => [key, { value }])));
    target.dispatchEvent(event);
  }
  it('uses the normal drop target to move a task into another row and column', () => {
    draw();
    const scroller = root.querySelector<HTMLElement>('.tt-scroll')!;
    scroller.setPointerCapture = vi.fn(); scroller.hasPointerCapture = () => false;
    const destination = root.querySelector<HTMLElement>('.tt-cell[data-row="none"][data-column="backlog"]')!;
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => destination });
    const handle = card(open).querySelector<HTMLElement>('.tt-card-drag-handle')!;
    pointer(handle, 'pointerdown', 200);
    pointer(scroller, 'pointermove', 300);
    expect(destination.querySelector('.tt-drop-indicator')).not.toBeNull();
    pointer(scroller, 'pointerup', 300);
    expect(host.onDrop).toHaveBeenCalledWith(open.id, { rowId: 'none', columnId: 'backlog', index: 0 });
    expect(host.onDragEnd).toHaveBeenCalledTimes(1);
    expect(root.querySelector('.tt-drop-indicator')).toBeNull();
  });
  it('does not write a move when released outside any drop zone', () => {
    draw();
    const scroller = root.querySelector<HTMLElement>('.tt-scroll')!;
    scroller.setPointerCapture = vi.fn(); scroller.hasPointerCapture = () => false;
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => document.body });
    const handle = card(open).querySelector<HTMLElement>('.tt-card-drag-handle')!;
    pointer(handle, 'pointerdown', 200); pointer(scroller, 'pointermove', 300); pointer(scroller, 'pointerup', 300);
    expect(host.onDrop).not.toHaveBeenCalled();
    expect(host.onDragEnd).toHaveBeenCalledTimes(1);
  });
  it('reorders within a cell with the dragged card excluded from the insertion index', () => {
    const second = task('- [ ] Second task 📅 2026-10-24 #tt/house/doing', 2);
    renderBoard(root, buildBoard([open, second], parseBoardConfig('House', { slug: 'house' }).config,
      today, () => undefined), host, { warnings: [], info: [] });
    const scroller = root.querySelector<HTMLElement>('.tt-scroll')!;
    scroller.setPointerCapture = vi.fn(); scroller.hasPointerCapture = () => false;
    const destination = card(open).parentElement!;
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => destination });
    vi.spyOn(card(open), 'getBoundingClientRect').mockReturnValue({ top: 200, height: 100 } as DOMRect);
    const handle = card(second).querySelector<HTMLElement>('.tt-card-drag-handle')!;
    pointer(handle, 'pointerdown', 400); pointer(scroller, 'pointermove', 100); pointer(scroller, 'pointerup', 100);
    expect(host.onDrop).toHaveBeenCalledWith(second.id, { rowId: 'now', columnId: 'doing', index: 0 });
  });
  it('retains native card drag/drop for desktop', () => {
    draw();
    const destination = root.querySelector<HTMLElement>('.tt-cell[data-row="none"][data-column="backlog"]')!;
    card(open).dispatchEvent(new Event('dragstart', { bubbles: true }));
    const over = new MouseEvent('dragover', { bubbles: true, cancelable: true, clientY: 100 });
    destination.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(true);
    destination.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));
    expect(host.onDrop).toHaveBeenCalledWith(open.id, { rowId: 'none', columnId: 'backlog', index: 0 });
  });
});
