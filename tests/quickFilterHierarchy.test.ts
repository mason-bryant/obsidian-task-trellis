// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { buildBoard, subtasksKey, type BoardTask } from '../src/core/board.ts';
import { parseBoardConfig } from '../src/core/boardConfig.ts';
import { triageCards } from '../src/core/bulkTriage.ts';
import { parseTaskLine } from '../src/core/taskLine.ts';
import { renderBoard, type RenderHost } from '../src/ui/renderBoard.ts';

const today = '2026-10-27';
const task = (line: number, text: string, parent?: BoardTask): BoardTask => {
  const raw = `- [ ] ${text}`;
  return { ...parseTaskLine(raw)!, raw, id: `Work.md:${line}`, path: 'Work.md', line, parentId: parent?.id };
};
const parent = task(0, 'Paint kitchen 📅 2026-11-20 #tt/house/doing/10 #tt/house/label/red');
const child = task(1, 'Call contractor 📅 2026-10-26', parent);
const sibling = task(2, 'Choose paint', parent);
const family = [parent, child, sibling];
const overdue = { id: 'late', name: 'Overdue', due: ['overdue'], 'match-subtasks': true };
const config = (filters: unknown[] = [overdue], fm: Record<string, unknown> = {}) => parseBoardConfig('House', {
  slug: 'house', columns: ['Backlog', 'Doing', 'Done'], 'done-column': 'done', 'quick-filters': filters, ...fm,
}).config;
const model = (tasks = family, filters: unknown[] = [overdue], fm: Record<string, unknown> = {}, active = ['late']) =>
  buildBoard(tasks, config(filters, fm), today, () => undefined, () => [], active);
const cards = (m: ReturnType<typeof model>) => Object.values(m.cells).flatMap((row) => Object.values(row).flat());

describe('quick-filter task hierarchy', () => {
  it('defaults to main tasks and never promotes an independently matching child', () => {
    const off = { ...overdue, 'match-subtasks': false };
    expect(cards(model(family, [off]))).toEqual([]);
    const orphan = task(4, 'Orphan 📅 2026-10-26', task(3, 'Excluded'));
    expect(cards(model([orphan], [off]))).toEqual([]);
    expect(config([{ id: 'late', name: 'Overdue', due: ['overdue'] }]).quickFilters[0]!.matchSubtasks).toBe(false);
    expect(cards(model(family, [off], {}, []))).toEqual([parent]);
  });

  it('retains a context parent in its own cell, with the complete subtree available', () => {
    const m = model();
    expect(cards(m)).toEqual([parent]);
    expect(m.rowOf[parent.id]).toBe(model(family, [], {}, []).rowOf[parent.id]);
    expect(Object.values(m.cells).some((row) => row.doing?.includes(parent))).toBe(true);
    expect(m.quickContext?.contextOnly).toEqual(new Set([parent.id]));
    expect(m.quickContext?.matches).toEqual(new Set([child.id]));
    expect(m.quickContext?.branches).toEqual(new Set([child.id, parent.id]));
    expect(m.subtasks[parent.id]).toEqual([child, sibling]);
    expect(triageCards(m)).toEqual([]);
    expect(m.total).toBe(1);
  });

  it('keeps intervening ancestors and deduplicates multiple matching descendants', () => {
    const middle = task(3, 'Find contractor', parent);
    const deep = task(4, 'Call specialist 📅 2026-10-25', middle);
    const m = model([...family, middle, deep]);
    expect(cards(m)).toEqual([parent]);
    expect(m.quickContext?.branches).toEqual(new Set([parent.id, child.id, middle.id, deep.id]));
    expect(m.quickContext?.matches).toEqual(new Set([child.id, deep.id]));
  });

  it('requires main-only filters on the parent and permits enabled filters on one descendant', () => {
    const label = { id: 'red', name: 'Red', labels: ['red'] };
    const m = model(family, [label, overdue], {}, ['red', 'late']);
    expect(cards(m)).toEqual([parent]);
    expect(cards(model(family, [{ ...label, labels: ['green'] }, overdue], {}, ['red', 'late']))).toEqual([]);
    const differentChild = task(3, 'High priority ⏫', parent);
    const high = { id: 'high', name: 'High', priority: ['high'], 'match-subtasks': true };
    expect(cards(model([...family, differentChild], [overdue, high], {}, ['late', 'high']))).toEqual([]);
    const both = task(4, 'Urgent call ⏫ 📅 2026-10-26', parent);
    expect(cards(model([...family, both], [overdue, high], {}, ['late', 'high']))).toEqual([parent]);
  });

  it('retains ordinary children of a directly matching main task without calling it context', () => {
    const p = task(0, 'Paint kitchen 📅 2026-10-26');
    const c = task(1, 'Choose paint', p);
    const m = model([p, c], [{ ...overdue, 'match-subtasks': false }]);
    expect(cards(m)).toEqual([p]); expect(m.subtasks[p.id]).toEqual([c]);
    expect(m.quickContext?.contextOnly.size).toBe(0);
    expect(m.quickContext?.matches.size).toBe(0);
    expect(triageCards(m)).toEqual([p]);
    expect(model([p, c]).quickContext?.matches.size).toBe(0);
  });

  it('does not widen board membership; outside ancestors become headings only', () => {
    const p = task(0, 'Outside project');
    const c = task(1, 'Scoped call #work 📅 2026-10-26', p);
    const m = model([p, c], [overdue], { 'include-tags': ['work'] });
    expect(cards(m)).toEqual([c]);
    expect(m.quickContext?.parents[c.id]).toEqual([p]);
    expect(m.rowOf[p.id]).toBeUndefined();
    expect(triageCards(m)).toEqual([c]);
    expect(cards(model([p, c], [overdue], { 'exclude-folders': ['Work.md'] }))).toEqual([]);
  });

  it('does not resurrect hidden completed matches, but keeps hidden ancestors as context', () => {
    const complete = (t: BoardTask, date: string) => {
      const raw = t.raw.replace('[ ]', '[x]') + ` ✅ ${date}`;
      return { ...t, ...parseTaskLine(raw)!, raw };
    };
    const old = complete(parent, '2026-09-01');
    const m = model([old, child]);
    expect(cards(m)).toEqual([child]); expect(m.quickContext?.parents[child.id]).toEqual([old]);
    const dated = { ...overdue, due: ['today'] };
    const done = complete(task(1, 'Done today 📅 2026-10-27', parent), today);
    expect(model([parent, done], [dated]).quickContext?.matches.has(done.id)).toBe(true);
    expect(cards(model([parent, done], [dated], { 'show-completed-days': 0 }))).toEqual([]);
  });

  it('ignores hidden filters and handles missing/cyclic ancestor references without hanging', () => {
    expect(cards(model(family, [{ ...overdue, show: false }]))).toEqual([parent]);
    const a = task(5, 'A 📅 2026-10-26'), b = task(6, 'B 📅 2026-10-26', a);
    a.parentId = b.id;
    expect(() => model([a, b])).not.toThrow();
    const missing = task(7, 'Missing parent 📅 2026-10-26', task(9, 'Unavailable'));
    expect(cards(model([missing]))).toEqual([missing]);
  });
});

