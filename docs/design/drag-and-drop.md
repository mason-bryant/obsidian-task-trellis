[← UX rules](README.md)

# Drag and drop

## Rules

- A dragged item visibly follows the pointer. The destination shows before release, and the moving item looks different from the items staying put.
- Explicit drag handles sit on the right edge: narrow, and flush with the item's top, bottom and right borders. Room is reserved for them so they don't cover text or actions.
- Scrolling, or clicking an ordinary control, never starts a handle drag. A press that doesn't move reorders nothing. A drag claims only its own pointer, so other gestures keep working.
- Dragging near the edge of a scrolling area scrolls it. A cancelled pointer, lost capture or a closed screen cancels the drag and leaves nothing behind: no temporary styles, placeholders, pointer captures or animation frames.
- Nothing is saved until a valid drop. In a settings list, a drop changes the draft and the editor's Save commits it. A card drop writes the note and offers Undo.
- Arrange → Sort by due date reorders cards without dragging. It changes only the order numbers of the fewest cards needed to put each dated cell sooner-first, never a date or column, and writes it as one action with one Undo.
- Moving a card can change the task. A date row sets its due date, Done completes it and leaving Done reopens it, and dragging a subtask out of its card makes it a card of its own. These follow [task behavior](../tasks.md), not just the card's place on screen.
- In a settings list, such as columns or quick filters, the insertion point comes from the rows' original positions, so neighbors sliding aside can't make it jump. Expanded rows, unsaved edits, ids, the Done and No due date columns, and focus all survive a reorder. With a handle focused, Arrow Up and Arrow Down move the row one place and Home and End move it to either end, and the new position is announced.
- In the one-column touch layout, holding a dragged card at the side edge reveals the next column. That takes outward movement and a short hold, so a vertical drag near the right-edge handle doesn't switch columns. An ordinary sideways swipe pages between columns without moving a task.
- Resizing a column is a separate interaction; see [responsive layouts](responsive-layouts-and-gestures.md). A resize separator never looks or behaves like a reorder handle.

- **Subtask order:** on desktop, an open subtask is reordered among its direct siblings by dragging its row, with the same native drag, dimmed source and insertion marker as a card. Alt+Up/Down on a focused row does the same. Keep focus on the moved row; the Undo status says Subtask reordered. The intact Markdown block, including descendants and indented notes, moves with the task.
- Completed subtasks can't be reordered, and dropping one inside its list does nothing. With Completed last, an open subtask lands only among the open ones. Hidden and completed siblings keep their place in the note, and a drop beside the row's current place on screen writes nothing. Dropping a subtask into another list, or into its own while a composer is open there, does nothing. Mobile and coarse-pointer devices don't reorder subtasks.

## Exceptions

- With a mouse, moving a card and reordering or promoting a subtask use the whole item, with the browser's native drag and drop, as desktop users expect. The card-movement grip appears only on touch screens and in Obsidian mobile, where dragging a whole card would fight scrolling. A subtask dropped inside its own list is reordered; dropped outside it, it becomes a card.
- With a mouse on a one-column board, a dragged card can't reach another column. Move to… does that instead.
- Whole-card drags and settings lists use different controllers because they save differently: a card drop writes notes, while a list drop changes a draft. Their feedback differs too:
  - cards show an insertion marker, while a settings list opens a gap with a dashed slot;
  - a touch-dragged card is a floating copy, while a settings list moves the row itself;
  - Escape cancels a settings-list drag and a column resize, but card drags have no Escape handling of their own.

## Where it lives

- **Sibling subtask order:** [reorderSubtasks.ts](../../src/ui/reorderSubtasks.ts) handles native drops and Alt+Up/Down inside a subtask list, and draws the card insertion marker there. [The core transform](../../src/core/reorderSubtasks.ts) validates the direct sibling list and moves its Markdown blocks; `TaskWriter.reorderSubtask` validates snapshots and writes atomically with the normal guarded Undo.
- **Card drags with a mouse:** native drag and drop of the whole card or subtask row, in [renderBoard.ts](../../src/ui/renderBoard.ts). It draws the insertion marker, works out the target cell and position, and also handles Alt+Up/Down.
- **Card drags on touch:** the right-edge grip, in [touchCardDrag.ts](../../src/ui/touchCardDrag.ts). It moves a floating copy and scrolls near the edges: the column vertically, and a board wider than the screen sideways. In the one-column layout, holding at a side edge pages instead. The grip shows only with a coarse pointer or in Obsidian mobile.
- **What a drop changes:** `planDrop` and `planPromotion` in [board.ts](../../src/core/board.ts). [BoardView.ts](../../src/obsidian/BoardView.ts) shows the move at once, writes it with `TaskWriter.applyEdits` and records Undo.
- **Settings lists (columns and quick filters):** [reorderRows.ts](../../src/ui/reorderRows.ts) moves the row, slides its neighbors and draws the slot. It listens for pointer moves and releases on the document, in the capture phase, because Obsidian can catch them before they reach the handle. Each listener ignores everything but its own drag, and all of them are removed on redraw. [renderBoardSettings.ts](../../src/ui/renderBoardSettings.ts) applies the new order, restores focus and announces the position.
- **Column resize:** [columnResize.ts](../../src/ui/columnResize.ts).
