[← Shared UX guidance](README.md)

# Buttons, icons and menus

## Expected behavior

Reuse Obsidian's line icons through the host's icon adapter. Prefer a labeled button for unfamiliar or consequential actions; compact repeated actions may use icons with accessible names and hover explanations. Do not rely on hover as the only explanation on touch screens.

| Action | Convention |
| --- | --- |
| Create an item | Plus icon followed by Add task, Add Label or Add quick filter; use the existing add-button treatment for that surface. |
| Save / cancel a draft | Green check on the left, X on the right; see [editing and saving](editing-and-saving.md). |
| Assign labels / edit a definition | Tag icon / pencil icon. |
| Copy / remove a quick filter | Copy / trash icons with names identifying the filter. Removal changes the settings draft. |
| Reorder | Right-edge grip, distinct from edit and remove. |
| More card actions | Ellipsis with Move to… choices that explain date/completion consequences. |
| All subtasks | One Subtasks menu beside Compact, containing Collapse all and Expand all. The hide-completed preference stays in settings. |

The per-card subtask count and add-subtask action share a row. Its chevron/count tooltip names the action: Hide subtasks or Show subtasks. Keep the card's scheduling arrow at the right end of the footer/action row, including when metadata wraps.

## Toggle and menu states

Expose toggle state with `aria-pressed` or a checkbox, not just a background color. Menu triggers expose expanded state and restore focus when closed. Re-resolve the trigger after a redraw rather than focusing a detached node.

Quick-filter buttons put the filter icon first, selected-label color squares next, and the chosen name last. Use [quickFilterColors.ts](../../src/ui/quickFilterColors.ts) for toolbar, menu and settings previews. The menu's checked state represents activation; being in the menu does not disable a filter. Its trigger counts active filters hidden inside it.

Use public Obsidian `Menu` APIs in [BoardView.ts](../../src/obsidian/BoardView.ts). The quick-filter menu intentionally uses a non-native menu to retain colored previews; its browser-harness equivalent is for testing, not a second production menu system.

## Reuse and verify

See [renderQuickFilters.ts](../../src/ui/renderQuickFilters.ts), [renderBoard.ts](../../src/ui/renderBoard.ts), [editorHeader.ts](../../src/ui/editorHeader.ts) and [styles.css](../../styles.css).

- Check long names, multiple label squares, no labels, disabled actions and active states.
- Check toolbar wrapping and menu placement in narrow panes, light/dark themes and the user's installed theme when available.
- Open and dismiss menus with pointer and keyboard; verify focus and checkmarks after redraw.
- Inspect both the settings editor and main toolbar after changing either surface. Do not share their layout classes.
- Use [quick-filter menu tests](../../tests/quickFilterMenu.test.ts), [subtask visibility tests](../../tests/subtaskVisibility.test.ts) and visual layout checks.
