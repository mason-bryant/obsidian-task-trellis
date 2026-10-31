import { describe, expect, it } from 'vitest';
import { parseBoardConfig } from '../src/core/boardConfig.ts';
import { draftChanged, draftFromConfig, draftToFrontmatter, filterWarnings, type DraftRule } from '../src/core/boardDraft.ts';
import { flatRules, matchesProperty, noteMatchesFilters, requiredPropertyKeys, simplifyFilter, taskMatchesBoard, missingRequiredPropertyKeys, type FilterGroup } from '../src/core/filters.ts';
import { NEEDS_GROUPS } from '../src/core/filterTree.ts';
import { renameFilterTags } from '../src/core/boardTagRename.ts';
import { buildBoard, type BoardTask } from '../src/core/board.ts';
import { parseTaskLine } from '../src/core/taskLine.ts';

const rule = (key: string, ...values: string[]) => ({ key, values });
const config = (fm: Record<string, unknown> = {}) => parseBoardConfig('House', fm).config;
const task = { path: 'Projects/Kitchen/a.md', tags: ['house/kitchen'] };

describe('symmetric board filters', () => {
  it.each([null, '', [], false, 0, ['active']])('treats a present %j value as existing', (value) => {
    expect(matchesProperty({ status: value }, rule('status'))).toBe(true);
    expect(noteMatchesFilters({ status: value }, [], [rule('status')])).toBe(false);
  });

  it('handles missing properties differently for inclusion and exclusion', () => {
    expect(noteMatchesFilters({}, [rule('status', 'active')])).toBe(false);
    expect(noteMatchesFilters(undefined, [], [rule('status', 'archived')])).toBe(true);
    expect(noteMatchesFilters({}, [], [rule('status')])).toBe(true);
  });

  it('matches lists, numbers, booleans and value case while preserving key case', () => {
    const fm = { status: ['Active', 'ARCHIVED'], count: 12, ready: false };
    expect(matchesProperty(fm, rule('status', 'planned', 'active'))).toBe(true);
    expect(noteMatchesFilters(fm, [], [rule('status', 'archived')])).toBe(false);
    expect(matchesProperty(fm, rule('count', '12'))).toBe(true);
    expect(matchesProperty(fm, rule('ready', 'FALSE'))).toBe(true);
    expect(matchesProperty(fm, rule('Status', 'active'))).toBe(false);
  });

  it('ANDs inclusion rules, ORs exclusion rules, and lets exclusions win', () => {
    const include = [rule('status', 'active'), rule('status', 'planned')];
    expect(noteMatchesFilters({ status: ['active', 'planned'] }, include)).toBe(true);
    expect(noteMatchesFilters({ status: ['active'] }, include)).toBe(false);
    expect(noteMatchesFilters({ status: ['active', 'planned', 'archived'] }, include, [rule('unrelated'), rule('status', 'archived')])).toBe(false);
  });

  it('ANDs configured categories and ORs tags/folders within their categories', () => {
    const c = config({ 'include-tags': ['garden', 'house'], 'include-folders': ['Daily', 'Projects'], 'filter-properties': ['status: active'], 'exclude-properties': ['status: archived'] });
    expect(taskMatchesBoard(task, c, { status: 'active' })).toBe(true);
    expect(taskMatchesBoard({ ...task, tags: ['other'] }, c, { status: 'active' })).toBe(false);
    expect(taskMatchesBoard({ ...task, path: 'Elsewhere/a.md' }, c, { status: 'active' })).toBe(false);
    expect(taskMatchesBoard(task, c, { status: ['active', 'archived'] })).toBe(false);
    expect(taskMatchesBoard(task, config(), undefined)).toBe(true);
  });

  it('matches one note when a folder rule names its path', () => {
    const c = config({ filter: { or: [{ folders: ['Projects/Plan.md'] }, { folders: ['Daily'] }] } });
    expect(taskMatchesBoard({ path: 'Projects/Plan.md', tags: [] }, c, {})).toBe(true);
    expect(taskMatchesBoard({ path: 'Projects/Plan.md.bak', tags: [] }, c, {})).toBe(false);
    expect(taskMatchesBoard({ path: 'Projects/Other.md', tags: [] }, c, {})).toBe(false);
  });

  it('matches descendants without confusing folder or tag prefixes', () => {
    expect(taskMatchesBoard(task, config({ 'exclude-folders': ['Projects'] }), {})).toBe(false);
    expect(taskMatchesBoard({ ...task, path: 'Projects-old/a.md' }, config({ 'exclude-folders': ['Projects'] }), {})).toBe(true);
    expect(taskMatchesBoard(task, config({ 'exclude-tags': ['house'] }), {})).toBe(false);
    expect(taskMatchesBoard({ ...task, tags: ['housework'] }, config({ 'exclude-tags': ['house'] }), {})).toBe(true);
    expect(taskMatchesBoard({ ...task, path: 'Projects-old/a.md' }, config({ 'include-folders': ['Projects'] }), {})).toBe(false);
  });

  it('diagnoses missing required keys only, never harmless exclusion keys', () => {
    const c = config({ 'filter-properties': ['context', 'status: active'], 'exclude-properties': ['archived', 'hidden: true'] });
    expect(missingRequiredPropertyKeys(c, [{ context: null }, undefined])).toEqual(['status']);
    expect(missingRequiredPropertyKeys(config({ 'exclude-properties': ['absent'] }), [{}])).toEqual([]);
  });

  it('keeps filtered children inside visible parents, but filters standalone children', () => {
    const make = (raw: string, line: number, parentId?: string): BoardTask => ({ ...parseTaskLine(raw)!, raw, path: 'a.md', id: `a.md:${line}`, line, parentId });
    const parent = make('- [ ] parent', 0);
    const child = make('  - [ ] child #private', 1, parent.id);
    const c = config({ 'exclude-tags': ['private'] });
    expect(buildBoard([parent, child], c, '2026-10-23', () => ({})).subtasks[parent.id]).toEqual([child]);
    expect(buildBoard([child], c, '2026-10-23', () => ({})).total).toBe(0);
  });
});

