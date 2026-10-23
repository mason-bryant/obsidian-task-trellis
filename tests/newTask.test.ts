import { describe, expect, it } from 'vitest';
import { appendSort, buildNewTaskLine, finishNewTaskLine, insertUnderHeading } from '../src/core/newTask.ts';

// The daily note template's layout, after Templater has run.
const daily = [
  '---',
  'context:',
  '  - house',
  '---',
  '',
  '# Thursday, Oct 22nd',
  '',
  '---',
  '## 📅 Daily Questions',
  '',
  '### 🚀 things I plan to accomplish ',
  '',
  '',
  '### 🌟 My accomplishments yesterday were...',
  '',
  '---',
  '# 📝 Notes / Meetings',
  '',
].join('\n');

describe('insertUnderHeading', () => {
  it('puts the first task right under an empty section heading', () => {
    const out = insertUnderHeading(daily, '### 🚀 things I plan to accomplish', ['- [ ] a']);
    expect(out.split('\n').slice(10, 14)).toEqual(['### 🚀 things I plan to accomplish ', '- [ ] a', '', '']);
  });

  it('adds later tasks after the last line of the section, keeping its spacing', () => {
    const once = insertUnderHeading(daily, '### 🚀 things I plan to accomplish', ['- [ ] a']);
    const twice = insertUnderHeading(once, '🚀 Things I plan to   accomplish', ['- [ ] b']);
    expect(twice.split('\n').slice(10, 15)).toEqual(['### 🚀 things I plan to accomplish ', '- [ ] a', '- [ ] b', '', '']);
  });

  it('runs a section until a heading of the same or higher level, past sub-headings', () => {
    const note = ['## Tasks', '- [ ] a', '### Sub', '- [ ] b', '', '## Next', 'x'].join('\n');
    expect(insertUnderHeading(note, '## Tasks', ['- [ ] c'])).toBe(
      ['## Tasks', '- [ ] a', '### Sub', '- [ ] b', '- [ ] c', '', '## Next', 'x'].join('\n'),
    );
  });

  it('requires the level when the heading has #s', () => {
    const note = ['# Tasks', 'x', '## Tasks', 'y'].join('\n');
    expect(insertUnderHeading(note, '## Tasks', ['- [ ] c']).split('\n')).toEqual(['# Tasks', 'x', '## Tasks', 'y', '- [ ] c']);
  });

  it('ignores headings in front matter and code blocks', () => {
    const note = ['```', '## Tasks', '```', '## Tasks', 'a', '```', '# not a heading', '```', 'b'].join('\n');
    expect(insertUnderHeading(note, '## Tasks', ['- [ ] c']).split('\n').slice(-2)).toEqual(['b', '- [ ] c']);
  });

  it('adds a missing heading at the end, or appends when no heading is set', () => {
    expect(insertUnderHeading('# Note\ntext\n', '## Tasks', ['- [ ] c'])).toBe('# Note\ntext\n\n## Tasks\n- [ ] c\n');
    expect(insertUnderHeading('# Note\ntext\n', 'Tasks', ['- [ ] c'])).toBe('# Note\ntext\n\n## Tasks\n- [ ] c\n');
    expect(insertUnderHeading('# Note\ntext', '', ['- [ ] c'])).toBe('# Note\ntext\n\n- [ ] c');
    expect(insertUnderHeading('', '', ['- [ ] c'])).toBe('- [ ] c\n');
  });

  it('keeps CRLF line endings', () => {
    expect(insertUnderHeading('## Tasks\r\n- [ ] a\r\n', '## Tasks', ['- [ ] b'])).toBe('## Tasks\r\n- [ ] a\r\n- [ ] b\r\n');
  });
});

describe('new task lines', () => {
  it('adds created, due and placement in Tasks order', () => {
    expect(
      buildNewTaskLine(' Call the plumber ', {
        created: '2026-10-22',
        due: '2026-10-28',
        placement: { slug: 'renovation', column: 'doing', sort: 400 },
      }),
    ).toBe('- [ ] Call the plumber ➕ 2026-10-22 📅 2026-10-28 #tt/renovation/doing/400');
  });

  it('keeps a due date typed into the text', () => {
    expect(buildNewTaskLine('Call 📅 2026-11-05', { due: '2026-10-28' })).toBe('- [ ] Call 📅 2026-11-05');
  });

  it('joins text typed or pasted over several lines into one task line', () => {
    expect(
      buildNewTaskLine('Call the roofer\n  about the estimate\r\n', {
        due: '2026-10-28',
        placement: { slug: 'house', column: 'doing', sort: 100 },
      }),
    ).toBe('- [ ] Call the roofer about the estimate 📅 2026-10-28 #tt/house/doing/100');
  });

  it('leaves out the due date in the No due date row', () => {
    expect(buildNewTaskLine('Call', { due: null, created: '2026-10-22' })).toBe('- [ ] Call ➕ 2026-10-22');
  });

  it('fills in a Tasks-modal line without duplicating its fields', () => {
    expect(
      finishNewTaskLine('- [ ] Call ⏫ ➕ 2026-10-22 📅 2026-10-30', {
        created: '2026-10-22',
        due: '2026-10-28',
        placement: { slug: 'renovation', column: 'backlog' },
      }),
    ).toBe('- [ ] Call ⏫ ➕ 2026-10-22 📅 2026-10-30 #tt/renovation/backlog');
  });

  it('numbers a card added at the bottom of a cell', () => {
    expect(appendSort(undefined, true)).toBe(100);
    expect(appendSort(300, false)).toBe(400);
    expect(appendSort(undefined, false)).toBeUndefined();
  });
});