function ui(initial = model(), collapsed = true) {
  const root = document.createElement('div'); document.body.replaceChildren(root);
  const host: RenderHost = {
    renderText: (el, t) => { el.textContent = t.text; }, icon: vi.fn(), sourceLabel: () => 'Work',
    isCollapsed: () => collapsed, onToggleRow: vi.fn(), onSetSubtasksCollapsed: vi.fn(),
    onDrop: vi.fn(), onToggle: vi.fn(), onEdit: vi.fn(), onOpenSource: vi.fn(), onDragEnd: vi.fn(),
    onAddTask: vi.fn(() => true), onAddSubtask: vi.fn(() => true), onSetQuickFilters: vi.fn(),
    onBulkAction: vi.fn(async (tasks) => ({ tasks, message: 'Updated' })),
  };
  const draw = (m = initial) => renderBoard(root, m, host, { warnings: [], info: [] });
  const button = (name: string) => [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === name || b.getAttribute('aria-label') === name)!;
  draw(); return { root, host, draw, button };
}

describe('quick-filter context UI', () => {
  it('reveals matches through collapsed rows and branches without changing saved preferences', () => {
    const f = ui();
    expect(f.root.querySelector('.tt-filter-context-note')?.textContent).toContain('Matching subtask');
    expect(f.root.querySelector('.tt-subtask.tt-filter-match')?.textContent).toContain('Call contractor');
    expect(f.root.querySelector(`[data-id="${sibling.id}"]`)).toBeNull();
    f.button('Show 1 other subtask').click();
    expect(f.root.querySelector(`[data-id="${sibling.id}"]`)).not.toBeNull();
    f.button('Hide other subtasks').click();
    expect(f.root.querySelector(`[data-id="${sibling.id}"]`)).toBeNull();
    f.button('Hide subtasks (0 of 2 done)').click();
    expect(f.root.querySelector('.tt-subtasks')).toBeNull();
    f.button('Show subtasks (0 of 2 done)').click();
    expect(f.root.querySelector('.tt-subtasks')).not.toBeNull();
    expect(f.host.onToggleRow).not.toHaveBeenCalled();
    f.draw(model(family, [overdue], {}, []));
    expect(f.root.querySelector('.tt-subtasks')).toBeNull();
    expect(f.root.querySelector('.tt-card')).toBeNull(); // original row is still collapsed
    f.draw();
    expect(f.root.querySelector('.tt-subtasks')).not.toBeNull();
    expect(f.host.isCollapsed(subtasksKey(parent))).toBe(true);
  });

  it('renders nested matching paths and retains matching completed subtasks despite hide-completed', () => {
    const middle = task(3, 'Find contractor', parent);
    const deep = task(4, 'Call specialist 📅 2026-10-25', middle);
    const f = ui(model([...family, middle, deep]));
    expect(f.root.querySelector(`[data-id="${middle.id}"] [data-id="${deep.id}"]`)).not.toBeNull();
    const raw = '- [x] Finished 📅 2026-10-27 ✅ 2026-10-27';
    const done = { ...task(5, 'Finished', parent), ...parseTaskLine(raw)!, raw };
    f.draw(model([parent, done], [{ ...overdue, due: ['today'] }], { 'hide-completed-subtasks': true }));
    expect(f.root.querySelector(`[data-id="${done.id}"]`)).not.toBeNull();
  });

  it('shows ancestors outside the board as source links without edit/complete controls', () => {
    const p = task(0, 'Outside project');
    const c = task(1, 'Scoped call #work 📅 2026-10-26', p);
    const f = ui(model([p, c], [overdue], { 'include-tags': ['work'] }));
    const heading = f.root.querySelector('.tt-filter-ancestors')!;
    expect(heading.textContent).toBe('Outside project');
    expect(heading.querySelector('input')).toBeNull();
    f.button('Outside project').click();
    expect(f.host.onOpenSource).toHaveBeenCalledWith(p, false);
    expect(f.host.onEdit).not.toHaveBeenCalled();
  });

  it('excludes context parents from select-all, column selection, modifier-click and direct selection', () => {
    const direct = task(3, 'Direct match 📅 2026-10-26');
    const f = ui(model([...family, direct]));
    f.root.querySelector<HTMLElement>(`[data-id="${parent.id}"]`)!.dispatchEvent(new MouseEvent('click', { bubbles: true, metaKey: true }));
    expect(f.root.querySelector('.tt-bulk-bar')).toBeNull();
    expect(f.host.onEdit).not.toHaveBeenCalled();
    f.button('Select').click();
    expect(f.button('Select Paint kitchen').disabled).toBe(true);
    expect(f.root.querySelector('.tt-filter-match-summary')?.textContent).toContain('Call contractor');
    f.button('Select all 1 matching tasks').click();
    expect(f.root.querySelector('.tt-bulk-count')?.textContent).toBe('1 selected');
    f.button('Clear').click(); f.button('Select Doing column').click();
    expect(f.root.querySelector('.tt-bulk-count')?.textContent).toBe('0 selected');
  });

  it('keeps a selected task that became context-only after an edit, and lets it be unticked', async () => {
    const before = task(0, 'Paint kitchen 📅 2026-10-20 #tt/house/doing/10');
    const after = task(0, 'Paint kitchen 📅 2026-11-20 #tt/house/doing/10');
    const childOf = (p: BoardTask) => task(1, 'Call contractor 📅 2026-10-26', p);
    const f = ui(model([before, childOf(before)]));
    f.button('Select').click(); f.button('Select Paint kitchen').click();
    f.host.onBulkAction = vi.fn(async () => { f.draw(model([after, childOf(after)])); return { tasks: [after], message: '1 updated.' }; });
    f.button('Priority').click();
    await vi.waitFor(() => expect(f.root.querySelector('.tt-bulk-status')?.textContent).toBe('1 updated. 1 selected task now shows only for context.'));
    const check = f.button('Select Paint kitchen');
    expect(check.disabled).toBe(false); expect(check.getAttribute('aria-checked')).toBe('true');
    check.click();
    expect(f.root.querySelector('.tt-bulk-count')?.textContent).toBe('0 selected');
    expect(f.button('Select Paint kitchen').disabled).toBe(true);
  });

  it('selects a subtask shown as a card of its own, like any card', () => {
    const p = task(0, 'Outside project'), c = task(1, 'Scoped call #work 📅 2026-10-26', p);
    const f = ui(model([p, c], [overdue], { 'include-tags': ['work'] }));
    f.button('Select').click();
    expect(f.root.querySelector<HTMLButtonElement>(`[data-id="${c.id}"] .tt-select-card`)!.disabled).toBe(false);
    f.button('Select all 1 matching tasks').click();
    expect(f.root.querySelector('.tt-bulk-count')?.textContent).toBe('1 selected');
  });

  it('reveals matching descendant cards past cell limits', () => {
    const p = task(20, 'Last parent'), c = task(21, 'Important child ⏫', p);
    const earlier = Array.from({ length: 5 }, (_, i) => task(i, `Earlier ${i} ⏫`));
    const f = ui(model([...earlier, p, c], [{ id: 'late', name: 'High', priority: ['high'], 'match-subtasks': true }], { 'undated-column': 'backlog', 'limit-undated': true, 'undated-limit': 1 }));
    expect(f.root.querySelector(`[data-id="${c.id}"]`)).not.toBeNull();
  });
});
