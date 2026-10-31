// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { parseBoardConfig } from '../src/core/boardConfig.ts';
import { draftChanged, draftFromConfig, draftToFrontmatter } from '../src/core/boardDraft.ts';
import { taskMatchesBoard } from '../src/core/filters.ts';
import { NEEDS_GROUPS } from '../src/core/filterTree.ts';
import { renderBoardSettings, type SettingsFormHost } from '../src/ui/renderBoardSettings.ts';

function editor(properties: Record<string, unknown> = {}) {
  Element.prototype.scrollIntoView = vi.fn();
  const config = parseBoardConfig('Filters', properties).config, draft = draftFromConfig(config);
  const root = document.createElement('div'); document.body.replaceChildren(root);
  const dispose = vi.fn();
  const host: SettingsFormHost = {
    initialSection: 'filters', icon: vi.fn(), attachKeySuggest: vi.fn(() => dispose), attachValueSuggest: vi.fn(() => dispose),
    attachTagSuggest: vi.fn(() => dispose), attachFolderSuggest: vi.fn(() => dispose), taggedTasks: () => [],
    onSave: vi.fn(), onDiscard: vi.fn(),
    createTextInput: vi.fn(() => document.createElement('input')), createDropdown: vi.fn(() => document.createElement('select')),
  };
  const form = renderBoardSettings(root, draft, config, host);
  const control = <T extends HTMLElement = HTMLInputElement>(label: string) => root.querySelector<T>(`[aria-label="${label}"]`)!;
  const choose = (label: string, value: string) => { const node = control<HTMLSelectElement>(label); node.value = value; node.dispatchEvent(new Event('change')); };
  const type = (label: string, value: string) => { const node = control<HTMLInputElement>(label); node.value = value; node.dispatchEvent(new Event('input')); return node; };
  /** Adds a filter to `group`, then picks its field, as a user would in the new filter's first dropdown. */
  const add = (kind: string, group = 'Filters') => {
    control<HTMLButtonElement>(`${group}: Add filter`).click();
    const field = document.activeElement as HTMLSelectElement;
    if (field.value !== kind) { field.value = kind; field.dispatchEvent(new Event('change')); }
    return field.getAttribute('aria-label')!.replace(/: Field$/, '');
  };
  const addGroup = (match: string, group = 'Filters') => {
    control<HTMLButtonElement>(`${group}: Add filter group`).click();
    const select = document.activeElement as HTMLSelectElement;
    select.value = match; select.dispatchEvent(new Event('change'));
    return select.getAttribute('aria-label')!.replace(/: Match$/, '');
  };
  const chip = (label: string, value: string) => type(label, value).dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}));
  const result = () => { const r = draftToFrontmatter(draft, config); expect(r.errors).toEqual([]); return r.frontmatter; };
  const saved = () => parseBoardConfig('Filters', result()).config;
  return {root, draft, config, form, host, dispose, control, choose, type, add, addGroup, chip, result, saved};
}

it('shows the filters every board had as one All group, with the exclusions in a None group, without changing what they mean', () => {
  const ui = editor({'include-tags': ['work', 'urgent'], 'include-folders': ['Projects'], 'filter-properties': ['team: design, product', 'status'],
    'exclude-tags': ['blocked'], 'exclude-folders': ['Archive'], 'exclude-properties': ['confidential: true']});
  expect(ui.root.querySelectorAll('.tt-filter-expression')).toHaveLength(7);
  expect(ui.control<HTMLSelectElement>('Filters: Match').value).toBe('all');
  expect(ui.control<HTMLSelectElement>('Group 5: Match').value).toBe('none');
  expect(ui.control('Group 5').querySelectorAll('.tt-filter-expression')).toHaveLength(3);
  expect(draftChanged(ui.draft, ui.config)).toBe(false);
  expect(ui.result()).toMatchObject({'include-tags': ['work', 'urgent'], 'exclude-folders': ['Archive'], 'filter-properties': ['team: design, product', 'status']});
  expect(ui.result().filter).toBeUndefined();
  expect(ui.host.createTextInput).toHaveBeenCalled(); expect(ui.host.createDropdown).toHaveBeenCalled();
  ui.form.destroy();
});

it('lays filters out like Bases: All, Any or None the following are true, then where, and or or before each one', () => {
  const ui = editor({'include-tags': ['work'], 'include-folders': ['Projects'], 'exclude-tags': ['blocked'], 'exclude-folders': ['Archive']});
  expect([...ui.control<HTMLSelectElement>('Filters: Match').options].map(o => o.text))
    .toEqual(['All the following are true', 'Any of the following are true', 'None of the following are true']);
  const words = (group: Element) => [...group.querySelectorAll(':scope > .tt-filter-group-statements > .tt-filter-row')]
    .map(row => row.classList.contains('tt-filter-row--group') ? 'group' : row.querySelector('.tt-filter-conjunction-label')!.textContent);
  expect(words(ui.control('Filters'))).toEqual(['where', 'and', 'group']);
  // None of a or b: like Bases, a None group joins its filters with or.
  expect(words(ui.control('Group 3'))).toEqual(['where', 'or']);
  ui.choose('Filters: Match', 'any');
  expect(words(ui.control('Filters'))).toEqual(['where', 'or', 'group']);
  const parts = [...ui.control('Filter 1').children].map(n => n.getAttribute('aria-label') ?? n.textContent);
  expect(parts).toEqual(['Filter 1: Field', 'include any of', 'work', '']);
  expect(ui.control('Filter 1').querySelector('.tt-filter-row-actions button')!.getAttribute('aria-label')).toBe('Remove filter 1');
  expect(ui.control('Group 3').querySelector('.tt-filter-group-header button')!.getAttribute('aria-label')).toBe('Remove group 3');
  expect(ui.control('Filters').querySelector(':scope > .tt-filter-group-header button')).toBeNull();
  ui.form.destroy();
});

