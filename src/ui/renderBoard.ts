import { columnOf, isOverdue, moreKey, quickMoveTarget, subtasksKey, workflowColumnOf, type BoardModel, type BoardTask, type DropTarget } from '../core/board.ts';
import type { BoardColumn } from '../core/boardConfig.ts';
import { shortLabel } from '../core/dates.ts';
import { PRIORITY_EMOJI } from '../core/taskLine.ts';

/** What the board needs from its host (the Obsidian view, or the dev harness). */
export type RenderHost = {
  renderText(el: HTMLElement, task: BoardTask): void;
  icon(el: HTMLElement, name: string): void;
  sourceLabel(task: BoardTask): string;
  isCollapsed(rowId: string): boolean;
  onToggleRow(rowId: string): void;
  onDrop(taskId: string, target: DropTarget): void;
  onToggle(task: BoardTask): void;
  onEdit(task: BoardTask): void;
  /** `newTab` is set for a Cmd/Ctrl-click. */
  onOpenSource(task: BoardTask, newTab: boolean): void;
  /** Called when a drag ends, so a host that deferred redraws can catch up. */
  onDragEnd(): void;
  /** Adds a task to a cell; `detailed` opens the full editor first. */
  onAddTask(target: { rowId: string; columnId: string }, text: string, detailed: boolean): void;
  onAddSubtask(parent: BoardTask, text: string, detailed: boolean): void;
};

export type RenderNotes = { warnings: string[]; info: string[] };

const DRAG_TYPE = 'application/x-task-trellis';
// No real drag lasts this long; past it a missed dragend can't keep the board from redrawing.
const STALE_DRAG_MS = 60_000;
let draggingId: string | null = null;
let dragStartedAt = 0;
/**
 * The open "Add task" or "Add subtask" box, kept across redraws so typing isn't lost when the board
 * updates. Keys include the board's slug, so a box open on one board doesn't show on another.
 */
let composer: { key: string; text: string } | null = null;
/** During a redraw, whether focus was in the board before it; null between redraws. */
let redrawHadFocus: boolean | null = null;

export function isDragging(): boolean {
  return draggingId !== null && Date.now() - dragStartedAt < STALE_DRAG_MS;
}

/**
 * Plain DOM so the harness can run it without Obsidian. A redraw gives focus back to an open add
 * box only if the board had it, so one set off by typing in a note leaves the cursor there.
 */
export function renderBoard(root: HTMLElement, model: BoardModel, host: RenderHost, notes: RenderNotes): void {
  redrawHadFocus = root.contains(root.ownerDocument.activeElement);
  try {
    drawBoard(root, model, host, notes);
  } finally {
    redrawHadFocus = null;
  }
}