describe('filter persistence and validation', () => {
  it.each([
    ['status: active, planned', [rule('status', 'active', 'planned')]],
    [['"status: active, planned"', 'project'], [rule('status', 'active', 'planned'), rule('project')]],
    [{ status: ['active', 'planned'], project: null }, [rule('status', 'active', 'planned'), rule('project')]],
    [[{ status: 'active' }, { status: ['planned'] }], [rule('status', 'active'), rule('status', 'planned')]],
  ])('loads legacy and exclusion syntax %j', (value, expected) => {
    const c = config({ 'filter-properties': value, 'exclude-properties': value });
    expect(flatRules(c.filter)!.propertyFilters).toEqual(expected);
    expect(flatRules(c.filter)!.excludedPropertyFilters).toEqual(expected);
    expect(draftChanged(draftFromConfig(c), c)).toBe(false);
  });

  it('round-trips commas, quotes, colon keys and repeated rules when unrelated settings change', () => {
    const c = config({
      'filter-properties': [{ status: ['active', 'planned'] }, { status: ['ready, waiting'] }, { 'project:phase': ['say "yes"'] }],
      'exclude-properties': [{ status: ['archived'] }, { status: ['cancelled, deferred'] }, 'hidden'],
    });
    const draft = draftFromConfig(c); draft.dueNow = '12';
    const result = draftToFrontmatter(draft, c);
    expect(result.errors).toEqual([]);
    const reopened = config(result.frontmatter);
    expect(reopened.filter).toEqual(c.filter);
    expect(flatRules(reopened.filter)!.excludedPropertyFilters).toHaveLength(3);
    expect(draftChanged(draftFromConfig(reopened), reopened)).toBe(false);
  });

  it('requires values for matching and warns about contradictory existence rules', () => {
    const c = config({ 'filter-properties': ['status'] });
    const draft = draftFromConfig(c);
    const excluded: DraftRule = { kind: 'property', key: 'status', condition: 'matches', values: [] };
    draft.filter.items.push({ kind: 'group', match: 'none', items: [excluded] });
    expect(draftToFrontmatter(draft, c).errors).toEqual(['Filter 2.1: Add at least one value to match.']);
    excluded.condition = 'exists';
    expect(filterWarnings(draft)).toHaveLength(1);
    excluded.condition = 'matches'; excluded.values = ['archived'];
    expect(filterWarnings(draft)).toEqual([]);
    expect(draftToFrontmatter(draft, c).errors).toEqual([]);
  });
});

