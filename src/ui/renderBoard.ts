import { BulkSelection, triageCards, type BulkKind, type BulkResult } from '../core/bulkTriage.ts';
import { uiElement, isComposing } from './dom.ts';
import { announce, clearForRedraw } from './announce.ts';
import { installColumnResize } from './columnResize.ts';
import { watchComposerViewport } from './composerViewport.ts';
import type { Section } from './renderBoardSettings.ts';
import { labelDescription, taskLabels, type BoardLabel } from '../core/labels.ts';
import { columnOf, isOverdue, moreKey, moveChoices, quickMoveTarget, subtaskListKeys, subtasksKey, workflowColumnOf, type BoardModel, type BoardTask, type DropTarget, type MoveChoices } from '../core/board.ts';
import type { BoardColumn, LabelShape } from '../core/boardConfig.ts';
import { diffDays, shortLabel } from '../core/dates.ts';
import { installColumnSwipe } from './columnSwipe.ts';
import { installTouchCardDrag } from './touchCardDrag.ts';
import { renderQuickFilters, type QuickFilterMenu } from './renderQuickFilters.ts';
import { installSubtaskReorder } from './reorderSubtasks.ts';
import type { SubtaskReorder } from '../core/reorderSubtasks.ts';

/** What the board needs from its host (the Obsidian view, or the dev harness). */
/** What the toolbar's Arrange menu can offer. */
export type ArrangeChoice = 'collapse' | 'expand' | 'sort';

export type RenderHost = {
  renderText(el: HTMLElement, task: BoardTask): void;
  icon(el: HTMLElement, name: string): void;
  sourceLabel(task: BoardTask): string;
  isCollapsed(rowId: string): boolean;
  onToggleRow(rowId: string): void;
  /** Sets every supplied subtask list in one persisted update. */
  onSetSubtasksCollapsed(keys: string[], collapsed: boolean): void;
  /** Persists which quick filters are switched on. Without it the board shows no quick filter buttons. */
  onSetQuickFilters?(ids: string[]): void;
  onQuickFiltersMenu?: QuickFilterMenu;
  /** Opens the host's accessible Arrange menu with these choices; calls onClose when dismissed. */
  onArrangeMenu?(anchor: HTMLElement, choices: ArrangeChoice[], choose: (choice: ArrangeChoice) => void, onClose: () => void): void;
  /** Puts every dated cell in due-date order with the fewest moves; see planDueDateSort. */
  onSortByDueDate?(): void;
  onDrop(taskId: string, target: DropTarget): void;
  onReorderSubtask?(move: SubtaskReorder): void;
  onToggle(task: BoardTask): void;
  onEdit(task: BoardTask): void;
  /** `newTab` is set for a Cmd/Ctrl-click. */
  onOpenSource(task: BoardTask, newTab: boolean): void;
  /** Called when a drag ends, so a host that deferred redraws can catch up. */
  onDragEnd(): void;
  /** Adds a task to a cell, with the labels picked in its composer; `detailed` opens the full editor first. */
  onAddTask(target: { rowId: string; columnId: string }, text: string, detailed: boolean, labels: string[]): Promise<boolean> | boolean;
  onAddSubtask(parent: BoardTask, text: string, detailed: boolean): Promise<boolean> | boolean;
  /** Keeps text whose save failed after its composer was closed; `retry` saves it again. */
  onUnsavedText?(text: string, retry: (text: string) => Promise<boolean>): void;
  /** Offers a card's "Move to…" choices, applying the one picked like a drop; calls onClose when dismissed. Without it cards have no ⋯ button. */
  onMoveMenu?(task: BoardTask, choices: MoveChoices, evt: MouseEvent, onClose?: (moved: boolean) => void): void;
  onSettings?(section?: Section): void;
  onRename?(): void;
  onColumnWidthsChange?(widths: Record<string, number>): Promise<void> | void;
  onLabels?(task: BoardTask): void;
  /** Opens the label picker for a task still in its composer: `choose` only changes the draft. Without it the composer has no Labels button. */
  onComposerLabels?: ComposerLabels['pick'];
  onBulkAction?(tasks: BoardTask[], kind: BulkKind): Promise<BulkResult | null>;
  /** Renderer-owned shortcut for starting selection from a normal card. */
  onSelectCard?(task: BoardTask, range: boolean): void;
  /** Renderer-owned selection controls; omitted during normal browsing. */
  selection?: { has(task: BoardTask): boolean; toggle(task: BoardTask, range: boolean): void; busy: boolean };
  /** Renderer-owned temporary disclosures while a quick filter reveals matching descendants. */
  quickDisclosure?: { collapsed(id: string): boolean; toggle(id: string): void; all(id: string): boolean; toggleAll(id: string): void };
  /** Its label is said when a new object arrives, so pass the same one on redraws that don't change it. */
  undo?: { label: string; run(): void };
  highlightIds?: Set<string>;
};

export type RenderNotes = { warnings: string[]; info: string[] };

type DisplayState = { slug: string; column: string };
const renderInputs = new WeakMap<HTMLElement, { model: BoardModel; host: RenderHost; notes: RenderNotes }>();
const bulkStates = new WeakMap<HTMLElement, BulkSelection>();
const selectionClickCleanup = new WeakMap<HTMLElement, () => void>();
const composerViewportCleanup = new WeakMap<HTMLElement, () => void>();
const subtaskReorderCleanup = new WeakMap<HTMLElement, () => void>();

function disposeSubtaskReorders(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('.tt-subtasks').forEach(section => {
    subtaskReorderCleanup.get(section)?.(); subtaskReorderCleanup.delete(section);
  });
}
const displayStates = new WeakMap<HTMLElement, DisplayState>();
/** What each board last said in its live region, so a redraw doesn't say it again. */
const spoken = new WeakMap<HTMLElement, { undo?: RenderHost['undo']; count?: string; result?: string }>();
const quickDisclosures = new WeakMap<HTMLElement, { scope: string; collapsed: Set<string>; all: Set<string> }>();
/**
 * How many cards a cell draws at a time; its "more" button draws the next page. Every card drawn
 * costs memory, and on an iPhone a board that drew about a thousand restarted Obsidian.
 */
export const CELL_PAGE = 25;
/** Extra pages shown in long cells, by cell. They last while the board stays open, and aren't saved. */
const cellPages = new WeakMap<HTMLElement, { slug: string; pages: Map<string, number> }>();
/** Shared by a board's cells: the pages shown, cards that must stay drawn, and a redraw. */
type Paging = { pages: Map<string, number>; keep: Set<string>; redraw(): void };

/** Undo invalidates selected snapshots; keep selection mode but require a fresh choice. */
export function clearBulkSelection(root: HTMLElement): void { bulkStates.get(root)?.clear(); }

/** Release document listeners when a view closes or switches files. */
export function disposeBoardSelection(root: HTMLElement): void {
  disposeSubtaskReorders(root);
  composerViewportCleanup.get(root)?.();
  selectionClickCleanup.get(root)?.();
  bulkStates.delete(root);
  quickDisclosures.delete(root);
  cellPages.delete(root);
}

const DRAG_TYPE = 'application/x-task-trellis';
const dropTargets = new WeakMap<HTMLElement, (id: string) => DropTarget>();
// No real drag lasts this long; past it a missed dragend can't keep the board from redrawing.
const STALE_DRAG_MS = 60_000;
let draggingId: string | null = null;
let dragStartedAt = 0;
/** An open "Add task" or "Add subtask" box's draft, kept across redraws so typing isn't lost when the view updates. */
export type ComposerDraft = { key: string; text: string; labels?: string[]; picking?: boolean; saving?: boolean; refresh?: () => void };
/** Where a surface keeps its open box. The board and the boards sidebar each have one, so opening one doesn't close the other. */
export type ComposerSlot = { draft: ComposerDraft | null };
/** A task composer's Labels button: the board's labels and how they're drawn, and the host's picker. */
export type ComposerLabels = {
  palette: BoardLabel[];
  shape: LabelShape;
  pick(selected: string[], choose: (ids: string[]) => void, onClose: () => void): void;
};
/** The board's box. Keys include the board's slug, so a box open on one board doesn't show on another. */
const boardComposer: ComposerSlot = { draft: null };
/** During a redraw, whether focus was in the board before it; null between redraws. */
let redrawHadFocus: boolean | null = null;

export function isDragging(): boolean {
  return draggingId !== null && Date.now() - dragStartedAt < STALE_DRAG_MS;
}

/** Focuses the first of `keys` that names a control on the board, finding it by its focus key. */
function focusBoardControl(root: HTMLElement, ...keys: string[]): boolean {
  const controls = [...root.querySelectorAll<HTMLElement>('[data-board-focus]')];
  for (const key of keys) {
    const control = controls.find((el) => el.dataset.boardFocus === key);
    if (control) { control.focus({ preventScroll: true }); return true; }
  }
  return false;
}

/**
 * Plain DOM so the harness can run it without Obsidian. A redraw gives focus back to an open add
 * box only if the board had it, so one set off by typing in a note leaves the cursor there.
 */
export function renderBoard(root: HTMLElement, model: BoardModel, host: RenderHost, notes: RenderNotes): void {
  renderInputs.set(root, { model, host, notes });
  redrawHadFocus = root.contains(root.ownerDocument.activeElement);
  const focused = redrawHadFocus ? root.ownerDocument.activeElement as HTMLElement | null : null;
  const focusKey = focused?.dataset.boardFocus;
  const focusTask = focused?.closest<HTMLElement>('[data-id]')?.dataset.id;
  // An explicitly focused control keeps focus even when a draft input is redrawn.
  if (focusKey) redrawHadFocus = false;
  try {
    drawBoard(root, model, host, notes);
    if (focusKey) {
      // A control that left with its task falls back to the task's card, then to a card the action changed.
      const fallbacks = [focusKey, ...focusTask ? [`card:${focusTask}`, `subtask:${focusTask}`] : [], ...[...host.highlightIds ?? []].map((id) => `card:${id}`)];
      focusBoardControl(root, ...fallbacks);
    }
  } finally {
    redrawHadFocus = null;
  }
}

