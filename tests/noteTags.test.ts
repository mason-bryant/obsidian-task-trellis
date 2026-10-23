import { describe, expect, it } from 'vitest';
import type { CachedMetadata } from 'obsidian';
import { noteTags } from '../src/obsidian/noteTags.ts';
import { parseBoardConfig } from '../src/core/boardConfig.ts';
import { buildBoard, type BoardTask } from '../src/core/board.ts';
import { taskMatchesBoard } from '../src/core/filters.ts';
import { parseTaskLine } from '../src/core/taskLine.ts';

const config = (fm: Record<string, unknown> = {}) => parseBoardConfig('House', fm).config;
const position = (line: number) => ({ start: { line, col: 0, offset: 0 }, end: { line, col: 10, offset: 10 } });
const cache = (frontmatter: Record<string, unknown>, inline: Array<[string, number]> = [], taskLines: number[] = []): CachedMetadata => ({
  frontmatter: frontmatter as CachedMetadata['frontmatter'],
  tags: inline.map(([tag, line]) => ({ tag, position: position(line) })),
  listItems: taskLines.map((line) => ({ task: ' ', parent: -1, position: position(line) })),
});
const task = { path: 'Projects/Kitchen.md', tags: [] as string[] };

describe('unified page and task tags', () => {
  it.each([['Home/Kitchen'], 'Home/Kitchen'])('combines frontmatter tags %j with prose tags and removes task/placement tags', (tags) => {
    const metadata = cache({ tags }, [['#Home/Kitchen', 0], ['#Renovation', 1], ['#private', 2], ['#tt/house/doing', 3]], [2]);
    expect(noteTags(metadata)).toEqual(['home/kitchen', 'renovation']);
    expect(noteTags(undefined)).toEqual([]);
  });

  it('matches either the task or its page with nested tags and case-normalized config', () => {
    const c = config({ 'include-tags': ['#HOME', 'work'] });
    expect(taskMatchesBoard(task, c, {}, ['home/kitchen'])).toBe(true);
    expect(taskMatchesBoard({ ...task, tags: ['work'] }, c, {}, [])).toBe(true);
    expect(taskMatchesBoard(task, c, {}, ['homework'])).toBe(false);
    expect(taskMatchesBoard(task, c, {}, [])).toBe(false);
  });

  it('lets page exclusions reject tasks with matching task inclusions, and vice versa', () => {
    const c = config({ 'include-tags': ['work'], 'exclude-tags': ['private', 'archived'] });
    expect(taskMatchesBoard({ ...task, tags: ['work'] }, c, {}, ['private/client'])).toBe(false);
    expect(taskMatchesBoard({ ...task, tags: ['archived'] }, c, {}, ['work'])).toBe(false);
    expect(taskMatchesBoard(task, c, {}, ['work'])).toBe(true);
    expect(taskMatchesBoard(task, config({ 'exclude-tags': ['private'] }), {}, [])).toBe(true);
  });

  it('applies page tags to every task, while a tag on one task never leaks to sibling tasks', () => {
    const make = (line: number, suffix = ''): BoardTask => {
      const raw = `- [ ] Task ${line}${suffix}`;
      return { ...parseTaskLine(raw)!, path: 'a.md', line, raw, id: `a.md:${line}` };
    };
    const tasks = [make(2, ' #work'), make(3), make(4, ' #private')];
    const model = (rules: Record<string, unknown>, metadata: CachedMetadata) => buildBoard(tasks, config(rules), '2026-10-23', () => metadata.frontmatter, () => noteTags(metadata));
    const taskOnly = cache({}, [['#work', 2], ['#private', 4]], [2, 3, 4]);
    expect(model({ 'include-tags': ['work'] }, taskOnly).total).toBe(1);
    expect(model({ 'exclude-tags': ['private'] }, taskOnly).total).toBe(2);
    const page = cache({ tags: ['work'] }, taskOnly.tags!.map((tag) => [tag.tag, tag.position.start.line]), [2, 3, 4]);
    expect(model({ 'include-tags': ['work'] }, page).total).toBe(3);
    expect(model({ 'include-tags': ['work'], 'exclude-tags': ['private'] }, page).total).toBe(2);
    const excludedPage = cache({ tags: ['work'] }, [['#private', 0], ['#work', 2]], [2, 3, 4]);
    expect(model({ 'exclude-tags': ['private'] }, excludedPage).total).toBe(0);
  });
});
