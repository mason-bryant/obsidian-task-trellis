import { describe, expect, it, vi } from 'vitest';
import { defaultLabels, newLabelId, labelDescription, labelTextColor, normalizeLabelColor, parseLabels, setTaskLabels, taskLabels } from '../src/core/labels.ts';
import { newBoardFrontmatter, parseBoardConfig } from '../src/core/boardConfig.ts';
import { dedupeFields, movePlacementsToEnd, parseTaskLine, setClosedFallback, setDueDate, setPlacement } from '../src/core/taskLine.ts';

const raw = '- [ ] Paint the kitchen #house 🔁 every week 📅 2026-10-25 #tt/home/doing/100 ^task-id';

describe('board labels', () => {
  it('gives new and existing boards independent copies of six unnamed defaults', () => {
    const a = parseBoardConfig('Home', newBoardFrontmatter('home')).config;
    const b = parseBoardConfig('Work', {}).config;
    expect(a.labels).toEqual(defaultLabels());
    expect(b.labels).toEqual(a.labels);
    a.labels[0]!.name = 'Financial planning';
    expect(b.labels.every((l) => l.name === '')).toBe(true);
    expect(parseBoardConfig('Blank', { labels: [] }).config.labels).toEqual([]);
  });

  it('normalizes hex and safely ignores malformed or duplicate definitions', () => {
    const warnings: string[] = [];
    expect(parseLabels([
      { id: 'urgent', name: ' Urgent ', color: '#F00' },
      { id: 'urgent', name: 'Duplicate', color: '#ffffff' },
      null, 'red', { id: 'bad', name: 'CSS', color: 'url(https://example.com)' },
    ], warnings)).toEqual([{ id: 'urgent', name: 'Urgent', color: '#ff0000' }]);
    expect(warnings).toHaveLength(4);
    expect(normalizeLabelColor('#AAbbCC')).toBe('#aabbcc');
    expect(normalizeLabelColor('#abcd')).toBeNull();
  });

  it('describes colors and picks readable text for custom swatches', () => {
    const red = defaultLabels().find((l) => l.id === 'red')!;
    expect(labelDescription({ ...red, name: 'Urgent' })).toBe('Red: Urgent');
    expect(labelDescription(red)).toBe('Red');
    expect(labelDescription({ ...red, color: '#abcdef', name: 'Custom' })).toBe('#ABCDEF: Custom');
    expect(labelTextColor('#ffffff')).toBe('#000000');
    expect(labelTextColor('#000000')).toBe('#ffffff');
  });
});

describe('task label persistence', () => {
  it('keeps assignments independent per board and removes only the chosen labels', () => {
    const both = setTaskLabels(setTaskLabels(raw, 'home', ['red', 'yellow', 'red']), 'work', ['blue']);
    expect(taskLabels(both, 'home')).toEqual(['red', 'yellow']);
    expect(taskLabels(both, 'work')).toEqual(['blue']);
    expect(parseTaskLine(both)).toEqual({ ...parseTaskLine(raw), tags: ['house', 'tt/work/label/blue', 'tt/home/label/red', 'tt/home/label/yellow'] });
    const one = setTaskLabels(both, 'home', []);
    expect(taskLabels(one, 'home')).toEqual([]);
    expect(taskLabels(one, 'work')).toEqual(['blue']);
    expect(setTaskLabels(one, 'work', [])).toBe(raw);
  });

  it('retains assignments through due dates, placement, completion and field normalization', () => {
    let line = setTaskLabels(raw, 'home', ['red', 'yellow']);
    line = setPlacement(line, 'home', 'waiting', 250);
    line = setDueDate(line, '2026-11-01');
    line = setClosedFallback(line, true, '2026-10-24');
    line = movePlacementsToEnd(dedupeFields(line));
    expect(taskLabels(line, 'home')).toEqual(['red', 'yellow']);
    expect(parseTaskLine(line)).toMatchObject({ closed: true, dueDate: '2026-11-01', placements: { home: { column: 'waiting', sort: 250 } } });
    expect(line.endsWith('^task-id')).toBe(true);
    expect(line).toContain('🔁 every week');
  });

  it('exposes label tags to filters while keeping card titles clean', () => {
    const line = setTaskLabels('- [ ] Invoice #finance <!-- task-trellis-request:123 -->', 'board', ['red']);
    expect(parseTaskLine(line)).toMatchObject({ text: 'Invoice #finance', tags: ['finance', 'tt/board/label/red'] });
  });

  it('retains indentation, blockquotes and alternate Markdown checkboxes', () => {
    const line = '\t> 1. [-] Cancelled 📅 2026-10-25 ^id';
    expect(setTaskLabels(setTaskLabels(line, 'café', ['red']), 'café', [])).toBe(line);
  });

  it('does not allow metadata injection through ids', () => {
    expect(() => setTaskLabels(raw, 'board', ['x --> bad'])).toThrow();
    expect(() => setTaskLabels(raw, 'board:bad', ['red'])).toThrow();
  });
});


