import { describe, expect, it } from 'vitest';
import { indentWidth, insertSubtask } from '../src/core/subtasks.ts';

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
