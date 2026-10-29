[← UX rules](README.md)

# Buttons, icons and menus

## Rules

Use a labeled button for an unfamiliar or consequential action. Compact, repeated actions can be icons, with accessible names and hover explanations. On touch screens, hover can't be the only explanation. Icons are Obsidian's line icons; see [look and feel](look-and-feel.md).

| Action | Control |
| --- | --- |
| Create an item | A plus icon followed by Add task, Add label or Add quick filter, in that surface's add-button style |
| Save or cancel a draft | A green check on the left and an X on the right; see [editing and saving](editing-and-saving.md) |
| Assign labels / edit a label | The tag icon / the pencil icon |
| Copy / remove a quick filter | Copy and trash icons, named for the filter. Removing a filter changes the settings draft. |
| Reorder | A grip on the right edge, separate from edit and remove, in every reorderable list: board columns and quick filters in settings, and cards on touch screens |
| More card actions | ⋯ opens Move to…, whose choices say what else the move changes, such as the due date it sets |
| All subtasks | One Subtasks button beside Compact opens a menu with Collapse all subtasks and Expand all subtasks. Hiding completed subtasks is a setting under Appearance, not a toolbar button. |

A card's actions sit at the right of its action row, in this order: Labels, Add subtask, the scheduling arrow, and ⋯ last. They stay together at the right when the metadata wraps. The subtask count and the add-subtask button share a row; the count's chevron is named for what it does, Hide subtasks or Show subtasks.

### Toggles and menus

Show a toggle's state with `aria-pressed` or a checkbox, not only a color. A menu's trigger exposes whether the menu is open, and gets focus back when the menu closes. After a redraw, find the current trigger again rather than focusing an element that was removed.

A quick-filter button shows the filter icon, then the color squares of its labels, then its name. The toolbar, the menu and the settings preview draw those squares the same way. In the menu, a checkmark means the filter is on; being in the menu doesn't turn a filter off. The menu's trigger counts the active filters inside it.

Menus use Obsidian's public `Menu` API.

## Exceptions

- The quick-filter menu isn't a native menu, because native menus can't show the color squares. The browser harness has its own stand-in for testing; it isn't a second menu style.

## Where it lives

- Toolbar quick filters and their menu trigger: [renderQuickFilters.ts](../../src/ui/renderQuickFilters.ts). Color squares: [quickFilterColors.ts](../../src/ui/quickFilterColors.ts).
- Card actions, the Subtasks button and selection controls: [renderBoard.ts](../../src/ui/renderBoard.ts).
- The Subtasks, Move to… and quick-filter menus: [BoardView.ts](../../src/obsidian/BoardView.ts).
- Add label and the pencil: [renderLabelPicker.ts](../../src/ui/renderLabelPicker.ts). The column and quick-filter grips, copy, trash and Add quick filter: [renderBoardSettings.ts](../../src/ui/renderBoardSettings.ts), with dragging in [reorderRows.ts](../../src/ui/reorderRows.ts).
- Editor headers: [editorHeader.ts](../../src/ui/editorHeader.ts).