function drawBoard(root: HTMLElement, model: BoardModel, host: RenderHost, notes: RenderNotes): void {
  selectionClickCleanup.get(root)?.();
  const baseHost = host;
  const scroller = root.querySelector<HTMLElement>('.tt-scroll');
  const scroll = scroller ? { top: verticalScroller(scroller).scrollTop, left: scroller.scrollLeft, column: columnInView(scroller)?.dataset.column } : null;
  // A focused card, or one an action just changed, stays drawn even when it moved past its cell's page.
  const active = root.ownerDocument.activeElement;
  const focusedCard = active && root.contains(active) ? active.closest<HTMLElement>('.tt-card')?.dataset.id : undefined;
  const keep = new Set([...host.highlightIds ?? [], ...focusedCard ? [focusedCard] : []]);
  composerViewportCleanup.get(root)?.();
  disposeSubtaskReorders(root);
  clearForRedraw(root);
  root.classList.add('tt-board');

  for (const text of notes.warnings) root.append(el('div', 'tt-note tt-note--warning', text));
  for (const text of notes.info) root.append(el('div', 'tt-note', text));

  const scrollEl = el('div', 'tt-scroll');
  // Obsidian checks this ancestor flag before starting its mobile swipe gestures.
  // Keep column swipes and card drags from also opening a workspace sidebar.
  scrollEl.dataset.ignoreSwipe = 'true';
  const verticalEl = el('div', 'tt-vertical-scroll');
  const grid = el('div', 'tt-grid');
  grid.style.setProperty('--tt-columns', String(model.columns.length));
  verticalEl.append(grid);
  scrollEl.append(verticalEl);
  root.append(scrollEl);

  const { config } = model;
  let display = displayStates.get(root);
  if (!display || display.slug !== config.slug) {
    display = { slug: config.slug, column: '' };
    displayStates.set(root, display);
  }
  if (!config.showColumnSelector || !model.columns.some((c) => c.id === display.column)) display.column = '';
  let bulk = bulkStates.get(root);
  if (!bulk) { bulk = new BulkSelection(); bulkStates.set(root, bulk); }
  bulk.resetScope(JSON.stringify([config.slug, config.includeTags, config.excludeTags, config.includeFolders, config.excludeFolders,
    config.propertyFilters, config.excludedPropertyFilters, model.activeQuickFilters, config.quickFilters, display.column]));
  const selection = bulk;
  const redraw = () => {
    const latest = renderInputs.get(root)!;
    renderBoard(root, latest.model, latest.host, latest.notes);
  };
  let paged = cellPages.get(root);
  if (!paged || paged.slug !== config.slug) {
    paged = { slug: config.slug, pages: new Map() };
    cellPages.set(root, paged);
  }
  const paging: Paging = { pages: paged.pages, keep, redraw };
  const quickScope = JSON.stringify([config.slug, model.activeQuickFilters, config.quickFilters]);
  let disclosures = quickDisclosures.get(root);
  if (!disclosures || disclosures.scope !== quickScope) {
    disclosures = { scope: quickScope, collapsed: new Set(), all: new Set() };
    quickDisclosures.set(root, disclosures);
  }
  const temporary = disclosures;
  const toggleTemporary = (set: Set<string>, id: string) => { if (set.has(id)) set.delete(id); else set.add(id); redraw(); };
  host = { ...host, quickDisclosure: {
    collapsed: (id) => temporary.collapsed.has(id), toggle: (id) => toggleTemporary(temporary.collapsed, id),
    all: (id) => temporary.all.has(id), toggleAll: (id) => toggleTemporary(temporary.all, id),
  } };
  // Reveal rows containing matched descendants without changing saved row preferences.
  const revealedRows = new Set(Object.entries(model.rowOf)
    .filter(([id]) => model.quickContext?.branches.has(id)).map(([, row]) => row));
  const rowCollapsed = (id: string) => revealedRows.has(id) ? temporary.collapsed.has(`row:${id}`) : baseHost.isCollapsed(id);
  const toggleRow = (id: string) => revealedRows.has(id) ? toggleTemporary(temporary.collapsed, `row:${id}`) : baseHost.onToggleRow(id);
  if (selection.active) {
    const doc = root.ownerDocument;
    const dismiss = (event: MouseEvent) => {
      if (!root.isConnected) { cleanup(); return; }
      // The bulk editor lives outside the board. Keep its selection until it closes,
      // including while writes are in flight.
      if (selection.busy) return;
      const target = event.target as Element | null;
      if (!target || typeof target.closest !== 'function') return;
      if (root.contains(target) && target.closest('.tt-card, button, a, input, select, textarea, [role="button"], [role="splitter"], .tt-row-sticky')) return;
      selection.active = false;
      selection.clear();
      // Do not cancel the click or move focus: an outside control must still work.
      redraw();
    };
    const cleanup = () => {
      doc.removeEventListener('click', dismiss, true);
      selectionClickCleanup.delete(root);
    };
    doc.addEventListener('click', dismiss, true);
    selectionClickCleanup.set(root, cleanup);
  }
  root.onkeydown = (event) => {
    if (event.key === 'Escape' && selection.active && !selection.busy) {
      event.preventDefault(); selection.active = false; selection.clear(); redraw();
      root.querySelector<HTMLButtonElement>('[data-board-focus="select"]')?.focus();
    }
  };
  const selectCard = (task: BoardTask, range: boolean) => {
    if (selection.busy || (model.quickContext?.contextOnly.has(task.id) && !selection.has(task))) return;
    const byId = new Map(triageCards(model, columnOf(task, config)).map((t) => [t.id, t]));
    const ordered = [...grid.querySelectorAll<HTMLElement>('.tt-card')].flatMap((c) => {
      const t = byId.get(c.dataset.id ?? ''); return t ? [t] : [];
    });
    selection.active = true;
    selection.toggle(task, ordered, range); redraw();
    [...root.querySelectorAll<HTMLButtonElement>('.tt-select-card')]
      .find((button) => button.dataset.boardFocus === `select-card:${task.id}`)?.focus({ preventScroll: true });
  };
  if (host.onBulkAction) host = { ...host, onSelectCard: selectCard };
  if (selection.active) host = { ...host, selection: {
    has: (task) => selection.has(task), busy: selection.busy, toggle: selectCard,
  } };
  root.classList.toggle('tt-board--selecting', selection.active);
  root.classList.toggle('tt-board--compact', config.compact);
  root.classList.toggle('tt-board--no-overdue-bar', !config.overdueBar);
  const toolbar = el('div', 'tt-board-toolbar');
  const heading = el('div', 'tt-board-heading');
  if (host.onRename) {
    const name = el('button', 'tt-board-name tt-board-rename', config.name);
    name.type = 'button'; name.setAttribute('aria-label', `Rename board: ${config.name}`);
    name.dataset.boardFocus = 'rename'; name.onclick = () => host.onRename?.();
    heading.append(name);
  } else heading.append(el('span', 'tt-board-name', config.name));
  heading.append(el('span', 'tt-board-total', `${model.total} ${model.total === 1 ? 'card' : 'cards'}`));
  const tools = el('div', 'tt-board-tools');
  const picker = el('select', 'tt-column-picker'); picker.setAttribute('aria-label', 'Visible board column');
  picker.dataset.boardFocus = 'column';
  for (const [id, label] of [['', 'All columns'], ...model.columns.map((c) => [c.id, c.label])]) {
    const option = el('option', '', label); option.value = id!; picker.append(option);
  }
  picker.value = display.column;
  picker.onchange = () => { display.column = picker.value; renderBoard(root, model, baseHost, notes); };
  const subtaskKeys = subtaskListKeys(model);
  const choices: ArrangeChoice[] = [...(subtaskKeys.length > 0 ? ['collapse', 'expand'] as const : []), ...(host.onSortByDueDate ? ['sort'] as const : [])];
  if (choices.length > 0 && host.onArrangeMenu) {
    const action = el('button', 'tt-toolbar-button tt-arrange-menu');
    action.type = 'button';
    action.dataset.boardFocus = 'arrange';
    action.setAttribute('aria-label', 'Arrange');
    action.setAttribute('aria-haspopup', 'menu');
    action.setAttribute('aria-expanded', 'false');
    action.append(hostIcon(host, 'arrow-down-up'));
    const restoreFocus = () => {
      // A selection can redraw the toolbar, so find the current button.
      const current = root.querySelector<HTMLButtonElement>('.tt-arrange-menu');
      current?.setAttribute('aria-expanded', 'false');
      current?.focus({ preventScroll: true });
    };
    const open = () => {
      if (action.getAttribute('aria-expanded') === 'true') return;
      action.setAttribute('aria-expanded', 'true');
      host.onArrangeMenu?.(action, choices, (choice) => {
        if (choice === 'sort') { host.onSortByDueDate?.(); restoreFocus(); return; }
        const collapsed = choice === 'collapse';
        for (const id of model.quickContext?.branches ?? []) {
          if (collapsed) temporary.collapsed.add(id); else temporary.collapsed.delete(id);
        }
        host.onSetSubtasksCollapsed(subtaskKeys, collapsed);
        if (model.quickContext?.branches.size) redraw();
        restoreFocus();
      }, restoreFocus);
    };
    action.onclick = open;
    action.onkeydown = (event) => {
      if (event.key === 'ArrowDown') { event.preventDefault(); open(); }
    };
    tools.append(action);
  }
  if (config.showColumnSelector) tools.append(picker);
  if (host.onSetQuickFilters) {
    tools.append(renderQuickFilters(root, config, model.activeQuickFilters, !!display.column,
      (name) => hostIcon(host, name), (ids) => host.onSetQuickFilters?.(ids), host.onQuickFiltersMenu));
  }
  if (host.onBulkAction) {
    const select = el('button', 'tt-toolbar-button', selection.active ? 'Done selecting' : 'Select');
    select.type = 'button'; select.dataset.boardFocus = 'select'; select.setAttribute('aria-pressed', String(selection.active));
    select.disabled = selection.busy;
    select.onclick = () => { selection.active = !selection.active; selection.clear(); redraw(); };
    tools.append(select);
  }
  if (host.onSettings) {
    const settings = el('button', 'tt-toolbar-button'); settings.type = 'button'; settings.dataset.boardFocus = 'settings';
    settings.append(hostIcon(host, 'sliders-horizontal'), el('span', '', 'Settings')); settings.onclick = () => host.onSettings?.(); tools.append(settings);
  }
  toolbar.append(heading, tools); root.insertBefore(toolbar, root.firstChild);
  const visibleColumns = display.column ? model.columns.filter((c) => c.id === display.column) : model.columns;
  scrollEl.style.setProperty('--tt-columns', String(visibleColumns.length));
  grid.style.setProperty('--tt-columns', String(visibleColumns.length));
  const hint = el('div', 'tt-scroll-hint', config.showColumnSelector
    ? 'Scroll sideways to explore columns, or choose one above.' : 'Scroll sideways to explore columns.');
  hint.hidden = !!display.column; root.insertBefore(hint, scrollEl);
  const filters = config.propertyFilters.length + config.excludedPropertyFilters.length +
    [config.includeTags, config.excludeTags, config.includeFolders, config.excludeFolders].filter((list) => list.length).length;
  if (filters) heading.append(el('span', 'tt-filter-count', `${filters} filter ${filters === 1 ? 'condition' : 'conditions'}`));
  if (model.total === 0 && model.activeQuickFilters.length && host.onSetQuickFilters) {
    const empty = el('section', 'tt-note tt-empty-state');
    empty.append(el('p', '', 'No tasks match the quick filters that are on.'));
    const clear = el('button', 'tt-toolbar-button', 'Turn off quick filters'); clear.type = 'button';
    clear.dataset.boardFocus = 'quick-clear'; clear.onclick = () => host.onSetQuickFilters?.([]);
    empty.append(clear); root.insertBefore(empty, scrollEl);
  } else if (model.total === 0 && host.onSettings) {
    const empty = el('section', 'tt-note tt-empty-state');
    empty.setAttribute('aria-label', 'Get started with this board');
    empty.append(el('p', '', filters ? 'No tasks match this board. Check its filters and where new tasks are saved.' : 'Your board is ready. Choose where tasks are saved, then use Add task in a column.'));
    for (const [label, section] of [['Choose task destination', 'destination'], ['Review filters', 'filters']] as const) {
      const action = el('button', 'tt-toolbar-button', label); action.type = 'button';
      action.onclick = () => host.onSettings?.(section); empty.append(action);
    }
    root.insertBefore(empty, scrollEl);
  }
  const said = spoken.get(root) ?? {};
  spoken.set(root, said);
  if (host.undo) {
    const undo = el('div', 'tt-undo');
    const action = el('button', 'tt-toolbar-button', 'Undo'); action.type = 'button'; action.dataset.boardFocus = 'undo'; action.onclick = () => host.undo?.run();
    undo.append(el('span', '', host.undo.label), action); root.insertBefore(undo, scrollEl);
    // While selecting, the selection status says what a bulk change did.
    if (host.undo !== said.undo && !selection.active) announce(root, host.undo.label);
  }
  said.undo = host.undo;
  if (selection.active) {
    const bar = el('div', 'tt-bulk-bar'); bar.setAttribute('aria-label', 'Bulk task actions'); bar.setAttribute('role', 'region');
    bar.append(el('span', 'tt-bulk-count', `${selection.tasks.length} selected`));
    const button = (text: string, key: string, action: () => void) => {
      const b = el('button', 'tt-toolbar-button', text); b.type = 'button'; b.dataset.boardFocus = key;
      b.disabled = selection.busy; b.onclick = action; bar.append(b); return b;
    };
    const matching = triageCards(model, display.column);
    button(`Select all ${matching.length}`, 'select-all', () => { selection.add(matching); redraw(); }).setAttribute('aria-label', `Select all ${matching.length} matching tasks`);
    button('Clear', 'select-clear', () => { selection.clear(); redraw(); }).setAttribute('aria-label', 'Clear selection');
    const actions = el('div', 'tt-bulk-actions'); bar.append(actions);
    for (const [kind, label] of [['move', 'Move'], ['due', 'Due date'], ['labels', 'Labels'], ['priority', 'Priority']] as const) {
      const b = button(label, `bulk:${kind}`, () => {
        const scope = selection.scope;
        selection.busy = true; redraw();
        void baseHost.onBulkAction!(selection.tasks, kind).then((result) => {
          if (result && selection.scope === scope) { selection.replace(result.tasks); selection.message = result.message; }
        }).catch((error: unknown) => { selection.message = error instanceof Error ? error.message : 'Could not update tasks. Try again.'; })
          .finally(() => {
            selection.busy = false;
            // A dialog can outlive its board tab. Never redraw a disposed/replaced view.
            if (bulkStates.get(root) !== selection || !root.isConnected) return;
            // Ask the host for a fresh model after writing; the index may have changed while the dialog was open.
            baseHost.onDragEnd();
            if (root.isConnected) {
              const current = root.querySelector<HTMLButtonElement>(`[data-board-focus="bulk:${kind}"]`);
              current?.focus({ preventScroll: true });
            }
            redraw();
          });
      });
      b.disabled = selection.busy || selection.tasks.length === 0;
      actions.append(b);
    }
    const visible = new Set(matching.map((task) => `${task.id}\0${task.raw}`));
    const context = model.quickContext?.contextOnly;
    const asContext = selection.tasks.filter((task) => context?.has(task.id)).length;
    const outside = selection.tasks.filter((task) => !context?.has(task.id) && !visible.has(`${task.id}\0${task.raw}`)).length;
    const away = [
      outside === 1 ? '1 selected task is outside the current view.' : outside ? `${outside} selected tasks are outside the current view.` : '',
      asContext === 1 ? '1 selected task now shows only for context.' : asContext ? `${asContext} selected tasks now show only for context.` : '',
    ].filter(Boolean).join(' ');
    const result = [selection.message.replace(/[^.!?…]$/, '$&.'), away].filter(Boolean).join(' ');
    bar.append(el('span', 'tt-bulk-status', selection.busy ? 'Choose changes in the dialog…'
      : result || 'Select cards, or select all matching tasks including collapsed rows.'));
    root.insertBefore(bar, scrollEl);
    // Say a changed count or result; the dialog speaks for itself while it's open.
    if (!selection.busy) {
      const count = `${selection.tasks.length} selected.`;
      announce(root, [count === (said.count ?? '0 selected.') ? '' : count, result === (said.result ?? '') ? '' : result].filter(Boolean).join(' '));
      said.count = count; said.result = result;
    }
  } else {
    said.count = undefined; said.result = undefined;
  }
  for (const column of visibleColumns) {
    const count = model.rows.reduce((n, r) => n + (model.cells[r.id]?.[column.id]?.length ?? 0), 0);
    const header = el('div', 'tt-col-header');
    header.dataset.column = column.id;
    const glyph = column.id === config.doneColumn ? 'circle-check' : column.id === config.undatedColumn ? 'inbox' : 'circle';
    header.append(hostIcon(host, glyph), el('span', 'tt-col-title', column.label), el('span', 'tt-count', String(count)));
    if (column.id === config.doneColumn) header.classList.add('tt-col-header--done');
    if (selection.active) {
      const selectColumn = el('button', 'tt-select-column', 'Select column'); selectColumn.type = 'button';
      selectColumn.setAttribute('aria-label', `Select ${column.label} column`); selectColumn.disabled = selection.busy;
      selectColumn.dataset.boardFocus = `select-column:${column.id}`;
      selectColumn.onclick = () => { selection.add(triageCards(model, column.id)); redraw(); };
      header.append(selectColumn);
    }
    grid.append(header);
  }

  // A No due date column is one cell down the whole board, in place of the No due date row; the
  // row bars run across the other columns, in two pieces when it sits in the middle.
  const undatedAt = visibleColumns.findIndex((c) => c.id === config.undatedColumn);
  const rows = !config.undatedColumn ? model.rows : model.rows.filter((r) => r.id !== 'none');
  const barSpans =
    undatedAt < 0
      ? ['1 / -1']
      : [undatedAt > 0 ? `1 / ${undatedAt + 1}` : '', undatedAt < visibleColumns.length - 1 ? `${undatedAt + 2} / -1` : ''].filter(Boolean);
  if (undatedAt >= 0) {
    const undated = cell('none', visibleColumns[undatedAt]!, model, host, paging);
    undated.classList.add('tt-cell--undated');
    undated.style.gridColumn = String(undatedAt + 1);
    undated.style.gridRow = visibleColumns.length === 1 ? '2' : `2 / span ${rows.reduce((n, r) => n + (rowCollapsed(r.id) ? 1 : 2), 0)}`;
    grid.append(undated);
  }

  for (const row of visibleColumns.every((c) => c.id === config.undatedColumn) ? [] : rows) {
    const collapsed = rowCollapsed(row.id);
    const cells = model.cells[row.id] ?? {};
    const count = visibleColumns.reduce((n, c) => n + (cells[c.id]?.length ?? 0), 0);

    const bar = el('div', `tt-row-bar${collapsed ? ' is-collapsed' : ''}`);
    bar.dataset.row = row.id;
    bar.classList.toggle('tt-row-bar--now', row.kind === 'now');
    bar.style.gridColumn = barSpans[0]!;
    const toggle = el('button', 'tt-row-toggle clickable-icon');
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.setAttribute('aria-label', `${collapsed ? 'Expand' : 'Collapse'} ${row.label}`);
    toggle.dataset.boardFocus = `row:${row.id}`;
    toggle.append(chevron(host));
    const label = el('span', 'tt-row-label');
    label.append(el('span', 'tt-row-title', row.label));
    if (row.detail) label.append(el('span', 'tt-row-detail', row.detail));
    label.append(el('span', 'tt-count', String(count)));
    const sticky = el('div', 'tt-row-sticky');
    sticky.append(toggle, label);
    bar.append(sticky);
    bar.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.tt-row-sticky')) toggleRow(row.id);
    });
    const bars = [bar];
    if (barSpans[1]) {
      const rest = el('div', `tt-row-bar tt-row-bar--rest${collapsed ? ' is-collapsed' : ''}`);
      rest.style.gridColumn = barSpans[1];
      // Its own label, shown when a column right of the No due date column is the only one in view.
      rest.classList.toggle('tt-row-bar--now', row.kind === 'now');
      const copy = sticky.cloneNode(true) as HTMLElement;
      copy.querySelector<HTMLElement>('.tt-row-toggle')!.dataset.boardFocus = `row-rest:${row.id}`;
      rest.append(copy);
      rest.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.tt-row-sticky')) toggleRow(row.id);
      });
      bars.push(rest);
    }
    // A collapsed row still takes drops: the card keeps its column and goes to the end.
    if (collapsed) {
      for (const b of bars) {
        addDropZone(b, host, (id) => {
          const task = findTask(model, id);
          const shown = task ? columnOf(task, config) : model.columns[0]!.id;
          // A card leaving the No due date column goes back to its tagged column.
          const columnId = task && shown === config.undatedColumn ? workflowColumnOf(task, config) : shown;
          return { rowId: row.id, columnId, index: model.cells[row.id]?.[columnId]?.length ?? 0 };
        });
      }
    }
    grid.append(...bars);
    if (collapsed) continue;

    for (const column of visibleColumns) {
      if (column.id !== config.undatedColumn) grid.append(cell(row.id, column, model, host, paging));
    }
  }

  if (visibleColumns.length > 1 && host.onColumnWidthsChange) {
    installColumnResize(grid, config.columnWidths, {
      enabled: () => !swipesColumns(scrollEl),
      save: (widths) => host.onColumnWidthsChange!(widths),
      end: () => host.onDragEnd(),
    });
  }
  let swipe: ReturnType<typeof installColumnSwipe> | null = null;
  const pages = visibleColumns.length > 1 ? pager(scrollEl, visibleColumns.length, host, (direction) => swipe?.page(direction)) : null;
  if (pages) root.insertBefore(pages.bar, scrollEl);
  if (scroll) {
    verticalScroller(scrollEl).scrollTop = scroll.top;
    scrollEl.scrollLeft = scroll.left;
    // One column at a time, come back to the same column even when the columns beside it changed.
    const header = [...scrollEl.querySelectorAll<HTMLElement>('.tt-col-header')].find((h) => h.dataset.column === scroll.column);
    if (header && swipesColumns(scrollEl)) scrollEl.scrollLeft += offsetFromMiddle(scrollEl, header);
  }
  pages?.update();
  const alignRowLabels = () => scrollEl.style.setProperty('--tt-page-left', `${scrollEl.scrollLeft}px`);
  scrollEl.addEventListener('scroll', alignRowLabels, { passive: true });
  alignRowLabels();
  const columnPositions = () =>
    [...scrollEl.querySelectorAll<HTMLElement>('.tt-col-header')].map((header) =>
      scrollEl.scrollLeft + offsetFromMiddle(scrollEl, header));
  swipe = installColumnSwipe(scrollEl, () => swipesColumns(scrollEl), columnPositions);
  let touchTarget: DropTarget | null = null;
  if (!selection.active) installTouchCardDrag(scrollEl, {
    start: (id) => { draggingId = id; dragStartedAt = Date.now(); },
    move: (x, y) => {
      clearIndicators(root.ownerDocument);
      touchTarget = null;
      const zone = root.ownerDocument.elementFromPoint(x, y)?.closest<HTMLElement>('.tt-cell, .tt-row-bar');
      if (!zone || !scrollEl.contains(zone) || !draggingId) return;
      const target = dropTargets.get(zone);
      if (!target) return;
      zone.classList.add('is-drop-target');
      if (zone.classList.contains('tt-cell')) showIndicator(zone, y);
      touchTarget = target(draggingId);
    },
    end: (commit) => {
      const id = draggingId;
      draggingId = null;
      clearIndicators(root.ownerDocument);
      try { if (commit && id && touchTarget) host.onDrop(id, touchTarget); }
      finally { touchTarget = null; host.onDragEnd(); }
    },
  }, () => verticalScroller(scrollEl), () => swipesColumns(scrollEl) ? columnPositions() : []);
}

