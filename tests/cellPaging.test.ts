// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildBoard, taskId, type BoardTask } from '../src/core/board.ts';
import { parseBoardConfig } from '../src/core/boardConfig.ts';
import { parseTaskLine } from '../src/core/taskLine.ts';
import { CELL_PAGE, renderBoard, type RenderHost } from '../src/ui/renderBoard.ts';

const today = '2026-10-23';
const task = (raw: string, line: number): BoardTask => ({ ...parseTaskLine(raw)!, raw, path: 'Load.md', line, id: taskId('Load.md', line) });
/** `count` open tasks in the Doing column's Due now cell, in order of their sort ranks. */
const doing = (count: number, rank = (i: number) => i) =>
  Array.from({ length: count }, (_, i) => task(`- [ ] Task ${i + 1} 📅 2026-10-24 #tt/load/doing/${rank(i) * 100 + 100}`, i));

let root: HTMLElement;
let host: RenderHost;
let collapsed: Record<string, boolean>;
let tasks: BoardTask[];
const draw = (slug = 'load') =>
  renderBoard(root, buildBoard(tasks, parseBoardConfig('Load', { slug }).config, today, () => undefined), host, { warnings: [], info: [] });
const cell = (column = 'doing') => root.querySelector<HTMLElement>(`.tt-cell[data-row="now"][data-column="${column}"]`)!;
const cards = (column = 'doing') => [...cell(column).querySelectorAll<HTMLElement>(':scope > .tt-card')];
const buttons = (column = 'doing') => [...cell(column).querySelectorAll<HTMLButtonElement>(':scope > .tt-more')];
const button = (text: string, column = 'doing') => buttons(column).find((b) => b.textContent === text);
const press = (b: HTMLButtonElement | undefined) => { expect(b).toBeDefined(); b!.focus(); b!.click(); };

beforeEach(() => {
  root = document.createElement('div');
  document.body.replaceChildren(root);
  collapsed = {};
  host = {
    renderText: (el, t) => { el.textContent = t.text; }, icon: () => undefined, sourceLabel: () => 'Load',
    isCollapsed: (key) => collapsed[key] ?? (key === 'later' || key.startsWith('more:')),
    onToggleRow: vi.fn((key: string) => { collapsed[key] = !host.isCollapsed(key); draw(); }),
    onSetSubtasksCollapsed: vi.fn(), onDrop: vi.fn(), onToggle: vi.fn(), onEdit: vi.fn(),
    onOpenSource: vi.fn(), onDragEnd: vi.fn(), onAddTask: vi.fn(), onAddSubtask: vi.fn(),
  };
});

describe('long cells', () => {
  it('draw a page of cards at a time, and Show fewer goes back to the first page', () => {
    tasks = doing(60);
    draw();
    expect(cards()).toHaveLength(CELL_PAGE);
    expect(buttons().map((b) => b.textContent)).toEqual(['35 more']);
    expect(button('35 more')!.title).toBe('Show the next 25');

    press(button('35 more'));
    expect(cards()).toHaveLength(2 * CELL_PAGE);
    expect(buttons().map((b) => b.textContent)).toEqual(['10 more', 'Show fewer']);
    expect(button('10 more')!.title).toBe('Show the next 10');

    press(button('10 more'));
    expect(cards()).toHaveLength(60);
    expect(buttons().map((b) => b.textContent)).toEqual(['Show fewer']);

    press(button('Show fewer'));
    expect(cards()).toHaveLength(CELL_PAGE);
    expect(document.activeElement).toBe(button('35 more'));
  });

  it('leave short cells alone', () => {
    tasks = doing(CELL_PAGE);
    draw();
    expect(cards()).toHaveLength(CELL_PAGE);
    expect(buttons()).toEqual([]);
  });

  it('move focus to the first card a page adds', () => {
    tasks = doing(30);
    draw();
    press(button('5 more'));
    expect(document.activeElement).toBe(cards()[CELL_PAGE]);
    expect(cards()[CELL_PAGE]!.dataset.id).toBe(tasks[CELL_PAGE]!.id);
  });

  it('keep their pages across redraws, and start over on another board', () => {
    tasks = doing(60);
    draw();
    press(button('35 more'));
    draw();
    expect(cards()).toHaveLength(2 * CELL_PAGE);
    // Without focus on one of its cards, which would keep that card drawn.
    (document.activeElement as HTMLElement).blur();
    draw('other');
    draw();
    expect(cards()).toHaveLength(CELL_PAGE);
  });

  it('keep drawing a card an action just changed, past the page', () => {
    tasks = doing(60);
    host.highlightIds = new Set([tasks[40]!.id]);
    draw();
    expect(cards()).toHaveLength(2 * CELL_PAGE);
    // The page stays shown once the highlight ends, so the card doesn't vanish on the next redraw.
    host.highlightIds = undefined;
    draw();
    expect(cards()).toHaveLength(2 * CELL_PAGE);
  });

  it('keep the focused card drawn and focused when it moves past the page', () => {
    tasks = doing(60);
    draw();
    const moving = tasks[CELL_PAGE - 1]!;
    cards()[CELL_PAGE - 1]!.focus();
    // Alt+Down past the page: the card now ranks 31st.
    tasks = doing(60, (i) => i === CELL_PAGE - 1 ? 30.5 : i);
    draw();
    const moved = cards().find((c) => c.dataset.id === moving.id);
    expect(moved).toBeDefined();
    expect(document.activeElement).toBe(moved);
  });

  it('page Done past its own limit, and Show fewer collapses it again', () => {
    tasks = Array.from({ length: 40 }, (_, i) => task(`- [x] Done ${i + 1} 📅 2026-10-24 ✅ 2026-10-22`, i));
    draw();
    expect(cards('done')).toHaveLength(5);
    expect(buttons('done').map((b) => b.textContent)).toEqual(['35 more']);

    press(button('35 more', 'done'));
    expect(host.onToggleRow).toHaveBeenLastCalledWith('more:now');
    expect(cards('done')).toHaveLength(CELL_PAGE);
    expect(buttons('done').map((b) => b.textContent)).toEqual(['15 more', 'Show fewer']);

    press(button('15 more', 'done'));
    expect(cards('done')).toHaveLength(40);
    expect(buttons('done').map((b) => b.textContent)).toEqual(['Show fewer']);

    press(button('Show fewer', 'done'));
    expect(host.onToggleRow).toHaveBeenCalledTimes(2);
    expect(cards('done')).toHaveLength(5);
    // Expanding again starts from the first page, not the pages shown before.
    press(button('35 more', 'done'));
    expect(cards('done')).toHaveLength(CELL_PAGE);
  });

  it('still select every matching card past the page', () => {
    tasks = doing(60);
    host.onBulkAction = vi.fn(async () => null);
    draw();
    press([...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Select'));
    expect([...root.querySelectorAll('button')].some((b) => b.textContent === 'Select all 60')).toBe(true);
    expect(cards()).toHaveLength(CELL_PAGE);
  });
});
