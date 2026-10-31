import { describe, expect, it } from 'vitest';
import { buildBoard, taskId, type BoardModel, type BoardTask, type TaskEdit } from '../src/core/board.ts';
import { parseBoardConfig } from '../src/core/boardConfig.ts';
import { longestOrderedRun, planDueDateSort } from '../src/core/dueSort.ts';
import { parseTaskLine, setPlacement } from '../src/core/taskLine.ts';

const today = '2026-10-30';
const config = parseBoardConfig('House', { slug: 'house', columns: ['Backlog', 'Doing', 'Done'], 'done-column': 'Done', 'due-now': 7 }).config;

function board(lines: string[]): BoardModel {
  const tasks: BoardTask[] = lines.map((raw, line) => ({ ...parseTaskLine(raw)!, raw, path: 'House.md', line, id: taskId('House.md', line) }));
  return buildBoard(tasks, config, today, () => undefined);
}
function apply(lines: string[], edits: Map<string, TaskEdit>): string[] {
  return lines.map((raw, line) => {
    const edit = edits.get(taskId('House.md', line));
    return edit ? setPlacement(raw, 'house', edit.column!, edit.sort) : raw;
  });
}
const texts = (model: BoardModel, row: string, column: string) => (model.cells[row]?.[column] ?? []).map((t) => t.text);

describe('sorting by due date', () => {
  it('moves only the card out of place, past the numbered cards to where the date order puts it', () => {
    const lines = [
      '- [ ] Paint 📅 2026-11-05 #tt/house/backlog/100',
      '- [ ] Call roofer 📅 2026-11-01 #tt/house/backlog/200',
      '- [ ] Buy filters 📅 2026-11-03 #tt/house/backlog/300',
    ];
    const edits = planDueDateSort(board(lines));
    expect([...edits.keys()]).toEqual([taskId('House.md', 0)]);
    expect(texts(board(apply(lines, edits)), 'now', 'backlog')).toEqual(['Call roofer', 'Buy filters', 'Paint']);
  });

  it('slots a card into the gap between two numbered cards', () => {
    const lines = [
      '- [ ] Call roofer 📅 2026-11-01 #tt/house/doing/100',
      '- [ ] Buy filters 📅 2026-11-04 #tt/house/doing/200',
      '- [ ] Order lumber 📅 2026-11-02 #tt/house/doing/300',
      '- [ ] Paint 📅 2026-11-05 #tt/house/doing/400',
    ];
    const edits = planDueDateSort(board(lines));
    // Moving either Buy filters or Order lumber is one move; this planner moves Buy filters.
    expect(edits.size).toBe(1);
    const [id, moved] = [...edits][0]!;
    expect(id).toBe(taskId('House.md', 1));
    expect(moved!.column).toBe('doing'); expect(moved!.sort).toBeGreaterThan(300); expect(moved!.sort).toBeLessThan(400);
    expect(texts(board(apply(lines, edits)), 'now', 'doing')).toEqual(['Call roofer', 'Order lumber', 'Buy filters', 'Paint']);
  });

  it('leaves same-date cards, Done, the No due date row and other boards’ tags alone', () => {
    const lines = [
      '- [ ] Second 📅 2026-11-01 #tt/house/backlog/100',
      '- [ ] First 📅 2026-11-01 #tt/house/backlog/200',
      '- [x] Old ✅ 2026-10-29 📅 2026-11-04 #tt/house/done/100',
      '- [x] Older ✅ 2026-10-28 📅 2026-11-01 #tt/house/done/200',
      '- [ ] Someday #tt/house/backlog/300',
      '- [ ] Whenever #tt/house/backlog/100',
    ];
    expect(planDueDateSort(board(lines)).size).toBe(0);
  });

  it('sorts week rows and Later as well as Due now', () => {
    const lines = [
      '- [ ] Late in Later 📅 2027-03-01 #tt/house/backlog/100',
      '- [ ] Early in Later 📅 2027-01-15 #tt/house/backlog/200',
      '- [ ] Late next week 📅 2026-11-13 #tt/house/backlog/100',
      '- [ ] Early next week 📅 2026-11-10 #tt/house/backlog/200',
    ];
    const sorted = board(apply(lines, planDueDateSort(board(lines))));
    expect(texts(sorted, 'later', 'backlog')).toEqual(['Early in Later', 'Late in Later']);
    const week = sorted.rows.find((r) => r.kind === 'week' && texts(sorted, r.id, 'backlog').length)!;
    expect(texts(sorted, week.id, 'backlog')).toEqual(['Early next week', 'Late next week']);
  });

  it('numbers a cell afresh only when hand-edited numbers leave no room', () => {
    const lines = [
      '- [ ] A 📅 2026-11-01 #tt/house/backlog/1',
      '- [ ] B 📅 2026-11-03 #tt/house/backlog/2',
      '- [ ] C 📅 2026-11-02 #tt/house/backlog/3',
      '- [ ] D 📅 2026-11-04 #tt/house/backlog/4',
    ];
    const edits = planDueDateSort(board(lines));
    expect(texts(board(apply(lines, edits)), 'now', 'backlog')).toEqual(['A', 'C', 'B', 'D']);
  });

  it('always ends in date order, rewriting only cards outside the longest run already in order', () => {
    // A small deterministic generator, so a failure can be replayed.
    let seed = 7;
    const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    for (let round = 0; round < 400; round++) {
      const count = 1 + Math.floor(random() * 12);
      const lines = Array.from({ length: count }, (_, i) => {
        const date = random() < 0.15 ? '' : ` 📅 2026-11-0${1 + Math.floor(random() * 5)}`;
        const rank = random() < 0.25 ? '' : `/${random() < 0.1 ? 100 : (1 + Math.floor(random() * 40)) * 10}`;
        return `- [ ] T${i}${date} #tt/house/backlog${rank}`;
      });
      const before = board(lines);
      const shown = before.cells.now!.backlog!;
      const edits = planDueDateSort(before);
      const after = board(apply(lines, edits)).cells.now!.backlog!;
      const keys = after.map((t) => t.dueDate ?? '￿');
      expect(keys, lines.join('\n')).toEqual([...keys].sort());
      // Fewest moves: everything outside the kept run, unless numbers had to be redone.
      const outside = shown.length - longestOrderedRun(shown.map((t) => t.dueDate ?? '￿')).size;
      const renumbered = [...edits.values()].some((e) => e.sort !== undefined && e.sort % 100 === 0 && edits.size > outside);
      if (!renumbered) expect(edits.size, lines.join('\n')).toBeLessThanOrEqual(outside);
      // Same-date numbered cards keep their order.
      const numbered = (list: BoardTask[]) => list.filter((t) => t.placements.house?.sort !== undefined && !edits.has(t.id)).map((t) => t.text);
      const keptBefore = numbered(shown), keptAfter = after.map((t) => t.text).filter((t) => keptBefore.includes(t));
      expect(keptAfter, lines.join('\n')).toEqual(keptBefore);
    }
  });
});

describe('the longest run already in order', () => {
  it('counts equal keys as in order and finds a longest run', () => {
    expect([...longestOrderedRun(['5', '1', '3'])].sort()).toEqual([1, 2]);
    expect(longestOrderedRun(['1', '1', '1']).size).toBe(3);
    expect(longestOrderedRun(['3', '2', '1']).size).toBe(1);
    expect(longestOrderedRun([]).size).toBe(0);
    expect(longestOrderedRun(['1', '4', '2', '3', '5']).size).toBe(4);
  });
});