function cell(rowId: string, column: BoardColumn, model: BoardModel, host: RenderHost, paging: Paging): HTMLElement {
  const c = el('div', 'tt-cell');
  c.dataset.row = rowId;
  c.dataset.column = column.id;
  const cards = model.cells[rowId]?.[column.id] ?? [];
  const limit = cardLimit(column.id, model.config);
  const capped = limit !== null && cards.length > limit && !cards.some((task) => model.quickContext?.branches.has(task.id));
  const hidden = capped && host.isCollapsed(moreKey(rowId));
  // Otherwise a cell draws a page of cards at a time, and enough pages to include any card that must stay drawn.
  const key = `${rowId}:${column.id}`;
  const first = Math.max(limit ?? 0, CELL_PAGE);
  const kept = cards.reduce((last, task, i) => paging.keep.has(task.id) ? i : last, -1);
  if (!hidden && kept >= first) paging.pages.set(key, Math.max(paging.pages.get(key) ?? 0, Math.floor((kept - first) / CELL_PAGE) + 1));
  const pages = hidden ? 0 : paging.pages.get(key) ?? 0;
  const shown = hidden ? limit : Math.min(cards.length, first + CELL_PAGE * pages);
  for (const task of cards.slice(0, shown)) c.append(card(task, model, host));
  if (shown < cards.length && !hidden) {
    const more = moreToggle(true, cards.length - shown, `more-cards:${key}`, host, () => {
      // Focus goes on to the first card it adds, which takes the button's place.
      more.dataset.boardFocus = `card:${cards[shown]!.id}`;
      paging.pages.set(key, pages + 1);
      paging.redraw();
    });
    more.title = `Show the next ${Math.min(CELL_PAGE, cards.length - shown)}`;
    c.append(more);
  }
  if (capped || shown > first) {
    const toggle = moreToggle(hidden, cards.length - (limit ?? 0), `more:${key}`, host, () => {
      paging.pages.delete(key);
      if (capped) { host.onToggleRow(moreKey(rowId)); return; }
      toggle.dataset.boardFocus = `more-cards:${key}`;
      paging.redraw();
    });
    c.append(toggle);
  }
  // Done fills itself by completing tasks, so it gets no add button.
  // The No due date column is one cell down the board, so its column names it.
  const place = rowId === 'none' && column.id === model.config.undatedColumn ? column.label
    : `${column.label}, ${model.rows.find((r) => r.id === rowId)?.label ?? rowId}`;
  if (!host.selection && column.id !== model.config.doneColumn) c.append(addTask({ rowId, columnId: column.id }, model.config, place, host));
  if (!host.selection) addDropZone(c, host, () => ({ rowId, columnId: column.id, index: dropIndex(c) }));
  return c;
}

