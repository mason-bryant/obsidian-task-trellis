import { describe, expect, it } from 'vitest';
import { parseShortcutTask, shortcutColumn, shortcutURL } from '../src/core/shortcut.ts';
import { parseBoardConfig } from '../src/core/boardConfig.ts';
import { parseTaskLine } from '../src/core/taskLine.ts';

const input = { board: 'personal-projects', text: 'Call supplier' };

describe('shortcut inputs', () => {
  it('defaults to no date, no column override, and leaving the current view alone', () => {
    expect(parseShortcutTask(input)).toMatchObject({ ...input, due: null, openBoard: false });
  });
  it('accepts a real date, a column label, and an optional retry ID', () => {
    expect(parseShortcutTask({ ...input, due: '2028-02-29', column: 'In Progress', 'open-board': 'true', 'request-id': '123_abc-456' }))
      .toMatchObject({ due: '2028-02-29', column: 'In Progress', openBoard: true, requestId: '123_abc-456' });
  });
  it.each(['2026-02-29', '2026-02-30', '2026-13-01', '2026-00-10', '2026-10-00', 'tomorrow', '2026-1-1', '2026-10-24T00:00:00Z'])('rejects invalid date %s', due => {
    expect(() => parseShortcutTask({ ...input, due })).toThrow('valid due date');
  });
  it.each([
    { board: '', text: 'Task' }, { board: 'house', text: '  ' },
    { ...input, 'open-board': 'yes' }, { ...input, 'request-id': 'bad --> ID' },
    { ...input, 'request-id': '' },
  ])('rejects missing or malformed parameters', params => {
    expect(() => parseShortcutTask(params)).toThrow();
  });
  it('URL-encodes values exactly once, including reserved characters and Unicode', () => {
    const url = new URL(shortcutURL('Mason & family', 'Boards/Café #1.md'));
    expect(url.searchParams.get('vault')).toBe('Mason & family');
    expect(url.searchParams.get('board')).toBe('Boards/Café #1.md');
    const text = '50% + tea & coffee #home?';
    expect(parseShortcutTask({ ...input, text }).text).toBe(text);
  });
});

describe('shortcut column selection', () => {
  const config = parseBoardConfig('House', { columns: ['Doing', 'Backlog', 'No date', 'Done'], 'undated-column': 'No date' }).config;
  it('prefers Backlog even when it is not the first column', () => {
    expect(shortcutColumn(config, undefined, null)).toBe('backlog');
  });
  it('falls back to the first ordinary workflow column when there is no Backlog', () => {
    expect(shortcutColumn({ ...config, columns: config.columns.filter(c => c.id !== 'backlog') }, undefined, null)).toBe('doing');
  });
  it('accepts labels and IDs and preserves a workflow column for an undated task', () => {
    expect(shortcutColumn(config, 'Doing', null)).toBe('doing');
    expect(shortcutColumn(config, 'doing', '2026-10-25')).toBe('doing');
    expect(shortcutColumn(config, 'No date', null)).toBe('backlog');
  });
  it('rejects unsupported or conflicting placements', () => {
    expect(() => shortcutColumn(config, 'Missing', null)).toThrow('Unknown');
    expect(() => shortcutColumn(config, 'Done', null)).toThrow('New tasks');
    expect(() => shortcutColumn(config, 'No date', '2026-10-25')).toThrow('cannot');
  });
  it('keeps retry markers out of the displayed task title', () => {
    const task = parseTaskLine('- [ ] Buy milk #tt/house/backlog <!-- task-trellis-request:abc_123 -->')!;
    expect(task.text).toBe('Buy milk');
    expect(task.placements.house?.column).toBe('backlog');
  });
});
