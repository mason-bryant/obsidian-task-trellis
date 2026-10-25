import { describe, expect, it } from 'vitest';
import {
  dedupeFields,
  movePlacementsToEnd,
  parseTaskLine,
  removePlacement,
  setClosedFallback,
  setDueDate,
  setPlacement,
  slugify,
} from '../src/core/taskLine.ts';

describe('parseTaskLine', () => {
  it('reads Tasks emoji fields and placement tags', () => {
    const t = parseTaskLine(
      '- [ ] Paint the hallway ⏫ ➕ 2026-10-15 📅 2026-10-23 #tt/house/doing/300 #tt/garden/backlog',
    );
    expect(t).toMatchObject({
      status: ' ',
      closed: false,
      text: 'Paint the hallway',
      dueDate: '2026-10-23',
      createdDate: '2026-10-15',
      priority: 'high',
      placements: { house: { column: 'doing', sort: 300 }, garden: { column: 'backlog' } },
      tags: [],
    });
  });

  it('finds a due date anywhere in the line, as this vault writes them', () => {
    const t = parseTaskLine('- [ ] 📅 2026-10-23 Figure out paint colors ⏫ ➕ 2026-10-15 #sort/80');
    expect(t?.dueDate).toBe('2026-10-23');
    expect(t?.text).toBe('Figure out paint colors');
  });

  it('keeps ordinary tags in the text and the tag list', () => {
    const t = parseTaskLine('- [x] Order #house/kitchen tiles ✅ 2026-10-20 ^abc-1');
    expect(t).toMatchObject({
      closed: true,
      closedDate: '2026-10-20',
      text: 'Order #house/kitchen tiles',
      tags: ['house/kitchen'],
    });
  });

  it('strips recurrence, ids and dependencies from the text', () => {
    const t = parseTaskLine('- [ ] Water plants 🔁 every week on Monday 🆔 abc123 ⛔ def456,ghi789 📅 2026-10-26');
    expect(t?.text).toBe('Water plants');
  });

  it('treats cancelled tasks as closed, dated by ❌', () => {
    expect(parseTaskLine('- [-] Drop it ❌ 2026-10-01')).toMatchObject({ closed: true, closedDate: '2026-10-01' });
  });

  it('accepts other list markers, indentation and blockquotes', () => {
    expect(parseTaskLine('    * [ ] nested')?.text).toBe('nested');
    expect(parseTaskLine('1. [ ] numbered')?.text).toBe('numbered');
    expect(parseTaskLine('> - [ ] quoted')?.text).toBe('quoted');
  });

  it('ignores non-task lines and malformed placement tags', () => {
    expect(parseTaskLine('- plain item')).toBeNull();
    expect(parseTaskLine('- [ ] a #tt/house #tt/house/doing/12x')?.placements).toEqual({});
  });

  it('lower-cases board and column names', () => {
    expect(parseTaskLine('- [ ] a #tt/House/Doing/5')?.placements).toEqual({ house: { column: 'doing', sort: 5 } });
  });
});

describe('lines with repeated fields', () => {
  // Fields before the `--` were in the description as far as Tasks was concerned; it appended its own.
  const line =
    '- [/] Pick up paint samples (before noon) 🔺 ➕ 2026-10-19 📅 2026-10-19 -- https://example.com/swatches#96dc ⏫ 📅 2026-10-22 #tt/renovation/backlog/1250';

  it('reads the last due date and priority, as Tasks does', () => {
    expect(parseTaskLine(line)).toMatchObject({
      dueDate: '2026-10-22',
      priority: 'high',
      text: 'Pick up paint samples (before noon) -- https://example.com/swatches#96dc',
    });
  });

  it('sets the due date on the last copy and drops the stale one', () => {
    expect(setDueDate(line, '2026-10-30')).toBe(
      '- [/] Pick up paint samples (before noon) 🔺 ➕ 2026-10-19 -- https://example.com/swatches#96dc ⏫ 📅 2026-10-30 #tt/renovation/backlog/1250',
    );
    expect(setDueDate(line, null)).toBe(
      '- [/] Pick up paint samples (before noon) 🔺 ➕ 2026-10-19 -- https://example.com/swatches#96dc ⏫ #tt/renovation/backlog/1250',
    );
  });

  it('dedupes every single-valued field, keeping the last', () => {
    expect(dedupeFields(line)).toBe(
      '- [/] Pick up paint samples (before noon) ➕ 2026-10-19 -- https://example.com/swatches#96dc ⏫ 📅 2026-10-22 #tt/renovation/backlog/1250',
    );
    expect(dedupeFields('- [ ] plain 📅 2026-10-22')).toBe('- [ ] plain 📅 2026-10-22');
  });
});

