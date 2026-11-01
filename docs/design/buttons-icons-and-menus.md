[← UX rules](README.md)

# Buttons, icons and menus

## Rules

Use a labeled button for an unfamiliar or consequential action. Compact, repeated actions can be icons, with accessible names and hover explanations. On touch screens, hover can't be the only explanation. Icons are Obsidian's line icons; see [look and feel](look-and-feel.md).

| Action | Control |
| --- | --- |
| Create an item | A plus icon followed by Add task, Add label, Add quick filter, or Add filter and Add filter group in filters, in that surface's add-button style |
| Combine filters | As in Bases: an All the following are true / Any of the following are true / None of the following are true dropdown at the top of each group, and a trash icon at the right of a nested group's header (Remove group ‹n›) and at the end of each filter (Remove filter ‹n›). |
| Rename or duplicate a board | Rename board… with the pencil icon and Duplicate board… with the copy icon, in General in board settings, after the date settings. Each opens its own editor. Clicking the board's name on the toolbar also opens the rename. |
| Discard unsaved board settings | Closing the settings with changes opens a warning: Keep editing, with focus first, and a red Discard changes. |
| Delete a board | A red Delete board… button with a trash icon, at the end of General in board settings. It opens a warning whose red Delete board button does it; Cancel has focus first. |
| Save or cancel a draft | A green check on the left and an X on the right; see [editing and saving](editing-and-saving.md) |
| Assign labels, on a card or in a new task's composer / edit a label | The tag icon / the pencil icon |
| Copy / remove a quick filter | Copy and trash icons, named for the filter. Removing a filter changes the settings draft. |
| Reorder | A grip on the right edge, separate from edit and remove, in every reorderable list: board columns and quick filters in settings, and cards on touch screens |
| More card actions | ⋯ opens Move to…, whose choices say what else the move changes, such as the due date it sets |
| Arrange the board | One Arrange button on the toolbar opens a menu: Collapse all subtasks and Expand all subtasks when the board has subtasks, then, after a separator, Sort by due date. Hiding completed subtasks is a setting under Appearance, not a toolbar button. |

A card's actions sit at the right of its action row, in this order: Labels, Add subtask, the scheduling arrow, and ⋯ last. They stay together at the right when the metadata wraps. The subtask count and the add-subtask button share a row; the count's chevron is named for what it does, Hide subtasks or Show subtasks.

The board toolbar always ends with Settings, after Select or Done selecting. Keep that order in the DOM, keyboard navigation and wrapped layouts, even when other controls are hidden.

### Toggles and menus

Show a toggle's state with `aria-pressed` or a checkbox, not only a color. A menu's trigger exposes whether the menu is open, and gets focus back when the menu closes. After a redraw, find the current trigger again rather than focusing an element that was removed.

Every checkbox in Appearance means **hide when checked, show when unchecked**, and its label begins with Hide. Keep stored preferences compatible when inverting a control’s wording. Non-visibility settings, such as card spacing and subtask ordering, use dropdowns instead of checkboxes.

A quick-filter button shows the filter icon, then the color squares of its labels, then its name. The toolbar, the menu and the settings preview draw those squares the same way. In the menu, a checkmark means the filter is on; being in the menu doesn't turn a filter off. The menu's trigger counts the active filters inside it.

Menus use Obsidian's public `Menu` API.

## Exceptions

- The quick-filter menu isn't a native menu, because native menus can't show the color squares. The browser harness has its own stand-in for testing; it isn't a second menu style.

## Where it lives

- Toolbar quick filters and their menu trigger: [renderQuickFilters.ts](../../src/ui/renderQuickFilters.ts). Color squares: [quickFilterColors.ts](../../src/ui/quickFilterColors.ts).
- Card actions, the Arrange button and selection controls: [renderBoard.ts](../../src/ui/renderBoard.ts). The due-date sort is planned in [dueSort.ts](../../src/core/dueSort.ts).
- The Arrange, Move to… and quick-filter menus: [BoardView.ts](../../src/obsidian/BoardView.ts).
- Add label and the pencil: [renderLabelPicker.ts](../../src/ui/renderLabelPicker.ts). The column and quick-filter grips, copy, trash and Add quick filter: [renderBoardSettings.ts](../../src/ui/renderBoardSettings.ts), with dragging in [reorderRows.ts](../../src/ui/reorderRows.ts).
- Rename board…, Duplicate board… and Delete board… in General: [renderBoardSettings.ts](../../src/ui/renderBoardSettings.ts), opening their editors from [BoardSettingsModal.ts](../../src/obsidian/BoardSettingsModal.ts).
- Editor headers: [editorHeader.ts](../../src/ui/editorHeader.ts).
