import { describe, expect, it } from 'vitest';
import { applyEdit, buildBoard, columnOf, moveChoices, planDrop, quickMoveTarget, taskId, type BoardTask, type MoveChoice } from '../src/core/board.ts';
import { destinationFor, newBoardFrontmatter, parseBoardConfig, type BoardConfig } from '../src/core/boardConfig.ts';
import { startOfWeek } from '../src/core/dates.ts';
import { computeRows, rowForDue } from '../src/core/rows.ts';
import { planReorder } from '../src/core/sort.ts';
import { parseTaskLine, setClosedFallback } from '../src/core/taskLine.ts';

// Wednesday.
const TODAY = '2026-10-21';

function config(fm: Record<string, unknown> = {}): BoardConfig {
  return parseBoardConfig('House', { slug: 'house', ...fm }).config;
}

function task(raw: string, path = 'a.md', line = 0): BoardTask {
  return { ...parseTaskLine(raw)!, id: taskId(path, line), path, line, raw };
}

describe('parseBoardConfig', () => {
  it('fills defaults and derives column ids', () => {
    const { config: c, warnings, slugMissing } = parseBoardConfig('Renovation house', {
      columns: ['Backlog', 'In Progress', 'Done'],
    });
    expect(c.slug).toBe('renovation-house');
    expect(slugMissing).toBe(true);
    expect(c.columns).toEqual([
      { id: 'backlog', label: 'Backlog' },
      { id: 'in-progress', label: 'In Progress' },
      { id: 'done', label: 'Done' },
    ]);
    expect(c.doneColumn).toBe('done');
    expect(c).toMatchObject({
      dueNow: 7,
      dueNowUnit: 'days',
      weekHorizon: 2,
      weekStart: 1,
      showCompletedDays: 7,
      limitDone: true,
      doneLimit: 5,
    });
    expect(warnings).toEqual([]);
  });

  it('parses filters in list and mapping form', () => {
    expect(config({ 'filter-properties': ['context: renovation, house', 'project'] }).propertyFilters).toEqual([
      { key: 'context', values: ['renovation', 'house'] },
      { key: 'project', values: [] },
    ]);
    expect(config({ 'filter-properties': { context: ['renovation'] } }).propertyFilters).toEqual([
      { key: 'context', values: ['renovation'] },
    ]);
  });

  it('ignores quotes typed into the Properties editor, and unquoted YAML mappings', () => {
    expect(config({ 'filter-properties': ['"context: renovation, house"'] }).propertyFilters).toEqual([
      { key: 'context', values: ['renovation', 'house'] },
    ]);
    expect(config({ 'filter-properties': ["'context': 'renovation', \"house\""] }).propertyFilters).toEqual([
      { key: 'context', values: ['renovation', 'house'] },
    ]);
    expect(config({ 'filter-properties': [{ context: 'renovation, house' }] }).propertyFilters).toEqual([
      { key: 'context', values: ['renovation', 'house'] },
    ]);
  });

  it('warns about a done column that is not a column, and an empty one turns it off', () => {
    const r = parseBoardConfig('B', { columns: ['A', 'B'], 'done-column': 'Finished' });
    expect(r.config.doneColumn).toBeNull();
    expect(r.warnings).toHaveLength(1);
    expect(config({ 'done-column': '' }).doneColumn).toBeNull();
  });

  it('clamps numbers and reads week-start', () => {
    expect(config({ 'due-now': '-4', 'week-horizon': 99, 'week-start': 'Sunday' })).toMatchObject({
      dueNow: 0,
      weekHorizon: 52,
      weekStart: 0,
    });
  });
});

describe('new task destination', () => {
  const fallback = { kind: 'daily' as const, note: '', heading: '### 🚀 things I plan to accomplish' };

  it('uses the plugin default unless the board overrides it', () => {
    expect(destinationFor(config(), fallback)).toBe(fallback);
    expect(destinationFor(null, fallback)).toBe(fallback);
    expect(
      destinationFor(config({ 'new-tasks': 'note', 'new-tasks-note': 'Inbox.md', 'new-tasks-heading': '## Tasks' }), fallback),
    ).toEqual({ kind: 'note', note: 'Inbox.md', heading: '## Tasks' });
  });

  it('warns about an unknown destination', () => {
    const r = parseBoardConfig('B', { 'new-tasks': 'email' });
    expect(r.config.newTasks).toBe('default');
    expect(r.warnings).toHaveLength(1);
  });
});