function drawBoard(root: HTMLElement, model: BoardModel, host: RenderHost, notes: RenderNotes): void {
  const scroller = root.querySelector<HTMLElement>('.tt-scroll');
  const scroll = scroller ? { top: scroller.scrollTop, left: scroller.scrollLeft } : null;
  root.replaceChildren();
  root.classList.add('tt-board');

  for (const text of notes.warnings) root.append(el('div', 'tt-note tt-note--warning', text));
  for (const text of notes.info) root.append(el('div', 'tt-note', text));

  const scrollEl = el('div', 'tt-scroll');
  const grid = el('div', 'tt-grid');
  grid.style.setProperty('--tt-columns', String(model.columns.length));
  scrollEl.append(grid);
  root.append(scrollEl);

  const { config } = model;
  for (const column of model.columns) {
    const count = model.rows.reduce((n, r) => n + (model.cells[r.id]?.[column.id]?.length ?? 0), 0);
    const header = el('div', 'tt-col-header');
    header.append(el('span', 'tt-col-title', column.label), el('span', 'tt-count', String(count)));
    if (column.id === config.doneColumn) header.classList.add('tt-col-header--done');
    grid.append(header);
  }

  // A No due date column is one cell down the whole board, in place of the No due date row; the
  // row bars run across the other columns, in two pieces when it sits in the middle.
  const undatedAt = model.columns.findIndex((c) => c.id === config.undatedColumn);
  const rows = undatedAt < 0 ? model.rows : model.rows.filter((r) => r.id !== 'none');
  const barSpans =
    undatedAt < 0
      ? ['1 / -1']
      : [undatedAt > 0 ? `1 / ${undatedAt + 1}` : '', undatedAt < model.columns.length - 1 ? `${undatedAt + 2} / -1` : ''].filter(Boolean);
  if (undatedAt >= 0) {
    const undated = cell('none', model.columns[undatedAt]!, model, host);
    undated.classList.add('tt-cell--undated');
    undated.style.gridColumn = String(undatedAt + 1);
    undated.style.gridRow = `2 / span ${rows.reduce((n, r) => n + (host.isCollapsed(r.id) ? 1 : 2), 0)}`;
    grid.append(undated);
  }

  for (const row of rows) {
    const collapsed = host.isCollapsed(row.id);
    const cells = model.cells[row.id] ?? {};
    const count = Object.values(cells).reduce((n, c) => n + c.length, 0);

    const bar = el('div', `tt-row-bar${collapsed ? ' is-collapsed' : ''}`);
    bar.dataset.row = row.id;
    bar.style.gridColumn = barSpans[0]!;
    const toggle = el('button', 'tt-row-toggle clickable-icon');
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.setAttribute('aria-label', `${collapsed ? 'Expand' : 'Collapse'} ${row.label}`);
    toggle.append(chevron());
    const label = el('span', 'tt-row-label');
    label.append(el('span', 'tt-row-title', row.label));
    if (row.detail) label.append(el('span', 'tt-row-detail', row.detail));
    label.append(el('span', 'tt-count', String(count)));
    const sticky = el('div', 'tt-row-sticky');
    sticky.append(toggle, label);
    bar.append(sticky);
    bar.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.tt-row-sticky')) host.onToggleRow(row.id);
    });
    const bars = [bar];
    if (barSpans[1]) {
      const rest = el('div', `tt-row-bar tt-row-bar--rest${collapsed ? ' is-collapsed' : ''}`);
      rest.style.gridColumn = barSpans[1];
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

    for (const column of model.columns) {
      if (column.id !== config.undatedColumn) grid.append(cell(row.id, column, model, host));
    }
  }

  if (scroll) {
    scrollEl.scrollTop = scroll.top;
    scrollEl.scrollLeft = scroll.left;
  }
}

function cell(rowId: string, column: BoardColumn, model: BoardModel, host: RenderHost): HTMLElement {
  const c = el('div', 'tt-cell');
  c.dataset.row = rowId;
  c.dataset.column = column.id;
  const cards = model.cells[rowId]?.[column.id] ?? [];
  const limit = cardLimit(column.id, model.config);
  const capped = limit !== null && cards.length > limit;
  const hidden = capped && host.isCollapsed(moreKey(rowId));
  for (const task of hidden ? cards.slice(0, limit) : cards) c.append(card(task, model, host));
  if (capped) c.append(moreToggle(hidden, cards.length - limit, () => host.onToggleRow(moreKey(rowId))));
  // Done fills itself by completing tasks, so it gets no add button.
  if (column.id !== model.config.doneColumn) c.append(addTask({ rowId, columnId: column.id }, model.config.slug, host));
  addDropZone(c, host, () => ({ rowId, columnId: column.id, index: dropIndex(c) }));
  return c;
}

/** Done and No due date cells can show only their first few cards, the rest behind "more". */
function cardLimit(columnId: string, config: BoardModel['config']): number | null {
  if (columnId === config.doneColumn) return config.limitDone ? config.doneLimit : null;
  if (columnId === config.undatedColumn) return config.limitUndated ? config.undatedLimit : null;
  return null;
}

