[← UX rules](README.md)

# Responsive layouts and gestures

## Rules

- The layout follows the board's width, not the device. At 600px or narrower, the board shows one column at a time, in a narrow desktop pane as on a phone.
- Choosing one column in the column picker uses the one-column quick-filter count, like a narrow board. A blank one-column count uses the main count; 0 puts every shown filter in the menu.
- Vertical scrolling stays native and steady, and a little sideways drift while scrolling doesn't move columns. A deliberate sideways touch drag follows the finger, reveals the next column partway, then settles on a column. Scrolling vertically after paging stays on that column.
- A one-column board can change column without touch, too: a sideways trackpad swipe or the Previous column and Next column buttons beside the page dots move one column.
- Pinch zoom and text editing keep working. Card handles take precedence over paging; see [drag and drop](drag-and-drop.md).
- Obsidian's sidebar gestures don't take over gestures that belong to the board. The board isolates them only within itself and leaves the rest of Obsidian working. Never fix a board gesture by turning off touch behavior across the app.
- At 600px or narrower, Add task sits above its list, clear of Obsidian's bottom toolbar. On wider boards it stays at the bottom of its cell while the cell scrolls past. Done and selection mode have no Add task.
- There's enough scrollable space below the last card for it and its actions to clear Obsidian's floating toolbar and the safe area. Padding outside the scrolling element doesn't count.
- Column headers and row labels stay in view while scrolling. The column and scroll position survive board refreshes.
- With several columns showing, dragging a column header's edge resizes that column like a spreadsheet, and the other columns keep their widths. A click without movement changes nothing, and a failed save restores the previous widths. Double-click or Home resets all widths. The arrow keys resize the focused separator, with Shift for bigger steps. There's no resizing at 600px or narrower, or when one column is chosen.
- Editors keep their header reachable when the phone keyboard opens; see [editing and saving](editing-and-saving.md). An opened inline task or subtask composer scrolls into the space between the column header and the keyboard, including while the keyboard opens or pans the visible area. Constrain the actual board scroller to that visible area so a composer at the end of a list can still scroll above an overlay keyboard. Keep its actions and input visible together when space allows; prioritize the text entry when space is too short for both. Restore normal sizing and remove viewport listeners when focus leaves, the composer closes, or the board redraws or closes.
- On touch screens, text fields use at least 16px text, so iOS doesn't zoom the page when one is focused.

## Exceptions

- In Obsidian mobile, Add task sits above its list at any width, even on a wide iPad board, because Obsidian mobile's floating bottom toolbar would cover it at the bottom of the cell.
- Obsidian mobile gets the touch styles at any width, even with a trackpad: the card drag grip, extra scroll space below the last card, editors pinned below the status bar, 16px text fields, and no buttons that appear only on hover. Its toolbar, keyboard and iOS behavior don't depend on the board's width.

## Where it lives

- The 600px breakpoint is a container query on the board (`container: trellis` in [styles.css](../../styles.css)), so it measures the board, not the window. Touch-specific styles use `(pointer: coarse)` and `(hover: none)`, and Obsidian mobile's `.is-mobile` class.
- Paging: [columnSwipe.ts](../../src/ui/columnSwipe.ts) locks a touch gesture's direction, pages and suppresses the click after a swipe. Trackpad swipes and the Previous and Next column buttons page through the same code.
- Column resize: [columnResize.ts](../../src/ui/columnResize.ts). Keyboard-safe editor sizing: `prepareEditorModal` in [editorHeader.ts](../../src/ui/editorHeader.ts).
- Inline keyboard visibility: [composerViewport.ts](../../src/ui/composerViewport.ts), attached by `addBox` in [renderBoard.ts](../../src/ui/renderBoard.ts).
