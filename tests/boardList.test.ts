// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { renderBoardList, type BoardListHost, type BoardListTarget } from '../src/ui/renderBoardList.ts';
import { renderBoard, type RenderHost } from '../src/ui/renderBoard.ts';
import { buildBoard } from '../src/core/board.ts';
import { parseBoardConfig } from '../src/core/boardConfig.ts';

const boards = [
  { path: 'Boards/Garden.md', name: 'Garden', folder: 'Boards' },
  { path: 'Boards/House.md', name: 'House', folder: 'Boards' },
];
const config = parseBoardConfig('House', { slug: 'house', labels: [{ id: 'l1', name: 'Urgent', color: '#e03131' }] }).config;
const house: BoardListTarget = { path: 'Boards/House.md', place: 'Backlog, No due date', labels: { palette: config.labels, shape: config.labelShape } };

function setup(extra: Partial<BoardListHost> = {}) {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  const host: BoardListHost = { icon: () => {}, onCreateBoard: vi.fn(), onOpenBoard: vi.fn(), onAddTask: vi.fn(async () => true), ...extra };
  let open: BoardListTarget | null = house;
  const draw = (target: BoardListTarget | null = open) => { open = target; renderBoardList(root, boards, open, host); };
  draw();
  const q = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector);
  const input = () => q<HTMLTextAreaElement>('.tt-add-input')!;
  const type = (text: string) => { input().value = text; input().dispatchEvent(new Event('input')); };
  const key = (k: string) => input().dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  return { root, host, draw, q, input, type, key };
}
afterEach(() => {
  document.querySelectorAll<HTMLButtonElement>('.tt-add-cancel').forEach((b) => b.click());
  document.body.replaceChildren();
});

it('offers Add task only under the open board, named for where the task goes', () => {
  const ui = setup();
  const active = ui.q('[aria-current="page"]')!;
  expect(active.textContent).toBe('House');
  const add = ui.q<HTMLButtonElement>('.tt-board-list-add .tt-add-button')!;
  expect(add.textContent).toBe('Add task');
  expect(add.getAttribute('aria-label')).toBe('Add task to House: Backlog, No due date');
  expect(active.closest('li')!.contains(add)).toBe(true);
  ui.draw(null);
  expect(ui.q('.tt-board-list-add')).toBeNull();
  expect(ui.q('[aria-current]')).toBeNull();
});

