// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { parseBoardConfig } from '../src/core/boardConfig.ts';
import { draftChanged, draftFromConfig, draftToFrontmatter } from '../src/core/boardDraft.ts';
import { taskMatchesBoard } from '../src/core/filters.ts';
import { renderBoardSettings, type SettingsFormHost } from '../src/ui/renderBoardSettings.ts';

function editor(properties: Record<string, unknown> = {}) {
  Element.prototype.scrollIntoView = vi.fn();
  const config = parseBoardConfig('Filters', properties).config, draft = draftFromConfig(config);
  const root = document.createElement('div'); document.body.replaceChildren(root);
  const dispose = vi.fn();
  const host: SettingsFormHost = {
    initialSection: 'filters', icon: vi.fn(), attachKeySuggest: vi.fn(() => dispose), attachValueSuggest: vi.fn(() => dispose),
    attachTagSuggest: vi.fn(() => dispose), attachFolderSuggest: vi.fn(() => dispose), countTagged: () => 0,
    onSave: vi.fn(), onDiscard: vi.fn(),
    createTextInput: vi.fn(() => document.createElement('input')), createDropdown: vi.fn(() => document.createElement('select')),
  };
  const form = renderBoardSettings(root, draft, config, host);
  const control = <T extends HTMLElement = HTMLInputElement>(label: string) => root.querySelector<T>(`[aria-label="${label}"]`)!;
  const choose = (label: string, value: string) => { const node = control<HTMLSelectElement>(label); node.value = value; node.dispatchEvent(new Event('change')); };
  const type = (label: string, value: string) => { const node = control<HTMLInputElement>(label); node.value = value; node.dispatchEvent(new Event('input')); return node; };
  const add = (kind: string, group = 'Must include') => { choose(`${group}: New filter field`, kind); control<HTMLButtonElement>(`${group}: Add filter`).click(); };
  const chip = (label: string, value: string) => type(label, value).dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}));
  const saved = () => { const result = draftToFrontmatter(draft, config); expect(result.errors).toEqual([]); return parseBoardConfig('Filters', result.frontmatter).config; };
  return {root, draft, config, form, host, dispose, control, choose, type, add, chip, saved};
}

it('renders existing tag, folder and property rules consistently without changing their saved meaning', () => {
  const ui = editor({'include-tags': ['work', 'urgent'], 'include-folders': ['Projects'], 'filter-properties': ['team: design, product', 'status'],
    'exclude-tags': ['blocked'], 'exclude-folders': ['Archive'], 'exclude-properties': ['confidential: true']});
  expect(ui.root.querySelectorAll('.tt-filter-rule')).toHaveLength(7);
  for (const row of ui.root.querySelectorAll('.tt-filter-rule')) {
    expect([...row.querySelectorAll(':scope > .tt-field > .tt-field-label')].map(n => n.textContent)).toEqual(['Field', 'Condition', 'Value']);
  }
  expect(draftChanged(ui.draft, ui.config)).toBe(false);
  expect(ui.saved().propertyFilters).toEqual(ui.config.propertyFilters);
  expect(ui.host.createTextInput).toHaveBeenCalled(); expect(ui.host.createDropdown).toHaveBeenCalled();
  ui.form.destroy();
});
it('adds all rule types with matching suggestions and preserves all/any/exclusion semantics', () => {
  const ui = editor(); ui.add('tags'); ui.chip('Must include: Tags', 'work, urgent');
  ui.add('folders'); ui.chip('Must include: Note folders', 'Projects');
  ui.add('property'); ui.type('Must include: Property 1', 'team'); ui.choose('Must include: Condition 1', 'matches');
  ui.chip('Must include: Values 1', 'design'); ui.chip('Must include: Values 1', 'product');
  ui.add('tags', 'Must not include'); ui.chip('Must not include: Tags', 'blocked');
  const config = ui.saved(), task = {path: 'Projects/Note.md', tags: ['urgent']};
  expect(taskMatchesBoard(task, config, {team: 'design'})).toBe(true);
  expect(taskMatchesBoard(task, config, {team: 'sales'})).toBe(false);
  expect(taskMatchesBoard({...task, path: 'Other/Note.md'}, config, {team: 'design'})).toBe(false);
  expect(taskMatchesBoard({...task, tags: ['work', 'blocked']}, config, {team: 'design'})).toBe(false);
  expect(ui.host.attachTagSuggest).toHaveBeenCalled(); expect(ui.host.attachFolderSuggest).toHaveBeenCalled();
  expect(ui.host.attachKeySuggest).toHaveBeenCalled(); expect(ui.host.attachValueSuggest).toHaveBeenCalled();
  ui.form.destroy(); expect(ui.dispose).toHaveBeenCalled();
});
it('removes entire rules, restores add choices and returns focus without accidentally excluding all tasks', () => {
  const ui = editor({'include-tags': ['work'], 'exclude-folders': ['Archive']});
  expect([...ui.control<HTMLSelectElement>('Must include: New filter field').options].map(o => o.value)).not.toContain('tags');
  ui.control<HTMLButtonElement>('Remove must include tags').click();
  expect(document.activeElement).toBe(ui.control('Must include: New filter field'));
  ui.control<HTMLButtonElement>('Remove must not include folders').click();
  expect(ui.saved().includeTags).toEqual([]); expect(ui.saved().excludeFolders).toEqual([]);
  ui.add('tags'); expect(ui.draft.includeTags).toBe(''); expect(ui.saved().includeTags).toEqual([]);
  ui.form.destroy();
});
it('validates property rules, retains comma-containing values and supports exclusions symmetrically', () => {
  const ui = editor(); ui.add('property', 'Must not include');
  ui.form.showErrors(draftToFrontmatter(ui.draft, ui.config).errors);
  expect(ui.control('Must not include: Property 1').getAttribute('aria-invalid')).toBe('true');
  ui.type('Must not include: Property 1', 'status'); ui.choose('Must not include: Condition 1', 'matches');
  ui.chip('Must not include: Values 1', 'cancelled, deferred');
  expect(ui.saved().excludedPropertyFilters).toEqual([{key: 'status', values: ['cancelled, deferred']}]);
  ui.control<HTMLButtonElement>('Remove must not include property 1').click();
  expect(ui.saved().excludedPropertyFilters).toEqual([]); ui.form.destroy();
});
it('keeps chip entry IME-safe, supports selection/blur and preserves drafts across tab changes', () => {
  const ui = editor(); ui.add('tags'); const input = ui.type('Must include: Tags', '仕事');
  input.dispatchEvent(new Event('compositionstart')); input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', isComposing: true}));
  input.dispatchEvent(new Event('blur')); expect(ui.draft.includeTags).toBe('');
  input.dispatchEvent(new Event('compositionend')); input.dispatchEvent(new Event('change')); expect(ui.draft.includeTags).toBe('仕事');
  ui.root.querySelector<HTMLButtonElement>('#tt-tab-general')!.click(); ui.root.querySelector<HTMLButtonElement>('#tt-tab-filters')!.click();
  expect(ui.draft.includeTags).toBe('仕事'); expect(ui.root.querySelector('.tt-chip-text')?.textContent).toBe('仕事');
  ui.form.setSaving(true); expect(ui.control<HTMLButtonElement>('Must include: Add filter').disabled).toBe(true);
  ui.form.setSaving(false); expect(ui.control<HTMLButtonElement>('Must include: Add filter').disabled).toBe(false);
  ui.form.destroy();
});
