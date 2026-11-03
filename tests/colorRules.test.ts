// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { buildBoard, taskId, type BoardTask } from '../src/core/board.ts';
import { parseBoardConfig } from '../src/core/boardConfig.ts';
import { changedFrontmatter, draftChanged, draftFromConfig, draftToFrontmatter } from '../src/core/boardDraft.ts';
import { parseColorRules } from '../src/core/colorRules.ts';
import { parseTaskLine } from '../src/core/taskLine.ts';
import { renderBoard, type RenderHost } from '../src/ui/renderBoard.ts';
import { renderBoardSettings, type SettingsFormHost } from '../src/ui/renderBoardSettings.ts';

const TODAY = '2026-10-27';
const task = (line: number, text: string, path = 'Projects/Kitchen.md', parent?: BoardTask): BoardTask => {
  const raw = `- [ ] ${text}`;
  return { ...parseTaskLine(raw)!, raw, id: taskId(path, line), path, line, parentId: parent?.id };
};
const repaint = task(0, 'Repaint the walls ⏫ #tt/house/label/red');
const trim = task(1, 'Paint the trim ⏫', 'Projects/Kitchen.md', repaint);
const quote = task(2, 'Get countertop quotes');
const café = task(3, 'Book the Café table #tt/house/label/green', 'Errands.md');
const sweep = task(4, 'Sweep the porch', 'Errands.md');
const tasks = [repaint, trim, quote, café, sweep];
const config = (fm: Record<string, unknown> = {}) => parseBoardConfig('House', {
  slug: 'house', columns: ['Backlog', 'Doing', 'Done'], 'done-column': 'done',
  labels: [{ id: 'red', color: '#ae2e24', name: '' }, { id: 'green', color: '#216e4e', name: 'Out and about' }], ...fm,
}).config;
const kitchen = { name: 'Kitchen', color: '#1558bc', 'include-folders': ['Projects'] };
const urgent = { name: 'Urgent', color: '#ae2e24', priority: ['high'] };
const colors = (rules: unknown[], frontmatterOf: (path: string) => Record<string, unknown> | undefined = () => undefined, noteTags: (path: string) => string[] = () => []) => {
  const model = buildBoard(tasks, config({ 'color-rules': rules }), TODAY, frontmatterOf, noteTags);
  return Object.fromEntries(Object.entries(model.colors).map(([id, rule]) => [tasks.find((t) => t.id === id)!.text, rule.name]));
};

