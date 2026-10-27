// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { buildBoard, taskId, type BoardTask } from '../src/core/board.ts';
import { newBoardFrontmatter, parseBoardConfig } from '../src/core/boardConfig.ts';
import { draftChanged, draftFromConfig, draftToFrontmatter } from '../src/core/boardDraft.ts';
import { activeQuickFilterIds, setActiveQuickFilterIds } from '../src/core/collapse.ts';
import { parseQuickFilters, taskMatchesQuickFilter } from '../src/core/quickFilters.ts';
import { parseTaskLine } from '../src/core/taskLine.ts';
import { renderBoard, type RenderHost } from '../src/ui/renderBoard.ts';
import { renderBoardSettings, type SettingsFormHost } from '../src/ui/renderBoardSettings.ts';

// Wednesday.
const TODAY = '2026-10-21';

function task(raw: string, line: number, path = 'Projects/House.md'): BoardTask {
  return { ...parseTaskLine(raw)!, id: taskId(path, line), path, line, raw };
}

const urgent = task('- [ ] Fix the leak ⏫ 📅 2026-10-20 #tt/house/label/green', 0);
const highest = task('- [ ] Call the roofer 🔺 📅 2026-11-30', 1);
const plain = task('- [ ] Sweep the porch #outside', 2);
const low = task('- [ ] Oil the hinges 🔽 📅 2026-10-21 #tt/house/label/green', 3);
const tasks = [urgent, highest, plain, low];

const config = (fm: Record<string, unknown> = {}) => parseBoardConfig('House', { slug: 'house', ...fm }).config;
const cards = (ids: string[], fm: Record<string, unknown> = {}) => {
  const model = buildBoard(tasks, config(fm), TODAY, () => undefined, () => [], ids);
  return Object.values(model.cells).flatMap((row) => Object.values(row).flat()).map((t) => t.text).sort();
};

describe('quick filter config', () => {
  it('gives boards without quick filters High priority, Overdue and their first label', () => {
    const c = config({ labels: [{ id: 'urgent', name: 'Critical', color: '#c74e48' }, { id: 'calm', name: '', color: '#216e4e' }] });
    expect(c.quickFilters.map((f) => [f.id, f.name, f.show, f.priorities, f.labels])).toEqual([
      ['high-priority', 'High priority', true, ['highest', 'high'], []],
      ['overdue', 'Overdue', true, [], []],
      ['label-urgent', '🏷️ Critical', true, [], ['urgent']],
    ]);
    expect(c.quickFilters[1]!.due).toEqual(['overdue']);
    expect(config({ labels: [{ id: 'calm', name: '', color: '#216e4e' }] }).quickFilters[2]!.name).toBe('🏷️ Green');
    expect(config({ labels: [] }).quickFilters.map((f) => f.id)).toEqual(['high-priority', 'overdue']);
    expect(config({ 'quick-filters': [] }).quickFilters).toEqual([]);
  });

  it('writes the defaults into new boards so they read back the same', () => {
    const fresh = parseBoardConfig('House', newBoardFrontmatter('house')).config;
    expect(fresh.quickFilters).toEqual(config().quickFilters.map((f) => f.id === 'label-green' ? { ...f, id: 'label-1', labels: ['1'] } : f));
  });

  it('ignores unnamed filters and unknown choices, and keeps ids unique', () => {
    const warnings: string[] = [];
    const filters = parseQuickFilters([
      { name: 'Soon', due: ['today', 'Due now', 'someday'], priority: ['HIGH', 'urgent'] },
      { name: 'Soon', show: 'false' },
      { due: ['today'] },
      'Loose',
    ], [], warnings);
    expect(filters.map((f) => [f.id, f.show, f.due, f.priorities])).toEqual([
      ['soon', true, ['today', 'due-now'], ['high']],
      ['soon-2', false, [], []],
    ]);
    expect(warnings).toHaveLength(2);
  });
});

