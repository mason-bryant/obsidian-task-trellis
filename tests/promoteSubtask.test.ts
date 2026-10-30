// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { notices, TFile, Workspace } from './mocks/obsidian.ts';
import { buildBoard, moveChoices, planPromotion, taskId, type BoardTask } from '../src/core/board.ts';
import { parseBoardConfig } from '../src/core/boardConfig.ts';
import { parseTaskLine } from '../src/core/taskLine.ts';
import { TaskWriter } from '../src/obsidian/TaskWriter.ts';
import { renderBoard, type RenderHost } from '../src/ui/renderBoard.ts';

// Friday.
const TODAY = '2026-10-23';
const PATH = 'House.md';
const config = parseBoardConfig('House', { slug: 'house' }).config;

function task(raw: string, line: number, parentLine?: number): BoardTask {
  return { ...parseTaskLine(raw)!, raw, path: PATH, line, id: taskId(PATH, line),
    ...(parentLine === undefined ? {} : { parentId: taskId(PATH, parentLine) }) };
}

const NOTE = [
  '- [ ] Paint the kitchen 📅 2026-10-24 #tt/house/doing/100',
  '\t- [ ] Patch walls',
  '\t- [ ] Buy paint 📅 2026-11-20',
  '\t\t- [ ] Pick colours',
  '\t- [x] Tape edges ✅ 2026-10-22',
  '- [ ] Fix the leak 📅 2026-10-25 #tt/house/doing/200',
];
const card = task(NOTE[0]!, 0);
const patch = task(NOTE[1]!, 1, 0);
const buy = task(NOTE[2]!, 2, 0);
const pick = task(NOTE[3]!, 3, 2);
const tape = task(NOTE[4]!, 4, 0);
const leak = task(NOTE[5]!, 5);
const model = () => buildBoard([card, patch, buy, pick, tape, leak], config, TODAY, () => undefined);

describe('planPromotion', () => {
  it('places the subtask like a dropped card and renumbers the cell', () => {
    const p = planPromotion(model(), patch.id, { rowId: 'now', columnId: 'doing', index: 1 })!;
    expect(p.card.id).toBe(card.id);
    expect(p.edits.get(patch.id)).toEqual({ column: 'doing', sort: 150, due: '2026-10-30' });
  });

  it('keeps a date that already puts it in the target row', () => {
    const p = planPromotion(model(), buy.id, { rowId: 'later', columnId: 'backlog', index: 0 })!;
    expect(p.edits.get(buy.id)).toEqual({ column: 'backlog', sort: 100 });
  });

  it('finds the card of a nested subtask and reopens a completed one outside Done', () => {
    expect(planPromotion(model(), pick.id, { rowId: 'now', columnId: 'doing', index: 2 })!.card.id).toBe(card.id);
    expect(planPromotion(model(), tape.id, { rowId: 'none', columnId: 'backlog', index: 0 })!.edits.get(tape.id)).toMatchObject({ closed: false });
  });

  it('is not for cards', () => {
    expect(planPromotion(model(), leak.id, { rowId: 'now', columnId: 'doing', index: 0 })).toBeNull();
  });
});

describe('moveChoices for a subtask', () => {
  it('offers a spot just below its card, then columns and rows from the card’s cell', () => {
    const choices = moveChoices(model(), patch)!;
    expect(choices.out).toMatchObject({ label: 'Below “Paint the kitchen”', target: { rowId: 'now', columnId: 'doing', index: 1 }, detail: 'due Oct 30' });
    expect(choices.columns.every((c) => !c.current)).toBe(true);
    expect(choices.rows.find((r) => r.label === 'No due date')).toMatchObject({ target: { rowId: 'none', columnId: 'doing' }, detail: '' });
    expect(moveChoices(model(), leak)!.out).toBeUndefined();
  });
});

function fakeApp(files: Record<string, string>) {
  const entries = new Map(Object.keys(files).map((path) => [path, new TFile(path)]));
  return { workspace: new Workspace(), vault: {
    getAbstractFileByPath: (path: string) => entries.get(path) ?? null,
    process: async (file: TFile, fn: (content: string) => string) => (files[file.path] = fn(files[file.path]!)),
  }, plugins: { enabledPlugins: new Set<string>(), plugins: {} } } as unknown as App;
}