describe('filter groups in the board note', () => {
  const tags = (...values: string[]) => ({ kind: 'tags', values }) as const;
  const folders = (...values: string[]) => ({ kind: 'folders', values }) as const;

  it('reads and, or and not groups of tags, folders and property rules, written by hand', () => {
    const { config: c, warnings } = parseBoardConfig('House', { filter: { or: [
      { and: [{ tag: '#Work' }, { property: { 'project:phase': ['a, b'] } }] },
      { not: [{ folders: ['/Archive/'] }, { property: 'hidden' }] },
    ] } });
    expect(warnings).toEqual([]);
    expect(c.filter).toEqual({ kind: 'group', match: 'any', items: [
      { kind: 'group', match: 'all', items: [tags('work'), { kind: 'property', key: 'project:phase', values: ['a, b'] }] },
      { kind: 'group', match: 'none', items: [folders('Archive'), { kind: 'property', key: 'hidden', values: [] }] },
    ] });
    expect(taskMatchesBoard({ path: 'Notes/a.md', tags: [] }, c, {})).toBe(true);
    expect(taskMatchesBoard({ path: 'Archive/a.md', tags: ['work'] }, c, { 'project:phase': 'a, b' })).toBe(true);
    expect(taskMatchesBoard({ path: 'Archive/a.md', tags: ['work'] }, c, {})).toBe(false);
    // A list on its own is an and group, and the filter group wins over the plain lists.
    expect(config({ filter: [tags('x'), folders('y')].map((r) => ({ [r.kind]: r.values })), 'include-tags': ['ignored'] }).filter)
      .toEqual({ kind: 'group', match: 'all', items: [tags('x'), folders('y')] });
  });

  it('matches no tasks, and says why, when the group can’t be read', () => {
    for (const filter of [{ or: [{ tagz: 'work' }] }, { or: 'work' }, { and: [{ property: { a: 1, b: 2 } }] }, 'work', { and: [], or: [] }]) {
      const { config: c, warnings } = parseBoardConfig('House', { filter });
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toMatch(/^The board’s filter couldn’t be read \(.+\), so it matches no tasks\./);
      expect(taskMatchesBoard({ path: 'a.md', tags: [] }, c, {})).toBe(false);
    }
    expect(parseBoardConfig('House', { 'quick-filters': [{ id: 'q', name: 'Mine', filter: { nor: [] } }] }).warnings[0])
      .toMatch(/^The Mine quick filter’s rules couldn’t be read/);
  });

  it('drops what adds nothing, and an empty filter matches every task', () => {
    expect(simplifyFilter({ kind: 'group', match: 'all', items: [
      { kind: 'group', match: 'any', items: [tags('a')] },
      { kind: 'group', match: 'all', items: [tags('b'), { kind: 'group', match: 'any', items: [] }] },
      tags(), { kind: 'property', key: '', values: [] },
      { kind: 'group', match: 'none', items: [folders('c')] },
    ] })).toEqual({ kind: 'group', match: 'all', items: [tags('a'), tags('b'), { kind: 'group', match: 'none', items: [folders('c')] }] });
    const empty = simplifyFilter({ kind: 'group', match: 'any', items: [{ kind: 'group', match: 'none', items: [] }] });
    expect(empty).toEqual({ kind: 'group', match: 'all', items: [] });
    expect(taskMatchesBoard({ path: 'a.md', tags: [] }, { filter: empty }, {})).toBe(true);
  });

  it('fits groups into the plain lists only when they say the same thing', () => {
    const none = (...items: object[]) => ({ kind: 'group', match: 'none', items }) as FilterGroup;
    const all = (...items: object[]) => ({ kind: 'group', match: 'all', items }) as FilterGroup;
    expect(flatRules(all(tags('a'), none(tags('b')), none(tags('c'), folders('d'))))).toMatchObject({ includeTags: ['a'], excludeTags: ['b', 'c'], excludeFolders: ['d'] });
    expect(flatRules(none(tags('b')))).toMatchObject({ excludeTags: ['b'] });
    expect(flatRules(all(tags('a'), tags('b')))).toBeNull();
    expect(flatRules({ kind: 'group', match: 'any', items: [tags('a'), folders('b')] })).toBeNull();
    expect(flatRules(all(none(none(tags('a')))))).toBeNull();
    expect(flatRules(all(none(all(tags('a'), folders('b')))))).toBeNull();
  });

  it('diagnoses properties every match needs, but not ones only some matches need', () => {
    const c = config({ filter: { and: [{ property: 'context' }, { or: [{ property: 'status' }, { tags: ['work'] }] }, { not: [{ property: 'hidden' }] }] } });
    expect(requiredPropertyKeys(c.filter)).toEqual(['context']);
    expect(missingRequiredPropertyKeys(c, [{ status: 'x' }])).toEqual(['context']);
    expect(requiredPropertyKeys(config({ filter: { or: [{ property: 'a' }, { property: 'b' }] } }).filter)).toEqual([]);
  });

  it('renames the board tags in a filter group at every depth, and only those', () => {
    const filter = { or: [{ tags: ['tt/house/doing', 'tt/household'] }, { not: [{ tag: '#tt/house/label/1' }, { property: 'tags: tt/house' }] }] };
    expect(renameFilterTags(filter, 'house', 'home')).toEqual(
      { or: [{ tags: ['tt/home/doing', 'tt/household'] }, { not: [{ tag: '#tt/home/label/1' }, { property: 'tags: tt/house' }] }] });
  });

  it('keeps a quick filter’s group, with the marker for older releases, and a board’s plain rules beside it', () => {
    const c = config({ 'quick-filters': [{ id: 'mine', name: 'Mine', filter: { or: [{ tags: ['work'] }, { folders: ['Clients'] }] } }] });
    const draft = draftFromConfig(c); draft.dueNow = '9';
    const fm = draftToFrontmatter(draft, c).frontmatter;
    expect(fm['quick-filters']).toEqual([{ id: 'mine', name: 'Mine', show: true, filter: { or: [{ tags: ['work'] }, { folders: ['Clients'] }] }, 'include-folders': [NEEDS_GROUPS] }]);
    expect(config(fm).quickFilters[0]!.filter).toEqual(c.quickFilters[0]!.filter);
  });
});