/** "+ Add task" at the bottom of a cell, which opens the add box. */
function addTask(target: { rowId: string; columnId: string }, slug: string, host: RenderHost): HTMLElement {
  const wrap = el('div', 'tt-add');
  const key = `cell:${slug}:${target.rowId}:${target.columnId}`;

  const showButton = () => {
    const b = el('button', 'tt-add-button');
    b.type = 'button';
    const icon = el('span', 'tt-add-icon');
    host.icon(icon, 'plus');
    b.append(icon, el('span', '', 'Add task'));
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      composer = { key, text: '' };
      showBox();
    });
    wrap.replaceChildren(b);
  };
  const showBox = () =>
    wrap.replaceChildren(
      addBox(key, 'New task. Enter to add, ⌘/Ctrl+Enter for details', host, (text, detailed) => host.onAddTask(target, text, detailed), showButton),
    );

  if (composer?.key === key) showBox();
  else showButton();
  return wrap;
}

/**
 * The box for typing a new task: Enter adds it and keeps the box open for the next one,
 * Cmd/Ctrl+Enter or "Details" opens the Tasks editor, Esc closes it.
 */
function addBox(
  key: string,
  placeholder: string,
  host: RenderHost,
  onSubmit: (text: string, detailed: boolean) => void,
  onClose: () => void,
): HTMLElement {
  const box = el('div', 'tt-add-box');
  const isOpen = () => composer?.key === key;
  // Opened by a click, or reopened by a redraw while the board had focus.
  const takeFocus = redrawHadFocus ?? true;
  const input = el('textarea', 'tt-add-input');
  input.rows = 2;
  input.placeholder = placeholder;
  input.value = isOpen() ? composer!.text : '';
  input.addEventListener('input', () => {
    if (isOpen()) composer!.text = input.value;
  });
  const close = () => {
    if (isOpen()) composer = null;
    onClose();
  };
  const submit = (detailed: boolean) => {
    const text = input.value.trim();
    if (!text && !detailed) return;
    if (detailed) close();
    else {
      input.value = '';
      if (isOpen()) composer!.text = '';
    }
    onSubmit(text, detailed);
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit(e.metaKey || e.ctrlKey);
    }
  });
  input.addEventListener('blur', () => {
    // Clicking one of the buttons blurs first; let its click run. A box another one replaced closes too.
    window.setTimeout(() => {
      if (!box.isConnected) return;
      if (!isOpen() || (!input.value.trim() && !box.contains(box.ownerDocument.activeElement))) close();
    }, 150);
  });

  const actions = el('div', 'tt-add-actions');
  const add = el('button', 'mod-cta', 'Add');
  add.type = 'button';
  add.addEventListener('click', () => submit(false));
  const details = el('button', '', 'Details…');
  details.type = 'button';
  details.title = 'Open the Tasks editor for priority, dates and recurrence';
  details.addEventListener('click', () => submit(true));
  const cancel = el('button', 'clickable-icon tt-add-cancel');
  cancel.type = 'button';
  cancel.setAttribute('aria-label', 'Cancel');
  host.icon(cancel, 'x');
  cancel.addEventListener('click', close);
  actions.append(add, details, cancel);

  box.append(input, actions);
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

