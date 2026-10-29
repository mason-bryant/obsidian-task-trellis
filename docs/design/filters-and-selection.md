[← UX rules](README.md)

# Filters and selection

## Rules

- Board filters decide what's on the board, and each active quick filter narrows that further. A quick filter never brings in a task that the board excludes, as a card or as a bulk target. A parent task from outside the board can appear only as a context heading above a matching subtask, without edit or complete controls.
- Quick filters keep their ids when they're renamed or reordered, so whether they're on survives.
- A quick filter is in one of three states: hidden from the board (Show on board off), which is never applied; shown but off; or on. A board can keep only the first few shown filters on the toolbar, in settings order, and put the rest in a menu. That's presentation only: moving an active filter into the menu doesn't turn it off. See [quick filters](../filters.md#quick-filters) for the settings.
- Label filters use the board's label ids and colors, and No labels is a choice of its own. The same color squares appear in settings, on the toolbar and in menus. Editing a label's color updates them everywhere without changing which tasks have the label.
- Match subtasks is off by default. When it's on, a matching subtask shows inside its parent's card, for context. A parent shown only for context has the subdued, italic context note and is never a bulk target. Results keep the task hierarchy rather than flattening it.

### Bulk selection

- Select starts selecting. In selection mode, an accent selection square takes the place of each card's completion checkbox, so the two never appear together and selecting can't complete a task.
- Cmd-click or Ctrl-click toggles a card, starting selection if needed. Shift-click selects the cards shown between two cards in the same column. Modifier-clicking a link still follows the link.
- Select all includes every matching card, past collapsed rows and display limits. The column picker limits it; swiping between columns doesn't. Select column adds that column's matching cards to the selection; Clear starts over.
- Anything shown as a card can be selected, including a subtask shown as a card of its own because its parent isn't on the board; a bulk edit changes only that task's own line. Subtasks inside a card and context-only parents can't be selected on their own.
- Selecting ends with a click on empty board space or outside the board, Escape, or Done selecting. It stays on while a bulk editor is open or work is in progress.
- Changing filters or the column picker clears the selection. After an edit, selected tasks stay selected even if they no longer match, and the status says so alongside the edit's result, for example "2 updated. 2 selected tasks are outside the current view." A selected task that now shows only as a parent for context stays selected too, and can still be unticked. Undo clears the selection but leaves selection mode on.
- Bulk actions use the same checks as single edits, and report which tasks changed and which were skipped. They never quietly widen the selection or overwrite edits made since the tasks were selected.

## Exceptions

None recorded.

## Where it lives

- Matching: [filters.ts](../../src/core/filters.ts), [quickFilters.ts](../../src/core/quickFilters.ts) and [quickFilterHierarchy.ts](../../src/core/quickFilterHierarchy.ts), within the board model in [board.ts](../../src/core/board.ts).
- How many filters stay on the toolbar: the `quick-filters-menu`, `quick-filters-visible` and `quick-filters-visible-mobile` board properties, read in [boardConfig.ts](../../src/core/boardConfig.ts). The toolbar and menu groups: [renderQuickFilters.ts](../../src/ui/renderQuickFilters.ts).
- Selection: `triageCards` and `planBulk` in [bulkTriage.ts](../../src/core/bulkTriage.ts). The selection controls, status and bulk bar are in [renderBoard.ts](../../src/ui/renderBoard.ts), and the bulk editor in [renderBulkEditor.ts](../../src/ui/renderBulkEditor.ts). The user guide's [bulk triage](../tasks.md#bulk-triage) section explains selection to users.
