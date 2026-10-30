[← UX rules](README.md)

# Accessibility

## Rules

- Every essential action done by dragging or swiping also has a keyboard or button alternative. Prefer native buttons, inputs and checkboxes; a custom role carries its own state and keyboard behavior. Icon-only controls have names that say what they do, and which item, where several look alike.
- Focus is always visible. After a redraw, focus returns to the same item or control, found by a stable id rather than a reference to the old element. Menus return focus to their trigger, and nested editors to the control that opened them. Background updates never take focus from another window.
- Headings and groups describe a form's structure. Results such as a new reorder position or a selection count are announced in a live region, and errors that need attention are alerts. Visual placeholders and drag copies are hidden from assistive technology and contain no focusable controls.
- Color is never the only signal. Label squares have descriptions, and the labels on cards are named after their label, and selections and active filters have a checkmark or a pressed state. Label text is chosen for at least 4.5:1 contrast with its label's color. Surfaces and text use Obsidian's theme colors.
- Touch targets are 44px, with space between them.
- Reduced motion turns animation off, and nothing depends on it: rows sliding aside and columns settling aren't needed to understand the result, and the drop indicator shows without animation. Long and enlarged text stays usable without covering nearby controls.

### Keyboard alternatives today

- **Cards and subtasks:** Tab to a card or subtask. Enter edits it, or opens its source line when the Tasks plugin isn't installed. Alt+Up/Down moves an open card within its cell, and ⋯ Move to… moves a card or subtask to another column or date row.
- **One-column boards:** the Previous column and Next column buttons beside the page dots.
- **Desktop subtasks:** Alt+Up/Down on an open subtask's row moves it past its visible neighbor, including in narrow desktop panes. Saving keeps focus on the moved row, and the Undo status says Subtask reordered.
- **Settings lists:** column and quick-filter grips move with Arrow Up/Down and Home/End, with the new position announced.
- **Column separators:** Arrow Left/Right resize, with Shift for bigger steps, and Home resets all widths.
- **Settings and editors:** the settings tabs work with the keyboard, and editor headers have named save and close buttons.

## Exceptions

- Drag grips on cards, desktop subtasks and settings rows, and the column-resize separators, are narrower than 44px, so they don't take space from or cover what's beside them. They keep their full height, and what they do has an alternative that isn't a drag. This doesn't extend to other buttons.

## Where it lives

- Focus after a redraw: `renderBoard` in [renderBoard.ts](../../src/ui/renderBoard.ts) refocuses the control whose `data-board-focus` key matches the one that had focus. Menu triggers find their current button the same way.
- Label text contrast: [labels.ts](../../src/core/labels.ts). Focus outlines, 44px sizing and reduced motion: [styles.css](../../styles.css).
- Keyboard reordering and its announcement: [reorderRows.ts](../../src/ui/reorderRows.ts) and [renderBoardSettings.ts](../../src/ui/renderBoardSettings.ts). Column separators: [columnResize.ts](../../src/ui/columnResize.ts). The touch drag copy is hidden and inert: [touchCardDrag.ts](../../src/ui/touchCardDrag.ts).