describe('due now settings', () => {
  it('reads the old due-now-days key, booleans as text, and warns about a bad unit', () => {
    expect(config({ 'due-now-days': 4 })).toMatchObject({ dueNow: 4, dueNowUnit: 'days' });
    expect(config({ 'limit-done': 'false', 'done-limit': 3 })).toMatchObject({ limitDone: false, doneLimit: 3 });
    const r = parseBoardConfig('B', { 'due-now-unit': 'fortnights' });
    expect(r.config.dueNowUnit).toBe('days');
    expect(r.warnings).toHaveLength(1);
  });

  it('in weeks, runs to the end of this week, or later weeks', () => {
    const oneWeek = computeRows(config({ 'due-now': 1, 'due-now-unit': 'weeks' }), TODAY);
    expect(oneWeek[1]).toMatchObject({ id: 'now', to: '2026-10-25', dropDate: '2026-10-25' });
    expect(oneWeek[2]).toMatchObject({ id: 'week-2026-10-26', from: '2026-10-26', to: '2026-11-01' });
    const twoWeeks = computeRows(config({ 'due-now': 2, 'due-now-unit': 'weeks' }), TODAY);
    expect(twoWeeks[1]!.to).toBe('2026-11-01');
    const sundayStart = computeRows(config({ 'due-now': 1, 'due-now-unit': 'weeks', 'week-start': 'sunday' }), TODAY);
    expect(sundayStart[1]!.to).toBe('2026-10-24');
  });

  it('a week count of zero still means this week', () => {
    expect(config({ 'due-now': 0, 'due-now-unit': 'weeks' }).dueNow).toBe(1);
  });
});

describe('computeRows', () => {
  const rows = computeRows(config(), TODAY);

  it('lays out none, now, a partial first week, full weeks and later', () => {
    expect(rows[2]).toMatchObject({ label: 'Oct 29 – Nov 1', detail: 'Partial week' });
    expect(rows[3]).toMatchObject({ label: 'Week of Nov 2', detail: '' });
    expect(rows.map((r) => [r.id, r.from, r.to, r.dropDate])).toEqual([
      ['none', undefined, undefined, null],
      ['now', undefined, '2026-10-28', '2026-10-28'],
      ['week-2026-10-26', '2026-10-29', '2026-11-01', '2026-10-29'],
      ['week-2026-11-02', '2026-11-02', '2026-11-08', '2026-11-02'],
      ['later', '2026-11-09', undefined, '2026-11-09'],
    ]);
  });

  it('buckets due dates, overdue included in now', () => {
    expect(rowForDue(rows, undefined).id).toBe('none');
    expect(rowForDue(rows, '2025-01-01').id).toBe('now');
    expect(rowForDue(rows, '2026-10-28').id).toBe('now');
    expect(rowForDue(rows, '2026-10-29').id).toBe('week-2026-10-26');
    expect(rowForDue(rows, '2026-11-08').id).toBe('week-2026-11-02');
    expect(rowForDue(rows, '2026-11-09').id).toBe('later');
    expect(rowForDue(rows, '2027-06-01').id).toBe('later');
  });

  it('every drop date lands back in its own row', () => {
    for (const row of rows) expect(rowForDue(rows, row.dropDate ?? undefined).id).toBe(row.id);
  });

  it('starts later right after the window when there are no week rows', () => {
    const r = computeRows(config({ 'week-horizon': 0, 'due-now-days': 0 }), TODAY);
    expect(r.map((x) => x.id)).toEqual(['none', 'now', 'later']);
    expect(r[2]!.from).toBe('2026-10-22');
  });

  it('honours a Sunday week start', () => {
    expect(startOfWeek('2026-10-21', 0)).toBe('2026-10-18');
    const r = computeRows(config({ 'week-start': 'sunday', 'due-now-days': 4 }), TODAY);
    expect(r[2]).toMatchObject({ id: 'week-2026-10-25', from: '2026-10-26', to: '2026-10-31' });
  });
});