describe('applying quick filters', () => {
  it('narrows the board with every filter that is on, and ignores ones that are off or hidden', () => {
    expect(cards([])).toEqual(['Call the roofer', 'Fix the leak', 'Oil the hinges', 'Sweep the porch #outside']);
    expect(cards(['high-priority'])).toEqual(['Call the roofer', 'Fix the leak']);
    expect(cards(['label-green'])).toEqual(['Fix the leak', 'Oil the hinges']);
    expect(cards(['high-priority', 'label-green'])).toEqual(['Fix the leak']);
    expect(cards(['high-priority'], { 'quick-filters': [{ id: 'high-priority', name: 'High', show: false, priority: ['high'] }] }))
      .toHaveLength(4);
    expect(cards(['missing'])).toHaveLength(4);
  });

  it('stacks on top of the board filters', () => {
    expect(cards(['label-green'], { 'exclude-tags': ['tt/house/label/green'] })).toEqual([]);
    expect(cards(['high-priority'], { 'include-folders': ['Elsewhere'] })).toEqual([]);
  });

  it('matches due dates, no priority, and task or page tags like the board filters', () => {
    const c = config({ 'due-now': 7, 'quick-filters': [
      { id: 'overdue', name: 'Overdue', due: ['overdue'] },
      { id: 'week', name: 'This week', due: ['due-now', 'none'] },
      { id: 'today', name: 'Today', due: ['today'] },
      { id: 'unranked', name: 'No priority', priority: ['none'] },
      { id: 'outside', name: 'Outside', 'include-tags': ['outside'] },
    ] }).quickFilters;
    const ids = (filter: (typeof c)[number], noteTags: string[] = []) => tasks
      .filter((t) => taskMatchesQuickFilter(t, filter, config(), TODAY, undefined, noteTags)).map((t) => t.line);
    expect(ids(c[0]!)).toEqual([0]);
    expect(ids(c[1]!)).toEqual([0, 2, 3]);
    expect(ids(c[2]!)).toEqual([3]);
    expect(ids(c[3]!)).toEqual([2]);
    expect(ids(c[4]!)).toEqual([2]);
    expect(ids(c[4]!, ['outside'])).toEqual([0, 1, 2, 3]);
  });

  it('remembers which filters are on beside the row state', () => {
    const state = setActiveQuickFilterIds({ later: true, 'quick:old': true }, ['high-priority', 'label-green']);
    expect(state).toEqual({ later: true, 'quick:high-priority': true, 'quick:label-green': true });
    expect(activeQuickFilterIds(state)).toEqual(['high-priority', 'label-green']);
  });
});

