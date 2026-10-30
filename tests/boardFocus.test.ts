// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { buildBoard, taskId, type BoardTask } from '../src/core/board.ts';
import { parseBoardConfig } from '../src/core/boardConfig.ts';
import { parseTaskLine } from '../src/core/taskLine.ts';
import { disposeBoardSelection, renderBoard, type RenderHost } from '../src/ui/renderBoard.ts';

const today = '2026-10-28';
const config = parseBoardConfig('House', { slug: 'house' }).config;
function task(raw: string, line: number, parentLine?: number): BoardTask {
  return { ...parseTaskLine(raw)!, raw, path: 'House.md', line, id: taskId('House.md', line),
    ...(parentLine === undefined ? {} : { parentId: taskId('House.md', parentLine) }) };
}
const paint = task('- [ ] Paint the kitchen #tt/house/doing', 0);
const walls = task('\t- [ ] Prepare walls', 1, 0);
const roofer = task('- [ ] Call roofer 📅 2027-03-01', 2);

let root: HTMLElement;
let tasks: BoardTask[];
let host: RenderHost;
let closeMenu: (moved: boolean) => void;
const draw = () => renderBoard(root, buildBoard(tasks, config, today, () => undefined), host, { warnings: [], info: [] });
const key = (k: string) => [...root.querySelectorAll<HTMLElement>('[data-board-focus]')].find((el) => el.dataset.boardFocus === k)!;
const card = (t: BoardTask) => key(`card:${t.id}`);
const focusedKey = () => (document.activeElement as HTMLElement | null)?.dataset.boardFocus;

beforeEach(() => {
  root = document.createElement('div'); document.body.replaceChildren(root);
  tasks = [paint, walls, roofer];
  host = {
    renderText: (el, t) => { el.textContent = t.text; }, icon: () => undefined, sourceLabel: () => 'House',
    isCollapsed: () => false, onToggleRow: vi.fn(() => draw()), onSetSubtasksCollapsed: vi.fn(),
    onDrop: vi.fn(() => draw()), onToggle: vi.fn(() => draw()), onEdit: vi.fn(), onOpenSource: vi.fn(), onDragEnd: vi.fn(),
    onAddTask: vi.fn(), onAddSubtask: vi.fn(), onSettings: vi.fn(),
    onMoveMenu: vi.fn((_task, _choices, _evt, onClose) => { closeMenu = onClose!; }),
  };
  draw();
});

it('a redraw gives focus back to the row toggle, checkbox, scheduling arrow, Undo and Settings', () => {
  host.undo = { label: 'Task moved', run: vi.fn() }; draw();
  const keys = [`row:${root.querySelector<HTMLElement>('.tt-row-bar')!.dataset.row}`, `check:${paint.id}`, `move:${roofer.id}`, 'undo', 'settings'];
  for (const k of keys) {
    key(k).focus(); draw();
    expect(focusedKey()).toBe(k); expect(document.activeElement!.isConnected).toBe(true);
  }
});

it('focus falls back to the task\'s card when its control goes away, and Undo hands it to the restored card', () => {
  key(`move:${roofer.id}`).focus();
  tasks = [paint, walls, task('- [x] Call roofer 📅 2027-03-01 ✅ 2026-10-28', 2)]; draw();
  expect(document.activeElement).toBe(card(roofer));
  host.undo = { label: 'Task completed', run: () => { host.undo = undefined; tasks = [paint, walls, roofer]; host.highlightIds = new Set([roofer.id]); draw(); } };
  draw(); key('undo').click();
  expect(document.activeElement).toBe(card(roofer));
});

it('the Move to… menu reports when it is open, and gives focus to the moved card or back to ⋯', () => {
  const more = () => key(`move-menu:${paint.id}`);
  more().focus(); more().click();
  expect(more().getAttribute('aria-expanded')).toBe('true');
  closeMenu(false);
  expect(more().getAttribute('aria-expanded')).toBe('false'); expect(document.activeElement).toBe(more());
  more().click(); draw(); closeMenu(true);
  expect(more().getAttribute('aria-expanded')).toBe('false'); expect(document.activeElement).toBe(card(paint));
});

it('closing a composer with Escape or X returns focus to the button that opened it', () => {
  const addTask = root.querySelector<HTMLButtonElement>('.tt-add-button')!;
  const cellKey = addTask.dataset.boardFocus;
  addTask.click();
  root.querySelector<HTMLTextAreaElement>('.tt-add-input')!.focus();
  root.querySelector<HTMLTextAreaElement>('.tt-add-input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(focusedKey()).toBe(cellKey);

  const addSubtask = () => [...card(paint).querySelectorAll<HTMLButtonElement>('.tt-add-subtask')].find((b) => b.dataset.addSubtask === paint.id)!;
  addSubtask().click();
  const save = card(paint).querySelector<HTMLButtonElement>('.tt-add-box .tt-editor-save')!;
  expect(save.getAttribute('aria-label')).toBe('Add subtask');
  card(paint).querySelector<HTMLButtonElement>('.tt-add-box .tt-add-cancel')!.focus();
  card(paint).querySelector<HTMLButtonElement>('.tt-add-box .tt-add-cancel')!.click();
  expect(document.activeElement).toBe(addSubtask());
});

it('names each card and subtask action after its task, and lets the keyboard edit subtasks', () => {
  expect(card(paint).querySelector('.tt-add-subtask')?.getAttribute('aria-label')).toBe('Add subtask to Paint the kitchen');
  expect(key(`move-menu:${paint.id}`).getAttribute('aria-label')).toBe('Move Paint the kitchen to…');
  expect(key(`move-menu:${walls.id}`).getAttribute('aria-label')).toBe('Move Prepare walls to…');
  const row = key(`subtask:${walls.id}`);
  expect(row.tabIndex).toBe(0); expect(row.getAttribute('aria-label')).toBe('Prepare walls');
  row.focus(); row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  expect(host.onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: walls.id }));
});

