// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildBoard, taskId, type BoardTask } from '../src/core/board.ts';
import { parseBoardConfig } from '../src/core/boardConfig.ts';
import { parseTaskLine } from '../src/core/taskLine.ts';
import { disposeBoardSelection, renderBoard, type RenderHost } from '../src/ui/renderBoard.ts';

const today = '2026-10-23';
const task = (raw: string, line: number): BoardTask => ({ ...parseTaskLine(raw)!, raw, path: 'House.md', line, id: taskId('House.md', line) });
const undated = task('- [ ] Someday, maybe #tt/house/doing', 0);
const dated = task('- [ ] Paint the kitchen 📅 2026-10-24 #tt/house/doing', 1);
const withColumn = { columns: ['Backlog', 'Doing', 'Done'], 'undated-column': 'Backlog', 'undated-scroll': true };

let root: HTMLElement;
let host: RenderHost;
const draw = (fm: Record<string, unknown> = withColumn) =>
  renderBoard(root, buildBoard([undated, dated], parseBoardConfig('House', { slug: 'house', ...fm }).config, today, () => undefined), host, { warnings: [], info: [] });
const pane = () => root.querySelector<HTMLElement>('.tt-cell--undated')!;
const board = () => root.querySelector<HTMLElement>('.tt-scroll')!;
const grid = () => root.querySelector<HTMLElement>('.tt-grid')!;
const openComposer = () => {
  // An earlier test can leave a composer open; start with none.
  root.querySelectorAll<HTMLButtonElement>('.tt-add-cancel').forEach((cancel) => cancel.click());
  pane().querySelector<HTMLButtonElement>('.tt-add-button')!.click();
};
const rect = (top: number, height: number) => () => ({ top, bottom: top + height, left: 0, right: 300, width: 300, height, x: 0, y: top, toJSON: () => ({}) });

beforeEach(() => {
  root = document.createElement('div');
  document.body.replaceChildren(root);
  host = {
    renderText: (el, t) => { el.textContent = t.text; }, icon: () => undefined, sourceLabel: () => 'House',
    isCollapsed: () => false, onToggleRow: vi.fn(), onSetSubtasksCollapsed: vi.fn(), onDrop: vi.fn(), onToggle: vi.fn(),
    onEdit: vi.fn(), onOpenSource: vi.fn(), onDragEnd: vi.fn(), onAddTask: vi.fn(), onAddSubtask: vi.fn(),
  };
});

afterEach(() => {
  disposeBoardSelection(root);
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, 'visualViewport');
  document.head.querySelectorAll('style').forEach((style) => style.remove());
});