it('opens the board’s composer, adds to the open board and stays open for the next task', async () => {
  const ui = setup({ onComposerLabels: vi.fn() });
  ui.q<HTMLButtonElement>('.tt-add-button')!.click();
  await Promise.resolve();
  expect(document.activeElement).toBe(ui.input());
  expect([...ui.q('.tt-add-actions')!.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') ?? b.textContent))
    .toEqual(['Add task', 'Details…', 'Labels', 'Cancel']);
  ui.type('Call the roofer'); ui.key('Enter');
  await vi.waitFor(() => expect(ui.input().value).toBe(''));
  expect(ui.host.onAddTask).toHaveBeenCalledWith('Boards/House.md', 'Call the roofer', false, []);
  expect(document.activeElement).toBe(ui.input());
  await vi.waitFor(() => expect(ui.q('[role="status"]')!.textContent).toBe('Task added to House.'));
});

it('keeps a draft with its board across redraws, and Escape hands focus back to Add task', async () => {
  const ui = setup();
  ui.q<HTMLButtonElement>('.tt-add-button')!.click();
  await Promise.resolve();
  ui.type('Half typed');
  ui.draw();
  await Promise.resolve();
  expect(ui.input().value).toBe('Half typed');
  expect(document.activeElement).toBe(ui.input());
  ui.draw({ ...house, path: 'Boards/Garden.md' });
  expect(ui.q('.tt-add-input')).toBeNull();
  expect(ui.q('.tt-add-button')!.getAttribute('aria-label')).toBe('Add task to Garden: Backlog, No due date');
  ui.draw(house);
  expect(ui.input().value).toBe('Half typed');
  ui.input().focus();
  ui.key('Escape');
  expect(ui.q('.tt-add-input')).toBeNull();
  expect(document.activeElement).toBe(ui.q('.tt-add-button'));
});

it('picks labels for the draft, shows them, keeps the box open while picking and adds them with the task', async () => {
  let choose!: (ids: string[]) => void, close!: () => void;
  const onComposerLabels = vi.fn((_path: string, _selected: string[], c: (ids: string[]) => void, done: () => void) => { choose = c; close = done; });
  const ui = setup({ onComposerLabels });
  ui.q<HTMLButtonElement>('.tt-add-button')!.click();
  const labels = ui.q<HTMLButtonElement>('.tt-add-labels-button')!;
  labels.click();
  expect(onComposerLabels).toHaveBeenCalledWith('Boards/House.md', [], expect.any(Function), expect.any(Function));
  ui.input().dispatchEvent(new FocusEvent('blur'));
  await new Promise((resolve) => setTimeout(resolve, 200));
  expect(ui.q('.tt-add-input')).not.toBeNull();
  choose(['l1']);
  expect([...ui.root.querySelectorAll('.tt-add-labels .tt-card-label')].map((m) => m.getAttribute('aria-label'))).toEqual(['Urgent']);
  close();
  expect(document.activeElement).toBe(ui.q('.tt-add-labels-button'));
  ui.type('Call the roofer'); ui.key('Enter');
  await vi.waitFor(() => expect(ui.input().value).toBe(''));
  expect(ui.host.onAddTask).toHaveBeenCalledWith('Boards/House.md', 'Call the roofer', false, ['l1']);
  expect(ui.q<HTMLElement>('.tt-add-labels')!.hidden).toBe(true);
});

it('has no Labels button without a picker, and the board’s and sidebar’s boxes don’t close each other', async () => {
  const ui = setup();
  ui.q<HTMLButtonElement>('.tt-add-button')!.click();
  expect(ui.q('.tt-add-labels-button')).toBeNull();
  ui.type('Sidebar draft');
  const board = document.createElement('div');
  document.body.append(board);
  const model = buildBoard([], config, '2026-10-30', () => undefined);
  const boardHost: RenderHost = { renderText: () => {}, icon: () => {}, sourceLabel: () => '', isCollapsed: () => false,
    onToggleRow: () => {}, onSetSubtasksCollapsed: () => {}, onDrop: () => {}, onToggle: () => {}, onEdit: () => {},
    onOpenSource: () => {}, onDragEnd: () => {}, onAddTask: () => true, onAddSubtask: () => false };
  renderBoard(board, model, boardHost, { warnings: [], info: [] });
  board.querySelector<HTMLButtonElement>('.tt-add-button')!.click();
  const boardInput = board.querySelector<HTMLTextAreaElement>('.tt-add-input')!;
  boardInput.value = 'Board draft'; boardInput.dispatchEvent(new Event('input'));
  renderBoard(board, model, boardHost, { warnings: [], info: [] });
  ui.draw();
  expect(board.querySelector<HTMLTextAreaElement>('.tt-add-input')!.value).toBe('Board draft');
  expect(ui.input().value).toBe('Sidebar draft');
});

it('puts focus back on the board row or button that had it after a redraw', () => {
  const ui = setup();
  ui.q<HTMLButtonElement>('[data-board-focus="board:Boards/Garden.md"]')!.focus();
  ui.draw();
  expect(document.activeElement).toBe(ui.q('[data-board-focus="board:Boards/Garden.md"]'));
  ui.q<HTMLButtonElement>('.tt-board-list-create')!.click();
  expect(ui.host.onCreateBoard).toHaveBeenCalled();
  ui.q<HTMLButtonElement>('[data-board-focus="board:Boards/Garden.md"]')!.click();
  expect(ui.host.onOpenBoard).toHaveBeenCalledWith('Boards/Garden.md');
});

it('gives a board cell’s composer the same Labels button, adding the labels with the task', async () => {
  const board = document.createElement('div');
  document.body.replaceChildren(board);
  const onAddTask = vi.fn(() => true);
  const onComposerLabels = vi.fn((selected: string[], choose: (ids: string[]) => void, done: () => void) => { choose([...selected, 'l1']); done(); });
  const host: RenderHost = { renderText: () => {}, icon: () => {}, sourceLabel: () => '', isCollapsed: () => false,
    onToggleRow: () => {}, onSetSubtasksCollapsed: () => {}, onDrop: () => {}, onToggle: () => {}, onEdit: () => {},
    onOpenSource: () => {}, onDragEnd: () => {}, onAddTask, onAddSubtask: () => false, onComposerLabels };
  const model = buildBoard([], config, '2026-10-30', () => undefined);
  renderBoard(board, model, host, { warnings: [], info: [] });
  board.querySelector<HTMLButtonElement>('[aria-label="Add task to Backlog, No due date"]')!.click();
  board.querySelector<HTMLButtonElement>('.tt-add-labels-button')!.click();
  expect(board.querySelectorAll('.tt-add-labels .tt-card-label')).toHaveLength(1);
  const input = board.querySelector<HTMLTextAreaElement>('.tt-add-input')!;
  input.value = 'Order paint'; input.dispatchEvent(new Event('input'));
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  await vi.waitFor(() => expect(onAddTask).toHaveBeenCalledWith({ rowId: 'none', columnId: 'backlog' }, 'Order paint', false, ['l1']));
});