/** Done and No due date cells can show only their first few cards, the rest behind "more". */
function cardLimit(columnId: string, config: BoardModel['config']): number | null {
  if (columnId === config.doneColumn) return config.limitDone ? config.doneLimit : null;
  if (columnId === config.undatedColumn) return config.limitUndated ? config.undatedLimit : null;
  return null;
}

/** Opens a cell's add box; on mobile CSS places it above the task list. `place` names the cell. */
function addTask(target: { rowId: string; columnId: string }, config: BoardModel['config'], place: string, host: RenderHost): HTMLElement {
  const wrap = el('div', 'tt-add');
  const key = `cell:${config.slug}:${target.rowId}:${target.columnId}`;

  const showButton = () => {
    const b = el('button', 'tt-add-button');
    b.type = 'button';
    const icon = el('span', 'tt-add-icon');
    host.icon(icon, 'plus');
    b.append(icon, el('span', '', 'Add task'));
    b.setAttribute('aria-label', `Add task to ${place}`);
    b.dataset.boardFocus = `add:${key}`;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      boardComposer.draft = { key, text: '' };
      showBox();
    });
    // Closing with X or Escape hands focus back; closing because focus moved elsewhere leaves it there.
    const hadFocus = wrap.contains(wrap.ownerDocument.activeElement);
    wrap.replaceChildren(b);
    if (hadFocus) b.focus({ preventScroll: true });
  };
  const labels = host.onComposerLabels && { palette: config.labels, shape: config.labelShape, pick: host.onComposerLabels };
  const showBox = () =>
    wrap.replaceChildren(
      addBox(key, 'New task. Enter to add, ⌘/Ctrl+Enter for details', 'Add task', host,
        (text, detailed, chosen) => host.onAddTask(target, text, detailed, chosen), showButton, { labels }),
    );

  if (boardComposer.draft?.key === key) showBox();
  else showButton();
  return wrap;
}

