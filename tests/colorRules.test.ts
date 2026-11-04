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

  it('reads an opacity in percent, and falls back to the automatic one', () => {
    const warnings: string[] = [];
    const rules = parseColorRules([
      { name: 'Faint', color: '#1558bc', opacity: 8 },
      { name: 'Strong', color: '#1558bc', opacity: '40.4%' },
      { name: 'Automatic', color: '#1558bc', opacity: null },
      { name: 'Too strong', color: '#1558bc', opacity: 140 },
      { name: 'Words', color: '#1558bc', opacity: 'half' },
    ], warnings);
    expect(rules.map((r) => [r.name, r.opacity])).toEqual([['Faint', 8], ['Strong', 40], ['Automatic', undefined], ['Too strong', undefined], ['Words', undefined]]);
    expect(warnings).toEqual([
      'The Too strong color rule’s opacity must be from 0 to 100, so it uses the automatic opacity.',
      'The Words color rule’s opacity must be from 0 to 100, so it uses the automatic opacity.',
    ]);
  });

  it('reads a pattern, and falls back to solid', () => {
    const warnings: string[] = [];
    const rules = parseColorRules([
      { name: 'Striped', color: '#1558bc', pattern: 'stripes' },
      { name: 'Shouted', color: '#1558bc', pattern: ' DOTS ' },
      { name: 'Solid', color: '#1558bc', pattern: 'solid' },
      { name: 'Plaid', color: '#1558bc', pattern: 'plaid' },
      { name: 'Number', color: '#1558bc', pattern: 3 },
    ], warnings);
    expect(rules.map((r) => [r.name, r.pattern])).toEqual([['Striped', 'stripes'], ['Shouted', 'dots'], ['Solid', undefined], ['Plaid', undefined], ['Number', undefined]]);
    expect(warnings).toEqual([
      'The Plaid color rule’s pattern must be solid, stripes, dots, grid or checks, so its tint is solid.',
      'The Number color rule’s pattern must be solid, stripes, dots, grid or checks, so its tint is solid.',
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
    // The theme's automatic tint comes from the stylesheet; a rule's own opacity is set on the card.
    expect(card(quote).style.getPropertyValue('--tt-card-tint')).toBe('');
    renderBoard(root, buildBoard(tasks, config({ 'color-rules': [{ ...kitchen, opacity: 35 }] }), TODAY, () => undefined), host, { warnings: [], info: [] });
    expect(card(quote).style.getPropertyValue('--tt-card-tint')).toBe('0.35');
    expect(card(quote).className).not.toMatch(/tt-tint--/);
    renderBoard(root, buildBoard(tasks, config({ 'color-rules': [{ ...kitchen, pattern: 'stripes' }] }), TODAY, () => undefined), host, { warnings: [], info: [] });
    expect(card(quote).classList.contains('tt-tint--stripes')).toBe(true);
  });
});