describe('columnOf', () => {
  const c = config();

  it('uses the board’s tag, falling back to the first column', () => {
    expect(columnOf(task('- [ ] a #tt/house/doing'), c)).toBe('doing');
    expect(columnOf(task('- [ ] a #tt/garden/doing'), c)).toBe('backlog');
    expect(columnOf(task('- [ ] a #tt/house/gone'), c)).toBe('backlog');
  });

  it('keeps Done in step with the checkbox', () => {
    expect(columnOf(task('- [x] a #tt/house/doing ✅ 2026-10-20'), c)).toBe('done');
    expect(columnOf(task('- [ ] a #tt/house/done'), c)).toBe('backlog');
  });
});

describe('buildBoard', () => {
  const fm = (path: string) => (path === 'house.md' ? { context: ['renovation'] } : { context: 'garden' });

  it('places, filters, hides old completed tasks and sorts', () => {
    const tasks = [
      task('- [ ] b 📅 2026-10-22 #tt/house/doing/200', 'house.md', 1),
      task('- [ ] a 📅 2026-10-25 #tt/house/doing/100', 'house.md', 2),
      task('- [ ] unnumbered 📅 2026-10-21 #tt/house/doing', 'house.md', 3),
      task('- [ ] garden task', 'garden.md', 1),
      task('- [x] old ✅ 2026-09-01', 'house.md', 4),
      task('- [x] recent 📅 2026-10-20 ✅ 2026-10-20', 'house.md', 5),
      task('- [ ] later ⏫ 📅 2027-03-01', 'house.md', 6),
    ];
    const model = buildBoard(tasks, config({ 'filter-properties': ['context: renovation'] }), TODAY, fm);
    expect(model.cells.now!.doing!.map((t) => t.text)).toEqual(['a', 'b', 'unnumbered']);
    expect(model.cells.now!.done!.map((t) => t.text)).toEqual(['recent']);
    expect(model.cells.later!.backlog!.map((t) => t.text)).toEqual(['later']);
    expect(model.total).toBe(5);
  });

  it('lists the Done column newest completed first, ignoring sort numbers', () => {
    const done = [
      task('- [x] older ✅ 2026-10-18 #tt/house/done/100', 'house.md', 1),
      task('- [x] newest ✅ 2026-10-21 #tt/house/done/300', 'house.md', 2),
      task('- [x] middle ✅ 2026-10-20 #tt/house/done/200', 'house.md', 3),
    ];
    const model = buildBoard(done, config(), TODAY, () => undefined);
    expect(model.cells.none!.done!.map((t) => t.text)).toEqual(['newest', 'middle', 'older']);
  });

  it('nests subtasks inside their parent card, whatever their own date or done date', () => {
    const sub = (raw: string, line: number, parentLine: number) => ({ ...task(raw, 'house.md', line), parentId: taskId('house.md', parentLine) });
    const tasks = [
      task('- [ ] parent 📅 2026-10-22 #tt/house/doing/100', 'house.md', 1),
      sub('\t- [ ] due later 📅 2026-12-01 #tt/house/waiting', 3, 1),
      sub('\t- [x] long done ✅ 2026-09-01', 2, 1),
      sub('\t\t- [ ] grandchild', 4, 3),
      task('- [x] old parent ✅ 2026-09-01', 'house.md', 5),
      sub('\t- [ ] orphan 📅 2026-10-23', 6, 5),
    ];
    const model = buildBoard(tasks, config(), TODAY, () => undefined);
    expect(model.cells.now!.doing!.map((t) => t.text)).toEqual(['parent']);
    expect(model.subtasks['house.md:1']!.map((t) => t.text)).toEqual(['long done', 'due later']);
    expect(model.subtasks['house.md:3']!.map((t) => t.text)).toEqual(['grandchild']);
    // A hidden parent leaves its open subtasks as cards of their own.
    expect(model.cells.now!.backlog!.map((t) => t.text)).toEqual(['orphan']);
    expect(model.rowOf['house.md:3']).toBeUndefined();
    expect(model.total).toBe(2);
  });
});

