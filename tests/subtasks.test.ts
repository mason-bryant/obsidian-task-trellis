import { describe, expect, it } from 'vitest';
import { indentWidth, insertSubtask, promoteSubtask } from '../src/core/subtasks.ts';

describe('indentWidth', () => {
  it('counts tabs to the next stop of 4, and blockquote markers', () => {
    expect(indentWidth('- [ ] a')).toBe(0);
    expect(indentWidth('\t- [ ] a')).toBe(4);
    expect(indentWidth('  \t- [ ] a')).toBe(4);
    expect(indentWidth('> \t- [ ] a')).toBe(4);
  });
});

describe('insertSubtask', () => {
  it('goes one level under a parent with no subtasks', () => {
    expect(insertSubtask('- [ ] parent\n- [ ] next', 0, '- [ ] new', '\t')).toBe('- [ ] parent\n\t- [ ] new\n- [ ] next');
    expect(insertSubtask('  - [ ] parent', 0, '- [ ] new', '    ')).toBe('  - [ ] parent\n      - [ ] new');
  });

  it('goes after the last nested line, indented like the existing subtasks', () => {
    const content = ['# H', '- [ ] parent', '  - [ ] one', '    - [ ] deeper', '  some note', '', '- [ ] next'].join('\n');
    expect(insertSubtask(content, 1, '- [ ] new', '\t').split('\n')).toEqual([
      '# H',
      '- [ ] parent',
      '  - [ ] one',
      '    - [ ] deeper',
      '  some note',
      '  - [ ] new',
      '',
      '- [ ] next',
    ]);
  });

  it('stays inside a blockquote and keeps CRLF', () => {
    expect(insertSubtask('> - [ ] parent\r\n> text', 0, '- [ ] new', '\t')).toBe('> - [ ] parent\r\n> \t- [ ] new\r\n> text');
  });
});

describe('promoteSubtask', () => {
  const note = ['# H', '- [ ] card', '\t- [ ] one', '\t- [ ] two', '\t\t- [ ] two.a', '\t\tnote under two', '\t- [ ] three', '', '- [ ] next'];

  it('moves the subtask and its block after the card, outdented, and maps old lines to new', () => {
    const p = promoteSubtask(note, 3, 1)!;
    expect(p.lines).toEqual(['# H', '- [ ] card', '\t- [ ] one', '\t- [ ] three', '- [ ] two', '\t- [ ] two.a', '\tnote under two', '', '- [ ] next']);
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8].map(p.at)).toEqual([0, 1, 2, 4, 5, 6, 3, 7, 8]);
  });

  it('makes a nested subtask a sibling of the card, not of its parent', () => {
    expect(promoteSubtask(note, 4, 1)!.lines).toEqual(['# H', '- [ ] card', '\t- [ ] one', '\t- [ ] two', '\t\tnote under two', '\t- [ ] three', '- [ ] two.a', '', '- [ ] next']);
  });

  it('keeps blockquote markers and an indented card level', () => {
    expect(promoteSubtask(['> - [ ] card', '> \t- [ ] sub', '> - [ ] next'], 1, 0)!.lines).toEqual(['> - [ ] card', '> - [ ] sub', '> - [ ] next']);
    expect(promoteSubtask(['- project', '  - [ ] card', '    - [ ] sub'], 2, 1)!.lines).toEqual(['- project', '  - [ ] card', '  - [ ] sub']);
  });

  it('refuses a line outside the card or with inconsistent indentation', () => {
    expect(promoteSubtask(note, 8, 1)).toBeNull();
    expect(promoteSubtask(note, 1, 1)).toBeNull();
    expect(promoteSubtask(['- [ ] card', '    - [ ] sub', '\t\t- [ ] child'], 1, 0)).toBeNull();
  });
});
