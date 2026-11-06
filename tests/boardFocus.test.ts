// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

it('names a card’s repeated icon buttons for its task', () => {
  const names = [...card(paint).querySelectorAll('.tt-card-icon')].map((b) => b.getAttribute('aria-label'));
  expect(names[0]).toBe('Labels for Paint the kitchen');
  expect(names.some((n) => /^(Defer Paint the kitchen|Move Paint the kitchen into Due now)/.test(n ?? ''))).toBe(true);
});

it('a redraw gives focus back to a card’s source link, and to the card from a control with no key of its own', () => {
  key(`source:${paint.id}`).focus(); draw();
  expect(focusedKey()).toBe(`source:${paint.id}`);
  card(paint).querySelector<HTMLButtonElement>('.tt-add-subtask')!.focus(); draw();
  expect(document.activeElement).toBe(card(paint));
  const link = document.createElement('a'); link.href = '#'; card(paint).querySelector('.tt-card-text')!.append(link);
  link.focus(); draw();
  expect(document.activeElement).toBe(card(paint));
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

it('keeps what was typed in a composer that another one replaced, until it’s discarded', () => {
  const adds = () => [...root.querySelectorAll<HTMLButtonElement>('.tt-add-button')];
  const inputs = () => [...root.querySelectorAll<HTMLTextAreaElement>('.tt-add-input')];
  const type = (text: string) => { inputs()[0]!.value = text; inputs()[0]!.dispatchEvent(new Event('input')); };
  const first = adds()[0]!.dataset.boardFocus!, second = adds()[1]!.dataset.boardFocus!;
  const add = (key: string) => adds().find((b) => b.dataset.boardFocus === key)!;

  add(first).click();
  type('Half typed');
  add(second).click();
  // Only the new box is open, and it's empty, whether or not the first had focus.
  expect(inputs().map((i) => i.value)).toEqual(['']);
  expect(add(first)).toBeDefined();
  // A redraw doesn't lose it.
  draw();
  expect(inputs().map((i) => i.value)).toEqual(['']);

  add(first).click();
  expect(inputs().map((i) => i.value)).toEqual(['Half typed']);
  // The empty box it replaced has nothing to keep, and X discards the text.
  add(second).click();
  add(first).click();
  expect(inputs()[0]!.value).toBe('Half typed');
  root.querySelector<HTMLButtonElement>('.tt-add-cancel')!.click();
  add(first).click();
  expect(inputs()[0]!.value).toBe('');
  root.querySelector<HTMLButtonElement>('.tt-add-cancel')!.click();
});

it.each(['.tt-editor-save', '.tt-add-labels-button', '.tt-add-cancel'])('closes a composer with Escape from its %s button, returning focus', (selector) => {
  host.onComposerLabels = vi.fn();
  draw();
  const add = root.querySelector<HTMLButtonElement>('.tt-add-button')!;
  const key = add.dataset.boardFocus!;
  add.click();
  const button = root.querySelector<HTMLButtonElement>(`.tt-add-box ${selector}`)!;
  button.focus();
  button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  expect(root.querySelector('.tt-add-input')).toBeNull();
  expect((document.activeElement as HTMLElement).dataset.boardFocus).toBe(key);
  delete host.onComposerLabels;
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

it('names each card and subtask action after its task, and each Add task button after its cell', () => {
  const adds = [...root.querySelectorAll('.tt-add-button')].map((b) => b.getAttribute('aria-label'));
  expect(adds).toContain('Add task to Backlog, Due now');
  expect(adds).toContain('Add task to Waiting, No due date');
  expect(new Set(adds).size).toBe(adds.length);
  expect(card(paint).querySelector('.tt-add-subtask')?.getAttribute('aria-label')).toBe('Add subtask to Paint the kitchen');
  expect(key(`move-menu:${paint.id}`).getAttribute('aria-label')).toBe('Move Paint the kitchen to…');
  expect(key(`move-menu:${walls.id}`).getAttribute('aria-label')).toBe('Move Prepare walls to…');
  const row = key(`subtask:${walls.id}`);
  expect(row.tabIndex).toBe(0); expect(row.getAttribute('aria-label')).toBe('Prepare walls');
  row.focus(); row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  expect(host.onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: walls.id }));
});

it('keeps focus in the composer while its check button saves, ready for the next task', async () => {
  let finish!: (saved: boolean) => void;
  host.onAddTask = vi.fn(() => new Promise<boolean>((resolve) => { finish = resolve; })); draw();
  root.querySelector<HTMLButtonElement>('.tt-add-button')!.click();
  const input = root.querySelector<HTMLTextAreaElement>('.tt-add-input')!;
  input.value = 'Buy paint'; input.dispatchEvent(new Event('input'));
  const save = root.querySelector<HTMLButtonElement>('.tt-add-box .tt-editor-save')!;
  save.focus(); save.click();
  // The check button is disabled while saving; focus moves to the text box rather than the page.
  expect(save.disabled).toBe(true);
  expect(document.activeElement).toBe(input);
  finish(true); await Promise.resolve(); await Promise.resolve();
  draw(); await Promise.resolve();
  const next = root.querySelector<HTMLTextAreaElement>('.tt-add-input')!;
  expect(document.activeElement).toBe(next); expect(next.value).toBe('');
  next.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
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

describe('a subtask composer near a cell’s pinned Add task box', () => {
  const rect = (top: number, height: number) => () => ({ top, bottom: top + height, left: 0, right: 300, width: 300, height, x: 0, y: top, toJSON: () => ({}) });
  const setUp = (css: string) => {
    const viewport = Object.assign(new EventTarget(), { offsetTop: 0, height: 700 });
    Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true });
    const style = document.createElement('style');
    style.textContent = css;
    document.head.append(style);
    draw();
    const list = root.querySelector<HTMLElement>('.tt-scroll')!;
    list.getBoundingClientRect = rect(100, 600);
    root.querySelector<HTMLElement>('.tt-col-header')!.getBoundingClientRect = rect(100, 40);
    // An earlier test can leave a composer open; start with none.
    root.querySelectorAll<HTMLButtonElement>('.tt-add-cancel').forEach((cancel) => cancel.click());
    return { list, cell: card(paint).closest<HTMLElement>('.tt-cell')! };
  };
  const pinnedOf = (cell: HTMLElement) => cell.querySelector<HTMLElement>(':scope > .tt-add')!;
  const openSubtask = async (list: HTMLElement) => {
    card(paint).querySelector<HTMLButtonElement>('.tt-add-subtask')!.click();
    const box = card(paint).querySelector<HTMLElement>('.tt-add-box')!;
    // Clear of the board's bottom edge, but under the Add task box. It follows the board's scrolling.
    box.getBoundingClientRect = () => rect(560 - list.scrollTop, 120)();
    await Promise.resolve();
    const input = box.querySelector<HTMLTextAreaElement>('.tt-add-input')!;
    expect(document.activeElement).toBe(input);
    input.dispatchEvent(new Event('input'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    return box;
  };
  afterEach(() => {
    disposeBoardSelection(root);
    Reflect.deleteProperty(window, 'visualViewport');
    document.head.querySelectorAll('style').forEach((style) => style.remove());
  });

  it('scrolls it clear of the box', async () => {
    const { list, cell } = setUp('.tt-cell > .tt-add { position: sticky; }');
    pinnedOf(cell).getBoundingClientRect = rect(640, 50);
    const box = await openSubtask(list);
    expect(box.getBoundingClientRect().bottom).toBe(632);
    expect(list.scrollTop).toBe(48);
  });

  it('leaves it where it is when the box sits below it in the list', async () => {
    const { list, cell } = setUp('.tt-cell > .tt-add { position: sticky; }');
    pinnedOf(cell).getBoundingClientRect = rect(690, 50);
    await openSubtask(list);
    expect(list.scrollTop).toBe(0);
  });

  it('ignores an Add task box that isn’t pinned, as above the list on a phone', async () => {
    const { list, cell } = setUp('.tt-cell > .tt-add { position: static; }');
    pinnedOf(cell).getBoundingClientRect = rect(640, 50);
    await openSubtask(list);
    expect(list.scrollTop).toBe(0);
  });

  it('doesn’t make Add task’s own composer try to clear itself', async () => {
    const { list, cell } = setUp('.tt-cell > .tt-add { position: sticky; }');
    const pinned = pinnedOf(cell);
    pinned.querySelector<HTMLButtonElement>('.tt-add-button')!.click();
    pinned.getBoundingClientRect = rect(500, 120);
    const box = pinned.querySelector<HTMLElement>('.tt-add-box')!;
    box.getBoundingClientRect = () => rect(500 - list.scrollTop, 120)();
    await Promise.resolve();
    const input = box.querySelector<HTMLTextAreaElement>('.tt-add-input')!;
    expect(document.activeElement).toBe(input);
    input.dispatchEvent(new Event('input'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(list.scrollTop).toBe(0);
  });
});

it('leaves the board still while typing in a sticky Add task box near its bottom edge', async () => {
  const viewport = Object.assign(new EventTarget(), { offsetTop: 0, height: 700 });
  Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true });
  try {
    draw();
    const list = root.querySelector<HTMLElement>('.tt-scroll')!;
    const rect = (top: number, height: number) => () => ({ top, bottom: top + height, left: 0, right: 300, width: 300, height, x: 0, y: top, toJSON: () => ({}) });
    list.getBoundingClientRect = rect(100, 600);
    root.querySelector<HTMLElement>('.tt-col-header')!.getBoundingClientRect = rect(100, 40);
    // An earlier test can leave a composer open; start with none.
    root.querySelectorAll<HTMLButtonElement>('.tt-add-cancel').forEach((cancel) => cancel.click());
    root.querySelector<HTMLButtonElement>('.tt-add-button')!.click();
    const box = root.querySelector<HTMLElement>('.tt-add-box')!;
    // Sticky at the board's bottom, 5px from its edge: scrolling never moves it.
    box.getBoundingClientRect = rect(575, 120);
    await Promise.resolve();
    const input = box.querySelector<HTMLTextAreaElement>('.tt-add-input')!;
    expect(document.activeElement).toBe(input);
    for (const text of ['R', 'Re', 'R']) {
      input.value = text; input.dispatchEvent(new Event('input'));
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(list.scrollTop).toBe(0);
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