describe('planReorder', () => {
  const s = (n?: number) => ({ n });
  const sortOf = (x: { n?: number }) => x.n;

  it('takes the midpoint or appends', () => {
    const a = s(100);
    const b = s(200);
    const d = s();
    expect([...planReorder([a, b], d, 1, sortOf).values()]).toEqual([150]);
    expect([...planReorder([a, b], d, 2, sortOf).values()]).toEqual([300]);
    expect([...planReorder([a, b], d, 0, sortOf).values()]).toEqual([50]);
  });

  it('renumbers when there is no gap', () => {
    const a = s(100);
    const b = s(101);
    const d = s();
    const plan = planReorder([a, b], d, 1, sortOf);
    expect(plan.get(a)).toBeUndefined();
    expect(plan.get(d)).toBe(200);
    expect(plan.get(b)).toBe(300);
  });
});

describe('planDrop and applyEdit', () => {
  const c = config();
  const tasks = [
    task('- [ ] one 📅 2026-10-22 #tt/house/doing/100', 'a.md', 0),
    task('- [ ] two 📅 2026-10-23 #tt/house/doing/200', 'a.md', 1),
    task('- [ ] three', 'b.md', 0),
  ];
  const model = buildBoard(tasks, c, TODAY, () => undefined);
  const toggle = (line: string) => [setClosedFallback(line, !parseTaskLine(line)!.closed, TODAY)];

  it('moving between rows sets the drop date and the column tag', () => {
    const edits = planDrop(model, 'b.md:0', { rowId: 'week-2026-11-02', columnId: 'doing', index: 0 });
    expect(edits.get('b.md:0')).toEqual({ column: 'doing', sort: 100, due: '2026-11-02' });
    expect(applyEdit('- [ ] three', edits.get('b.md:0')!, 'house', toggle)).toEqual([
      '- [ ] three 📅 2026-11-02 #tt/house/doing/100',
    ]);
  });

  it('dropping into Due now sets the end of the window', () => {
    const edits = planDrop(model, 'b.md:0', { rowId: 'now', columnId: 'backlog', index: 0 });
    expect(edits.get('b.md:0')?.due).toBe('2026-10-28');
  });

  it('reordering within a row keeps the date', () => {
    const edits = planDrop(model, 'a.md:1', { rowId: 'now', columnId: 'doing', index: 0 });
    expect(edits.get('a.md:1')).toEqual({ column: 'doing', sort: 50 });
  });

  it('dropping into Done completes the task', () => {
    const edits = planDrop(model, 'a.md:0', { rowId: 'now', columnId: 'done', index: 0 });
    const edit = edits.get('a.md:0')!;
    expect(edit.closed).toBe(true);
    expect(applyEdit(tasks[0]!.raw, edit, 'house', toggle)).toEqual([
      '- [x] one 📅 2026-10-22 ✅ 2026-10-21 #tt/house/done',
    ]);
  });

  it('dropping into Done leaves the other completed tasks alone', () => {
    const m = buildBoard(
      [
        task('- [x] paid bill ✅ 2026-10-20', 'finance.md', 3),
        task('- [x] fixed sink ✅ 2026-10-19', 'house.md', 7),
        task('- [ ] mow lawn', 'house.md', 9),
      ],
      c,
      TODAY,
      () => undefined,
    );
    const edits = planDrop(m, 'house.md:9', { rowId: 'none', columnId: 'done', index: 2 });
    expect([...edits]).toEqual([['house.md:9', { column: 'done', closed: true }]]);
  });

  it('a recurring task’s next occurrence keeps its old column', () => {
    const recurringToggle = (line: string) => [line.replace('📅 2026-10-22', '📅 2026-10-29'), setClosedFallback(line, true, TODAY)];
    const lines = applyEdit(tasks[0]!.raw, { column: 'done', sort: 100, closed: true }, 'house', recurringToggle);
    expect(lines).toEqual([
      '- [ ] one 📅 2026-10-29 #tt/house/doing/100',
      '- [x] one 📅 2026-10-22 ✅ 2026-10-21 #tt/house/done/100',
    ]);
  });

  it('dragging out of Done reopens the task', () => {
    const done = task('- [x] fin 📅 2026-10-22 ✅ 2026-10-21 #tt/house/done/100', 'c.md', 0);
    const m = buildBoard([done], c, TODAY, () => undefined);
    const edit = planDrop(m, 'c.md:0', { rowId: 'now', columnId: 'doing', index: 0 }).get('c.md:0')!;
    expect(edit.closed).toBe(false);
    expect(applyEdit(done.raw, edit, 'house', toggle)).toEqual(['- [ ] fin 📅 2026-10-22 #tt/house/doing/100']);
  });

  it('dropping into No due date removes the date', () => {
    const edit = planDrop(model, 'a.md:0', { rowId: 'none', columnId: 'doing', index: 0 }).get('a.md:0')!;
    expect(edit.due).toBeNull();
    expect(applyEdit(tasks[0]!.raw, edit, 'house', toggle)).toEqual(['- [ ] one #tt/house/doing/100']);
  });
});