describe('setDueDate', () => {
  it('replaces the date in place', () => {
    expect(setDueDate('- [ ] 📅 2026-10-23 Figure out ⏫', '2026-11-02')).toBe('- [ ] 📅 2026-11-02 Figure out ⏫');
  });

  it('adds a date before trailing placement tags and block id', () => {
    expect(setDueDate('- [ ] Task ⏫ #tt/house/doing/100 ^id1', '2026-11-02')).toBe(
      '- [ ] Task ⏫ 📅 2026-11-02 #tt/house/doing/100 ^id1',
    );
    expect(setDueDate('- [ ] Task', '2026-11-02')).toBe('- [ ] Task 📅 2026-11-02');
  });

  it('removes the date', () => {
    expect(setDueDate('- [ ] Task 📅 2026-10-23 #tt/house/doing', null)).toBe('- [ ] Task #tt/house/doing');
    expect(setDueDate('- [ ] 📅 2026-10-23 Figure out', null)).toBe('- [ ] Figure out');
  });

  it('leaves a line without a date alone when removing', () => {
    expect(setDueDate('- [ ] Task', null)).toBe('- [ ] Task');
  });
});

describe('placement tags', () => {
  it('replaces only this board’s tag and puts it last', () => {
    expect(setPlacement('- [ ] T #tt/house/backlog/100 #tt/garden/doing/5', 'house', 'doing', 250)).toBe(
      '- [ ] T #tt/garden/doing/5 #tt/house/doing/250',
    );
  });

  it('writes a tag without a sort number', () => {
    expect(setPlacement('- [ ] T ^blk', 'house', 'doing')).toBe('- [ ] T #tt/house/doing ^blk');
  });

  it('removes a board’s tag from the middle of a line', () => {
    expect(removePlacement('- [ ] T #tt/house/doing more', 'house')).toBe('- [ ] T more');
  });

  it('moves placement tags back to the end after an edit', () => {
    expect(movePlacementsToEnd('- [ ] T #tt/house/doing/100 text 📅 2026-10-23 ^b')).toBe(
      '- [ ] T text 📅 2026-10-23 #tt/house/doing/100 ^b',
    );
    expect(movePlacementsToEnd('- [ ] T 📅 2026-10-23')).toBe('- [ ] T 📅 2026-10-23');
  });
});

describe('setClosedFallback', () => {
  it('completes with a done date before trailing tags', () => {
    expect(setClosedFallback('- [ ] T #tt/house/doing/100', true, '2026-10-21')).toBe(
      '- [x] T ✅ 2026-10-21 #tt/house/doing/100',
    );
  });

  it('reopens and drops the done date', () => {
    expect(setClosedFallback('- [x] T ✅ 2026-10-21 #tt/house/done', false, '2026-10-22')).toBe('- [ ] T #tt/house/done');
  });
});

describe('slugify', () => {
  it('makes names tag-safe', () => {
    expect(slugify('  In Progress! ')).toBe('in-progress');
    expect(slugify('Garden shed')).toBe('garden-shed');
    expect(slugify('Próximo')).toBe('próximo');
  });
});

it('moves legacy shortcut markers ahead of metadata when editing placements', () => {
  const line = '- [ ] Capture 📅 2026-10-30 <!-- task-trellis-request:abc123 --> #tt/home/backlog';
  const result = movePlacementsToEnd(line);
  expect(result).toBe('- [ ] <!-- task-trellis-request:abc123 --> Capture 📅 2026-10-30 #tt/home/backlog');
  expect(parseTaskLine(result)?.dueDate).toBe('2026-10-30');
  expect(parseTaskLine(result)?.text).toBe('Capture');
});
