import type { SubtaskReorder } from '../core/reorderSubtasks.ts';
import type { BoardTask } from '../core/board.ts';
import { uiElement } from './dom.ts';

/**
 * Dragging an open subtask's row within its list reorders it, with the same native drag and insertion marker
 * as cards. Completed subtasks keep their place; dragging any subtask out of its list still promotes it.
 */
export function installSubtaskReorder(section: HTMLElement, parent: BoardTask, siblings: BoardTask[], completedLast: boolean,
  drag: { id(): string | null; finish(): void; clear(): void }, save?: (move: SubtaskReorder) => void): () => void {
  const doc = section.ownerDocument, view = doc.defaultView!;
  // The board may list completed subtasks last; the write needs the note's order.
  const noteOrder = [...siblings].sort((a, b) => a.line - b.line);
  const rows = [...section.querySelectorAll<HTMLElement>(':scope > .tt-subtask')];
  const taskOf = (row: HTMLElement) => siblings.find(task => task.id === row.dataset.id);
  const desktop = () => !doc.body.classList.contains('is-mobile') && !view.matchMedia?.('(pointer: coarse)').matches;
  const movable = (task: BoardTask | undefined): task is BoardTask =>
    !!task && !task.closed && !!save && desktop() && !section.querySelector('.tt-add-input');
  // With completed subtasks listed last, an open one can only land among the open ones.
  const neighbors = (moving: BoardTask) => rows.filter(row => {
    const task = taskOf(row);
    return !!task && task.id !== moving.id && !(completedLast && task.closed);
  });
  const order = (moving: BoardTask) => rows.filter(row => row.dataset.id === moving.id || neighbors(moving).includes(row));
  // Place it before the row below the drop, or else just after the row above it, in the note.
  const place = (moving: BoardTask, below: HTMLElement | null, above: HTMLElement | null) => {
    const shown = order(moving), from = shown.findIndex(row => row.dataset.id === moving.id);
    const to = below ? shown.indexOf(below) : above ? shown.indexOf(above) + 1 : -1;
    // Beside itself on screen is no move, even when hidden or completed siblings sit between in the note.
    if (to < 0 || to === from || to === from + 1) return;
    const others = noteOrder.filter(task => task.id !== moving.id);
    const beforeId = below ? below.dataset.id! : others[others.findIndex(task => task.id === above!.dataset.id) + 1]?.id ?? null;
    save?.({ parent, siblings: noteOrder, taskId: moving.id, beforeId });
  };

  const indicator = uiElement(doc, 'div');
  indicator.className = 'tt-drop-indicator'; indicator.setAttribute('aria-hidden', 'true');
  const over = (event: DragEvent) => {
    const id = drag.id();
    if (!id) return;
    const moving = siblings.find(task => task.id === id);
    if (!movable(moving)) {
      // A nested list leaves other levels' subtasks to their own list. The outermost list keeps the rest
      // from bubbling into the cell, where the drop would promote them.
      if (!moving && section.parentElement?.closest('.tt-subtasks')) return;
      event.preventDefault(); event.stopPropagation(); drag.clear();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'none';
      if (event.type === 'drop') drag.finish();
      return;
    }
    event.preventDefault(); event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    const candidates = neighbors(moving);
    const below = candidates.find(row => { const r = row.getBoundingClientRect(); return event.clientY < r.top + r.height / 2; }) ?? null;
    const above = below ? null : candidates.at(-1) ?? null;
    if (event.type === 'drop') { place(moving, below, above); drag.finish(); return; }
    if (below ? indicator.nextSibling !== below : indicator.previousSibling !== above) {
      drag.clear();
      if (below) section.insertBefore(indicator, below); else above?.after(indicator);
    }
  };
  const leave = (event: DragEvent) => { if (!section.contains(event.relatedTarget as Node | null)) indicator.remove(); };
  section.addEventListener('dragover', over);
  section.addEventListener('drop', over);
  section.addEventListener('dragleave', leave);

  if (save && desktop()) {
    for (const row of rows) {
      const task = taskOf(row);
      if (!task || task.closed) continue;
      row.setAttribute('aria-description', 'Press Enter to edit. Alt+Up or Alt+Down reorders within this parent.');
      row.setAttribute('aria-keyshortcuts', 'Enter Alt+ArrowUp Alt+ArrowDown');
      row.addEventListener('keydown', event => {
        if (event.target !== row || !event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key) || !movable(task)) return;
        event.preventDefault(); event.stopPropagation();
        const shown = order(task), i = shown.indexOf(row);
        if (event.key === 'ArrowUp' && i > 0) place(task, shown[i - 1]!, null);
        if (event.key === 'ArrowDown' && i < shown.length - 1) place(task, null, shown[i + 1]!);
      });
    }
  }
  return () => {
    section.removeEventListener('dragover', over);
    section.removeEventListener('drop', over);
    section.removeEventListener('dragleave', leave);
  };
}
