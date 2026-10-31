[← Testing rules](README.md)

# UI checklists

What to check for each kind of UI change. The rules being checked are in the [UX rules](../design/README.md).

## By kind of change

| Change | Check at least |
| --- | --- |
| Settings styles or shared controls | The edited settings section, the main toolbar, card actions, long names, and quick filters both on the toolbar and in the menu |
| Drag, resize or scroll | Mouse and touch, cancelling and closing mid-gesture, edge scrolling, the keyboard alternative, and the scroll position afterwards; native Obsidian when available |
| Editors and saving | Success; failure with the draft kept; no duplicate submit; IME; focus; the layout with the phone keyboard open |
| Board columns | Renaming, reordering and removing a column, then the board: renamed columns keep their cards, and a removed column's note in the Columns tab names where its open cards went |
| Filters and bulk selection | Matches versus context-only tasks, scope and counts, stale tasks, partial writes and Undo |
| Shared CSS or layout | Wide desktop, a narrow desktop pane, phone width, one chosen column, light and dark themes, the user's installed theme, enlarged text |

## Look and feel

- Long names, several label squares, no labels, and disabled and active states.
- Light and dark themes, and the user's installed theme when available.
- After changing the settings editor or the toolbar, look at both.
- After changing what a card or cell draws, open a large board: `npm run harness`, then `dev/harness.html?load=2000`, at phone width and wide. The [large-board report](../qa/large-board-2026-10-30.md) says how its memory was measured. Long cells are tested in [cellPaging](../../tests/cellPaging.test.ts).

## Wording

- Read every new or changed string against the [wording rules](../design/wording.md): sentence case, verbs, "…", counts.
- Read each new notice as the user would see it: it says what failed, whether anything was saved, and what to do next.

## Buttons, icons and menus

