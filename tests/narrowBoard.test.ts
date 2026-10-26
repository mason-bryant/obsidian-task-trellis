import { setTaskLabels } from '../src/core/labels.ts';
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
  it('restores the inner vertical position and outer page across a narrow-board redraw', () => {
    const style = document.createElement('style');
    style.textContent = '.tt-scroll { --tt-column-paging: 1; }';
    document.head.append(style);
    try {
      draw();
      root.querySelector<HTMLElement>('.tt-scroll')!.scrollLeft = 400;
      root.querySelector<HTMLElement>('.tt-vertical-scroll')!.scrollTop = 300;
      draw();
      expect(root.querySelector<HTMLElement>('.tt-scroll')!.scrollLeft).toBe(400);
      expect(root.querySelector<HTMLElement>('.tt-scroll')!.scrollTop).toBe(0);
      expect(root.querySelector<HTMLElement>('.tt-vertical-scroll')!.scrollTop).toBe(300);
    } finally { style.remove(); }
  });

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
  function pointer(target: HTMLElement, type: string, y: number, x = 250) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, Object.fromEntries(Object.entries({
      pointerId: 1, isPrimary: true, pointerType: 'touch', button: 0, clientX: x, clientY: y,
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
  it('pages a held card into another column, drops there, and keeps that page on a vertical gesture', () => {
    const style = document.createElement('style');
    style.textContent = '.tt-scroll { --tt-column-paging: 1; }';
    document.head.append(style);
    let tick: FrameRequestCallback = () => undefined;
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => { tick = callback; return 1; });
    try {
      draw();
      const scroller = root.querySelector<HTMLElement>('.tt-scroll')!;
      scroller.setPointerCapture = vi.fn(); scroller.hasPointerCapture = () => false;
      scroller.getBoundingClientRect = () => ({ left: 0, right: 400, top: 100, bottom: 700 } as DOMRect);
      Object.defineProperty(scroller, 'clientWidth', { value: 400 });
      scroller.scrollTo = vi.fn((options?: ScrollToOptions | number) => {
        scroller.scrollLeft = typeof options === 'number' ? options : options?.left ?? scroller.scrollLeft;
      });
      root.querySelectorAll<HTMLElement>('.tt-col-header').forEach((header, index) => {
        header.getBoundingClientRect = () => ({ left: index * 400 - scroller.scrollLeft, width: 400 } as DOMRect);
      });
      scroller.scrollLeft = 400; // The source task is in Doing.
      const source = card(open).parentElement!;
      const destination = root.querySelector<HTMLElement>('.tt-cell[data-row="now"][data-column="waiting"]')!;
      Object.defineProperty(document, 'elementFromPoint', { configurable: true,
        value: () => scroller.scrollLeft === 800 ? destination : source });
      const handle = card(open).querySelector<HTMLElement>('.tt-card-drag-handle')!;
      pointer(handle, 'pointerdown', 300, 350);
      pointer(scroller, 'pointermove', 300, 380);
      tick(0); tick(500);
      expect(scroller.scrollLeft).toBe(800);
      expect(source.querySelector('.tt-drop-indicator')).toBeNull();
      expect(destination.querySelector('.tt-drop-indicator')).not.toBeNull();
      pointer(scroller, 'pointerup', 300, 200);
      expect(host.onDrop).toHaveBeenCalledExactlyOnceWith(open.id, { rowId: 'now', columnId: 'waiting', index: 0 });
      expect(host.onDragEnd).toHaveBeenCalledTimes(1);
      // Both gesture handlers are installed: a subsequent vertical gesture must
      // neither switch back to Backlog nor start another card move.
      pointer(card(open), 'pointerdown', 300, 200);
      pointer(scroller, 'pointermove', 200, 205);
      pointer(scroller, 'pointerup', 200, 205);
      expect(scroller.scrollLeft).toBe(800);
      expect(host.onDrop).toHaveBeenCalledTimes(1);
      expect(root.querySelector('.tt-drop-indicator')).toBeNull();
    } finally { style.remove(); raf.mockRestore(); }
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


describe('card labels', () => {
  it('renders board-specific bars and opens the picker without editing the card', () => {
    const raw = setTaskLabels(setTaskLabels(open.raw, 'house', ['red']), 'work', ['blue']);
    const labeled = task(raw, 0);
    host.onLabels = vi.fn();
    renderBoard(root, buildBoard([labeled], parseBoardConfig('House', { slug: 'house' }).config, today, () => undefined), host, { warnings: [], info: [] });
    expect(root.querySelectorAll('.tt-card-label')).toHaveLength(1);
    expect(root.querySelector('.tt-card-label')!.getAttribute('aria-label')).toBe('Red');
    root.querySelector<HTMLButtonElement>('.tt-card-label-button')!.click();
    expect(host.onLabels).toHaveBeenCalledWith(labeled);
    expect(host.onEdit).not.toHaveBeenCalled();
  });

  it('never adds label controls or bars to subtasks, including standalone subtasks', () => {
    host.onLabels = vi.fn();
    const child = { ...task(setTaskLabels('- [ ] Subtask', 'house', ['red']), 2), parentId: open.id };
    const config = parseBoardConfig('House', { slug: 'house' }).config;
    const drawTasks = (tasks: BoardTask[]) => renderBoard(root, buildBoard(tasks, config, today, () => undefined), host, { warnings: [], info: [] });
    drawTasks([open, child]);
    expect(root.querySelectorAll('.tt-card-label-button')).toHaveLength(1);
    expect(root.querySelectorAll('.tt-subtask .tt-card-label-button')).toHaveLength(0);
    drawTasks([child]);
    expect(root.querySelectorAll('.tt-card-label-button, .tt-card-label')).toHaveLength(0);
  });
});

it('offers actionable empty-board setup and keyboard movement without dragging', () => {
  host.onSettings = vi.fn();
  renderBoard(root, buildBoard([], parseBoardConfig('Empty', {}).config, today, () => undefined), host, { warnings: [], info: [] });
  const actions = root.querySelectorAll<HTMLButtonElement>('.tt-empty-state button');
  actions[0]!.click(); actions[1]!.click();
  expect(host.onSettings).toHaveBeenNthCalledWith(1, 'destination');
  expect(host.onSettings).toHaveBeenNthCalledWith(2, 'filters');
  const another = task('- [ ] Another 📅 2026-10-24 #tt/house/doing/200', 3);
  renderBoard(root, buildBoard([open, another], parseBoardConfig('House', { slug: 'house' }).config, today, () => undefined), host, { warnings: [], info: [] });
  // Numbered Another sorts first; Alt+Down moves it after Paint.
  card(another).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true }));
  expect(host.onDrop).toHaveBeenCalledWith(another.id, { rowId: 'now', columnId: 'doing', index: 1 });
  card(another).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  expect(host.onEdit).toHaveBeenCalledWith(another);
});


it('keeps keyboard focus on a card through board redraws', () => {
  draw(); card(open).focus();
  draw();
  expect(document.activeElement).toBe(card(open));
});