describe('quickMoveTarget', () => {
  const c = config();
  const later = task('- [ ] later 📅 2026-11-04 #tt/house/doing/100', 'a.md', 2);
  const tasks = [
    task('- [ ] one 📅 2026-10-22 #tt/house/doing/100', 'a.md', 0),
    task('- [ ] two 📅 2026-10-23 #tt/house/doing/200', 'a.md', 1),
    later,
    task('- [ ] three', 'b.md', 0),
    task('- [x] fin 📅 2026-10-22 ✅ 2026-10-21 #tt/house/done/100', 'c.md', 0),
  ];
  const model = buildBoard(tasks, c, TODAY, () => undefined);

  it('sends Due now to the next row, at the end of the same column', () => {
    expect(quickMoveTarget(model, tasks[0]!)).toEqual({ rowId: 'week-2026-10-26', columnId: 'doing', index: 0 });
    expect(planDrop(model, 'a.md:0', quickMoveTarget(model, tasks[0]!)!).get('a.md:0')?.due).toBe('2026-10-29');
  });

  it('sends every other row to Due now, behind the cards already there', () => {
    expect(quickMoveTarget(model, later)).toEqual({ rowId: 'now', columnId: 'doing', index: 2 });
    expect(planDrop(model, later.id, quickMoveTarget(model, later)!).get(later.id)).toEqual({ column: 'doing', sort: 300, due: '2026-10-28' });
    expect(quickMoveTarget(model, tasks[3]!)?.rowId).toBe('now');
  });

  it('leaves completed cards alone', () => {
    expect(quickMoveTarget(model, tasks[4]!)).toBeNull();
  });
});