describe('a No due date column that scrolls on its own', () => {
  it('is marked only on a board that has one and has turned it on', () => {
    draw();
    expect(grid().classList.contains('tt-grid--undated')).toBe(true);
    expect(board().classList.contains('tt-scroll--undated')).toBe(true);
    for (const fm of [{ columns: ['Backlog', 'Doing', 'Done'], 'undated-scroll': true }, { ...withColumn, 'undated-scroll': false }, { columns: ['Backlog', 'Doing', 'Done'], 'undated-column': 'Backlog' }]) {
      draw(fm);
      expect(grid().classList.contains('tt-grid--undated')).toBe(false);
      expect(board().classList.contains('tt-scroll--undated')).toBe(false);
      expect(grid().style.getPropertyValue('--tt-header-height')).toBe('');
    }
  });

  it('scrolls with the board when it’s the only column chosen, even when it’s on', () => {
    draw();
    const choose = (value: string) => {
      const picker = root.querySelector<HTMLSelectElement>('.tt-column-picker')!;
      picker.value = value; picker.dispatchEvent(new Event('change'));
    };
    choose('backlog');
    expect(root.querySelectorAll('.tt-col-header')).toHaveLength(1);
    expect(pane().classList.contains('tt-cell--undated')).toBe(true);
    expect(grid().classList.contains('tt-grid--undated')).toBe(false);
    expect(board().classList.contains('tt-scroll--undated')).toBe(false);
    choose('');
    expect(grid().classList.contains('tt-grid--undated')).toBe(true);
  });

  it('scrolls with the board while it’s off', async () => {
    const off = { ...withColumn, 'undated-scroll': false };
    draw(off);
    expect(pane().classList.contains('tt-cell--undated')).toBe(true);
    // Only the board's place is kept: the column has none of its own.
    board().scrollTop = 90;
    pane().scrollTop = 240;
    draw(off);
    expect(pane().scrollTop).toBe(0);
    expect(board().scrollTop).toBe(90);
    // A composer scrolls the board, as it does in any other cell.
    const viewport = Object.assign(new EventTarget(), { offsetTop: 0, height: 700 });
    Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true });
    board().getBoundingClientRect = rect(100, 600);
    pane().getBoundingClientRect = rect(150, 500);
    openComposer();
    const box = pane().querySelector<HTMLElement>('.tt-add-box')!;
    // Lower than the board's bottom edge, and moved by scrolling the board.
    let top = 640;
    box.getBoundingClientRect = () => rect(top, 120)();
    Object.defineProperty(board(), 'scrollTop', { configurable: true, get: () => 730 - top, set: (value: number) => { top = 730 - value; } });
    box.querySelector<HTMLTextAreaElement>('.tt-add-input')!.dispatchEvent(new Event('input'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(top).toBeLessThan(640);
    expect(pane().scrollTop).toBe(0);
  });

  it('keeps its own place and the board’s through a redraw', () => {
    draw();
    pane().scrollTop = 240;
    board().scrollTop = 90;
    draw();
    expect(pane().scrollTop).toBe(240);
    expect(board().scrollTop).toBe(90);
  });

  it('sits below the column headers, following their height, and stops watching when the board closes', () => {
    const watches: { callback: () => void; observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] = [];
    vi.stubGlobal('ResizeObserver', class {
      observe = vi.fn(); disconnect = vi.fn();
      constructor(public callback: () => void) { watches.push(this); }
    });
    const height = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(rect(0, 44));
    draw();
    expect(grid().style.getPropertyValue('--tt-header-height')).toBe('44px');
    expect(watches[0]!.observe).toHaveBeenCalledWith(root.querySelector('.tt-col-header'));

    // A title wrapping, a theme, or a board that was hidden when it drew.
    height.mockImplementation(rect(0, 66));
    watches[0]!.callback();
    expect(grid().style.getPropertyValue('--tt-header-height')).toBe('66px');

    draw();
    expect(watches[0]!.disconnect).toHaveBeenCalledTimes(1);
    expect(watches).toHaveLength(2);
    disposeBoardSelection(root);
    expect(watches[1]!.disconnect).toHaveBeenCalledTimes(1);
    height.mockRestore();
  });

  it('scrolls itself, not the board, to keep a composer inside it in view', async () => {
    const viewport = Object.assign(new EventTarget(), { offsetTop: 0, height: 700 });
    Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true });
    draw();
    board().getBoundingClientRect = rect(100, 600);
    pane().getBoundingClientRect = rect(150, 500);
    openComposer();
    const box = pane().querySelector<HTMLElement>('.tt-add-box')!;
    // Lower than the pane's bottom edge, and moved by scrolling the pane.
    let top = 640;
    box.getBoundingClientRect = () => rect(top, 120)();
    Object.defineProperty(pane(), 'scrollTop', { configurable: true, get: () => 640 - top, set: (value: number) => { top = 640 - value; } });
    box.querySelector<HTMLTextAreaElement>('.tt-add-input')!.dispatchEvent(new Event('input'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(top).toBeLessThan(640);
    expect(board().scrollTop).toBe(0);
  });

  it('scrolls a subtask composer clear of its pinned Add task box', async () => {
    const viewport = Object.assign(new EventTarget(), { offsetTop: 0, height: 700 });
    Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true });
    const style = document.createElement('style');
    style.textContent = '.tt-cell > .tt-add { position: sticky; }';
    document.head.append(style);
    draw();
    board().getBoundingClientRect = rect(100, 600);
    pane().getBoundingClientRect = rect(150, 500);
    root.querySelectorAll<HTMLButtonElement>('.tt-add-cancel').forEach((cancel) => cancel.click());
    pane().querySelector<HTMLElement>(':scope > .tt-add')!.getBoundingClientRect = rect(600, 40);
    pane().querySelector<HTMLButtonElement>('.tt-add-subtask')!.click();
    const box = pane().querySelector<HTMLElement>('.tt-card .tt-add-box')!;
    box.getBoundingClientRect = () => rect(530 - pane().scrollTop, 100)();
    box.querySelector<HTMLTextAreaElement>('.tt-add-input')!.dispatchEvent(new Event('input'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(box.getBoundingClientRect().bottom).toBe(592);
    expect(board().scrollTop).toBe(0);
  });

  it('scrolls itself while a card is held near its edge, and the board anywhere else', () => {
    let tick: FrameRequestCallback = () => undefined;
    const frames = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => { tick = callback; return 1; });
    const over = vi.fn<(x: number, y: number) => Element | null>(() => pane());
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: over });
    draw();
    const scroller = board();
    scroller.setPointerCapture = vi.fn(); scroller.hasPointerCapture = vi.fn(() => false); scroller.releasePointerCapture = vi.fn();
    scroller.getBoundingClientRect = rect(100, 600);
    pane().getBoundingClientRect = rect(150, 500);
    const pointer = (type: string, x: number, y: number, target: Element = scroller) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, Object.fromEntries(Object.entries({ pointerId: 1, isPrimary: true, pointerType: 'touch', button: 0, clientX: x, clientY: y }).map(([key, value]) => [key, { value }])));
      target.dispatchEvent(event);
    };
    pointer('pointerdown', 50, 300, pane().querySelector('.tt-card-drag-handle') ?? scroller.querySelector('.tt-card-drag-handle')!);
    pointer('pointermove', 50, 640);
    tick(16);
    expect(pane().scrollTop).toBeGreaterThan(0);
    expect(scroller.scrollTop).toBe(0);

    over.mockImplementation(() => scroller.querySelector('.tt-col-header'));
    pointer('pointermove', 50, 690);
    tick(32);
    expect(scroller.scrollTop).toBeGreaterThan(0);
    pointer('pointerup', 50, 300);
    frames.mockRestore();
    Reflect.deleteProperty(document, 'elementFromPoint');
  });

  it('leaves one column at a time to scroll with the rest', async () => {
    const style = document.createElement('style');
    style.textContent = '.tt-scroll { --tt-column-paging: 1; }';
    document.head.append(style);
    const viewport = Object.assign(new EventTarget(), { offsetTop: 0, height: 700 });
    Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true });
    draw();
    const vertical = root.querySelector<HTMLElement>('.tt-vertical-scroll')!;
    vertical.getBoundingClientRect = rect(100, 400);
    openComposer();
    const box = pane().querySelector<HTMLElement>('.tt-add-box')!;
    let top = 640;
    box.getBoundingClientRect = () => rect(top, 120)();
    Object.defineProperty(vertical, 'scrollTop', { configurable: true, get: () => 640 - top, set: (value: number) => { top = 640 - value; } });
    box.querySelector<HTMLTextAreaElement>('.tt-add-input')!.dispatchEvent(new Event('input'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(top).toBeLessThan(640);
    expect(pane().scrollTop).toBe(0);
  });
});
