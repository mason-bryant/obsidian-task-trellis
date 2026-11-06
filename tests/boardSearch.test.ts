// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildBoard, taskId, type BoardModel, type BoardTask } from '../src/core/board.ts';
import { parseBoardConfig } from '../src/core/boardConfig.ts';
import { triageCards } from '../src/core/bulkTriage.ts';
import { searchTerms } from '../src/core/search.ts';
import { parseTaskLine } from '../src/core/taskLine.ts';
import { ANNOUNCE_DELAY_MS } from '../src/ui/announce.ts';
import { disposeBoardSelection, renderBoard, SEARCH_DELAY_MS, type RenderHost } from '../src/ui/renderBoard.ts';

const TODAY = '2026-10-27';
const task = (line: number, text: string, path = 'Projects/Kitchen.md', parent?: BoardTask): BoardTask => {
  const raw = `- [ ] ${text}`;
  return { ...parseTaskLine(raw)!, raw, id: taskId(path, line), path, line, parentId: parent?.id };
};
const repaint = task(0, 'Repaint the walls #tt/house/label/red');
const trim = task(1, 'Paint the trim', 'Projects/Kitchen.md', repaint);
const primer = task(2, 'Buy primer', 'Projects/Kitchen.md', repaint);
const café = task(3, 'Book the Café table ⏫ #tt/house/label/green', 'Errands.md');
const sweep = task(4, 'Sweep the porch', 'Errands.md');
const tasks = [repaint, trim, primer, café, sweep];
const config = (fm: Record<string, unknown> = {}) => parseBoardConfig('House', {
  slug: 'house', columns: ['Backlog', 'Doing', 'Done'], 'done-column': 'done',
  labels: [{ id: 'red', color: '#ae2e24', name: '' }, { id: 'green', color: '#216e4e', name: 'Out and about' }], ...fm,
}).config;
const model = (search: string, quick: string[] = [], fm: Record<string, unknown> = {}) =>
  buildBoard(tasks, config(fm), TODAY, () => undefined, () => [], quick, search);
const cards = (m: BoardModel) => Object.values(m.cells).flatMap((row) => Object.values(row).flat()).map((t) => t.text).sort();

describe('searching a board', () => {
  it('finds a completed subtask a card shows, however long ago it was completed', () => {
    const raw = '- [x] Line the drawers ✅ 2026-01-01';
    const old: BoardTask = { ...parseTaskLine(raw)!, raw, id: taskId('Projects/Kitchen.md', 9), path: 'Projects/Kitchen.md', line: 9, parentId: repaint.id };
    const found = (search: string, quick: string[] = []) => buildBoard([...tasks, old], config({ 'quick-filters': [{ id: 'undated', name: 'Undated', due: ['none'], 'match-subtasks': true }] }), TODAY, () => undefined, () => [], quick, search);
    const shown = found('drawers');
    expect(Object.values(shown.cells).flatMap((row) => Object.values(row).flat()).map((t) => t.id)).toEqual([repaint.id]);
    expect(shown.quickContext?.matches.has(old.id)).toBe(true);
    // A quick filter still leaves it out, as Show completed tasks for says.
    expect(found('', ['undated']).quickContext?.matches.has(old.id)).toBe(false);
  });

  it('ignores case, accents and repeated words', () => {
    expect(searchTerms('  Café  KITCHEN cafe ')).toEqual(['cafe', 'kitchen']);
    expect(searchTerms('   ')).toEqual([]);
  });

  it('matches what a card shows: its text, its note’s name and its labels, named or by color', () => {
    expect(cards(model('cafe'))).toEqual(['Book the Café table']);
    expect(cards(model('ERRANDS'))).toEqual(['Book the Café table', 'Sweep the porch']);
    expect(cards(model('about'))).toEqual(['Book the Café table']);
    expect(cards(model('red'))).toEqual(['Repaint the walls']);
    // The board's own tags and the Tasks fields aren't part of the text.
    expect(cards(model('tt/house'))).toEqual([]);
  });

  it('needs every word, each in the card or in one of its subtasks', () => {
    expect(cards(model('sweep porch'))).toEqual(['Sweep the porch']);
    expect(cards(model('sweep table'))).toEqual([]);
    const m = model('kitchen trim');
    expect(cards(m)).toEqual(['Repaint the walls']);
    expect(m.quickContext?.contextOnly).toEqual(new Set([repaint.id]));
    expect(m.quickContext?.matches).toEqual(new Set([trim.id]));
    expect(m.search).toBe('kitchen trim');
  });

  it('shows a card for a matching subtask, which matches by its own text only', () => {
    const m = model('trim');
    expect(cards(m)).toEqual(['Repaint the walls']);
    expect(m.quickContext?.matches).toEqual(new Set([trim.id]));
    expect(triageCards(m)).toEqual([]);
    // Searching for the note finds the card, not every subtask in it.
    const note = model('kitchen');
    expect(note.quickContext?.matches).toEqual(new Set());
    expect(note.quickContext?.contextOnly).toEqual(new Set());
    expect(triageCards(note).map((t) => t.id)).toEqual([repaint.id]);
  });

  it('narrows on top of the quick filters that are on, and does nothing when blank', () => {
    expect(cards(model('the', ['high-priority']))).toEqual(['Book the Café table']);
    const blank = model('  ');
    expect(blank.search).toBe('');
    expect(blank.quickContext).toBeUndefined();
    expect(cards(blank)).toEqual(cards(model('')));
  });
});