describe('label tags', () => {
  it('reads legacy assignments and converts them on a selection write', () => {
    const old = '- [ ] <!-- tt-labels:home:red --> Invoice 📅 2026-10-25 #tt/home/doing/100 ^id';
    expect(taskLabels(old, 'home')).toEqual(['red']);
    const migrated = setTaskLabels(old, 'home', ['red']);
    expect(migrated).toBe('- [ ] Invoice 📅 2026-10-25 #tt/home/label/red #tt/home/doing/100 ^id');
    expect(setTaskLabels(migrated, 'home', ['red'])).toBe(migrated);
    expect(parseTaskLine(old)?.text).toBe('Invoice');
  });

  it('keeps numeric label ids separate from placement tags', () => {
    const line = setTaskLabels(raw, 'home', ['123']);
    expect(parseTaskLine(line)?.placements).toEqual({ home: { column: 'doing', sort: 100 } });
    expect(taskLabels(setPlacement(line, 'home', 'waiting', 25), 'home')).toEqual(['123']);
  });

  it('recognizes case and punctuation without consuming longer nested tags', () => {
    const line = '- [ ] Test #TT/HOME/LABEL/RED, #tt/home/label/red/child #tt/home/doing/100';
    expect(taskLabels(line, 'home')).toEqual(['red']);
    expect(parseTaskLine(line)?.placements).toEqual({ home: { column: 'doing', sort: 100 } });
    expect(setTaskLabels(line, 'home', [])).toContain('#tt/home/label/red/child');
  });

  it('keeps long label names out of tags and preserves assignments through name/color edits', () => {
    const labels = defaultLabels();
    const id = newLabelId(labels);
    expect(id).toMatch(/^l[a-f0-9]{6}$/);
    labels.push({ id, name: 'A very long label name '.repeat(20), color: '#ffffff' });
    const line = setTaskLabels(raw, 'home', [id]);
    expect(line).toContain(`#tt/home/label/${id}`);
    labels[6]!.name = 'Renamed'; labels[6]!.color = '#000000';
    expect(taskLabels(line, 'home')).toEqual([labels[6]!.id]);
    expect(line).not.toContain('long label');
  });
});


it('retries a short id collision within the board', () => {
  const random = vi.spyOn(crypto, 'randomUUID')
    .mockReturnValueOnce('aaaaaa00-0000-0000-0000-000000000000')
    .mockReturnValueOnce('bbbbbb00-0000-0000-0000-000000000000');
  try {
    expect(newLabelId([{ id: 'laaaaaa', name: '', color: '#ffffff' }])).toBe('lbbbbbb');
  } finally { random.mockRestore(); }
});

it('warns when a manually configured column conflicts with the label namespace', () => {
  const parsed = parseBoardConfig('Home', { columns: ['Backlog', 'Label', 'Doing'] });
  expect(parsed.config.columns.map((c) => c.id)).toEqual(['backlog', 'doing']);
  expect(parsed.warnings).toContain('"Label" is reserved for label tags. Rename this column.');
});
