import { announce, clearForRedraw } from './announce.ts';
import { uiElement } from './dom.ts';
import { addBox, type ComposerLabels, type ComposerSlot, type RenderHost } from './renderBoard.ts';

/** A board in the boards sidebar. `folder` shows when another board has the same name. */
export type BoardListItem = { path: string; name: string; folder: string };

/**
 * The open board, which the sidebar adds tasks to: at the top of its backlog, which `place` names
 * as that cell's Add task button does, with its labels for the composer's Labels button.
 */
export type BoardListTarget = { path: string; place: string; labels: Omit<ComposerLabels, 'pick'> };

/** What the sidebar needs from its host (the Obsidian view, or the dev harness). */
export type BoardListHost = Pick<RenderHost, 'icon' | 'onUnsavedText'> & {
  onCreateBoard(): void;
  onOpenBoard(path: string): void;
  /** Adds a task to the top of the board's backlog; `detailed` opens the full editor first. */
  onAddTask(path: string, text: string, detailed: boolean, labels: string[]): Promise<boolean> | boolean;
  /** Without it the composer has no Labels button. */
  onComposerLabels?(path: string, ...pick: Parameters<ComposerLabels['pick']>): void;
};

/** The sidebar's open box, apart from the board's. Its key names the board, so a draft stays with its board. */
const sidebarComposer: ComposerSlot = { draft: null };

/**
 * The boards sidebar: Create new board, then a row for each board. Under the open board's row,
 * Add task opens the same composer as a board cell's, adding to the top of that board's backlog.
 * A redraw puts focus back on the control that had it, found by its `data-board-focus` key.
 */
export function renderBoardList(root: HTMLElement, boards: BoardListItem[], open: BoardListTarget | null, host: BoardListHost): void {
  const doc = root.ownerDocument;
  const focused = root.contains(doc.activeElement) ? doc.activeElement as HTMLElement : null;
  const focusKey = focused?.dataset.boardFocus;
  root.classList.add('tt-board-list');
  clearForRedraw(root);
  const node = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string) => {
    const el = uiElement(doc, tag); el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  };

  root.append(node('h2', 'tt-board-list-title', 'Boards'));
  const create = node('button', 'tt-board-list-create', 'Create new board');
  create.type = 'button';
  create.dataset.boardFocus = 'create';
  create.addEventListener('click', () => host.onCreateBoard());
  root.append(create);
  if (boards.length === 0) {
    root.append(node('p', 'tt-board-list-empty', 'No boards yet. Create a board to get started.'));
  } else {
    const names = new Map<string, number>();
    for (const { name } of boards) names.set(name, (names.get(name) ?? 0) + 1);
    const list = node('ul', 'tt-board-list-items');
    list.setAttribute('aria-label', 'Boards');
    for (const board of boards) {
      const row = node('li', '');
      const button = node('button', 'tt-board-list-item');
      button.type = 'button';
      button.title = board.path;
      button.dataset.boardFocus = `board:${board.path}`;
      const icon = node('span', 'tt-board-list-icon');
      icon.setAttribute('aria-hidden', 'true');
      host.icon(icon, 'kanban');
      const label = node('span', 'tt-board-list-label');
      label.append(node('span', '', board.name));
      if (names.get(board.name)! > 1) label.append(node('span', 'tt-board-list-folder', board.folder));
      button.append(icon, label);
      button.addEventListener('click', () => host.onOpenBoard(board.path));
      row.append(button);
      if (board.path === open?.path) {
        button.classList.add('is-active');
        button.setAttribute('aria-current', 'page');
        // A box redrawn while focus was in it keeps focus; one redrawn while focus was elsewhere leaves it there.
        row.append(addTask(root, board.name, open, host, !!focused && !focusKey));
      }
      list.append(row);
    }
    root.append(list);
  }
  if (focusKey) [...root.querySelectorAll<HTMLElement>('[data-board-focus]')].find((el) => el.dataset.boardFocus === focusKey)?.focus({ preventScroll: true });
}

function addTask(root: HTMLElement, name: string, open: BoardListTarget, host: BoardListHost, takeFocus: boolean): HTMLElement {
  const doc = root.ownerDocument;
  const wrap = uiElement(doc, 'div');
  wrap.className = 'tt-board-list-add';
  const key = `sidebar:${open.path}`;
  const showButton = () => {
    const b = uiElement(doc, 'button');
    b.className = 'tt-add-button';
    b.type = 'button';
    const icon = uiElement(doc, 'span');
    icon.className = 'tt-add-icon';
    host.icon(icon, 'plus');
    const text = uiElement(doc, 'span');
    text.textContent = 'Add task';
    b.append(icon, text);
    b.setAttribute('aria-label', `Add task to ${name}: ${open.place}`);
    b.dataset.boardFocus = `add:${open.path}`;
    b.addEventListener('click', () => {
      sidebarComposer.draft = { key, text: '' };
      showBox(true);
    });
    // Closing with X or Escape hands focus back; closing because focus moved elsewhere leaves it there.
    const hadFocus = wrap.contains(doc.activeElement);
    wrap.replaceChildren(b);
    if (hadFocus) b.focus({ preventScroll: true });
  };
  const add = async (text: string, detailed: boolean, labels: string[]) => {
    const saved = await host.onAddTask(open.path, text, detailed, labels);
    // The board may not be in view, so say where the task went.
    if (saved) announce(root, `Task added to ${name}.`);
    return saved;
  };
  const labels: ComposerLabels | undefined = host.onComposerLabels
    ? { ...open.labels, pick: (...args) => host.onComposerLabels?.(open.path, ...args) }
    : undefined;
  const showBox = (focus: boolean) => wrap.replaceChildren(
    addBox(key, 'New task. Enter to add, ⌘/Ctrl+Enter for details', 'Add task', host, add, showButton, {
      slot: sidebarComposer,
      takeFocus: focus,
      labels,
    }),
  );
  if (sidebarComposer.draft?.key === key) showBox(takeFocus);
  else showButton();
  return wrap;
}
