[← Shared UX guidance](README.md)

# Responsive layouts and gestures

## Expected behavior

Base board layout on available container width, not device name. The current narrow-board breakpoint is 600px, so a narrow desktop pane gets paging too. Explicitly selecting one column also uses the single-column quick-filter count. A blank override inherits the main count; zero is an explicit choice to put all enabled filters in the menu.

Keep vertical scrolling native and steady. A small horizontal drift during vertical scrolling must not move columns. A deliberate horizontal touch gesture should track the finger, reveal the neighboring column partway, then settle on a column. Vertical scrolling after paging must retain the selected column.

Use [columnSwipe.ts](../../src/ui/columnSwipe.ts) for axis detection, paging and click suppression. Its current thresholds distinguish a deliberate horizontal gesture from vertical movement, and a short flick from a slow partial drag. Preserve pinch zoom and input editing. Card handles take precedence over paging; see [drag and drop](drag-and-drop.md).

Obsidian's host sidebar gestures must not take over gestures belonging to the board. Keep host-event isolation local to the board and retain access to surrounding Obsidian controls. Never solve a board gesture bug by disabling touch behavior throughout the application.

## Layout and persistence

- Mobile Add task controls sit above their task list. Desktop cells retain their bottom placement. Done has no Add task control.
- Leave enough scrollable bottom space to bring the final card and its actions above Obsidian's floating toolbar and the safe area. Padding outside the actual scroller is insufficient.
- Keep headers and row labels useful while scrolling. Preserve column position and scroll state through board refreshes.
- In multi-column layouts, use [columnResize.ts](../../src/ui/columnResize.ts) for spreadsheet-like header-edge resizing. Other columns retain their measured widths while one is resized. Resize does not apply to single-column paging.
- A stationary resize click must not freeze flexible widths. Failed persistence restores prior widths. Double-click or Home resets widths; keyboard arrows adjust the focused separator.
- Editor forms use the visual viewport through [editorHeader.ts](../../src/ui/editorHeader.ts), keeping primary actions reachable when the keyboard opens.

## Verify

Check wide desktop, tablet, a narrow desktop pane and phone width; test explicit one-column selection separately. Resize an existing board across the breakpoint rather than checking only initial render.

- Scroll every column vertically, including after paging and after an index update.
- Try slow partial swipes, flicks, diagonal movement, taps on links, pinch zoom and handle drags near edges.
- Reach the final card above the floating toolbar, with short and long lists.
- Check pointer resize, keyboard resize, reset and failed saves.
- Exercise keyboard-open editors on native iOS when available; record browser-only and simulator coverage separately from device coverage.

Relevant suites: [column swipe](../../tests/columnSwipe.test.ts), [narrow board](../../tests/narrowBoard.test.ts), [column resize](../../tests/columnResize.test.ts), [touch card drag](../../tests/touchCardDrag.test.ts) and [quick-filter menu](../../tests/quickFilterMenu.test.ts).