describe('TaskWriter promoting a subtask', () => {
  beforeEach(() => { notices.length = 0; });

  it('moves it with its own subtasks below the card, tags it, renumbers neighbours, and undoes', async () => {
    const original = NOTE.join('\n') + '\n';
    const files = { [PATH]: original };
    const p = planPromotion(model(), buy.id, { rowId: 'now', columnId: 'doing', index: 1 })!;
    const tasks = [card, leak, buy].filter((t) => p.edits.has(t.id));
    const result = await new TaskWriter(fakeApp(files)).applyEdits(tasks, p.edits, 'house', { subtask: buy, card });
    expect(result.appliedIds.sort()).toEqual(tasks.map((t) => t.id).sort());
    expect(files[PATH]).toBe([
      NOTE[0], NOTE[1], NOTE[4],
      '- [ ] Buy paint 📅 2026-10-30 #tt/house/doing/150',
      '\t- [ ] Pick colours',
      NOTE[5],
    ].join('\n') + '\n');
    expect(await result.action!.undo()).toBe(true);
    expect(files[PATH]).toBe(original);
  });

  it('writes nothing when the card changed', async () => {
    const changed = NOTE.join('\n').replace('Paint the kitchen', 'Paint the hall');
    const files = { [PATH]: changed };
    const p = planPromotion(model(), patch.id, { rowId: 'now', columnId: 'doing', index: 1 })!;
    const result = await new TaskWriter(fakeApp(files)).applyEdits([patch], p.edits, 'house', { subtask: patch, card });
    expect(result.failedPaths).toEqual([PATH]);
    expect(files[PATH]).toBe(changed);
  });
});

describe('dragging a subtask row', () => {
  it('drags the subtask, not its card', () => {
    const root = document.createElement('div'); document.body.replaceChildren(root);
    const host = {
      renderText: (el: HTMLElement, t: BoardTask) => { el.textContent = t.text; }, icon: () => undefined, sourceLabel: () => 'House',
      isCollapsed: () => false, onToggleRow: vi.fn(), onSetSubtasksCollapsed: vi.fn(), onDrop: vi.fn(), onToggle: vi.fn(), onEdit: vi.fn(),
      onOpenSource: vi.fn(), onDragEnd: vi.fn(), onAddTask: vi.fn(), onAddSubtask: vi.fn(), onMoveMenu: vi.fn(),
    } satisfies RenderHost;
    renderBoard(root, model(), host, { warnings: [], info: [] });
    const row = [...root.querySelectorAll<HTMLElement>('.tt-subtask')].find((r) => r.dataset.id === patch.id)!;
    expect(row.draggable).toBe(true);
    row.dispatchEvent(new Event('dragstart', { bubbles: true }));
    const cell = root.querySelector<HTMLElement>('.tt-cell[data-row="now"][data-column="backlog"]')!;
    cell.dispatchEvent(new MouseEvent('dragover', { bubbles: true, cancelable: true, clientY: 0 }));
    cell.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));
    expect(host.onDrop).toHaveBeenCalledWith(patch.id, { rowId: 'now', columnId: 'backlog', index: 0 });
    row.querySelector<HTMLButtonElement>('.tt-card-more')!.click();
    expect(host.onMoveMenu.mock.calls[0]![0]).toBe(patch);
  });
});

it('disables every draggable ancestor of a nested composer and restores them only when their inputs close', () => {
  const root = document.createElement('div'); document.body.replaceChildren(root);
  const host = {
    renderText: (el: HTMLElement, t: BoardTask) => { el.textContent = t.text; }, icon: () => undefined, sourceLabel: () => 'House',
    isCollapsed: () => false, onToggleRow: vi.fn(), onSetSubtasksCollapsed: vi.fn(), onDrop: vi.fn(), onToggle: vi.fn(), onEdit: vi.fn(),
    onOpenSource: vi.fn(), onDragEnd: vi.fn(), onAddTask: vi.fn(), onAddSubtask: vi.fn(), onMoveMenu: vi.fn(),
  } satisfies RenderHost;
  renderBoard(root, model(), host, { warnings: [], info: [] });
  const row = (id: string) => [...root.querySelectorAll<HTMLElement>('.tt-card, .tt-subtask')].find(el => el.dataset.id === id)!;
  const nested = row(pick.id), parent = row(buy.id), main = row(card.id);
  nested.querySelector<HTMLButtonElement>('.tt-add-subtask')!.click();
  expect([nested.draggable, parent.draggable, main.draggable]).toEqual([false, false, false]);
  const drag = new Event('dragstart', { bubbles: true, cancelable: true });
  nested.dispatchEvent(drag); expect(drag.defaultPrevented).toBe(true);
  // A second composer can coexist until a redraw; closing one must not re-enable its ancestors.
  parent.querySelector<HTMLButtonElement>(':scope > .tt-subtask-controls .tt-add-subtask')!.click();
  nested.querySelector('textarea')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(nested.draggable).toBe(true);
  expect([parent.draggable, main.draggable]).toEqual([false, false]);
  parent.querySelector('textarea')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect([nested.draggable, parent.draggable, main.draggable]).toEqual([true, true, true]);
});