describe('moveChoices', () => {
  const c = config({ 'week-horizon': 2 });
  const tasks = [
    task('- [ ] one 📅 2026-10-22 #tt/house/doing/100', 'a.md', 0),
    task('- [ ] two 📅 2026-10-23 #tt/house/backlog/100', 'a.md', 1),
    task('- [ ] undated #tt/house/doing/200', 'a.md', 2),
    task('- [x] fin 📅 2026-10-22 ✅ 2026-10-21 #tt/house/done/100', 'c.md', 0),
  ];
  const model = buildBoard(tasks, c, TODAY, () => undefined);
  const brief = (choices: MoveChoice[]) => choices.map((m) => [m.label, m.detail, m.target, m.current]);

  it('lists every column in the card’s row and every row in its column, each at the end of the cell', () => {
    const choices = moveChoices(model, tasks[0]!)!;
    expect(brief(choices.columns)).toEqual([
      ['Backlog', '', { rowId: 'now', columnId: 'backlog', index: 1 }, false],
      ['Doing', '', { rowId: 'now', columnId: 'doing', index: 1 }, true],
      ['Waiting', '', { rowId: 'now', columnId: 'waiting', index: 0 }, false],
      ['Done', 'completes it', { rowId: 'now', columnId: 'done', index: 1 }, false],
    ]);
    expect(brief(choices.rows)).toEqual([
      ['No due date', 'removes the due date', { rowId: 'none', columnId: 'doing', index: 1 }, false],
      ['Due now', '', { rowId: 'now', columnId: 'doing', index: 1 }, true],
      ['Oct 29 – Nov 1', 'due Oct 29', { rowId: 'week-2026-10-26', columnId: 'doing', index: 0 }, false],
      ['Week of Nov 2', 'due Nov 2', { rowId: 'week-2026-11-02', columnId: 'doing', index: 0 }, false],
      ['Later', 'due Nov 9', { rowId: 'later', columnId: 'doing', index: 0 }, false],
    ]);
  });

  it('applies through planDrop like a drag to the end of the cell', () => {
    const toBacklog = moveChoices(model, tasks[0]!)!.columns[0]!;
    expect(planDrop(model, 'a.md:0', toBacklog.target).get('a.md:0')).toEqual({ column: 'backlog', sort: 200 });
    const deferred = moveChoices(model, tasks[2]!)!.rows.find((r) => r.label === 'Later')!;
    expect(planDrop(model, 'a.md:2', deferred.target).get('a.md:2')).toEqual({ column: 'doing', sort: 100, due: '2026-11-09' });
  });

  it('leaves completed cards alone', () => {
    expect(moveChoices(model, tasks[3]!)).toBeNull();
  });

  describe('with a No due date column', () => {
    const u = config({ columns: ['Someday', 'Backlog', 'Doing', 'Done'], 'undated-column': 'Someday', 'week-horizon': 1 });
    const idea = task('- [ ] idea #tt/house/doing/100', 'a.md', 0);
    const dated = task('- [ ] dated 📅 2026-10-22 #tt/house/backlog/100', 'a.md', 1);
    const m = buildBoard([idea, dated], u, TODAY, () => undefined);

    it('lists the column (row "none") in place of the No due date row', () => {
      const choices = moveChoices(m, dated)!;
      expect(choices.columns[0]).toEqual({ label: 'Someday', detail: 'removes the due date', target: { rowId: 'none', columnId: 'someday', index: 1 }, current: false });
      expect(choices.rows.map((r) => r.target.rowId)).toEqual(['now', 'week-2026-10-26', 'later']);
      expect(planDrop(m, dated.id, choices.columns[0]!.target).get(dated.id)).toMatchObject({ column: 'backlog', due: null });
    });

    it('sends a card leaving it to Due now in the chosen column, or its tagged column for a row', () => {
      const choices = moveChoices(m, idea)!;
      expect(brief(choices.columns)).toEqual([
        ['Someday', '', { rowId: 'none', columnId: 'someday', index: 1 }, true],
        ['Backlog', 'due Oct 28', { rowId: 'now', columnId: 'backlog', index: 1 }, false],
        ['Doing', 'due Oct 28', { rowId: 'now', columnId: 'doing', index: 0 }, false],
        ['Done', 'completes it', { rowId: 'now', columnId: 'done', index: 0 }, false],
      ]);
      expect(choices.rows.map((r) => [r.label, r.target.columnId, r.current])).toEqual([
        ['Due now', 'doing', false],
        ['Oct 29 – Nov 1', 'doing', false],
        ['Later', 'doing', false],
      ]);
    });
  });
});