describe('the search box', () => {
  afterEach(() => { vi.useRealTimers(); });

  function board(fm: Record<string, unknown> = {}, quick: string[] = []) {
    vi.useFakeTimers();
    const root = document.createElement('div'); document.body.replaceChildren(root);
    let search = '';
    const draw = () => renderBoard(root, model(search, quick, fm), host, { warnings: [], info: [] });
    const onSearch = vi.fn((query: string) => { search = query; draw(); });
    const onSetQuickFilters = vi.fn((ids: string[]) => { quick = ids; draw(); });
    const host: RenderHost = {
      renderText: (el, t) => { el.textContent = t.text; }, icon: () => undefined, sourceLabel: (t) => t.path,
      isCollapsed: () => false, onToggleRow: vi.fn(), onSetSubtasksCollapsed: vi.fn(), onDrop: vi.fn(), onToggle: vi.fn(),
      onEdit: vi.fn(), onOpenSource: vi.fn(), onDragEnd: vi.fn(), onAddTask: vi.fn(() => true), onAddSubtask: vi.fn(() => true),
      onSettings: vi.fn(), onSetQuickFilters, onSearch, onBulkAction: vi.fn(),
    };
    draw();
    const input = () => root.querySelector<HTMLInputElement>('input.tt-board-search-input')!;
    const type = (text: string) => { input().value = text; input().dispatchEvent(new Event('input')); };
    const key = (k: string) => input().dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    const total = () => root.querySelector('.tt-board-total')!.textContent;
    const empty = () => root.querySelector<HTMLElement>('.tt-empty-state');
    const button = (text: string) => [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === text)!;
    return { root, input, type, key, total, empty, button, onSearch, onSetQuickFilters, draw };
  }

  it('ends the heading’s row, before the tools, named for screen readers', () => {
    const ui = board();
    const bar = [...ui.root.querySelector('.tt-board-toolbar')!.children].map((child) => child.className);
    expect(bar).toEqual(['tt-board-heading', 'tt-board-search', 'tt-board-tools']);
    expect(ui.root.querySelector('.tt-board-tools')!.lastElementChild!.textContent).toBe('Settings');
    expect(ui.root.querySelector<HTMLButtonElement>('.tt-board-search-clear')!.hidden).toBe(true);
    // Redraws keep that order.
    ui.type('porch'); vi.advanceTimersByTime(SEARCH_DELAY_MS);
    expect([...ui.root.querySelector('.tt-board-toolbar')!.children].map((child) => child.className)).toEqual(bar);
    expect(ui.input().type).toBe('search');
    expect(ui.input().getAttribute('aria-label')).toBe('Search cards');
    expect(ui.input().placeholder).toBe('Search cards…');
  });

  it('searches once typing pauses, keeping the same box, its focus and its caret', () => {
    const ui = board();
    const field = ui.input(); field.focus();
    ui.type('swe'); ui.type('sweep');
    field.setSelectionRange(2, 2);
    expect(ui.onSearch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(SEARCH_DELAY_MS);
    expect(ui.onSearch).toHaveBeenCalledTimes(1);
    expect(ui.onSearch).toHaveBeenLastCalledWith('sweep');
    expect(ui.total()).toBe('1 card');
    expect(ui.input()).toBe(field);
    expect(document.activeElement).toBe(field);
    expect([field.selectionStart, field.selectionEnd]).toEqual([2, 2]);
    expect(ui.root.querySelector<HTMLButtonElement>('.tt-board-search-clear')!.hidden).toBe(false);
    // A redraw for another reason leaves text that hasn't been searched yet alone.
    ui.type('sweep the'); ui.draw();
    expect(ui.input().value).toBe('sweep the');
  });

  it('waits for an input method to finish the word', () => {
    const ui = board();
    ui.input().value = 'カ';
    ui.input().dispatchEvent(new InputEvent('input', { isComposing: true }));
    vi.advanceTimersByTime(SEARCH_DELAY_MS * 2);
    expect(ui.onSearch).not.toHaveBeenCalled();
    ui.input().dispatchEvent(new CompositionEvent('compositionend'));
    vi.advanceTimersByTime(SEARCH_DELAY_MS);
    expect(ui.onSearch).toHaveBeenCalledWith('カ');
  });

  it('drops a search still waiting when an input method starts composing', () => {
    const ui = board();
    ui.type('k');
    ui.input().dispatchEvent(new CompositionEvent('compositionstart'));
    vi.advanceTimersByTime(SEARCH_DELAY_MS * 2);
    expect(ui.onSearch).not.toHaveBeenCalled();
    ui.input().value = 'kカ';
    ui.input().dispatchEvent(new CompositionEvent('compositionend'));
    vi.advanceTimersByTime(SEARCH_DELAY_MS);
    expect(ui.onSearch).toHaveBeenCalledWith('kカ');
  });

  it('Enter searches at once and moves to the first card; Escape clears, then leaves Escape to the board', () => {
    const ui = board();
    ui.input().focus(); ui.type('porch'); ui.key('Enter');
    expect(ui.onSearch).toHaveBeenCalledWith('porch');
    expect((document.activeElement as HTMLElement).getAttribute('aria-label')).toBe('Sweep the porch');

    ui.input().focus(); ui.key('Escape');
    expect(ui.input().value).toBe('');
    expect(ui.onSearch).toHaveBeenLastCalledWith('');
    expect(ui.total()).toBe('3 cards');
    expect(document.activeElement).toBe(ui.input());

    // With the box empty, Escape still ends selecting.
    ui.button('Select').click();
    expect(ui.root.classList.contains('tt-board--selecting')).toBe(true);
    ui.input().focus(); ui.key('Escape');
    expect(ui.root.classList.contains('tt-board--selecting')).toBe(false);
  });

  it('the clear button empties the box and searches again', () => {
    const ui = board();
    ui.type('porch'); vi.advanceTimersByTime(SEARCH_DELAY_MS);
    ui.root.querySelector<HTMLButtonElement>('.tt-board-search-clear')!.click();
    expect(ui.onSearch).toHaveBeenLastCalledWith('');
    expect(ui.input().value).toBe('');
    expect(document.activeElement).toBe(ui.input());
  });

  it('says how many cards match, and offers to clear a search that finds nothing', () => {
    const ui = board();
    ui.type('porch'); vi.advanceTimersByTime(SEARCH_DELAY_MS + ANNOUNCE_DELAY_MS);
    expect(ui.root.querySelector('[role="status"]')!.textContent).toBe('1 card matches “porch”.');
    ui.type('nothing here'); vi.advanceTimersByTime(SEARCH_DELAY_MS + ANNOUNCE_DELAY_MS);
    expect(ui.empty()!.textContent).toContain('No tasks match “nothing here”.');
    expect(ui.root.querySelector('[role="status"]')!.textContent).toBe('No tasks match “nothing here”.');
    ui.button('Clear search').click();
    expect(ui.input().value).toBe('');
    expect(ui.empty()).toBeNull();
    expect(ui.total()).toBe('3 cards');
  });

  it('with quick filters on too, offers to clear either', () => {
    const ui = board({}, ['high-priority']);
    ui.type('porch'); vi.advanceTimersByTime(SEARCH_DELAY_MS);
    expect(ui.empty()!.textContent).toContain('No tasks match “porch” and the quick filters that are on.');
    ui.button('Turn off quick filters').click();
    expect(ui.onSetQuickFilters).toHaveBeenCalledWith([]);
    expect(ui.total()).toBe('1 card');
  });

  it('labels a matching subtask by what it matched', () => {
    const ui = board();
    ui.type('trim'); vi.advanceTimersByTime(SEARCH_DELAY_MS);
    expect(ui.root.querySelector('.tt-subtask.tt-filter-match .tt-filter-match-note')!.textContent).toBe('Matches search');
    expect(ui.root.querySelector('.tt-filter-context-note')!.textContent).toBe('Matching subtask · parent shown for context');
  });

  it('changing the search clears a selection, as changing filters does', () => {
    const ui = board();
    ui.button('Select').click();
    ui.root.querySelector<HTMLButtonElement>('.tt-select-card')!.click();
    expect(ui.root.querySelector('.tt-bulk-count')!.textContent).toBe('1 selected');
    ui.type('porch'); vi.advanceTimersByTime(SEARCH_DELAY_MS);
    expect(ui.root.querySelector('.tt-bulk-count')!.textContent).toBe('0 selected');
  });

  it('starts empty when the view loads another note, and isn’t drawn without a host to search', () => {
    const ui = board();
    ui.type('porch'); vi.advanceTimersByTime(SEARCH_DELAY_MS);
    disposeBoardSelection(ui.root); ui.root.replaceChildren();
    ui.onSearch('');
    expect(ui.input().value).toBe('');
    expect(ui.total()).toBe('3 cards');

    const root = document.createElement('div');
    renderBoard(root, model(''), {
      renderText: (el, t) => { el.textContent = t.text; }, icon: () => undefined, sourceLabel: () => '', isCollapsed: () => false,
      onToggleRow: vi.fn(), onSetSubtasksCollapsed: vi.fn(), onDrop: vi.fn(), onToggle: vi.fn(), onEdit: vi.fn(),
      onOpenSource: vi.fn(), onDragEnd: vi.fn(), onAddTask: vi.fn(() => true), onAddSubtask: vi.fn(() => true),
    }, { warnings: [], info: [] });
    expect(root.querySelector('.tt-board-search')).toBeNull();
  });
});
