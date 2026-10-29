// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { parseBoardConfig } from '../src/core/boardConfig.ts';
import { draftChanged, draftFromConfig, draftToFrontmatter } from '../src/core/boardDraft.ts';
import { renderQuickFilters, type QuickFilterMenu } from '../src/ui/renderQuickFilters.ts';
import { renderBoardSettings, type SettingsFormHost } from '../src/ui/renderBoardSettings.ts';

const config = (fm: Record<string, unknown> = {}) => parseBoardConfig('Home', {
  'quick-filters': [{ id: 'first', name: 'First' }, { id: 'off', name: 'Disabled', show: false },
    { id: 'second', name: 'Second' }, { id: 'third', name: 'Third', labels: ['green'] }], ...fm,
}).config;

function toolbar(fm: Record<string, unknown> = {}, active: string[] = [], single = false) {
  const root = document.createElement('div'); document.body.replaceChildren(root);
  const menu = vi.fn<QuickFilterMenu>(); const toggle = vi.fn();
  root.append(renderQuickFilters(root, config(fm), active, single, () => document.createElement('i'), toggle, menu));
  const group = (mode = 'all') => root.querySelector(`.tt-quick-filter-group--${mode}`)!;
  const names = (mode = 'all') => [...group(mode).querySelectorAll('.tt-quick-filter')].map((b) => b.textContent);
  const trigger = (mode = 'all') => group(mode).querySelector<HTMLButtonElement>('.tt-quick-filter-menu');
  return { root, menu, toggle, names, trigger };
}

describe('quick filter menu settings', () => {
  it('leaves old boards unchanged and preserves blank versus zero overrides', () => {
    const original = config(); const draft = draftFromConfig(original);
    expect(original.quickFiltersMenu).toBe(false);
    expect(original.quickFiltersVisibleMobile).toBeNull();
    expect(draftChanged(draft, original)).toBe(false);
    draft.quickFiltersMenu = true; draft.quickFiltersVisible = '2';
    let result = draftToFrontmatter(draft, original);
    expect(result.errors).toEqual([]);
    expect(config(result.frontmatter)).toMatchObject({ quickFiltersMenu: true, quickFiltersVisible: 2, quickFiltersVisibleMobile: null });
    draft.quickFiltersVisibleMobile = '0'; result = draftToFrontmatter(draft, original);
    expect(config(result.frontmatter).quickFiltersVisibleMobile).toBe(0);
    expect(draftFromConfig(config(result.frontmatter)).quickFiltersVisibleMobile).toBe('0');
  });
  it.each(['-1', '1.5', 'no', 'Infinity'])('rejects invalid counts: %s', (value) => {
    const original = config(); const draft = draftFromConfig(original); draft.quickFiltersVisible = value;
    expect(draftToFrontmatter(draft, original).errors).toHaveLength(1);
    expect(config({ 'quick-filters-visible-mobile': value }).quickFiltersVisibleMobile).toBeNull();
  });
  it('shows optional numeric fields only when enabled and keeps values when toggled', () => {
    Element.prototype.scrollIntoView = vi.fn();
    const root = document.createElement('div'); document.body.replaceChildren(root);
    const original = config(); const draft = draftFromConfig(original);
    const host: SettingsFormHost = {
      initialSection: 'quick', icon: vi.fn(), attachKeySuggest: vi.fn(), attachValueSuggest: vi.fn(),
      attachTagSuggest: vi.fn(), attachFolderSuggest: vi.fn(), countTagged: () => 0,
      onSave: vi.fn(), onDiscard: vi.fn(), onOpenBoard: vi.fn(),
    };
    const form = renderBoardSettings(root, draft, original, host);
    const check = () => root.querySelector<HTMLInputElement>('[data-focus="Group filters in a menu"]')!;
    const input = () => root.querySelector<HTMLInputElement>('input[aria-label="Filters to keep visible"]');
    expect(input()).toBeNull(); check().click();
    input()!.value = '2'; input()!.dispatchEvent(new Event('input'));
    expect(draft.quickFiltersVisible).toBe('2'); check().click(); expect(input()).toBeNull();
    check().click(); expect(input()!.value).toBe('2');
    form.destroy();
  });
});

describe('quick filter overflow', () => {
  it('shows all enabled filters by default', () => {
    const ui = toolbar(); expect(ui.names()).toEqual(['First', 'Second', 'Third']); expect(ui.trigger()).toBeNull();
  });
  it('keeps the first two enabled filters and inherits that limit on mobile', () => {
    const ui = toolbar({ 'quick-filters-menu': true, 'quick-filters-visible': 2 });
    expect(ui.names('desktop')).toEqual(['First', 'Second']); expect(ui.names('mobile')).toEqual(['First', 'Second']);
    ui.trigger('desktop')!.click(); expect(ui.menu.mock.calls[0]![1].map((item) => item.id)).toEqual(['third']);
  });
  it('puts all filters in the mobile menu for an explicit zero and applies it to selected columns', () => {
    const fm = { 'quick-filters-menu': true, 'quick-filters-visible': 2, 'quick-filters-visible-mobile': 0 };
    expect(toolbar(fm).names('mobile')).toEqual([]);
    const ui = toolbar(fm, [], true); expect(ui.names()).toEqual([]);
    ui.trigger()!.click(); expect(ui.menu.mock.calls[0]![1]).toHaveLength(3);
  });
  it.each([{}, { 'quick-filters-visible': 0 }])('blank or zero puts all filters in the menu', (extra) => {
    const ui = toolbar({ 'quick-filters-menu': true, ...extra });
    expect(ui.names('desktop')).toEqual([]); expect(ui.trigger('desktop')).not.toBeNull();
  });
  it('omits empty menus when every filter fits or every filter is disabled', () => {
    expect(toolbar({ 'quick-filters-menu': true, 'quick-filters-visible': 99 }).trigger('desktop')).toBeNull();
    expect(toolbar({ 'quick-filters-menu': true, 'quick-filters': [] }).trigger('desktop')).toBeNull();
  });
  it('keeps colors, checked state, active count, toggling and dismissal focus', () => {
    const ui = toolbar({ 'quick-filters-menu': true, 'quick-filters-visible': 2 }, ['first', 'third']);
    const trigger = ui.trigger('desktop')!;
    expect(trigger.textContent).toBe('More filters (1)'); expect(trigger.getAttribute('aria-pressed')).toBe('true');
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    trigger.click(); expect(ui.menu).toHaveBeenCalledTimes(1);
    const [, items, select, close] = ui.menu.mock.calls[0]!;
    expect(items[0]!.active).toBe(true); expect(items[0]!.title.querySelector('.tt-quick-filter-color')).not.toBeNull();
    select('third'); expect(ui.toggle).toHaveBeenCalledWith(['first']);
    close(); expect(trigger.getAttribute('aria-expanded')).toBe('false'); expect(document.activeElement).toBe(trigger);
  });
});
