import type { SubtaskReorder } from '../core/reorderSubtasks.ts';
import type { BoardTask } from '../core/board.ts';
import { uiElement } from './dom.ts';
import { installRowReorder } from './reorderRows.ts';

/** A sibling grip never promotes or reparents a task; whole-row drags retain promotion outside lists. */
export function installSubtaskReorder(section: HTMLElement, parent: BoardTask, siblings: BoardTask[], complete: boolean,
  drag: { id(): string | null; finish(): void; clear(): void; active(value: boolean): void; scroller(): HTMLElement },
  icon: (el: HTMLElement, name: string) => void, save?: (move: SubtaskReorder) => void): () => void {
  const view = section.ownerDocument.defaultView!;
  const rows = [...section.querySelectorAll<HTMLElement>(':scope > .tt-subtask')];
  const desktop = () => !section.ownerDocument.body.classList.contains('is-mobile') && !view.matchMedia?.('(pointer: coarse)').matches;
  const allowed = (event?: PointerEvent) => !!save && desktop() && complete && !section.querySelector('.tt-add-input') &&
    (!event || event.pointerType === 'mouse');
  const commit = (from: number, to: number) => {
    if (from === to || !allowed()) return;
    const others = siblings.filter((_, i) => i !== from);
    save?.({ parent, siblings, taskId: siblings[from]!.id, beforeId: others[to]?.id ?? null });
  };
  // Keep native row drops inside any subtask list from bubbling into the promotion zone.
  for (const type of ['dragover', 'drop'] as const) section.addEventListener(type, event => {
    if (!drag.id()) return;
    event.preventDefault(); event.stopPropagation(); drag.clear();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'none';
    if (type === 'drop') drag.finish();
  });
  if (!save || rows.length < 2 || !desktop()) return () => undefined;
  const unavailable = 'Show all sibling subtasks and choose note order in appearance settings before reordering this list.';
  // A disabled button inside a draggable row can start the ROW's native drag.
  // Its dragstart targets the row, so a listener on the button cannot stop it.
  // Claim unavailable grip presses in capture and guard native dragging at the list.
  let gripPress = false;
  const guardPress = (event: PointerEvent) => {
    const grip = (event.target as Element).closest('.tt-subtask-reorder-grip');
    gripPress = !!grip;
    if (grip?.parentElement?.parentElement === section && !allowed(event)) { event.preventDefault(); event.stopPropagation(); }
  };
  const guardNativeDrag = (event: DragEvent) => {
    if (gripPress) { event.preventDefault(); event.stopPropagation(); }
  };
  section.addEventListener('pointerdown', guardPress, true);
  section.addEventListener('dragstart', guardNativeDrag, true);
  for (const [index, row] of rows.entries()) {
    const sibling = siblings.find(task => task.id === row.dataset.id)!;
    const handle = uiElement(section.ownerDocument, 'button');
    handle.type = 'button'; handle.className = 'tt-reorder-grip tt-subtask-reorder-grip';
    handle.setAttribute('aria-label', `Reorder subtask: ${sibling.text}`);
    handle.setAttribute('aria-description', complete ? 'Drag within this parent, or use Arrow Up, Arrow Down, Home or End.' : unavailable);
    handle.setAttribute('aria-keyshortcuts', 'ArrowUp ArrowDown Home End');
    handle.disabled = !complete; handle.title = complete ? 'Reorder within this parent' : unavailable;
    handle.dataset.boardFocus = `subtask-reorder:${sibling.id}`;
    icon(handle, 'grip-vertical');
    handle.addEventListener('click', event => event.stopPropagation());
    handle.addEventListener('dragstart', event => { event.preventDefault(); event.stopPropagation(); });
    row.classList.add('tt-subtask--reorderable'); row.append(handle);
    row.setAttribute('aria-description', complete ? 'Press Enter to edit. Alt+Up or Alt+Down reorders within this parent.' : unavailable);
    row.setAttribute('aria-keyshortcuts', complete ? 'Enter Alt+ArrowUp Alt+ArrowDown' : 'Enter');
    row.addEventListener('keydown', event => {
      if (event.target !== row || !event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key) || !allowed()) return;
      event.preventDefault(); event.stopPropagation();
      const to = index + (event.key === 'ArrowUp' ? -1 : 1);
      if (to >= 0 && to < rows.length) commit(index, to);
    });
  }
  const dispose = installRowReorder(section, ':scope > .tt-subtask', commit, {
    enabled: allowed, scroller: () => drag.scroller(), onDragState: active => drag.active(active), containDrop: true,
  });
  return () => {
    dispose();
    section.removeEventListener('pointerdown', guardPress, true);
    section.removeEventListener('dragstart', guardNativeDrag, true);
  };
}