/** "▸ 3 more" under a capped Done cell, or "▾ Show fewer" once it is open. */
function moreToggle(collapsed: boolean, extra: number, onClick: () => void): HTMLElement {
  const b = el('button', `tt-more${collapsed ? ' is-collapsed' : ''}`);
  b.type = 'button';
  b.setAttribute('aria-expanded', String(!collapsed));
  b.append(chevron(), el('span', '', collapsed ? `${extra} more` : 'Show fewer'));
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

function card(task: BoardTask, model: BoardModel, host: RenderHost): HTMLElement {
  const c = el('div', 'tt-card');
  c.dataset.id = task.id;
  c.draggable = true;
  if (task.closed) c.classList.add('is-closed');
  if (isOverdue(task, model.today)) c.classList.add('is-overdue');

  const main = taskMain(task, host);
  const meta = el('div', 'tt-card-meta');
  const subtasks = model.subtasks[task.id] ?? [];
  if (subtasks.length > 0) meta.append(subtaskToggle(task, subtasks, host));
  if (task.closed && task.closedDate) {
    const verb = task.status === '-' ? 'Cancelled' : 'Done';
    const end = `${task.status === '-' ? '❌' : '✅'} ${shortLabel(task.closedDate)}`;
    const span = el('span', 'tt-badge tt-done', task.createdDate ? `${shortLabel(task.createdDate)} → ${end}` : end);
    span.title = task.createdDate
      ? `Created ${task.createdDate}, ${verb.toLowerCase()} ${task.closedDate}`
      : `${verb} ${task.closedDate}`;
    meta.append(span);
  }
  appendBadges(meta, task, model);
  const actions = el('span', 'tt-card-actions');
  if (!task.closed) actions.append(addSubtaskButton(task, c, model, host));
  const move = moveButton(task, model, host);
  if (move) actions.append(move);
  if (actions.childElementCount > 0) meta.append(actions);
  const source = el('a', 'tt-source', host.sourceLabel(task));
  source.title = `Open ${task.path}, line ${task.line + 1}`;
  source.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    host.onOpenSource(task, e.metaKey || e.ctrlKey);
  });
  const sourceIcon = el('span', 'tt-source-icon');
  host.icon(sourceIcon, 'file-text');
  source.prepend(sourceIcon);
  const sourceLine = el('div', 'tt-card-source');
  sourceLine.append(source);
  c.append(main, sourceLine);
  if (meta.childElementCount > 0) c.append(meta);
  const section = subtaskSection(task, model, host);
  if (section) c.append(section);
  // Selecting text in an open add box would otherwise drag the card.
  if (c.querySelector('.tt-add-input')) c.draggable = false;

  c.addEventListener('click', (e) => {
    // Links and tags inside the rendered text keep their own behaviour.
    if ((e.target as HTMLElement).closest('a')) return;
    host.onEdit(task);
  });
  c.addEventListener('dragstart', (e) => {
    draggingId = task.id;
    dragStartedAt = Date.now();
    e.dataTransfer?.setData(DRAG_TYPE, task.id);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    // Let the browser capture the drag image before dimming the card.
    requestAnimationFrame(() => c.classList.add('is-dragging'));
  });
  c.addEventListener('dragend', () => {
    draggingId = null;
    c.classList.remove('is-dragging');
    clearIndicators(c.ownerDocument);
    host.onDragEnd();
  });
  return c;
}