describe('quick filter toolbar', () => {
  function board(active: string[], fm: Record<string, unknown> = {}) {
    const root = document.createElement('div'); document.body.replaceChildren(root);
    const onSetQuickFilters = vi.fn();
    const host: RenderHost = {
      renderText: (el, t) => { el.textContent = t.text; }, icon: () => undefined, sourceLabel: () => 'House',
      isCollapsed: () => false, onToggleRow: vi.fn(), onSetSubtasksCollapsed: vi.fn(), onDrop: vi.fn(), onToggle: vi.fn(),
      onEdit: vi.fn(), onOpenSource: vi.fn(), onDragEnd: vi.fn(), onAddTask: vi.fn(() => true), onAddSubtask: vi.fn(() => true),
      onSettings: vi.fn(), onSetQuickFilters,
    };
    renderBoard(root, buildBoard(tasks, config(fm), TODAY, () => undefined, () => [], active), host, { warnings: [], info: [] });
    const toggles = [...root.querySelectorAll<HTMLButtonElement>('.tt-quick-filter')];
    return { root, onSetQuickFilters, toggles };
  }

  it('shows a pressed toggle for each visible filter and switches one at a time', () => {
    const ui = board(['high-priority']);
    expect(ui.toggles.map((b) => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([['High priority', 'true'], ['Overdue', 'false'], ['🏷️ Green', 'false']]);
    ui.toggles[2]!.click();
    expect(ui.onSetQuickFilters).toHaveBeenLastCalledWith(['high-priority', 'label-green']);
    ui.toggles[0]!.click();
    expect(ui.onSetQuickFilters).toHaveBeenLastCalledWith([]);
    expect(board([], { 'quick-filters': [{ name: 'Hidden', show: false }] }).toggles).toEqual([]);
  });

  it('offers to turn the filters off when nothing matches', () => {
    const ui = board(['empty'], { 'quick-filters': [{ id: 'empty', name: 'Nothing', priority: ['lowest'] }] });
    expect(ui.root.querySelector('.tt-empty-state')?.textContent).toContain('No tasks match the quick filters that are on.');
    [...ui.root.querySelectorAll<HTMLButtonElement>('.tt-empty-state button')].find((b) => b.textContent === 'Turn off quick filters')!.click();
    expect(ui.onSetQuickFilters).toHaveBeenCalledWith([]);
  });
});

describe('quick filter settings', () => {
  function editor(fm: Record<string, unknown> = {}) {
    Element.prototype.scrollIntoView = vi.fn();
    const original = config(fm), draft = draftFromConfig(original);
    const root = document.createElement('div'); document.body.replaceChildren(root);
    const host: SettingsFormHost = {
      initialSection: 'quick', icon: vi.fn(), attachKeySuggest: vi.fn(), attachValueSuggest: vi.fn(), attachTagSuggest: vi.fn(),
      attachFolderSuggest: vi.fn(), countTagged: () => 0, onSave: vi.fn(), onDiscard: vi.fn(), onOpenBoard: vi.fn(),
    };
    const form = renderBoardSettings(root, draft, original, host);
    const control = <T extends HTMLElement = HTMLButtonElement>(label: string) => root.querySelector<T>(`[aria-label="${label}"]`)!;
    const expand = (i: number) => root.querySelectorAll<HTMLButtonElement>('.tt-quick-filter-toggle')[i]!.click();
    const checkbox = (i: number, label: string) => [...root.querySelectorAll('.tt-quick-filter')[i]!.querySelectorAll('label')]
      .find((l) => l.textContent === label)!.querySelector('input')!;
    const tick = (i: number, label: string) => { const box = checkbox(i, label); box.checked = !box.checked; box.dispatchEvent(new Event('change')); };
    const saved = () => { const result = draftToFrontmatter(draft, original); return { ...result, config: parseBoardConfig('House', { slug: 'house', ...result.frontmatter }).config }; };
    return { root, draft, original, form, control, expand, checkbox, tick, saved };
  }

  it('opens and closes without changing the board', () => {
    const ui = editor();
    expect([...ui.root.querySelectorAll('.tt-quick-filter-toggle')].map((b) => b.textContent)).toEqual(['High priority', 'Overdue', '🏷️ Green']);
    expect(draftChanged(ui.draft, ui.original)).toBe(false);
  });

  it('clones a filter with a new id and edits the copy on its own', () => {
    const ui = editor();
    ui.control('Clone High priority').click();
    expect(ui.draft.quickFilters.map((f) => f.name)).toEqual(['High priority', 'High priority copy', 'Overdue', '🏷️ Green']);
    expect(document.activeElement).toBe(ui.control('Quick filter 2 name'));
    ui.tick(1, 'Medium');
    ui.tick(1, 'Show on board');
    const { errors, config: saved } = ui.saved();
    expect(errors).toEqual([]);
    const [original, copy] = saved.quickFilters;
    expect(original!.priorities).toEqual(['highest', 'high']);
    expect(copy!.id).not.toBe(original!.id);
    expect(copy!.priorities).toEqual(['highest', 'high', 'medium']);
    expect(copy!.show).toBe(false);
  });

  it('adds a filter with labels, due dates and its own tag rule, and requires a name', () => {
    const ui = editor();
    [...ui.root.querySelectorAll('button')].find((b) => b.textContent === 'Add quick filter')!.click();
    ui.tick(3, 'Overdue');
    ui.tick(3, 'Green');
    const scope = 'Quick filter 4, Must include';
    const picker = ui.control<HTMLSelectElement>(`${scope}: New filter field`); picker.value = 'tags'; picker.dispatchEvent(new Event('change'));
    ui.control(`${scope}: Add filter`).click();
    const chip = ui.control<HTMLInputElement>(`${scope}: Tags`); chip.value = 'work';
    chip.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(ui.saved().errors).toEqual(['Quick filter 4 needs a name.']);
    ui.form.showErrors(ui.saved().errors);
    const name = ui.control<HTMLInputElement>('Quick filter 4 name');
    expect(name.getAttribute('aria-invalid')).toBe('true');
    name.value = 'Late work'; name.dispatchEvent(new Event('input'));
    const { errors, config: saved } = ui.saved();
    expect(errors).toEqual([]);
    expect(saved.quickFilters[3]).toMatchObject({ name: 'Late work', due: ['overdue'], labels: ['green'], includeTags: ['work'] });
    expect(saved.includeTags).toEqual([]);
  });

  it('reorders and removes filters', () => {
    const ui = editor();
    ui.control('Move 🏷️ Green up').click();
    ui.control('Remove High priority').click();
    expect(ui.saved().config.quickFilters.map((f) => f.id)).toEqual(['label-green', 'overdue']);
  });
});