it('builds ((A or B) and C) or D from groups, saves it as a filter group, and shows it again the same way', () => {
  const ui = editor();
  ui.choose('Filters: Match', 'any');
  const both = ui.addGroup('all');
  expect(both).toBe('Group 1');
  // A new group starts with a filter to fill in, as in Bases.
  const c = 'Filter 1.1';
  ui.choose(`${c}: Field`, 'property'); ui.type(`${c}: Property`, 'status'); ui.choose(`${c}: Condition`, 'matches'); ui.chip(`${c}: Values`, 'active');
  const either = ui.addGroup('any', both);
  expect(either).toBe('Group 1.2');
  ui.chip('Filter 1.2.1: Tags', 'work');
  const b = ui.add('folders', either); ui.chip(`${b}: Note folders`, 'Clients');
  const d = ui.add('tags'); expect(d).toBe('Filter 2'); ui.chip(`${d}: Tags`, 'urgent');

  const fm = ui.result();
  expect(fm.filter).toEqual({or: [{and: [{property: 'status: active'}, {or: [{tags: ['work']}, {folders: ['Clients']}]}]}, {tags: ['urgent']}]});
  // An older Task Trellis, which ignores `filter`, shows no tasks rather than every task.
  expect(fm).toMatchObject({'include-folders': [NEEDS_GROUPS], 'include-tags': [], 'filter-properties': [], 'exclude-tags': []});

  const config = ui.saved();
  const matches = (path: string, tags: string[], fm?: Record<string, unknown>) => taskMatchesBoard({path, tags}, config, fm);
  expect(matches('Notes/a.md', ['work'], {status: 'active'})).toBe(true);
  expect(matches('Clients/Acme.md', [], {status: 'active'})).toBe(true);
  expect(matches('Clients/Acme.md', [], {status: 'done'})).toBe(false);
  expect(matches('Notes/a.md', ['home'], {status: 'active'})).toBe(false);
  expect(matches('Notes/a.md', ['urgent'])).toBe(true);

  const reopened = editor(fm);
  expect(reopened.control<HTMLSelectElement>('Filters: Match').value).toBe('any');
  expect(reopened.control<HTMLSelectElement>('Group 1: Match').value).toBe('all');
  expect(reopened.control<HTMLSelectElement>('Group 1.2: Match').value).toBe('any');
  expect(reopened.control('Group 1.2').querySelectorAll('.tt-filter-expression')).toHaveLength(2);
  expect(draftChanged(reopened.draft, reopened.config)).toBe(false);
});

it('stops at three levels, and a new group matches the other way from the group it’s in', () => {
  const ui = editor();
  ui.control<HTMLButtonElement>('Filters: Add filter group').click();
  expect(document.activeElement).toBe(ui.control('Group 1: Match'));
  expect(ui.control<HTMLSelectElement>('Group 1: Match').value).toBe('any');
  ui.control<HTMLButtonElement>('Group 1: Add filter group').click();
  expect(ui.control<HTMLSelectElement>('Group 1.2: Match').value).toBe('all');
  expect(ui.control('Group 1.2: Add filter group')).toBeNull();
  expect(ui.control('Group 1.2: Add filter')).not.toBeNull();
  // Filters left empty add no restriction, so the board saves as it was.
  expect(draftChanged(ui.draft, ui.config)).toBe(false);
  ui.form.destroy();
});

it('changes what a filter tests from its first dropdown, starting it over', () => {
  const ui = editor({'include-tags': ['work']});
  ui.choose('Filter 1: Field', 'property');
  expect(document.activeElement).toBe(ui.control('Filter 1: Field'));
  expect(ui.draft.filter.items[0]).toEqual({kind: 'property', key: '', condition: 'exists', values: []});
  expect(ui.control('Filter 1: Property')).not.toBeNull();
  expect(ui.control<HTMLSelectElement>('Filter 1: Condition').value).toBe('exists');
  ui.choose('Filter 1: Field', 'folders');
  expect(ui.control('Filter 1: Note folders')).not.toBeNull();
  ui.form.destroy();
});