/**
 * The box for typing a new task: Enter adds it and keeps the box open for the next one,
 * Cmd/Ctrl+Enter or "Details" opens the Tasks editor, Esc closes it. With `labels`, a Labels button
 * picks labels for the task, shown above the text until it's added.
 */
export function addBox(
  key: string,
  placeholder: string,
  saveLabel: string,
  host: Pick<RenderHost, 'icon' | 'onUnsavedText'>,
  onSubmit: (text: string, detailed: boolean, labels: string[]) => Promise<boolean> | boolean,
  onClose: () => void,
  // Opened by a click, or reopened by a redraw while the board had focus.
  { slot = boardComposer, takeFocus = redrawHadFocus ?? true, labels }: { slot?: ComposerSlot; takeFocus?: boolean; labels?: ComposerLabels } = {},
): HTMLElement {
  const box = el('div', 'tt-add-box');
  let stopViewport: (() => void) | undefined;
  const isOpen = () => slot.draft?.key === key;
  const input = el('textarea', 'tt-add-input');
  input.rows = 2;
  input.placeholder = placeholder;
  input.value = isOpen() ? slot.draft!.text : '';
  input.addEventListener('input', () => {
    if (isOpen()) slot.draft!.text = input.value;
  });
  const close = () => {
    stopViewport?.();
    if (isOpen()) slot.draft = null;
    onClose();
  };
  const draft = slot.draft;
  const marks = el('div', 'tt-add-labels');
  const refresh = () => {
    if (slot.draft !== draft || !draft) return;
    input.value = draft.text;
    input.readOnly = !!draft.saving;
    box.setAttribute('aria-busy', String(!!draft.saving));
    const chosen = labels?.palette.filter((label) => draft.labels?.includes(label.id)) ?? [];
    marks.replaceChildren(...chosen.length ? [labelMarks(chosen, labels!.shape)] : []);
    marks.hidden = !chosen.length;
    const buttons = [...box.querySelectorAll<HTMLButtonElement>('button:not(.tt-add-cancel)')];
    // Disabling the focused button would drop focus to the page; keep it in the box, ready for the next task.
    if (draft.saving && buttons.includes(box.ownerDocument.activeElement as HTMLButtonElement)) input.focus({ preventScroll: true });
    buttons.forEach((b) => { b.disabled = !!draft.saving; });
  };
  if (draft) draft.refresh = refresh;
  const submit = async (detailed: boolean) => {
    if (!draft || slot.draft !== draft || draft.saving) return;
    const text = draft.text.trim();
    const chosen = draft.labels ?? [];
    if (!text && !detailed) return;
    draft.saving = true; draft.refresh?.();
    let saved = false;
    try {
      saved = !!await onSubmit(text, detailed, chosen);
      if (saved && slot.draft === draft) { draft.text = ''; draft.labels = []; }
    } catch {
      // Hosts display the cause; keep the draft even if an unexpected host failure escapes.
      if (slot.draft === draft) box.setAttribute('aria-label', 'Task not saved. Your text has been kept; try again.');
    } finally {
      draft.saving = false;
      if (slot.draft === draft) draft.refresh?.();
      // Closed while saving: the box can't keep the text, so the host does. A detailed add keeps its own.
      else if (!saved && !detailed) host.onUnsavedText?.(text, async (retry) => !!await onSubmit(retry, false, chosen));
    }
  };
  input.addEventListener('keydown', (e) => {
    if (isComposing(e)) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submit(e.metaKey || e.ctrlKey);
    }
  });
  input.addEventListener('blur', () => {
    // Clicking one of the buttons blurs first; let its click run. A box another one replaced closes too.
    // Picked labels are a draft too, and the label picker takes focus while it's open.
    window.setTimeout(() => {
      if (!box.isConnected) return;
      const empty = !input.value.trim() && !draft?.labels?.length && !draft?.picking;
      if (!isOpen() || (!draft?.saving && empty && !box.contains(box.ownerDocument.activeElement))) close();
    }, 150);
  });

  const actions = el('div', 'tt-add-actions');
  const add = el('button', 'tt-editor-save');
  add.setAttribute('aria-label', saveLabel);
  host.icon(add, 'check');
  add.type = 'button';
  add.addEventListener('click', () => void submit(false));
  const details = el('button', '', 'Details…');
  details.type = 'button';
  details.title = 'Open the Tasks editor for priority, dates and recurrence';
  details.addEventListener('click', () => void submit(true));
  const cancel = el('button', 'clickable-icon tt-add-cancel tt-editor-cancel');
  cancel.type = 'button';
  cancel.setAttribute('aria-label', 'Cancel');
  host.icon(cancel, 'x');
  cancel.addEventListener('click', close);
  actions.append(add, details);
  if (labels) {
    const pick = el('button', 'clickable-icon tt-add-labels-button');
    pick.type = 'button';
    pick.setAttribute('aria-label', 'Labels');
    // Found again by its key when the picker closes, since a redraw may have replaced it.
    const focusKey = `composer-labels:${key}`;
    pick.dataset.boardFocus = focusKey;
    host.icon(pick, 'tag');
    pick.addEventListener('click', () => {
      if (!draft || slot.draft !== draft || draft.saving) return;
      draft.picking = true;
      labels.pick(draft.labels ?? [], (ids) => { draft.labels = ids; draft.refresh?.(); }, () => {
        draft.picking = false;
        [...box.ownerDocument.querySelectorAll<HTMLElement>('[data-board-focus]')]
          .find((b) => b.dataset.boardFocus === focusKey)?.focus({ preventScroll: true });
      });
    });
    actions.append(pick);
  }
  actions.append(cancel);

  box.append(actions, marks, input);
  refresh();
  box.addEventListener('focusin', () => {
    const root = box.closest<HTMLElement>('.tt-board');
    const scroller = box.closest<HTMLElement>('.tt-scroll');
    if (!root || !scroller || stopViewport) return;
    composerViewportCleanup.get(root)?.();
    const destroy = watchComposerViewport(box, input, scroller, () => verticalScroller(scroller));
    stopViewport = () => {
      destroy();
      composerViewportCleanup.delete(root);
      stopViewport = undefined;
    };
    composerViewportCleanup.set(root, stopViewport);
  });
  box.addEventListener('focusout', () => queueMicrotask(() => {
    if (!box.contains(box.ownerDocument.activeElement)) stopViewport?.();
  }));
  // Clicks inside the box shouldn't reach the cell or card.
  box.addEventListener('click', (e) => e.stopPropagation());
  // Right after the redraw that attaches it, before the next keystroke arrives.
  queueMicrotask(() => {
    if (!box.isConnected || !takeFocus) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  });
  return box;
}