describe('color rules', () => {
  it('reads each rule’s name, color and criteria, skipping what it can’t use', () => {
    const warnings: string[] = [];
    expect(parseColorRules(undefined, warnings)).toEqual([]);
    expect(parseColorRules(null, warnings)).toEqual([]);
    expect(warnings).toEqual([]);
    expect(parseColorRules('blue', warnings)).toEqual([]);
    const rules = parseColorRules([
      { name: ' Errands ', color: '#ABC', labels: ['Green'], 'no-labels': 'true', due: ['Today'], 'include-folders': ['Errands'] },
      { color: '#1558bc' },
      { name: 'Plum', color: 'plum' },
    ], warnings);
    expect(rules).toEqual([{
      name: 'Errands', color: '#aabbcc', priorities: [], labels: ['green'], noLabels: true, due: ['today'],
      filter: { kind: 'group', match: 'all', items: [{ kind: 'folders', values: ['Errands'] }] },
    }]);
    expect(warnings).toEqual([
      'color-rules must be a list; no cards are colored.',
      'A color rule without a name was ignored.',
      'The Plum color rule was ignored: its color must be a hex color such as #1558bc.',
    ]);
  });

  it('colors each card with the first rule it matches, and leaves subtasks to their card', () => {
    expect(colors([kitchen, urgent])).toEqual({ 'Repaint the walls': 'Kitchen', 'Get countertop quotes': 'Kitchen' });
    expect(colors([urgent, kitchen])).toEqual({ 'Repaint the walls': 'Urgent', 'Get countertop quotes': 'Kitchen' });
    expect(colors([{ name: 'Labeled', color: '#216e4e', labels: ['green'] }, { name: 'Everything else', color: '#7f5f01' }])).toEqual({
      'Repaint the walls': 'Everything else', 'Get countertop quotes': 'Everything else', 'Book the Café table': 'Labeled', 'Sweep the porch': 'Everything else',
    });
  });

  it('matches note properties and note tags, even when the board’s own filters use neither', () => {
    const fm = (path: string) => path === 'Errands.md' ? { context: 'outside' } : undefined;
    expect(colors([{ name: 'Outside', color: '#216e4e', 'filter-properties': ['context: outside'] }], fm)).toEqual({
      'Book the Café table': 'Outside', 'Sweep the porch': 'Outside',
    });
    const tags = (path: string) => path === 'Errands.md' ? ['errand'] : [];
    expect(colors([{ name: 'Errand', color: '#216e4e', 'include-tags': ['errand'] }], undefined, tags)).toEqual({
      'Book the Café table': 'Errand', 'Sweep the porch': 'Errand',
    });
  });

  it('tints a matching card and names its rule first in the card’s description', () => {
    const root = document.createElement('div'); document.body.replaceChildren(root);
    const host: RenderHost = {
      renderText: (el, t) => { el.textContent = t.text; }, icon: () => undefined, sourceLabel: (t) => t.path,
      isCollapsed: () => false, onToggleRow: vi.fn(), onSetSubtasksCollapsed: vi.fn(), onDrop: vi.fn(), onToggle: vi.fn(),
      onEdit: vi.fn(), onOpenSource: vi.fn(), onDragEnd: vi.fn(), onAddTask: vi.fn(() => true), onAddSubtask: vi.fn(() => true),
      onSettings: vi.fn(),
    };
    renderBoard(root, buildBoard(tasks, config({ 'color-rules': [kitchen] }), TODAY, () => undefined), host, { warnings: [], info: [] });
    const card = (t: BoardTask) => root.querySelector<HTMLElement>(`.tt-card[data-id="${t.id}"]`)!;
    expect(card(quote).classList.contains('tt-card--colored')).toBe(true);
    expect(card(quote).style.getPropertyValue('--tt-card-rgb')).toBe('21, 88, 188');
    expect(card(quote).getAttribute('aria-description')).toMatch(/^Kitchen\. Press Enter to edit/);
    expect(card(sweep).classList.contains('tt-card--colored')).toBe(false);
    expect(card(sweep).getAttribute('aria-description')).toMatch(/^Press Enter to edit/);
    expect(root.querySelector('.tt-subtask.tt-card--colored')).toBeNull();
  });
});