it('goes back to the plain lists, without a filter group, once the filters fit them again', () => {
  const ui = editor({filter: {or: [{tags: ['work']}, {folders: ['Clients']}]}, 'include-folders': [NEEDS_GROUPS]});
  expect(ui.root.querySelectorAll('.tt-filter-expression')).toHaveLength(2);
  ui.choose('Filters: Match', 'all');
  const fm = ui.result();
  expect(fm).toMatchObject({'include-tags': ['work'], 'include-folders': ['Clients']});
  expect('filter' in fm && fm.filter === undefined).toBe(true);
});

it('removes a filter or a whole group, a group with its last filter, and puts focus on its group’s Add filter', () => {
  const ui = editor({'include-tags': ['work'], 'exclude-folders': ['Archive', 'Old'], 'exclude-tags': ['blocked']});
  ui.control<HTMLButtonElement>('Remove filter 1').click();
  expect(document.activeElement).toBe(ui.control('Filters: Add filter'));
  ui.control<HTMLButtonElement>('Remove filter 1.1').click();
  expect(document.activeElement).toBe(ui.control('Group 1: Add filter'));
  ui.control<HTMLButtonElement>('Remove filter 1.1').click();
  expect(ui.control('Group 1')).toBeNull();
  expect(document.activeElement).toBe(ui.control('Filters: Add filter'));
  expect(ui.root.textContent).toContain('No filters, so every task can show.');
  expect(ui.result()).toMatchObject({'include-tags': [], 'exclude-folders': [], 'exclude-tags': []});
  ui.add('tags'); expect(ui.result()['include-tags']).toEqual([]);
  ui.addGroup('none'); ui.control<HTMLButtonElement>('Remove group 2').click();
  expect(ui.control('Group 2')).toBeNull();
  ui.form.destroy();
});

it('names an unfinished property filter by its place, beside the filter and in the errors', () => {
  const ui = editor();
  ui.addGroup('none');
  ui.choose('Filter 1.1: Field', 'property');
  const errors = draftToFrontmatter(ui.draft, ui.config).errors;
  expect(errors).toEqual(['Filter 1.1: Enter a property name or remove this filter.']);
  ui.form.showErrors(errors);
  expect(ui.control('Filter 1.1: Property').getAttribute('aria-invalid')).toBe('true');
  expect(ui.root.querySelector('.tt-settings-errors')).toBeNull();
  expect(ui.root.querySelector('.tt-field-error')!.textContent).toBe('Filter 1.1: Enter a property name or remove this filter.');
  ui.type('Filter 1.1: Property', 'status'); ui.choose('Filter 1.1: Condition', 'matches');
  ui.chip('Filter 1.1: Values', 'cancelled, deferred');
  expect(ui.result()['exclude-properties']).toEqual([{status: ['cancelled, deferred']}]);
  ui.form.destroy();
});

it('offers every kind of filter in every group, with suggestions, and disposes them', () => {
  const ui = editor();
  ui.add('tags');
  expect([...ui.control<HTMLSelectElement>('Filter 1: Field').options].map(o => o.text)).toEqual(['Tags', 'Note folder', 'Note property']);
  ui.add('tags'); ui.chip('Filter 1: Tags', 'work'); ui.chip('Filter 2: Tags', 'urgent');
  ui.add('folders'); ui.add('property'); ui.type('Filter 4: Property', 'team'); ui.choose('Filter 4: Condition', 'matches');
  expect(ui.host.attachTagSuggest).toHaveBeenCalled(); expect(ui.host.attachFolderSuggest).toHaveBeenCalled();
  expect(ui.host.attachKeySuggest).toHaveBeenCalled(); expect(ui.host.attachValueSuggest).toHaveBeenCalled();
  // Two tag filters must both match, which the plain lists can't say.
  ui.chip('Filter 4: Values', 'design');
  expect(ui.result().filter).toEqual({and: [{tags: ['work']}, {tags: ['urgent']}, {property: 'team: design'}]});
  ui.form.destroy(); expect(ui.dispose).toHaveBeenCalled();
});

it('keeps chip entry IME-safe, and keeps the filters across tab changes and while saving', () => {
  const ui = editor(); ui.add('tags'); const input = ui.type('Filter 1: Tags', '仕事');
  input.dispatchEvent(new Event('compositionstart')); input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', isComposing: true}));
  input.dispatchEvent(new Event('blur')); expect(ui.draft.filter.items[0]).toEqual({kind: 'tags', values: []});
  input.dispatchEvent(new Event('compositionend')); input.dispatchEvent(new Event('change'));
  expect(ui.draft.filter.items[0]).toEqual({kind: 'tags', values: ['仕事']});
  ui.root.querySelector<HTMLButtonElement>('#tt-tab-general')!.click(); ui.root.querySelector<HTMLButtonElement>('#tt-tab-filters')!.click();
  expect(ui.root.querySelector('.tt-chip-text')?.textContent).toBe('仕事');
  ui.form.setSaving(true); expect(ui.control<HTMLButtonElement>('Filters: Add filter').disabled).toBe(true);
  ui.form.setSaving(false); expect(ui.control<HTMLButtonElement>('Filters: Add filter').disabled).toBe(false);
  ui.form.destroy();
});