/** "▸ 3 more" under a capped or long cell, or "▾ Show fewer" once more of it shows. */
function moreToggle(collapsed: boolean, extra: number, focusKey: string, host: RenderHost, onClick: () => void): HTMLElement {
  const b = el('button', `tt-more${collapsed ? ' is-collapsed' : ''}`);
  b.type = 'button';
  b.dataset.boardFocus = focusKey;
  b.setAttribute('aria-expanded', String(!collapsed));
  b.append(chevron(host), el('span', '', collapsed ? `${extra} more` : 'Show fewer'));
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

function card(task: BoardTask, model: BoardModel, host: RenderHost): HTMLElement {
  if (host.selection) return selectionCard(task, model, host);
  const c = el('div', 'tt-card');
  c.dataset.id = task.id;
  appendFilterContext(c, task, model, host);
  c.dataset.boardFocus = `card:${task.id}`;
  c.draggable = true;
  c.tabIndex = 0; c.setAttribute('role', 'group'); c.setAttribute('aria-label', task.text);
  if (host.highlightIds?.has(task.id)) c.classList.add('tt-card--updated');
  c.setAttribute('aria-description', 'Press Enter to edit or open the source. Use Alt and Up or Down to reorder open tasks.');
  c.setAttribute('aria-keyshortcuts', task.closed ? 'Enter' : 'Enter Alt+ArrowUp Alt+ArrowDown');
  c.addEventListener('keydown', (e) => {
    if (e.target !== c) return;
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); host.onEdit(task); return; }
    if (!e.altKey || task.closed || !['ArrowUp', 'ArrowDown'].includes(e.key)) return;
    const rowId = model.rowOf[task.id];
    const columnId = columnOf(task, model.config);
    const cards = rowId ? model.cells[rowId]?.[columnId] : undefined;
    const at = cards?.findIndex((card) => card.id === task.id) ?? -1;
    if (!rowId || !cards || at < 0) return;
    e.preventDefault(); e.stopPropagation();
    const index = Math.max(0, Math.min(cards.length - 1, at + (e.key === 'ArrowUp' ? -1 : 1)));
    if (index !== at) host.onDrop(task.id, { rowId, columnId, index });
  });
  if (task.closed) c.classList.add('is-closed');
  if (isOverdue(task, model.today)) c.classList.add('is-overdue');

  const assigned = taskLabels(task.raw, model.config.slug);
  const labels = task.parentId ? [] : model.config.labels.filter((label) => assigned.includes(label.id));
  if (labels.length) c.append(labelMarks(labels, model.config.labelShape));
  const main = taskMain(task, host);
  const handle = el('span', 'tt-card-drag-handle');
  handle.title = 'Drag to move task';
  handle.setAttribute('aria-hidden', 'true');
  host.icon(handle, 'grip-vertical');
  c.append(handle);
  const meta = el('div', 'tt-card-meta');
  const subtasks = model.subtasks[task.id] ?? [];
  if (task.closed && task.closedDate) {
    const span = badge(host, task.status === '-' ? 'circle-minus' : 'circle-check', `${task.status === '-' ? 'Cancelled' : 'Completed'} ${relativeDate(task.closedDate, model.today)}`, 'tt-done');
    span.title = `Completed ${task.closedDate}${task.createdDate ? ` · Created ${task.createdDate}` : ''}${task.dueDate ? ` · Due ${task.dueDate}` : ''}`;
    meta.append(span);
  } else appendBadges(meta, task, model, host);
  const actions = el('span', 'tt-card-actions');
  if (host.onLabels && !task.parentId) {
    const labelsButton = el('button', 'clickable-icon tt-card-icon tt-card-label-button');
    labelsButton.type = 'button'; labelsButton.setAttribute('aria-label', 'Labels');
    labelsButton.dataset.boardFocus = `labels:${task.id}`;
    host.icon(labelsButton, 'tag');
    labelsButton.onclick = (event) => { event.stopPropagation(); host.onLabels?.(task); };
    actions.append(labelsButton);
  }
  if (!task.closed) actions.append(addSubtaskButton(task, c, model, host));
  const move = moveButton(task, model, host);
  if (move) actions.append(move);
  if (host.onMoveMenu && !task.closed) actions.append(moveMenuButton(task, model, host));
  if (subtasks.length === 0 && actions.childElementCount > 0) meta.append(actions);
  const source = el('a', 'tt-source', host.sourceLabel(task));
  source.href = '#';
  source.title = `Open ${task.path}, line ${task.line + 1}`;
  source.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    host.onOpenSource(task, e.metaKey || e.ctrlKey);
  });
  const sourceIcon = el('span', 'tt-source-icon');
  host.icon(sourceIcon, 'file-text');
  source.prepend(sourceIcon);
  meta.prepend(source);
  c.append(main, meta);
  if (subtasks.length > 0) {
    const controls = el('div', 'tt-subtask-controls');
    controls.append(subtaskToggle(task, subtasks, model, host), actions);
    c.append(controls);
  }
  const section = subtaskSection(task, model, host);
  if (section) c.append(section);
  // Selecting text in an open add box would otherwise drag the card.
  if (c.querySelector('.tt-add-input')) c.draggable = false;

  c.addEventListener('click', (e) => {
    // Links and tags inside the rendered text keep their own behaviour.
    if ((e.target as HTMLElement).closest('a')) return;
    if (host.onSelectCard && (e.metaKey || e.ctrlKey || e.shiftKey)) {
      e.preventDefault(); e.stopPropagation();
      if (!model.quickContext?.contextOnly.has(task.id)) host.onSelectCard(task, e.shiftKey);
      return;
    }
    host.onEdit(task);
  });
  c.addEventListener('mousedown', (e) => {
    if (host.onSelectCard && e.button === 0 && (e.metaKey || e.ctrlKey || e.shiftKey) &&
      !(e.target as Element).closest('a, button, input, textarea, .tt-subtasks')) e.preventDefault();
  });
  c.addEventListener('dragstart', (e) => {
    if ((e.target as Element).closest('.tt-card-drag-handle') || c.closest('.tt-touch-dragging')) {
      e.preventDefault();
      return;
    }
    draggingId = task.id;
    dragStartedAt = Date.now();
    e.dataTransfer?.setData(DRAG_TYPE, task.id);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    // Let the browser capture the drag image before dimming the card.
    c.ownerDocument.defaultView?.requestAnimationFrame(() => {
      if (c.isConnected && draggingId === task.id) c.classList.add('is-dragging');
    });
  });
  c.addEventListener('dragend', () => {
    draggingId = null;
    c.classList.remove('is-dragging');
    clearIndicators(c.ownerDocument);
    host.onDragEnd();
  });
  return c;
}

/** A card's labels in the board's shape. Obsidian shows the aria-label, the label's name, on hover. */
function labelMarks(labels: BoardLabel[], shape: LabelShape): HTMLElement {
  const marks = el('div', `tt-card-labels tt-card-labels--${shape}`);
  for (const label of labels) {
    const mark = el('span', 'tt-card-label');
    mark.style.backgroundColor = label.color;
    mark.setAttribute('role', 'img');
    mark.setAttribute('aria-label', label.name || labelDescription(label));
    marks.append(mark);
  }
  return marks;
}

/** Selection uses separate controls, never the task's completion checkbox or drag handle. */
function selectionCard(task: BoardTask, model: BoardModel, host: RenderHost): HTMLElement {
  const selection = host.selection!;
  const c = el('div', 'tt-card tt-selection-card'); c.dataset.id = task.id;
  appendFilterContext(c, task, model, host);
  const selected = selection.has(task);
  // A parent shown only for context can't be picked, but one that became context after an edit can be unticked.
  const selectable = selected || !model.quickContext?.contextOnly.has(task.id);
  c.classList.toggle('is-selected', selected);
  const check = el('button', 'tt-select-card'); check.type = 'button'; check.setAttribute('role', 'checkbox');
  check.setAttribute('aria-checked', String(selected)); check.setAttribute('aria-label', `Select ${task.text}`);
  check.dataset.boardFocus = `select-card:${task.id}`; check.disabled = selection.busy || !selectable;
  host.icon(check, selected ? 'check-square' : 'square');
  const main = el('div', 'tt-card-main'); const text = el('div', 'tt-card-text'); host.renderText(text, task);
  main.append(check, text); c.append(main);
  const meta = el('div', 'tt-card-meta', host.sourceLabel(task)); appendBadges(meta, task, model, host); c.append(meta);
  const labels = model.config.labels.filter((label) => taskLabels(task.raw, model.config.slug).includes(label.id));
  if (labels.length) c.prepend(labelMarks(labels, model.config.labelShape));
  const children = model.subtasks[task.id]?.length ?? 0;
  if (children) c.append(el('span', 'tt-selection-detail', `${children} subtasks`));
  if (model.quickContext?.branches.has(task.id)) appendMatchingSummary(c, task, model);
  c.addEventListener('click', (event) => {
    if ((event.metaKey || event.ctrlKey) && (event.target as Element).closest('a')) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (!selection.busy && selectable) selection.toggle(task, event.shiftKey);
  }, true);
  c.addEventListener('mousedown', (event) => {
    if (event.button === 0 && event.shiftKey && !(event.target as Element).closest('a')) event.preventDefault();
  });
  check.onkeydown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); event.stopPropagation();
      if (!selection.busy && selectable) selection.toggle(task, event.shiftKey);
    }
  };
  return c;
}

function appendFilterContext(node: HTMLElement, task: BoardTask, model: BoardModel, host: RenderHost): void {
  const ancestors = model.quickContext?.parents[task.id] ?? [];
  if (ancestors.length) {
    const context = el('div', 'tt-filter-ancestors');
    context.setAttribute('aria-label', 'Parent task context');
    for (const parent of ancestors) {
      const link = el('button', 'tt-filter-parent', parent.text); link.type = 'button';
      link.title = 'Open parent task in source note';
      link.onclick = (event) => { event.stopPropagation(); host.onOpenSource(parent, event.metaKey || event.ctrlKey); };
      context.append(link);
    }
    node.append(context);
  }
  if (model.quickContext?.contextOnly.has(task.id)) {
    node.classList.add('tt-card--filter-context');
    node.append(el('div', 'tt-filter-context-note', 'Matching subtask · parent shown for context'));
  }
  if (model.quickContext?.matches.has(task.id)) {
    node.classList.add('tt-filter-match');
    node.append(el('span', 'tt-filter-match-note', 'Matches quick filters'));
  }
}

/** Selection mode shows the reason for a context card without enabling subtask edits. */
function appendMatchingSummary(node: HTMLElement, task: BoardTask, model: BoardModel): void {
  const list = el('div', 'tt-filter-match-summary');
  for (const sub of model.subtasks[task.id] ?? []) {
    if (!model.quickContext?.branches.has(sub.id)) continue;
    const row = el('div', model.quickContext.matches.has(sub.id) ? 'tt-filter-match' : '', sub.text);
    list.append(row); appendMatchingSummary(row, sub, model);
  }
  if (list.childElementCount) node.append(list);
}

/** Checkbox and text, shared by cards and subtasks. */
function taskMain(task: BoardTask, host: RenderHost): HTMLElement {
  const main = el('div', 'tt-card-main');
  const box = el('input', 'task-list-item-checkbox tt-checkbox');
  box.type = 'checkbox';
  box.checked = task.closed;
  box.setAttribute('aria-label', `${task.closed ? 'Reopen' : 'Complete'} ${task.text}`);
  box.dataset.boardFocus = `check:${task.id}`;
  box.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    host.onToggle(task);
  });
  const text = el('div', 'tt-card-text');
  host.renderText(text, task);
  main.append(box, text);
  return main;
}

function hostIcon(host: RenderHost, name: string): HTMLElement {
  const node = el('span', 'tt-icon'); node.setAttribute('aria-hidden', 'true'); host.icon(node, name); return node;
}

function badge(host: RenderHost, glyph: string, text: string, cls: string): HTMLElement {
  const node = el('span', `tt-badge ${cls}`); node.append(hostIcon(host, glyph), el('span', '', text)); return node;
}

function relativeDate(date: string, today: string): string {
  const days = diffDays(date, today);
  return days === 0 ? 'today' : days === 1 ? 'tomorrow' : days === -1 ? 'yesterday' : shortLabel(date);
}