describe('color rule settings', () => {
  function editor(fm: Record<string, unknown> = {}) {
    Element.prototype.scrollIntoView = vi.fn();
    const original = config(fm), draft = draftFromConfig(original);
    const root = document.createElement('div'); document.body.replaceChildren(root);
    const host: SettingsFormHost = {
      initialSection: 'appearance', icon: vi.fn(), attachKeySuggest: vi.fn(), attachValueSuggest: vi.fn(), attachTagSuggest: vi.fn(),
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

  it('ends the Appearance tab with Card color rules, empty to start, and leaves boards without rules unchanged', () => {
    const ui = editor();
    expect(ui.control('Board settings sections').querySelector('[aria-selected="true"]')!.textContent).toBe('Appearance');
    const section = ui.root.querySelector('.tt-settings-body')!.querySelector('.tt-settings-color-rules')!;
    expect(section.querySelector('.tt-section-title')!.textContent).toBe('Card color rules');
    expect(section.nextElementSibling).toBeNull();
    expect(ui.root.querySelector('.tt-filter-empty')!.textContent).toBe('No color rules.');
    expect(draftChanged(ui.draft, ui.original)).toBe(false);
    expect('color-rules' in ui.saved().frontmatter && ui.saved().frontmatter['color-rules'] !== undefined).toBe(false);
  });

  it('can open straight at Card color rules, in the Appearance tab', () => {
    vi.useFakeTimers();
    const scrolled = vi.fn(function (this: Element) { return this.className; });
    Element.prototype.scrollIntoView = scrolled;
    const original = config({ 'color-rules': [kitchen] });
    const root = document.createElement('div'); document.body.replaceChildren(root);
    renderBoardSettings(root, draftFromConfig(original), original, {
      showColorRules: true, icon: vi.fn(), attachKeySuggest: vi.fn(), attachValueSuggest: vi.fn(), attachTagSuggest: vi.fn(),
      attachFolderSuggest: vi.fn(), taggedTasks: () => [], onSave: vi.fn(), onDiscard: vi.fn(),
    });
    expect(root.querySelector('#tt-tab-appearance')!.getAttribute('aria-selected')).toBe('true');
    vi.runAllTimers(); vi.useRealTimers();
    expect(scrolled.mock.results.map((r) => r.value as string)).toEqual(['tt-settings-color-rules']);
    expect(document.activeElement).toBe(root.querySelector('.tt-settings-color-rules .tt-quick-filter-toggle'));
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

  it('mixes a color with sliders, kept in step with the palette and the code', () => {
    const ui = editor({ 'color-rules': [kitchen] });
    ui.root.querySelector<HTMLButtonElement>('.tt-quick-filter-toggle')!.click();
    const slider = (name: string) => ui.control<HTMLInputElement>(`Color rule 1 ${name}`);
    const slide = (name: string, value: number) => { slider(name).value = String(value); slider(name).dispatchEvent(new Event('input')); };
    expect([slider('hue').value, slider('saturation').value, slider('lightness').value]).toEqual(['216', '80', '41']);
    expect(slider('hue').getAttribute('aria-valuetext')).toBe('216°, blue');
    slide('hue', 270);
    expect(ui.control<HTMLInputElement>('Color rule 1 color code').value).toBe('#6915BC');
    expect(ui.swatch(0, 'Blue').getAttribute('aria-pressed')).toBe('false');
    expect(ui.root.querySelector('.tt-quick-filter-toggle .tt-color-rule-swatch')!.getAttribute('aria-label')).toBe('#6915BC');
    // Gray has no hue, so the hue slider stays put.
    ui.type('Color rule 1 color code', '#808080');
    expect([slider('hue').value, slider('saturation').value]).toEqual(['270', '0']);
    ui.swatch(0, 'Purple').click();
    expect(slider('hue').value).toBe('278');
    expect(ui.saved().frontmatter['color-rules']).toEqual([{ ...kitchen, color: '#803fa5' }]);
  });

  it('sets an opacity, shows it on a sample card, and can go back to automatic', () => {
    const ui = editor({ 'color-rules': [kitchen] });
    ui.root.querySelector<HTMLButtonElement>('.tt-quick-filter-toggle')!.click();
    const opacity = ui.control<HTMLInputElement>('Color rule 1 opacity');
    const sample = ui.root.querySelector<HTMLElement>('.tt-color-sample')!;
    expect(opacity.getAttribute('aria-valuetext')).toBe('Automatic, 14%');
    expect(ui.button('Use automatic opacity').hidden).toBe(true);
    expect(sample.style.getPropertyValue('--tt-card-rgb')).toBe('21, 88, 188');
    opacity.value = '35'; opacity.dispatchEvent(new Event('input'));
    expect(opacity.getAttribute('aria-valuetext')).toBe('35%');
    expect(sample.style.getPropertyValue('--tt-card-tint')).toBe('0.35');
    expect(ui.saved().frontmatter['color-rules']).toEqual([{ name: 'Kitchen', color: '#1558bc', opacity: 35, 'include-folders': ['Projects'] }]);
    ui.button('Use automatic opacity').click();
    expect(document.activeElement).toBe(opacity);
    expect(opacity.getAttribute('aria-valuetext')).toBe('Automatic, 14%');
    expect(sample.style.getPropertyValue('--tt-card-tint')).toBe('');
    expect(changedFrontmatter(ui.draft, ui.original)).toEqual({});
  });

  it('chooses a pattern, shown in the rule’s color and on the sample card', () => {
    const ui = editor({ 'color-rules': [kitchen] });
    ui.root.querySelector<HTMLButtonElement>('.tt-quick-filter-toggle')!.click();
    const patterns = ui.control<HTMLElement>('Color rule 1 pattern');
    const choice = (name: string) => [...patterns.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === name)!;
    const sample = ui.root.querySelector<HTMLElement>('.tt-color-sample')!;
    expect([...patterns.querySelectorAll('button')].map((b) => [b.textContent, b.getAttribute('aria-pressed')])).toEqual(
      [['Solid', 'true'], ['Stripes', 'false'], ['Dots', 'false'], ['Grid', 'false'], ['Checks', 'false']]);
    expect(patterns.style.getPropertyValue('--tt-card-rgb')).toBe('21, 88, 188');
    choice('Stripes').click();
    expect(choice('Stripes').getAttribute('aria-pressed')).toBe('true');
    expect(choice('Solid').getAttribute('aria-pressed')).toBe('false');
    expect(sample.classList.contains('tt-tint--stripes')).toBe(true);
    // The choices follow the color as it changes.
    ui.swatch(0, 'Purple').click();
    expect(patterns.style.getPropertyValue('--tt-card-rgb')).toBe(sample.style.getPropertyValue('--tt-card-rgb'));
    expect(ui.saved().frontmatter['color-rules']).toEqual([{ name: 'Kitchen', color: '#803fa5', pattern: 'stripes', 'include-folders': ['Projects'] }]);
    expect(ui.saved().config.colorRules[0]!.pattern).toBe('stripes');
    choice('Solid').click();
    expect(sample.classList.contains('tt-tint--stripes')).toBe(false);
    ui.swatch(0, 'Blue').click();
    expect(changedFrontmatter(ui.draft, ui.original)).toEqual({});
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

  it('opens the Appearance tab for a rule’s unfinished filter', () => {
    const ui = editor({ 'color-rules': [kitchen] });
    ui.control<HTMLButtonElement>('Board settings sections').querySelector<HTMLButtonElement>('#tt-tab-general')!.click();
    ui.draft.colorRules[0]!.filter.items.push({ kind: 'property', key: '', condition: 'exists', values: [] });
    ui.form.showErrors(ui.saved().errors);
    expect(ui.root.querySelector('#tt-tab-appearance')!.getAttribute('aria-selected')).toBe('true');
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