it('keeps an opened composer above the phone keyboard as it opens, and below the column header', async () => {
  const viewport = Object.assign(new EventTarget(), { offsetTop: 0, height: 700 });
  Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true });
  try {
    draw();
    const list = root.querySelector<HTMLElement>('.tt-scroll')!;
    const rect = (top: number, height: number) => () => ({ top, bottom: top + height, left: 0, right: 300, width: 300, height, x: 0, y: top, toJSON: () => ({}) });
    list.getBoundingClientRect = rect(100, 600);
    root.querySelector<HTMLElement>('.tt-col-header')!.getBoundingClientRect = rect(100, 40);
    root.querySelector<HTMLButtonElement>('.tt-add-button')!.click();
    const box = root.querySelector<HTMLElement>('.tt-add-box')!;
    // The box follows the list's scrolling, starting 520px down the screen.
    box.getBoundingClientRect = () => rect(520 - list.scrollTop, 120)();
    await Promise.resolve();
    expect(document.activeElement).toBe(box.querySelector('.tt-add-input'));
    expect(list.scrollTop).toBe(0);
    viewport.height = 400; viewport.dispatchEvent(new Event('resize'));
    expect(box.getBoundingClientRect().bottom).toBe(392);
  } finally {
    disposeBoardSelection(root);
    Reflect.deleteProperty(window, 'visualViewport');
  }
});

it.each([false, true])('reveals a bottom-of-list subtask above an overlay keyboard with bounded scrolling (paging=%s)', async (paging) => {
  const viewport = Object.assign(new EventTarget(), { offsetTop: 0, height: 700 });
  Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true });
  const style = document.createElement('style');
  style.textContent = `.tt-scroll { --tt-column-paging: ${paging ? 1 : 0}; }`;
  document.head.append(style);
  try {
    draw();
    const scroller = root.querySelector<HTMLElement>('.tt-scroll')!;
    const list = paging ? root.querySelector<HTMLElement>('.tt-vertical-scroll')! : scroller;
    scroller.scrollLeft = 400;
    const rect = (top: number, height: number) => ({ top, bottom: top + height, left: 0, right: 300,
      width: 300, height, x: 0, y: top, toJSON: () => ({}) });
    const listHeight = () => Math.min(600, parseFloat(scroller.style.maxHeight) || 600);
    scroller.getBoundingClientRect = () => rect(100, listHeight());
    list.getBoundingClientRect = () => rect(100, listHeight());
    root.querySelector<HTMLElement>('.tt-col-header')!.getBoundingClientRect = () => rect(100, 40);
    // Model the browser's real scroll clamp: the old scroll-only fix cannot reveal this box.
    let scrollTop = 0;
    Object.defineProperty(list, 'scrollTop', { configurable: true, get: () => scrollTop,
      set: (value: number) => { scrollTop = Math.max(0, Math.min(value, 800 - listHeight())); } });
    card(paint).querySelector<HTMLButtonElement>('.tt-add-subtask')!.click();
    const box = card(paint).querySelector<HTMLElement>('.tt-add-box')!;
    const input = box.querySelector<HTMLTextAreaElement>('textarea')!;
    box.getBoundingClientRect = () => rect(660 - scrollTop, 120);
    input.getBoundingClientRect = () => rect(708 - scrollTop, 72);
    await Promise.resolve();
    input.value = 'Keep this subtask draft'; input.dispatchEvent(new Event('input'));
    viewport.height = 400; viewport.dispatchEvent(new Event('resize'));
    expect(box.getBoundingClientRect().bottom).toBe(392);
    expect(box.getBoundingClientRect().top).toBeGreaterThanOrEqual(148);
    expect(scrollTop).toBeGreaterThan(200); // Original full-height list cannot scroll this far.
    expect(scroller.scrollLeft).toBe(400);
    viewport.height = 250; viewport.dispatchEvent(new Event('resize'));
    expect(input.getBoundingClientRect().bottom).toBe(242);
    expect(input.getBoundingClientRect().top).toBeGreaterThanOrEqual(148);
    // iOS can pan the visual viewport without resizing it.
    viewport.offsetTop = 300; viewport.height = 200; viewport.dispatchEvent(new Event('scroll'));
    expect(box.getBoundingClientRect().top).toBe(308);
    expect(input.value).toBe('Keep this subtask draft');
    // Focus on Save keeps keyboard tracking; moving out releases it, as does closing the view.
    box.querySelector<HTMLButtonElement>('.tt-editor-save')!.focus(); await Promise.resolve();
    expect(scroller.style.maxHeight).not.toBe('');
    key('settings').focus(); await Promise.resolve();
    expect(scroller.style.maxHeight).toBe('');
    viewport.height = 350; viewport.dispatchEvent(new Event('resize'));
    expect(scroller.style.maxHeight).toBe('');
    input.focus();
    expect(scroller.style.maxHeight).not.toBe('');
    draw(); await Promise.resolve();
    expect(scroller.style.maxHeight).toBe('');
    expect(root.querySelector<HTMLTextAreaElement>('.tt-add-input')!.value).toBe('Keep this subtask draft');
    disposeBoardSelection(root);
    expect(root.querySelector<HTMLElement>('.tt-scroll')!.style.maxHeight).toBe('');
  } finally {
    disposeBoardSelection(root); style.remove(); Reflect.deleteProperty(window, 'visualViewport');
  }
});
