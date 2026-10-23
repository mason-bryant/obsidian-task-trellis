import { describe, expect, it } from 'vitest';
import { parseBoardConfig } from '../src/core/boardConfig.ts';
import { draftChanged, draftFromConfig, draftToFrontmatter, filterWarnings } from '../src/core/boardDraft.ts';
import { matchesProperty, noteMatchesFilters, taskMatchesBoard, missingRequiredPropertyKeys } from '../src/core/filters.ts';
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
    expect(c.propertyFilters).toEqual(expected);
    expect(c.excludedPropertyFilters).toEqual(expected);
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
    expect(reopened.propertyFilters).toEqual(c.propertyFilters);
    expect(reopened.excludedPropertyFilters).toEqual(c.excludedPropertyFilters);
    expect(draftChanged(draftFromConfig(reopened), reopened)).toBe(false);
  });

  it('requires values for matching and warns about contradictory existence rules', () => {
    const c = config({ 'filter-properties': ['status'] });
    const draft = draftFromConfig(c);
    draft.excludedFilters.push({ key: 'status', condition: 'matches', values: [] });
    expect(draftToFrontmatter(draft, c).errors).toEqual(['Must not include, property 1: Add at least one value to match.']);
    draft.excludedFilters[0]!.condition = 'exists';
    expect(filterWarnings(draft)).toHaveLength(1);
    draft.excludedFilters[0] = { key: 'status', condition: 'matches', values: ['archived'] };
    expect(filterWarnings(draft)).toEqual([]);
    expect(draftToFrontmatter(draft, c).errors).toEqual([]);
  });
});