describe('color rule settings', () => {
  function editor(fm: Record<string, unknown> = {}) {
    Element.prototype.scrollIntoView = vi.fn();
    const original = config(fm), draft = draftFromConfig(original);
    const root = document.createElement('div'); document.body.replaceChildren(root);
    const host: SettingsFormHost = {
      initialSection: 'colors', icon: vi.fn(), attachKeySuggest: vi.fn(), attachValueSuggest: vi.fn(), attachTagSuggest: vi.fn(),
      attachFolderSuggest: vi.fn(), taggedTasks: () => [], onSave: vi.fn(), onDiscard: vi.fn(),
    };
    const form = renderBoardSettings(root, draft, original, host);
    const control = <T extends HTMLElement = HTMLButtonElement>(label: string) => root.querySelector<T>(`[aria-label="${label}"]`)!;
    const button = (text: string) => [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === text)!;
    const swatch = (i: number, name: string) => root.querySelectorAll('.tt-color-rule-editor')[i]!.querySelector<HTMLButtonElement>(`.tt-label-colors [aria-label="${name}"]`)!;
    const type = (label: string, value: string) => { const node = control<HTMLInputElement>(label); node.value = value; node.dispatchEvent(new Event('input')); };
    const tick = (i: number, label: string) => {
      const box = [...root.querySelectorAll('.tt-color-rule-editor')[i]!.querySelectorAll('label')].find((l) => l.textContent === label)!.querySelector('input')!;
      box.checked = !box.checked; box.dispatchEvent(new Event('change'));
    };
    const saved = () => { const result = draftToFrontmatter(draft, original); return { ...result, config: parseBoardConfig('House', { slug: 'house', ...result.frontmatter }).config }; };
    return { root, draft, original, form, control, button, swatch, type, tick, saved };
  }

  it('has a Colors tab that starts empty and leaves boards without rules unchanged', () => {
    const ui = editor();
    expect(ui.control('Board settings sections').querySelector('[aria-selected="true"]')!.textContent).toBe('Colors');
    expect(ui.root.querySelector('.tt-filter-empty')!.textContent).toBe('No color rules.');
    expect(draftChanged(ui.draft, ui.original)).toBe(false);
    expect('color-rules' in ui.saved().frontmatter && ui.saved().frontmatter['color-rules'] !== undefined).toBe(false);
  });

  it('adds a rule with a palette color, criteria and its own folder filter', () => {
    const ui = editor();
    ui.button('Add color rule').click();
    expect(document.activeElement).toBe(ui.control('Color rule 1 name'));
    // A new rule starts with the first palette color, and the next with one not used yet.
    expect(ui.swatch(0, 'Green').getAttribute('aria-pressed')).toBe('true');
    ui.type('Color rule 1 name', 'Kitchen');
    ui.swatch(0, 'Blue').click();
    expect(ui.swatch(0, 'Blue').getAttribute('aria-pressed')).toBe('true');
    expect(ui.swatch(0, 'Green').getAttribute('aria-pressed')).toBe('false');
    expect(ui.control<HTMLInputElement>('Color rule 1 color code').value).toBe('#1558BC');
    expect(ui.root.querySelector('.tt-quick-filter-toggle .tt-color-rule-swatch')!.getAttribute('aria-label')).toBe('Blue');
    ui.tick(0, 'High');
    ui.control('Color rule 1, filters: Add filter').click();
    const field = ui.control<HTMLSelectElement>('Color rule 1, Filter 1: Field'); field.value = 'folders'; field.dispatchEvent(new Event('change'));
    const folder = ui.control<HTMLInputElement>('Color rule 1, Filter 1: Note folders'); folder.value = 'Projects';
    folder.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const { errors, frontmatter, config: saved } = ui.saved();
    expect(errors).toEqual([]);
    expect(frontmatter['color-rules']).toEqual([{ name: 'Kitchen', color: '#1558bc', priority: ['high'], 'include-folders': ['Projects'] }]);
    expect(saved.colorRules[0]).toMatchObject({ name: 'Kitchen', color: '#1558bc', priorities: ['high'], filter: { items: [{ kind: 'folders', values: ['Projects'] }] } });
    ui.button('Add color rule').click();
    expect(ui.swatch(1, 'Blue').getAttribute('aria-pressed')).toBe('false');
    expect(ui.swatch(1, 'Green').getAttribute('aria-pressed')).toBe('true');
  });

  it('requires a name and a hex color, and shows where', () => {
    const ui = editor();
    ui.button('Add color rule').click();
    ui.type('Color rule 1 color code', '#12');
    expect(ui.saved().errors).toEqual(['Color rule 1 needs a name.', 'Color rule 1 needs a hex color such as #AABBCC or #ABC.']);
    ui.form.showErrors(ui.saved().errors);
    expect(ui.control('Color rule 1 name').getAttribute('aria-invalid')).toBe('true');
    expect(ui.control('Color rule 1 color code').getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(ui.control('Color rule 1 name'));
    ui.type('Color rule 1 name', 'Plum');
    ui.type('Color rule 1 color code', '#8e4585');
    expect(ui.control('Color rule 1 color code').getAttribute('aria-invalid')).toBe('false');
    expect(ui.saved().errors).toEqual([]);
  });

  it('opens the Colors tab for a rule’s unfinished filter', () => {
    const ui = editor({ 'color-rules': [kitchen] });
    ui.control<HTMLButtonElement>('Board settings sections').querySelector<HTMLButtonElement>('#tt-tab-general')!.click();
    ui.draft.colorRules[0]!.filter.items.push({ kind: 'property', key: '', condition: 'exists', values: [] });
    ui.form.showErrors(ui.saved().errors);
    expect(ui.root.querySelector('#tt-tab-colors')!.getAttribute('aria-selected')).toBe('true');
    expect(ui.control('Color rule 1, Filter 2: Property').getAttribute('aria-invalid')).toBe('true');
  });

  it('clones, reorders and removes rules, removing the property with the last one', () => {
    const ui = editor({ 'color-rules': [kitchen, urgent] });
    ui.control('Clone Kitchen').click();
    expect(ui.draft.colorRules.map((r) => r.name)).toEqual(['Kitchen', 'Kitchen copy', 'Urgent']);
    ui.control('Reorder Urgent').dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(ui.saved().config.colorRules.map((r) => r.name)).toEqual(['Urgent', 'Kitchen', 'Kitchen copy']);
    for (const name of ['Urgent', 'Kitchen', 'Kitchen copy']) ui.control(`Remove ${name}`).click();
    expect(ui.root.querySelector('.tt-filter-empty')!.textContent).toBe('No color rules.');
    expect(changedFrontmatter(ui.draft, ui.original)).toEqual({ 'color-rules': undefined });
  });
});
