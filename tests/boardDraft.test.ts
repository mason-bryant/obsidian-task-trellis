import { describe, expect, it } from 'vitest';
import { parseBoardConfig } from '../src/core/boardConfig.ts';
import { convertDueNow, draftChanged, draftFromConfig, draftToFrontmatter } from '../src/core/boardDraft.ts';

const original = parseBoardConfig('Renovation', {
  slug: 'renovation',
  columns: ['Backlog', 'Doing', 'Waiting', 'Done'],
  'done-column': 'Done',
  'filter-properties': ['"context: renovation, house"'],
  'exclude-folders': ['templates'],
}).config;

describe('board settings draft', () => {
  it('round-trips a config through the form unchanged', () => {
    const { frontmatter, errors, renames, removed } = draftToFrontmatter(draftFromConfig(original), original);
    expect(errors).toEqual([]);
    expect(renames.size).toBe(0);
    expect(removed).toEqual([]);
    expect(frontmatter).toEqual({
      columns: ['Backlog', 'Doing', 'Waiting', 'Done'],
      'done-column': 'Done',
      'limit-done': true,
      'done-limit': 5,
      'undated-column': '',
      'limit-undated': true,
      'undated-limit': 10,
      'due-now': 7,
      'due-now-unit': 'days',
      'week-horizon': 2,
      'week-start': 'monday',
      'filter-properties': ['context: renovation, house'],
      'exclude-properties': [],
      'include-tags': [],
      'exclude-tags': [],
      'include-folders': [],
      'exclude-folders': ['templates'],
      'quick-filters': [
        { id: 'high-priority', name: 'High priority', show: true, priority: ['highest', 'high'] },
        { id: 'overdue', name: 'Overdue', show: true, due: ['overdue'] },
        { id: 'label-green', name: '🏷️ Green', show: true, labels: ['green'] },
      ],
      'show-completed-days': 7,
      'sort-completed-subtasks': false,
      'hide-completed-subtasks': false,
      'overdue-bar': true,
      'new-tasks': 'default',
      'new-tasks-note': '',
      'new-tasks-heading': '',
    });
    expect(parseBoardConfig('Renovation', { slug: 'renovation', ...frontmatter }).config).toEqual(original);
  });

  it('tracks renamed and removed columns, and the done column follows its rename', () => {
    const draft = draftFromConfig(original);
    draft.columns[1]!.label = 'In Progress';
    draft.columns[3]!.label = 'Finished';
    draft.columns.splice(2, 1);
    draft.doneIndex = 2;
    draft.columns.push({ label: 'Blocked' });
    const r = draftToFrontmatter(draft, original);
    expect(r.errors).toEqual([]);
    expect([...r.renames]).toEqual([
      ['doing', 'in-progress'],
      ['done', 'finished'],
    ]);
    expect(r.removed).toEqual(['waiting']);
    expect(r.frontmatter).toMatchObject({
      columns: ['Backlog', 'In Progress', 'Finished', 'Blocked'],
      'done-column': 'Finished',
    });
  });

  it('saves a No due date column that follows its rename, and refuses it on the Done column', () => {
    const draft = draftFromConfig(original);
    draft.columns.unshift({ label: 'Inbox' });
    draft.doneIndex = 4;
    draft.undatedIndex = 0;
    draft.undatedLimit = '20';
    expect(draftToFrontmatter(draft, original).frontmatter).toMatchObject({ 'undated-column': 'Inbox', 'undated-limit': 20 });
    draft.columns[0]!.label = 'Someday';
    expect(draftToFrontmatter(draft, original).frontmatter).toMatchObject({ 'undated-column': 'Someday' });
    draft.undatedIndex = 4;
    expect(draftToFrontmatter(draft, original).errors).toEqual(['Done and No due date can’t be the same column.']);
  });

  it('keeps about the same window when switching between days and weeks', () => {
    expect(convertDueNow('7', 'weeks')).toBe('1');
    expect(convertDueNow('10', 'weeks')).toBe('1');
    expect(convertDueNow('2', 'days')).toBe('14');
    expect(convertDueNow('', 'weeks')).toBe('1');
  });

  it('requires a note when new tasks go to a specific note', () => {
    const draft = draftFromConfig(original);
    draft.newTasks = 'note';
    expect(draftToFrontmatter(draft, original).errors).toEqual(['Choose the note new tasks go to.']);
    draft.newTasksNote = ' Inbox.md ';
    draft.newTasksHeading = '## Tasks';
    expect(draftToFrontmatter(draft, original).frontmatter).toMatchObject({
      'new-tasks': 'note',
      'new-tasks-note': 'Inbox.md',
      'new-tasks-heading': '## Tasks',
    });
  });

  it('only counts real edits as changes', () => {
    const draft = draftFromConfig(original);
    expect(draftChanged(draft, original)).toBe(false);
    draft.includeTags = ' ';
    expect(draftChanged(draft, original)).toBe(false);
    draft.dueNow = '10';
    expect(draftChanged(draft, original)).toBe(true);
  });

  it('reports bad input instead of saving it', () => {
    const draft = draftFromConfig(original);
    draft.columns[1]!.label = 'backlog';
    draft.columns.push({ label: '!!!' });
    draft.dueNow = 'seven';
    draft.weekHorizon = '-1';
    draft.filters.push({ key: '', condition: 'matches', values: ['x'] }, { key: 'status', condition: 'matches', values: [] });
    expect(draftToFrontmatter(draft, original).errors).toEqual([
      'Two columns are both named "backlog".',
      'Column "!!!" needs a name with letters or numbers.',
      'Must include, property 2: Enter a property name or remove this rule.',
      'Must include, property 3: Add at least one value to match.',
      'Due now window must be a whole number from 0 to 365.',
      'Week rows must be a whole number from 0 to 52.',
    ]);
  });

  it('cleans tags and folders, and preserves existence rules', () => {
    const draft = draftFromConfig(original);
    draft.includeTags = '#house, , project/x/';
    draft.includeFolders = '/Projects/\n\nDaily';
    draft.filters.push({ key: 'project', condition: 'exists', values: [] });
    draft.doneIndex = -1;
    const fm = draftToFrontmatter(draft, original).frontmatter;
    expect(fm).toMatchObject({
      'include-tags': ['house', 'project/x'],
      'include-folders': ['Projects', 'Daily'],
      'filter-properties': ['context: renovation, house', 'project'],
      'done-column': '',
    });
  });
});
