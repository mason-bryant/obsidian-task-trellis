import { describe, expect, it } from 'vitest';
import {
  dateOption, flagOption, jsonListOption, listOption, plainText, positionIndex, positionOption, priorityOption,
  resolveColumn, resolveLabels,
} from '../src/core/cli.ts';
import { parseBoardConfig } from '../src/core/boardConfig.ts';
import { applyEdit, taskId, type BoardTask } from '../src/core/board.ts';
import { parseTaskLine, replaceTaskText } from '../src/core/taskLine.ts';
import { insertUnderHeadingAt } from '../src/core/newTask.ts';
import { insertSubtaskAt } from '../src/core/subtasks.ts';

const config = parseBoardConfig('Home', {
  slug: 'home', columns: ['Backlog', 'In Progress', 'Done'],
  labels: [{ id: '1', name: 'Urgent', color: '#e5484d' }, { id: '2', name: 'Paint kitchen', color: '#3e9b4f' }],
}).config;

function card(line: number, raw: string): BoardTask {
  return { ...parseTaskLine(raw)!, id: taskId('a.md', line), path: 'a.md', line, raw };
}

describe('CLI options', () => {
  it('reads bare flags, true and false', () => {
    expect(flagOption({ 'dry-run': 'true' }, 'dry-run')).toBe(true);
    expect(flagOption({}, 'dry-run')).toBe(false);
    expect(flagOption({}, 'done', true)).toBe(true);
    expect(flagOption({ done: 'false' }, 'done', true)).toBe(false);
    expect(() => flagOption({ done: 'yes' }, 'done')).toThrow('true or false');
  });

  it('validates dates and priorities, with none clearing them', () => {
    expect(dateOption({ due: '2026-11-08' }, 'due')).toBe('2026-11-08');
    expect(dateOption({ due: 'none' }, 'due')).toBeNull();
    expect(dateOption({ due: '' }, 'due')).toBeNull();
    expect(dateOption({}, 'due')).toBeUndefined();
    expect(() => dateOption({ due: '2026-02-30' }, 'due')).toThrow('YYYY-MM-DD');
    expect(priorityOption({ priority: 'High' }, 'priority')).toBe('high');
    expect(priorityOption({ priority: 'none' }, 'priority')).toBeNull();
    expect(() => priorityOption({ priority: 'urgent' }, 'priority')).toThrow('highest, high');
  });

  it('splits lists and parses JSON subtask lists', () => {
    expect(listOption({ labels: '1, 2,,' }, 'labels')).toEqual(['1', '2']);
    expect(listOption({ labels: '' }, 'labels')).toEqual([]);
    expect(jsonListOption({ subtasks: '["Buy paint","Tape the edges"]' }, 'subtasks')).toEqual(['Buy paint', 'Tape the edges']);
    expect(() => jsonListOption({ subtasks: 'Buy paint' }, 'subtasks')).toThrow('JSON array');
    expect(() => jsonListOption({ subtasks: '["ok", 3]' }, 'subtasks')).toThrow('non-empty strings');
  });

  it('turns a position into an index in the target cell', () => {
    const cards = [card(0, '- [ ] a'), card(1, '- [ ] b')];
    expect(positionIndex(positionOption({}), cards)).toBe(2);
    expect(positionIndex(positionOption({ position: 'top' }), cards)).toBe(0);
    expect(positionIndex(positionOption({ position: 'before:a.md:1' }), cards)).toBe(1);
    expect(positionIndex(positionOption({ position: 'after:a.md:0' }), cards)).toBe(1);
    expect(() => positionIndex(positionOption({ position: 'after:b.md:4' }), cards)).toThrow('not in the target cell');
    expect(() => positionOption({ position: 'middle' })).toThrow('top, bottom');
  });

  it('resolves columns and labels by id or name, and lists the choices when unknown', () => {
    expect(resolveColumn(config, 'in-progress')).toBe('in-progress');
    expect(resolveColumn(config, 'in progress')).toBe('in-progress');
    expect(() => resolveColumn(config, 'Waiting')).toThrow('This board has: backlog, in-progress, done.');
    expect(resolveLabels(config, ['urgent', '2', '1'])).toEqual(['1', '2']);
    expect(() => resolveLabels(config, ['Blue'])).toThrow('Unknown label: Blue');
  });
});

describe('plainText', () => {
  it('renders nested results as indented key: value lines', () => {
    expect(plainText({ board: { slug: 'home' }, cards: [{ id: 'a.md:1', labels: [] }], none: null })).toBe(
      'board:\n  slug: home\ncards:\n  - id: a.md:1\n    labels: (none)\nnone: none');
  });
});

describe('replaceTaskText', () => {
  it('keeps fields, tags, request markers and block ids', () => {
    expect(replaceTaskText('- [ ] Call roofer 📅 2026-10-28 #tt/home/doing/100 ^abc', 'Call the roofer back'))
      .toBe('- [ ] Call the roofer back 📅 2026-10-28 #tt/home/doing/100 ^abc');
    expect(replaceTaskText('\t- [x] <!-- task-trellis-request:r1 --> Old text ✅ 2026-10-01', 'New'))
      .toBe('\t- [x] <!-- task-trellis-request:r1 --> New ✅ 2026-10-01');
  });

  it('refuses text that would change placement, and descriptions behind a field', () => {
    expect(replaceTaskText('- [ ] Call roofer', 'Call #tt/home/done')).toBeNull();
    expect(replaceTaskText('- [ ] Call roofer', '  ')).toBeNull();
    expect(replaceTaskText('- [ ] 📅 2026-10-28 Call roofer', 'New')).toBeNull();
  });

  it('applies through applyEdit with the board labels replaced', () => {
    const [line] = applyEdit('- [ ] Paint #tt/home/label/1 #tt/home/backlog', { text: 'Paint the kitchen', labels: { mode: 'set', ids: ['2'] } }, 'home', (l) => [l]);
    expect(line).toBe('- [ ] Paint the kitchen #tt/home/label/2 #tt/home/backlog');
  });
});

describe('insert positions', () => {
  it('reports where lines went under a heading, including a heading that had to be added', () => {
    expect(insertUnderHeadingAt('# A\n## To do\n- [ ] one\n\n## Later\n', '## To do', ['- [ ] two'])).toEqual({
      content: '# A\n## To do\n- [ ] one\n- [ ] two\n\n## Later\n', at: 3,
    });
    expect(insertUnderHeadingAt('# A\n', 'To do', ['- [ ] x', '\t- [ ] y'])).toEqual({
      content: '# A\n\n## To do\n- [ ] x\n\t- [ ] y\n', at: 3,
    });
    expect(insertUnderHeadingAt('', '', ['- [ ] x'])).toEqual({ content: '- [ ] x\n', at: 0 });
  });

  it('reports where a subtask went', () => {
    expect(insertSubtaskAt('- [ ] parent\n\t- [ ] one\n- [ ] next', 0, '- [ ] two', '\t')).toEqual({
      content: '- [ ] parent\n\t- [ ] one\n\t- [ ] two\n- [ ] next', at: 2,
    });
  });
});