function appendBadges(meta: HTMLElement, task: BoardTask, model: BoardModel, host: RenderHost): void {
  if (task.dueDate) {
    const overdue = isOverdue(task, model.today);
    const days = diffDays(model.today, task.dueDate);
    const due = badge(host, overdue ? 'calendar-clock' : 'calendar-days', overdue ? `${days} ${days === 1 ? 'day' : 'days'} overdue` : relativeDate(task.dueDate, model.today), `tt-due${overdue ? ' is-overdue' : ''}`);
    due.title = `Due ${task.dueDate}`; meta.append(due);
  }
  if (task.priority) {
    const p = badge(host, 'flag', task.priority, `tt-priority tt-priority--${task.priority}`);
    p.title = `Priority: ${task.priority}`; meta.append(p);
  }
}

/** One subtask inside a card: a compact row, with its own subtasks nested below it. */
function subtaskRow(task: BoardTask, model: BoardModel, host: RenderHost): HTMLElement {
  const row = el('div', 'tt-subtask');
  row.dataset.id = task.id;
  appendFilterContext(row, task, model, host);
  if (task.closed) row.classList.add('is-closed');
  if (isOverdue(task, model.today)) row.classList.add('is-overdue');
  const main = taskMain(task, host);
  const subtasks = model.subtasks[task.id] ?? [];
  if (!task.closed && subtasks.length === 0) main.append(addSubtaskButton(task, row, model, host));
  // Out of the card without dragging; shown on the row being pointed at, and always on touch screens.
  if (host.onMoveMenu && !task.closed) main.append(moveMenuButton(task, model, host));
  row.append(main);
  const meta = el('div', 'tt-card-meta');
  appendBadges(meta, task, model, host);
  if (meta.childElementCount > 0) row.append(meta);
  if (subtasks.length > 0) {
    const controls = el('div', 'tt-subtask-controls');
    controls.append(subtaskToggle(task, subtasks, model, host));
    if (!task.closed) controls.append(addSubtaskButton(task, row, model, host));
    row.append(controls);
  }
  const section = subtaskSection(task, model, host);
  if (section) row.append(section);
  row.addEventListener('click', (e) => {
    e.stopPropagation();
    if ((e.target as HTMLElement).closest('a')) return;
    host.onEdit(task);
  });
  // Reachable from the keyboard like a card: Enter edits it.
  row.tabIndex = 0; row.setAttribute('role', 'group'); row.setAttribute('aria-label', task.text);
  row.dataset.boardFocus = `subtask:${task.id}`;
  row.setAttribute('aria-description', 'Press Enter to edit or open the source.');
  row.setAttribute('aria-keyshortcuts', 'Enter');
  row.addEventListener('keydown', (e) => {
    if (e.target !== row || e.key !== 'Enter') return;
    e.preventDefault(); e.stopPropagation();
    host.onEdit(task);
  });
  // Dragged out of its card, it becomes a card of its own (see planPromotion).
  row.draggable = !row.querySelector('.tt-add-input');
  row.addEventListener('dragstart', (e) => {
    e.stopPropagation();
    if (!row.draggable || row.closest('.tt-touch-dragging')) { e.preventDefault(); return; }
    draggingId = task.id;
    dragStartedAt = Date.now();
    e.dataTransfer?.setData(DRAG_TYPE, task.id);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    row.ownerDocument.defaultView?.requestAnimationFrame(() => {
      if (row.isConnected && draggingId === task.id) row.classList.add('is-dragging');
    });
  });
  row.addEventListener('dragend', (e) => {
    e.stopPropagation();
    draggingId = null;
    row.classList.remove('is-dragging');
    clearIndicators(row.ownerDocument);
    host.onDragEnd();
  });
  return row;
}

/** The indented list under a task: its subtasks unless collapsed, then the add box when it's open. */
function subtaskSection(task: BoardTask, model: BoardModel, host: RenderHost): HTMLElement | null {
  const subtasks = model.subtasks[task.id] ?? [];
  const composing = boardComposer.draft?.key === subtaskBoxKey(task, model.config.slug);
  if (subtasks.length > 0 ? subtasksCollapsed(task, model, host) : !composing) return null;
  const available = model.config.hideCompletedSubtasks ? subtasks.filter((sub) => hasOpenWork(sub, model) || model.quickContext?.branches.has(sub.id)) : subtasks;
  const narrowed = model.quickContext?.filteredParents.has(task.id);
  const others = narrowed ? available.filter((sub) => !model.quickContext?.branches.has(sub.id)) : [];
  const showAll = host.quickDisclosure?.all(task.id);
  const shown = narrowed && !showAll ? available.filter((sub) => model.quickContext?.branches.has(sub.id)) : available;
  if (!shown.length && !others.length && !composing) return null;
  const section = el('div', 'tt-subtasks');
  for (const sub of shown) section.append(subtaskRow(sub, model, host));
  if (others.length) {
    const more = el('button', 'tt-filter-show-others', showAll ? 'Hide other subtasks' : `Show ${others.length} other ${others.length === 1 ? 'subtask' : 'subtasks'}`);
    more.type = 'button'; more.setAttribute('aria-expanded', String(!!showAll));
    more.dataset.boardFocus = `other-subtasks:${task.id}`;
    more.onclick = (event) => { event.stopPropagation(); host.quickDisclosure?.toggleAll(task.id); };
    section.append(more);
  }
  if (composing) section.append(subtaskBox(task, model.config.slug, section, host));
  subtaskReorderCleanup.set(section, installSubtaskReorder(section, task, subtasks, model.config.sortCompletedSubtasks, {
    id: () => draggingId && Object.values(model.subtasks).some(list => list.some(sub => sub.id === draggingId)) ? draggingId : null,
    clear: () => clearIndicators(section.ownerDocument),
    finish: () => { draggingId = null; clearIndicators(section.ownerDocument); host.onDragEnd(); },
  }, host.onReorderSubtask ? move => host.onReorderSubtask?.(move) : undefined));
  return section;
}

/** An open task, or a completed one with open subtasks, which stays so they aren't hidden with it. */
function hasOpenWork(task: BoardTask, model: BoardModel): boolean {
  return !task.closed || (model.subtasks[task.id] ?? []).some((sub) => hasOpenWork(sub, model));
}

function subtaskBoxKey(task: BoardTask, slug: string): string {
  return `subtask:${slug}:${task.id}`;
}

function subtaskBox(parent: BoardTask, slug: string, section: HTMLElement, host: RenderHost): HTMLElement {
  const box = addBox(
    subtaskBoxKey(parent, slug),
    'New subtask. Enter to add, ⌘/Ctrl+Enter for details',
    'Add subtask',
    host,
    (text, detailed) => host.onAddSubtask(parent, text, detailed),
    () => {
      const owner = box.parentElement;
      const root = box.closest<HTMLElement>('.tt-board');
      // Closing with X or Escape hands focus back; closing because focus moved elsewhere leaves it there.
      const hadFocus = box.contains(box.ownerDocument.activeElement);
      box.remove();
      if (owner) updateComposerDragState(owner);
      if (!section.hasChildNodes()) section.remove();
      if (hadFocus) [...root?.querySelectorAll<HTMLElement>('.tt-add-subtask') ?? []].find((el) => el.dataset.addSubtask === parent.id)?.focus({ preventScroll: true });
    },
  );
  return box;
}

/** Compact disclosure and completion count beside Add subtask, with an explicit action tooltip. */
function subtasksCollapsed(task: BoardTask, model: BoardModel, host: RenderHost): boolean {
  return model.quickContext?.branches.has(task.id) ? host.quickDisclosure?.collapsed(task.id) ?? false : host.isCollapsed(subtasksKey(task));
}

function subtaskToggle(task: BoardTask, subtasks: BoardTask[], model: BoardModel, host: RenderHost): HTMLElement {
  const key = subtasksKey(task);
  const collapsed = subtasksCollapsed(task, model, host);
  const done = subtasks.filter((s) => s.closed).length;
  const b = el('button', `tt-subtask-toggle${collapsed ? ' is-collapsed' : ''}`);
  b.type = 'button';
  b.setAttribute('aria-expanded', String(!collapsed));
  const action = `${collapsed ? 'Show' : 'Hide'} subtasks`;
  const label = `${action} (${done} of ${subtasks.length} done)`;
  b.dataset.boardFocus = `subtasks-${task.id}`;
  b.setAttribute('aria-label', label);
  b.append(chevron(host), el('span', '', `${done}/${subtasks.length}`));
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    if (model.quickContext?.branches.has(task.id)) host.quickDisclosure?.toggle(task.id);
    else host.onToggleRow(key);
  });
  return b;
}

/** Nested composers must suppress native dragging on every enclosing task. */
function updateComposerDragState(owner: HTMLElement): void {
  for (let current: HTMLElement | null = owner; current; current = current.parentElement) {
    if (current.matches('.tt-card, .tt-subtask')) current.draggable = !current.querySelector('.tt-add-input');
  }
}

/** Opens the add box at the end of the task's subtasks, expanding them first if they're hidden. */
function addSubtaskButton(task: BoardTask, owner: HTMLElement, model: BoardModel, host: RenderHost): HTMLElement {
  const b = el('button', 'clickable-icon tt-card-icon tt-add-subtask');
  b.type = 'button';
  b.setAttribute('aria-label', `Add subtask to ${task.text}`);
  // Not a focus key: a redraw it causes hands focus to the box it opens.
  b.dataset.addSubtask = task.id;
  host.icon(b, 'list-plus');
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    const key = subtaskBoxKey(task, model.config.slug);
    if (boardComposer.draft?.key !== key) boardComposer.draft = { key, text: '' };
    if ((model.subtasks[task.id]?.length ?? 0) > 0 && subtasksCollapsed(task, model, host)) {
      // Redraws with the list open, and the box in it.
      if (model.quickContext?.branches.has(task.id)) host.quickDisclosure?.toggle(task.id);
      else host.onToggleRow(subtasksKey(task));
      return;
    }
    let section = owner.querySelector<HTMLElement>(':scope > .tt-subtasks');
    const open = section?.querySelector<HTMLTextAreaElement>(':scope > .tt-add-box .tt-add-input');
    if (open) {
      open.focus();
      return;
    }
    if (!section) section = owner.appendChild(el('div', 'tt-subtasks'));
    section.append(subtaskBox(task, model.config.slug, section, host));
    updateComposerDragState(owner);
  });
  return b;
}