/** Checkbox and text, shared by cards and subtasks. */
function taskMain(task: BoardTask, host: RenderHost): HTMLElement {
  const main = el('div', 'tt-card-main');
  const box = el('input', 'task-list-item-checkbox tt-checkbox');
  box.type = 'checkbox';
  box.checked = task.closed;
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

function appendBadges(meta: HTMLElement, task: BoardTask, model: BoardModel): void {
  if (task.dueDate) {
    const overdue = isOverdue(task, model.today);
    const due = el('span', `tt-badge tt-due${overdue ? ' is-overdue' : ''}`, `📅 ${shortLabel(task.dueDate)}`);
    due.title = overdue ? `Overdue: due ${task.dueDate}` : `Due ${task.dueDate}`;
    meta.append(due);
  }
  if (task.priority) {
    const p = el('span', `tt-badge tt-priority tt-priority--${task.priority}`, PRIORITY_EMOJI[task.priority]);
    p.title = `Priority: ${task.priority}`;
    meta.append(p);
  }
}

/** One subtask inside a card: a compact row, with its own subtasks nested below it. */
function subtaskRow(task: BoardTask, model: BoardModel, host: RenderHost): HTMLElement {
  const row = el('div', 'tt-subtask');
  row.dataset.id = task.id;
  if (task.closed) row.classList.add('is-closed');
  if (isOverdue(task, model.today)) row.classList.add('is-overdue');
  const main = taskMain(task, host);
  const subtasks = model.subtasks[task.id] ?? [];
  if (subtasks.length > 0) main.append(subtaskToggle(task, subtasks, host));
  if (!task.closed) main.append(addSubtaskButton(task, row, model, host));
  row.append(main);
  const meta = el('div', 'tt-card-meta');
  appendBadges(meta, task, model);
  if (meta.childElementCount > 0) row.append(meta);
  const section = subtaskSection(task, model, host);
  if (section) row.append(section);
  row.addEventListener('click', (e) => {
    e.stopPropagation();
    if ((e.target as HTMLElement).closest('a')) return;
    host.onEdit(task);
  });
  return row;
}

/** The indented list under a task: its subtasks unless collapsed, then the add box when it's open. */
function subtaskSection(task: BoardTask, model: BoardModel, host: RenderHost): HTMLElement | null {
  const subtasks = model.subtasks[task.id] ?? [];
  const composing = composer?.key === subtaskBoxKey(task, model.config.slug);
  if (subtasks.length > 0 ? host.isCollapsed(subtasksKey(task)) : !composing) return null;
  const section = el('div', 'tt-subtasks');
  for (const sub of subtasks) section.append(subtaskRow(sub, model, host));
  if (composing) section.append(subtaskBox(task, model.config.slug, section, host));
  return section;
}

function subtaskBoxKey(task: BoardTask, slug: string): string {
  return `subtask:${slug}:${task.id}`;
}

function subtaskBox(parent: BoardTask, slug: string, section: HTMLElement, host: RenderHost): HTMLElement {
  const box = addBox(
    subtaskBoxKey(parent, slug),
    'New subtask. Enter to add, ⌘/Ctrl+Enter for details',
    host,
    (text, detailed) => host.onAddSubtask(parent, text, detailed),
    () => {
      const card = box.closest<HTMLElement>('.tt-card');
      box.remove();
      if (!section.hasChildNodes()) section.remove();
      if (card) card.draggable = !card.querySelector('.tt-add-input');
    },
  );
  return box;
}

/** "▾ 1/3": shows or hides a task's subtasks, with how many are done. */
function subtaskToggle(task: BoardTask, subtasks: BoardTask[], host: RenderHost): HTMLElement {
  const key = subtasksKey(task);
  const collapsed = host.isCollapsed(key);
  const done = subtasks.filter((s) => s.closed).length;
  const b = el('button', `tt-subtask-toggle${collapsed ? ' is-collapsed' : ''}`);
  b.type = 'button';
  b.setAttribute('aria-expanded', String(!collapsed));
  const label = `${collapsed ? 'Show' : 'Hide'} subtasks (${done} of ${subtasks.length} done)`;
  b.setAttribute('aria-label', label);
  b.title = label;
  b.append(chevron(), el('span', '', `${done}/${subtasks.length}`));
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    host.onToggleRow(key);
  });
  return b;
}

/** Opens the add box at the end of the task's subtasks, expanding them first if they're hidden. */
function addSubtaskButton(task: BoardTask, owner: HTMLElement, model: BoardModel, host: RenderHost): HTMLElement {
  const b = el('button', 'clickable-icon tt-card-icon tt-add-subtask');
  b.type = 'button';
  b.setAttribute('aria-label', 'Add subtask');
  b.title = 'Add subtask';
  host.icon(b, 'list-plus');
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    const key = subtaskBoxKey(task, model.config.slug);
    if (composer?.key !== key) composer = { key, text: '' };
    if ((model.subtasks[task.id]?.length ?? 0) > 0 && host.isCollapsed(subtasksKey(task))) {
      // Redraws with the list open, and the box in it.
      host.onToggleRow(subtasksKey(task));
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
    const card = owner.closest<HTMLElement>('.tt-card');
    if (card) card.draggable = false;
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
  const label = `Move to ${model.rows[rowIndex(target.rowId)]!.label}`;
  b.setAttribute('aria-label', label);
  b.title = label;
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

function addDropZone(zone: HTMLElement, host: RenderHost, target: (taskId: string) => DropTarget): void {
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
  if (!indicator) indicator = el('div', 'tt-drop-indicator');
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

function chevron(): SVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'tt-chevron');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', 'M6 9l6 6 6-6');
  svg.append(path);
  return svg;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}
