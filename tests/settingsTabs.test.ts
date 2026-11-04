// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { parseBoardConfig } from '../src/core/boardConfig.ts';
import { draftFromConfig, draftToFrontmatter } from '../src/core/boardDraft.ts';
import { renderBoardSettings, type SettingsTarget } from '../src/ui/renderBoardSettings.ts';

function open(initialSection?: SettingsTarget) {
  const original = parseBoardConfig('House', { slug: 'house', columns: ['Backlog', 'Doing', 'Done'], 'done-column': 'Done' }).config;
  const draft = draftFromConfig(original);
  const root = document.createElement('div'); document.body.replaceChildren(root);
  const form = renderBoardSettings(root, draft, original, {
    initialSection, icon: vi.fn(), attachKeySuggest: vi.fn(), attachValueSuggest: vi.fn(), attachTagSuggest: vi.fn(),
    attachFolderSuggest: vi.fn(), taggedTasks: () => [], onSave: vi.fn(), onDiscard: vi.fn(),
    onRenameBoard: vi.fn(), onDuplicateBoard: vi.fn(), onDeleteBoard: vi.fn(),
  });
  const selected = () => root.querySelector('[role=tab][aria-selected=true]')!.textContent;
  const panel = () => root.querySelector('.tt-settings-body')!;
  const titles = () => [...panel().querySelectorAll('.tt-section-title')].map((t) => t.textContent);
  return { root, draft, original, form, selected, panel, titles };
}

describe('board settings tabs', () => {
  it('start with Appearance, then Quick filters, and open on the first when told nothing else', () => {
    const ui = open();
    const tabs = [...ui.root.querySelectorAll('[role=tab]')].map((tab) => tab.textContent);
    expect(tabs).toEqual(['Appearance', 'Quick filters', 'Setup', 'New tasks', 'General']);
    expect(ui.selected()).toBe('Appearance');
    expect(ui.form.section()).toBe('appearance');
  });

  it('go from the last tab to the first with the arrow keys, and report the tab showing', () => {
    const ui = open('general');
    expect(ui.form.section()).toBe('general');
    ui.root.querySelector('#tt-tab-general')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(ui.selected()).toBe('Appearance');
    ui.root.querySelector('#tt-tab-appearance')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(ui.selected()).toBe('Quick filters');
    expect(ui.form.section()).toBe('quick');
  });

  it('put Card color rules ahead of the rest of Appearance', () => {
    const ui = open('appearance');
    expect(ui.titles()).toEqual(['Card color rules', 'Choose how cards look']);
    expect(ui.panel().firstElementChild!.classList.contains('tt-settings-color-rules')).toBe(true);
    const look = ui.panel().querySelector('.tt-settings-card-look')!;
    expect(look.classList.contains('tt-settings-part')).toBe(true);
    expect(look.nextElementSibling!.getAttribute('aria-label')).toBe('Label shape');
  });

  it('keep General to renaming, duplicating and deleting the board', () => {
    const ui = open('general');
    expect(ui.selected()).toBe('General');
    expect(ui.titles()).toEqual(['Rename or duplicate', 'Delete board']);
    expect(ui.panel().querySelector('input, select')).toBeNull();
  });

  it('put columns, date rows and filters together in Setup, in that order', () => {
    const ui = open('setup');
    expect(ui.selected()).toBe('Setup');
    expect(ui.titles()).toEqual(['Columns', 'Date rows', 'Filters']);
    const after = (a: Element, b: Element) => a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING;
    const [column, due, match] = ['[aria-label="Column 1 name"]', '[aria-label="Due now window"]', '[aria-label="Filters"]'].map((s) => ui.panel().querySelector(s)!);
    expect(after(column!, due!)).toBeTruthy();
    expect(after(due!, match!)).toBeTruthy();
    for (const name of ['Window unit', 'Future week rows', 'Weeks start on', 'Show completed tasks for', 'Done column', 'No due date column']) {
      expect(ui.panel().querySelector(`[aria-label="${name}"]`), name).not.toBeNull();
    }
    // Dragging a column scrolls the panel, so columns have to be directly in it.
    expect(ui.panel().querySelector('.tt-column-editor')!.parentElement).toBe(ui.panel());
  });

  it('can open at the filters, as the empty board’s Review filters does', () => {
    vi.useFakeTimers();
    const scrolled = vi.fn(function (this: Element) { return this.className; });
    Element.prototype.scrollIntoView = scrolled;
    const ui = open('filters');
    expect(ui.selected()).toBe('Setup');
    vi.runAllTimers(); vi.useRealTimers();
    expect(scrolled.mock.results.map((r) => r.value as string)).toEqual(['tt-settings-part tt-settings-filters']);
    expect(document.activeElement).toBe(ui.panel().querySelector('[aria-label="Filters: Match"]'));
  });

  it('return to Setup for an unfinished filter, which then counts as the tab showing', () => {
    Element.prototype.scrollIntoView = vi.fn();
    const ui = open();
    ui.draft.filter.items.push({ kind: 'property', key: '', condition: 'exists', values: [] });
    ui.form.showErrors(draftToFrontmatter(ui.draft, ui.original).errors);
    expect(ui.selected()).toBe('Setup');
    expect(ui.form.section()).toBe('setup');
    expect(document.activeElement?.getAttribute('aria-invalid')).toBe('true');
  });
});