/** Bottom-right arrow that moves the card between Due now and the next row, pointing the way it goes. */
function moveButton(task: BoardTask, model: BoardModel, host: RenderHost): HTMLElement | null {
  const target = quickMoveTarget(model, task);
  if (!target) return null;
  const rowIndex = (id: string | undefined) => model.rows.findIndex((r) => r.id === id);
  const columnIndex = (id: string | null) => model.columns.findIndex((c) => c.id === id);
  const b = el('button', 'clickable-icon tt-card-icon tt-card-move');
  b.type = 'button';
  const destination = model.rows[rowIndex(target.rowId)]!;
  const label = `${destination.kind === 'now' ? 'Move into Due now' : 'Defer'}${destination.dropDate ? ` · due ${shortLabel(destination.dropDate)}` : ''}`;
  b.setAttribute('aria-label', label);
  b.dataset.boardFocus = `move:${task.id}`;
  // Out of the No due date column it's a sideways move.
  const icon =
    model.config.undatedColumn && model.rowOf[task.id] === 'none'
      ? columnIndex(target.columnId) > columnIndex(model.config.undatedColumn) ? 'arrow-right' : 'arrow-left'
      : rowIndex(target.rowId) > rowIndex(model.rowOf[task.id]) ? 'arrow-down' : 'arrow-up';
  host.icon(b, icon);
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    host.onDrop(task.id, target);
  });
  return b;
}

/** ⋯ opens "Move to…", for screens where a card can't be dragged; styles.css shows it on touch screens and narrow boards. */
function moveMenuButton(task: BoardTask, model: BoardModel, host: RenderHost): HTMLElement {
  const b = el('button', 'clickable-icon tt-card-icon tt-card-more');
  b.type = 'button';
  b.setAttribute('aria-label', `Move ${task.text} to…`);
  b.setAttribute('aria-haspopup', 'menu');
  b.setAttribute('aria-expanded', 'false');
  const key = `move-menu:${task.id}`;
  b.dataset.boardFocus = key;
  host.icon(b, 'more-horizontal');
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    const choices = moveChoices(model, task);
    if (!choices || !host.onMoveMenu) return;
    const root = b.closest<HTMLElement>('.tt-board');
    b.setAttribute('aria-expanded', 'true');
    host.onMoveMenu(task, choices, e, (moved) => {
      // A move can redraw the board while the menu is open, so find the current button and card.
      if (!root) return;
      const current = [...root.querySelectorAll<HTMLElement>('[data-board-focus]')].find((el) => el.dataset.boardFocus === key);
      current?.setAttribute('aria-expanded', 'false');
      focusBoardControl(root, ...moved ? [`card:${task.id}`, key] : [key]);
    });
  });
  return b;
}

/**
 * A dot per column and "2 / 4", following the scroll position. styles.css shows it only when the
 * board is narrow enough to show one column at a time.
 */
function pager(scroller: HTMLElement, count: number, host: RenderHost, page: (direction: number) => void): { bar: HTMLElement; update(): void } {
  const bar = el('div', 'tt-pager');
  const dots = el('span', 'tt-pager-dots');
  for (let i = 0; i < count; i++) dots.append(el('span', 'tt-pager-dot'));
  const text = el('span', 'tt-pager-text');
  dots.setAttribute('aria-hidden', 'true'); text.setAttribute('aria-hidden', 'true');
  // Paging without touch. aria-disabled, not disabled, so a button keeps focus at either end.
  const step = (direction: number, label: string, glyph: string) => {
    const b = el('button', 'clickable-icon tt-pager-button'); b.type = 'button';
    b.setAttribute('aria-label', label); b.dataset.boardFocus = `page:${direction}`;
    host.icon(b, glyph);
    b.addEventListener('click', () => { if (b.getAttribute('aria-disabled') !== 'true') page(direction); });
    return b;
  };
  const previous = step(-1, 'Previous column', 'chevron-left');
  const next = step(1, 'Next column', 'chevron-right');
  bar.append(previous, dots, text, next);
  const update = () => {
    const headers = [...scroller.querySelectorAll<HTMLElement>('.tt-col-header')];
    const index = Math.max(0, headers.indexOf(columnInView(scroller)!));
    [...dots.children].forEach((dot, i) => dot.classList.toggle('is-active', i === index));
    text.textContent = `${index + 1} / ${count}`;
    previous.setAttribute('aria-disabled', String(index === 0));
    next.setAttribute('aria-disabled', String(index === count - 1));
  };
  let queued = false;
  scroller.addEventListener('scroll', () => {
    if (queued) return;
    queued = true;
    (scroller.ownerDocument.defaultView ?? window).requestAnimationFrame(() => { queued = false; update(); });
  }, { passive: true });
  return { bar, update };
}

/** Whether the narrow layout enables column paging, independent of native CSS snapping. */
function swipesColumns(scroller: HTMLElement): boolean {
  return getComputedStyle(scroller).getPropertyValue('--tt-column-paging').trim() === '1';
}

/** Separate native vertical scrolling from horizontal paging on narrow boards. */
function verticalScroller(scroller: HTMLElement): HTMLElement {
  return swipesColumns(scroller) ? scroller.querySelector<HTMLElement>('.tt-vertical-scroll')! : scroller;
}

/** The column header nearest the middle of the board: the column in view when they're shown one at a time. */
function columnInView(scroller: HTMLElement): HTMLElement | undefined {
  if (scroller.clientWidth === 0) return undefined;
  let best: HTMLElement | undefined;
  for (const header of scroller.querySelectorAll<HTMLElement>('.tt-col-header')) {
    if (!best || Math.abs(offsetFromMiddle(scroller, header)) < Math.abs(offsetFromMiddle(scroller, best))) best = header;
  }
  return best;
}

/** How far right of the middle of the scroller's visible area the middle of `target` is. */
function offsetFromMiddle(scroller: HTMLElement, target: HTMLElement): number {
  const view = scroller.getBoundingClientRect();
  const box = target.getBoundingClientRect();
  return box.left + box.width / 2 - (view.left + scroller.clientLeft + scroller.clientWidth / 2);
}

function addDropZone(zone: HTMLElement, host: RenderHost, target: (taskId: string) => DropTarget): void {
  dropTargets.set(zone, target);
  zone.addEventListener('dragover', (e) => {
    if (!draggingId) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    zone.classList.add('is-drop-target');
    if (zone.classList.contains('tt-cell')) showIndicator(zone, e.clientY);
  });
  zone.addEventListener('dragleave', (e) => {
    if (zone.contains(e.relatedTarget as Node | null)) return;
    zone.classList.remove('is-drop-target');
    zone.querySelector('.tt-drop-indicator')?.remove();
  });
  zone.addEventListener('drop', (e) => {
    const id = draggingId;
    if (!id) return;
    e.preventDefault();
    const t = target(id);
    clearIndicators(zone.ownerDocument);
    // The drop redraws the board, which detaches the dragged card; don't rely on its dragend.
    draggingId = null;
    host.onDrop(id, t);
  });
}

/** Moves the single drop indicator above the first card whose midpoint is below the pointer. */
function showIndicator(cell: HTMLElement, clientY: number): void {
  let indicator = cell.querySelector<HTMLElement>('.tt-drop-indicator');
  if (!indicator) { indicator = el('div', 'tt-drop-indicator'); indicator.setAttribute('aria-hidden', 'true'); }
  const before = siblingsForDrop(cell).find((c) => {
    const r = c.getBoundingClientRect();
    return clientY < r.top + r.height / 2;
  });
  if (before) {
    if (indicator.nextSibling !== before) cell.insertBefore(indicator, before);
  } else if (cell.lastElementChild !== indicator) {
    cell.append(indicator);
  }
}

/** Index among the cell's cards, the dragged one excluded, where the indicator sits. */
function dropIndex(cell: HTMLElement): number {
  const indicator = cell.querySelector('.tt-drop-indicator');
  const cards = siblingsForDrop(cell);
  if (!indicator) return cards.length;
  return cards.filter((c) => indicator.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_PRECEDING).length;
}

function siblingsForDrop(cell: HTMLElement): HTMLElement[] {
  return [...cell.querySelectorAll<HTMLElement>(':scope > .tt-card')].filter((c) => c.dataset.id !== draggingId);
}

function clearIndicators(doc: Document): void {
  doc.querySelectorAll('.tt-drop-indicator').forEach((i) => i.remove());
  doc.querySelectorAll('.is-drop-target').forEach((z) => z.classList.remove('is-drop-target'));
}

function findTask(model: BoardModel, id: string): BoardTask | undefined {
  const rowId = model.rowOf[id];
  if (rowId === undefined) return undefined;
  for (const cards of Object.values(model.cells[rowId] ?? {})) {
    const t = cards.find((c) => c.id === id);
    if (t) return t;
  }
  return undefined;
}

/** Obsidian's chevron; CSS turns it to point right while its list is collapsed. */
function chevron(host: RenderHost): HTMLElement {
  const icon = el('span', 'tt-chevron');
  icon.setAttribute('aria-hidden', 'true');
  host.icon(icon, 'chevron-down');
  return icon;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  // Shared with the standalone browser harness; nodes are adopted by the destination document.
  const node = uiElement(document, tag);
  node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}