describe('No due date column', () => {
  const c = config({ columns: ['Someday', 'Backlog', 'Doing', 'Done'], 'undated-column': 'Someday' });
  const tasks = [
    task('- [ ] idea #tt/house/doing/100', 'a.md', 0),
    task('- [ ] dated 📅 2026-10-22', 'a.md', 1),
    task('- [ ] given a date 📅 2026-10-23 #tt/house/someday/100', 'a.md', 2),
    task('- [x] finished ✅ 2026-10-20', 'a.md', 3),
  ];
  const model = buildBoard(tasks, c, TODAY, () => undefined);

  it('reads the setting and refuses one that would leave no other column', () => {
    expect(c.undatedColumn).toBe('someday');
    const same = parseBoardConfig('House', { columns: ['A', 'Done'], 'done-column': 'Done', 'undated-column': 'Done' });
    expect(same.config.undatedColumn).toBeNull();
    expect(same.warnings).toEqual(['undated-column and done-column are the same column; ignoring undated-column.']);
    const alone = parseBoardConfig('House', { columns: ['A', 'Done'], 'undated-column': 'A' });
    expect(alone.config.undatedColumn).toBeNull();
  });

  it('holds undated open tasks whatever their tag; dated ones skip it for the first other column', () => {
    expect(model.cells.none!.someday!.map((t) => t.text)).toEqual(['idea']);
    expect(model.cells.now!.backlog!.map((t) => t.text)).toEqual(['given a date', 'dated']);
    // Completed undated tasks have no row of their own, so they sit in Done in Due now.
    expect(model.cells.now!.done!.map((t) => t.text)).toEqual(['finished']);
  });

  it('dropping in removes the date; dropping out sets one, except completing in Due now', () => {
    expect(planDrop(model, 'a.md:1', { rowId: 'none', columnId: 'someday', index: 0 }).get('a.md:1')).toMatchObject({ column: 'backlog', due: null });
    expect(planDrop(model, 'a.md:0', { rowId: 'now', columnId: 'doing', index: 0 }).get('a.md:0')).toMatchObject({ column: 'doing', due: '2026-10-28' });
    const completed = planDrop(model, 'a.md:0', { rowId: 'now', columnId: 'done', index: 0 }).get('a.md:0')!;
    expect(completed.closed).toBe(true);
    expect(completed.due).toBeUndefined();
    expect(planDrop(model, 'a.md:3', { rowId: 'now', columnId: 'backlog', index: 0 }).get('a.md:3')).toMatchObject({ closed: false, due: '2026-10-28' });
  });

  it('the move button sends an undated card to Due now in its tagged column', () => {
    expect(quickMoveTarget(model, tasks[0]!)).toEqual({ rowId: 'now', columnId: 'doing', index: 0 });
  });

  it('renumbering the column keeps the columns its cards remember', () => {
    const m = buildBoard(
      [
        task('- [ ] idea #tt/house/doing/100', 'a.md', 0),
        task('- [ ] other #tt/house/backlog/101', 'a.md', 1),
        task('- [ ] dated 📅 2026-10-22', 'a.md', 2),
      ],
      c,
      TODAY,
      () => undefined,
    );
    // No gap between 100 and 101, so the cards after the drop are renumbered.
    const edits = planDrop(m, 'a.md:2', { rowId: 'none', columnId: 'someday', index: 1 });
    expect(edits.get('a.md:1')).toEqual({ column: 'backlog', sort: 300 });
    expect(edits.get('a.md:2')).toMatchObject({ column: 'backlog', sort: 200, due: null });
  });

  it('a card dropped in keeps its column in its tag, and its arrow takes it back there', () => {
    const doing = task('- [ ] tile the floor 📅 2026-10-22 #tt/house/doing/100', 'b.md', 0);
    const edit = planDrop(buildBoard([doing], c, TODAY, () => undefined), 'b.md:0', { rowId: 'none', columnId: 'someday', index: 0 }).get('b.md:0')!;
    expect(edit).toEqual({ column: 'doing', sort: 100, due: null });
    const moved = task(applyEdit(doing.raw, edit, 'house', (l) => [l])[0]!, 'b.md', 0);
    const after = buildBoard([moved], c, TODAY, () => undefined);
    expect(after.cells.none!.someday!.map((t) => t.text)).toEqual(['tile the floor']);
    expect(quickMoveTarget(after, moved)).toMatchObject({ rowId: 'now', columnId: 'doing' });
  });
});


it('starts new boards with two future weeks without changing explicit saved horizons', () => {
  expect(newBoardFrontmatter('house')['week-horizon']).toBe(2);
  expect(config().weekHorizon).toBe(2);
  expect(config({ 'week-horizon': 6 }).weekHorizon).toBe(6);
  expect(config({ 'week-horizon': 0 }).weekHorizon).toBe(0);
});
