[← UX rules](README.md)

# Filters and selection

## Rules

- A board's rules, and each quick filter's tag, folder and property rules, are one group that matches All, Any or None of what's in it. Groups nest three levels deep: the whole filter, a group in it, and a group in that. Within one rule, any listed value can match. Empty rules and groups add no restriction. The board and quick filters use the same editor and the same matching.
- The editor follows Obsidian's Bases filter editor: All, Any or None the following are true at the top of each group, where, and or or before each filter (or in a None group, as in Bases), a nested group as a card, and each filter as one box with its trash button at the end. Removing a group's last filter removes the group. On narrow settings Bases hides where, and and or; Task Trellis keeps them, above each filter, because they make the logic easier to follow.
- Filters are named by where they are, filter 2.1 and group 2, in their controls' names and in errors, and an unfinished filter's error shows beside it.
- Rules that fit the plain lists are saved in them, as releases before groups wrote. Others are saved as a `filter` group, beside a folder rule older releases can't satisfy, so a device that hasn't updated shows no tasks instead of tasks the filter hides.
- Board filters decide what's on the board, and each active quick filter narrows that further. A quick filter never brings in a task that the board excludes, as a card or as a bulk target. A parent task from outside the board can appear only as a context heading above a matching subtask, without edit or complete controls.
- Quick filters keep their ids when they're renamed or reordered, so whether they're on survives.
- A quick filter is in one of three states: hidden from the board (Show on board off), which is never applied; shown but off; or on. A board can keep only the first few shown filters on the toolbar, in settings order, and put the rest in a menu. That's presentation only: moving an active filter into the menu doesn't turn it off. See [quick filters](../filters.md#quick-filters) for the settings.
- Label filters use the board's label ids and colors, and No labels is a choice of its own. The same color squares appear in settings, on the toolbar and in menus. Editing a label's color updates them everywhere without changing which tasks have the label.
- Match subtasks is off by default. When it's on, a matching subtask shows inside its parent's card, for context. A parent shown only for context has the subdued, italic context note and is never a bulk target. Results keep the task hierarchy rather than flattening it.

### Bulk selection

- Select starts selecting. In selection mode, an accent selection square takes the place of each card's completion checkbox, so the two never appear together and selecting can't complete a task.
- Cmd-click or Ctrl-click toggles a card, starting selection if needed. Shift-click selects the cards shown between two cards in the same column. Modifier-clicking a link still follows the link.
- Select all includes every matching card, past collapsed rows and display limits. The column picker limits it; swiping between columns doesn't. Select column adds that column's matching cards to the selection; Clear starts over.
- Anything shown as a card can be selected, including a subtask shown as a card of its own because its parent isn't on the board. A bulk edit changes only that task's own line, and label changes leave subtasks alone, because subtasks don't have labels. Subtasks inside a card and context-only parents can't be selected on their own.
- Selecting ends with a click on empty board space or outside the board, Escape, or Done selecting. It stays on while a bulk editor is open or work is in progress.
- Changing filters or the column picker clears the selection. After an edit, selected tasks stay selected even if they no longer match, and the status says so alongside the edit's result, for example "2 updated. 2 selected tasks are outside the current view." A selected task that now shows only as a parent for context stays selected too, can still be unticked, and is counted in the status. Undo clears the selection but leaves selection mode on.
- Bulk actions use the same checks as single edits, and report which tasks changed and which were skipped. They never quietly widen the selection or overwrite edits made since the tasks were selected.

## Exceptions

None recorded.

## Where it lives

- Rule groups, reading and saving them: [filterTree.ts](../../src/core/filterTree.ts), with the draft in [boardDraft.ts](../../src/core/boardDraft.ts) and the editor, `groupEditor`, in [renderBoardSettings.ts](../../src/ui/renderBoardSettings.ts).
- Matching: [filters.ts](../../src/core/filters.ts), [quickFilters.ts](../../src/core/quickFilters.ts) and [quickFilterHierarchy.ts](../../src/core/quickFilterHierarchy.ts), within the board model in [board.ts](../../src/core/board.ts).
- How many filters stay on the toolbar: the `quick-filters-menu`, `quick-filters-visible` and `quick-filters-visible-mobile` board properties, read in [boardConfig.ts](../../src/core/boardConfig.ts). The toolbar and menu groups: [renderQuickFilters.ts](../../src/ui/renderQuickFilters.ts).
- Selection: `triageCards` and `planBulk` in [bulkTriage.ts](../../src/core/bulkTriage.ts). The selection controls, status and bulk bar are in [renderBoard.ts](../../src/ui/renderBoard.ts), and the bulk editor in [renderBulkEditor.ts](../../src/ui/renderBulkEditor.ts). The user guide's [bulk triage](../tasks.md#bulk-triage) section explains selection to users.