- Toolbar wrapping and menu placement in narrow panes. Settings stays last in visual and keyboard order, with the column selector shown or hidden and selection mode on or off.
- Every Appearance checkbox checks to hide and unchecks to show. Existing saved preferences open unchanged; Save and Cancel preserve their meanings.
- Open and dismiss each menu with the pointer and with the keyboard. Check focus and checkmarks after a redraw.
- Tests: [quickFilterMenu](../../tests/quickFilterMenu.test.ts) (overflow, checked state, active count and focus on dismissal; its toggle doesn't redraw), [subtaskVisibility](../../tests/subtaskVisibility.test.ts) (the Subtasks menu and focus after a redraw), [narrowBoard](../../tests/narrowBoard.test.ts) (Move to…), [quickFilters](../../tests/quickFilters.test.ts) (copy, remove and reorder) and [editorHeader](../../tests/editorHeader.test.ts) (header order).

## Editing and saving

- Save, Cancel, Escape, returning from a nested editor, and successful navigation.
- An unavailable destination and a failed write: the draft is kept, and retrying doesn't add a duplicate.
- The phone keyboard open at phone width, long forms and enlarged text. Resizing a desktop browser doesn't prove keyboard clearance.
- IME confirmation, multiline entry, and focus after a redraw.
- Composer labels: pick labels on a board cell's composer and in the boards sidebar's; the box stays open while the picker is, the labels show above the text, focus returns to the Labels button, and the task is added with them. Check the action row fits a 240px column on a touch screen.
- Boards sidebar: + Add task follows the open board, adds to the top of its backlog with the board out of view, and keeps a draft with its board when another board is opened.
- Rename board… and Duplicate board… in General. Renaming returns to the settings with their draft and the new title; save afterwards and check the right note changed, also after renaming the tags. Duplicating makes one note next to the original with the same settings and a new slug, and opens it; compare the task notes before and after. With unsaved settings, the dialog says they aren't copied, and the settings stay open with them.
- Delete board: Cancel has focus first and changes nothing. Delete board moves only the board note to the trash: compare the task notes before and after, and check the board's tab, sidebar entry and Open board command are gone. Restoring the note brings the board back.
- Tests: [editorHeader](../../tests/editorHeader.test.ts), [deleteBoard](../../tests/deleteBoard.test.ts) (the General tab and the delete warning), [duplicateBoard](../../tests/duplicateBoard.test.ts) (Rename board… and Duplicate board… from the settings, and the copy), [saveReliability](../../tests/saveReliability.test.ts), [editorClose](../../tests/editorClose.test.ts) (dialogs that can't close while saving), [boardFocus](../../tests/boardFocus.test.ts) (composer focus, and the composer above the keyboard), [labelPicker](../../tests/labelPicker.test.ts), [NotePopup](../../tests/NotePopup.test.ts), [boardRename](../../tests/boardRename.test.ts) (the board name editor: retry, IME and spinners), [boardList](../../tests/boardList.test.ts) (the boards sidebar's composer and composer labels) and [QuickAdd](../../tests/QuickAdd.test.ts) (a missing destination, and adding to the top of the backlog).

## Drag and drop

- Move the first, a middle and the last item in both directions, including an expanded filter between collapsed ones.
- The item follows the pointer, the insertion point holds still, the edges scroll, and reduced motion works.
- Cancel, release outside any destination, and redraw or close mid-gesture: nothing is written and no drag is left stuck.
- Mouse and touch, the keyboard alternatives, settings Save and Cancel, a failed card write, and Undo.
- Desktop subtasks: drag an open row up and down, including one with descendants and in a nested list, with Note order, with Completed last and with completed subtasks hidden. During the drag the row dims and the card insertion marker shows where it will land. Completed subtasks can't be reordered. Check Undo, Alt+Up/Down and focus after saving, a drop outside the list (it becomes a card) and into another list (nothing), a narrow desktop pane and one selected column. No subtask reordering on mobile or coarse pointers.
- Ordinary vertical scrolling, column paging, Obsidian's sidebar gestures and the toolbar layout still work.
- Arrange → Sort by due date: every dated cell ends sooner-first, the notes show only the moved cards' tags changed, Done and the No due date row are untouched, and one Undo restores every note. Try it with a quick filter on, and on a board that's already sorted.
- Tests: [reorderRows](../../tests/reorderRows.test.ts) (the settings-list grip), [columnSettings](../../tests/columnSettings.test.ts) (reordering columns keeps the Done column), [quickFilters](../../tests/quickFilters.test.ts) (keyboard reordering keeps state and focus, and announces), [touchCardDrag](../../tests/touchCardDrag.test.ts) (the card grip), [narrowBoard](../../tests/narrowBoard.test.ts) (touch drops, native desktop drag and Alt+Down), [promoteSubtask](../../tests/promoteSubtask.test.ts) (dragging a subtask out of its card) [dueSort](../../tests/dueSort.test.ts) (fewest moves to due-date order) and [BoardView](../../tests/BoardView.test.ts) (writing a drop or a sort, previews and Undo). How Obsidian intercepts events needs native testing.

## Responsive layouts and gestures

- Wide desktop, tablet, a narrow desktop pane and phone width, and one chosen column separately. Resize a board across 600px rather than only loading it at one width.
- Scroll every column vertically, including after paging and after the index updates.
- Slow partial swipes, flicks, diagonal movement, taps on links, pinch zoom, and handle drags near the edges.
- Reach the last card above the floating toolbar, with short and long lists.
- Pointer and keyboard resizing, resetting, and a failed save.
- Editors with the keyboard open on native iOS when available. Record browser and simulator coverage separately from devices.
- Open a task and a nested subtask composer near the end of a list with an overlay keyboard. Check the input remains visible with real scroll limits, viewport resize and pan, paging and one chosen column, and after redraw. Close or move focus out and check the board regains its height. A mocked `scrollTop` that accepts unlimited values cannot validate this case.
- Tests: [columnSwipe](../../tests/columnSwipe.test.ts), [narrowBoard](../../tests/narrowBoard.test.ts), [columnResize](../../tests/columnResize.test.ts), [touchCardDrag](../../tests/touchCardDrag.test.ts) and [quickFilterMenu](../../tests/quickFilterMenu.test.ts). They set the one-column layout by hand, so the breakpoint itself needs a browser.

## Filters and selection

- Filter groups: build a nested filter, such as ((A or B) and C) or D, save it, and check the board and the note's `filter` property, then reopen the settings. Turn the groups back into plain filters and check `filter` is gone. Compare the editor with a base's filter editor, and check three levels at phone width.
- Compare what's shown, the selected count and what was actually written, including filtered subtasks and context-only parents.
- Tasks without labels, renamed labels, hidden filters, the overflow menu and one chosen column.
- Modifier-click, ranges within a column, Select all with collapsed rows, clicking away to stop selecting, and selection kept while the bulk editor is open.
- Partial writes, edits made after selecting, selection kept after an edit, and Undo.
- Tests: [quickFilterHierarchy](../../tests/quickFilterHierarchy.test.ts), [quickFilters](../../tests/quickFilters.test.ts), [quickFilterMenu](../../tests/quickFilterMenu.test.ts), [bulkTriage](../../tests/bulkTriage.test.ts), [filters](../../tests/filters.test.ts) (groups read from the note, simplified and saved), [filterEditor](../../tests/filterEditor.test.ts) (the group editor) and [BoardView](../../tests/BoardView.test.ts). These include adding a column to an existing selection, Undo clearing selected snapshots, the status for selected tasks outside the view, and a mixed main-task/subtask label edit followed by Undo.

## Feedback and recovery

- Force a failed destination, a failed write, a stale snapshot and a partly successful bulk edit, with synthetic tasks or a disposable vault.
- No lost input, false success, spinner left running, duplicate submission or card preview left in the wrong place.
- Edit a note before using Undo, and check that the edit survives.
- A successful save followed by failed navigation, and a retry after a failure.
- Tests: [saveReliability](../../tests/saveReliability.test.ts), [TaskWriter](../../tests/TaskWriter.test.ts), [BoardView](../../tests/BoardView.test.ts), [boardTagRename](../../tests/boardTagRename.test.ts) (the rename service), [boardRename](../../tests/boardRename.test.ts) (the board name editor), [NotePopup](../../tests/NotePopup.test.ts) and [ShortcutActions](../../tests/ShortcutActions.test.ts) (saved, then the board fails to open).

## Accessibility

- Complete the changed workflow without a pointer, and check where focus lands after saving, cancelling, a redraw and closing a menu.
- When a screen reader is available, check its names, state changes and reading order.
- Light and dark themes, enlarged text, reduced motion and narrow layouts. On native iOS, include the keyboard and touch exploration.
- Tests: [boardFocus](../../tests/boardFocus.test.ts) (focus after redraws, menus and composers, including while the composer saves; names; keyboard subtasks), [announcements](../../tests/announcements.test.ts) (live regions kept across redraws: Undo, selection, filter warnings and notices), [editorHeader](../../tests/editorHeader.test.ts), [labelPicker](../../tests/labelPicker.test.ts), [reorderRows](../../tests/reorderRows.test.ts) (keys), [quickFilters](../../tests/quickFilters.test.ts) (the position announcement), [columnResize](../../tests/columnResize.test.ts), [columnSwipe](../../tests/columnSwipe.test.ts) (reduced motion), [subtaskVisibility](../../tests/subtaskVisibility.test.ts) and [quickFilterMenu](../../tests/quickFilterMenu.test.ts) (menu state and focus), and [readiness](../../tests/readiness.test.ts) and [labels](../../tests/labels.test.ts) (label contrast). Record what was actually exercised; automation alone doesn't establish accessibility.
