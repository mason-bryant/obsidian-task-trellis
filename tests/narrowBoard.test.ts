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
