[← Shared UX guidance](README.md)

# Drag and drop

## Expected behavior

- A draggable item must visibly follow the pointer. Show the destination before release, and distinguish the moving item from stationary items.
- Put explicit drag handles on the right edge. Handles should be narrow and flush with the item's top, bottom and right borders; reserve space so they do not cover text or actions.
- Scrolling or clicking ordinary controls must not accidentally start a handle drag. A stationary press must not reorder anything. Claim only the active pointer; unrelated gestures must continue to work.
- Scroll near the container edges while dragging. Cancel safely on pointer cancellation, lost capture or disposal. Remove temporary styles, placeholders, captures and animation frames when finished.
- Persist only after a valid drop. For a draft settings list, a drop changes the draft; the editor's Save commits it. For cards, a valid drop writes through the task writer and offers Undo.

## Existing implementations and intentional differences

| Surface | Implementation and behavior |
| --- | --- |
| Board cards | [renderBoard.ts](../../src/ui/renderBoard.ts) handles desktop native drag/drop, insertion indicators, drop semantics and keyboard moves. [touchCardDrag.ts](../../src/ui/touchCardDrag.ts) provides handle-driven pointer movement with a floating inert copy. |
| Quick-filter settings | [reorderQuickFilters.ts](../../src/ui/reorderQuickFilters.ts) moves the actual row, slides neighbors aside and draws a dashed destination slot. [renderBoardSettings.ts](../../src/ui/renderBoardSettings.ts) applies the new draft order and restores focus. |
| Column edges | Resizing is a separate interaction: see [responsive layouts](responsive-layouts-and-gestures.md). A resize separator must not look or behave like a card reorder handle. |

Quick-filter hit testing uses the original row rectangles, not the animated positions, so neighbors moving aside cannot cause the insertion target to oscillate. Preserve expanded rows, edits, stable filter IDs and focus through reordering. Arrow Up/Down moves a focused handle one position; Home/End moves it to an end. Announce its new position.

Card movement has additional meaning: a date-row move changes the due date, Done changes completion, and moving a subtask out can change note hierarchy. Reuse the existing drop planning and writer; do not implement these as DOM-only moves. See [task behavior](../tasks.md).

In a single-column touch layout, an outward drag held at an edge reveals the next column. The current controller requires outward movement and a dwell, preventing a vertical drag near the right-side handle from switching columns. Ordinary horizontal swiping pages columns without moving a task.

The settings controller observes the active drag's move/up events in document capture because Obsidian can intercept them before they reach the handle. Keep this narrowly scoped and dispose listeners on redraw. Do not block document gestures globally.

**Current differences:** board cards show insertion indicators rather than the settings list's animated opening gap. Touch card movement uses a ghost; the filter list transforms its real row. Escape cancellation exists in the settings controller; do not assume every card drag controller has the same keyboard cancellation behavior. Cards have Alt+Up/Down and Move to… alternatives.

## Verify

- Move first, middle and last items in both directions, including an expanded filter between collapsed ones.
- Check pointer-following feedback, stable insertion targets, scroll edges, and reduced-motion behavior.
- Cancel, release outside a valid destination, and redraw/dispose during a gesture; verify no write or stuck drag remains.
- Test mouse and touch paths, keyboard alternatives, settings Save/Cancel, failed card writes and Undo.
- Verify ordinary vertical scrolling, column paging, native sidebar gestures and main toolbar layout still work.

Start with [reorder tests](../../tests/reorderQuickFilters.test.ts), [touch drag tests](../../tests/touchCardDrag.test.ts), [board view tests](../../tests/BoardView.test.ts) and [quick-filter tests](../../tests/quickFilters.test.ts). Native Obsidian testing is needed for host event interception.
