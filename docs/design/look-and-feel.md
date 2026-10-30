[← UX rules](README.md)

# Look and feel

## Rules

### Color

- Colors come from Obsidian's theme variables, so Task Trellis follows the user's theme in light and dark mode.
- The board's background is `--background-secondary`. Cards, inputs and toolbar buttons sit on `--background-primary`. Borders are `--background-modifier-border`, and a hovered control fills with `--background-modifier-hover`. Secondary text is `--text-muted`.
- `--interactive-accent` marks focus, drop targets, pressed toggles, the open composer and selected cards. `--text-accent` colors highlighted text and icons: column-header icons, the Due now row's title, high priorities and the selection checkmarks.
- Red means overdue: `--color-red` for the overdue bar and due date. `--text-error` marks errors and invalid fields.
- Label colors are the only colors users choose. Label text gets black or white, whichever contrasts more with the label's color.

### Type

| Text | Size and weight |
| --- | --- |
| Board name, settings section titles | 18px, bold |
| Column headers, editor titles | `--font-ui-medium`, semibold |
| Card text | Normal size, weight 500; subtasks regular |
| Controls, help text | `--font-ui-small` |
| Card metadata, counts, menu details | `--font-ui-smaller` |

### Icons

Icons are Obsidian's line icons, drawn through the host's icon function (`setIcon` in Obsidian). They are 16px with a 1.8 stroke in controls, 14px in badges and source links, and 24px in editor headers. The boards sidebar and the card drag grip use 18px, and the label pencil, in its 44px target, uses 20px.

### Controls

| Control | Looks like | Used for |
| --- | --- | --- |
| Toolbar button (`.tt-toolbar-button`, `.tt-button`) | Bordered, 7px corners, icon before text | Board toolbar actions and labeled buttons in settings |
| Subtle button (`.tt-button--subtle`) | The same without a background | Secondary actions, such as Add quick filter and Save & open board |
| Icon button (`.tt-icon-button`, `.tt-card-icon`) | No border, 6px corners, a fill on hover | Compact, repeated actions on cards and settings rows |
| Editor save and close | 44px circles: a green check and an X | Editor headers only |
| Add task (`.tt-add-button`) | Plain text after a plus, faint until its cell is hovered | Adding a task to a cell |

### States

- **Hover:** a fill or a stronger border. Cards lift by a pixel and gain a soft shadow.
- **Focus:** a 2px `--interactive-accent` outline, set slightly off the control.
- **Pressed toggle:** accent text and border on a toolbar button, with `aria-pressed`.
- **Disabled:** faded, with the default cursor.
- **Busy:** controls are disabled; longer operations show a spinner (see [feedback and recovery](feedback-and-recovery.md)).
- **Completed:** muted, struck-through text. Completed cards lose their shadow.
- **Overdue:** a red bar on the card's left edge, which a board setting can turn off, and a red due date.

### Sizes and spacing

- On touch screens, targets are 44px. With a mouse, card icons are 28px and toolbar buttons 32px tall. Editor header buttons and label picker controls are 44px everywhere.
- Cards have 12px padding and 10px corners, with 10px between cards. Compact cards have 8px by 10px padding, 6px between cards and smaller text.
- The board has 16px of padding at each side and 12px between columns.

### Layout

- **Board toolbar:** the board name, which renames the board when clicked, and the card count on the left. Then Subtasks, the optional column picker, the quick filters, Select (or Done selecting), and Settings last. Settings stays last in visual and keyboard order when controls are hidden or the toolbar wraps.
- **Columns and rows:** each column has a sticky header with an icon, its title and a count. Each date row has a sticky label with a chevron that collapses it.
- **Card:** labels at the top left, in the board's label shape, then the checkbox and text, then a metadata row: the source note, due date, priority and the card's actions. A card with subtasks puts its actions on the subtask row instead, after the count, above the subtask list.
- **Editor:** a header with the check on the left, the title in the middle and the X on the right, above the scrolling fields.
- **Board settings:** Card spacing and Hide column selector live in Appearance, use the normal draft/save flow, and are saved per board. Every Appearance checkbox is checked to hide and unchecked to show. Spacing and subtask ordering use dropdowns, since they are not visibility choices. The column selector starts visible; hiding it clears the chosen-column filter without disabling narrow-board page navigation. Tabs at the top, the chosen section below them, and a footer with Save & open board.
- **Menus:** Obsidian menus. Items can have an icon, active choices show a checkmark, and muted text after a choice explains what else it changes.
- **Boards sidebar:** a Boards heading, a full-width Create new board button, then a row for each board with the kanban icon. The open board uses Obsidian's active navigation colors. When two boards share a name, each shows its folder too.
- **Plugin settings tab:** Obsidian's own searchable setting rows, like other plugins' settings.

### Motion

Motion is brief and only decorates what already happened: a card lifting on hover, an outline settling on an updated card, rows sliding aside while reordering, columns settling after a swipe, and the spinner. Reduced motion turns all of it off.

## Exceptions

- The save check is a fixed green, `#15803d`, or `#4ade80` in dark themes, so it stays legible in both of Obsidian's built-in themes.
- The shadows of a hovered card, a dragged quick-filter row and the touch drag copy are translucent black, and label color squares have a faint white inner ring. Both read on any theme, so they don't come from theme variables. Cards at rest use Obsidian's `--shadow-s`.

## Where it lives

- All styles: [styles.css](../../styles.css), scoped by component class.
- Board, toolbar and cards: [renderBoard.ts](../../src/ui/renderBoard.ts). Editor headers: [editorHeader.ts](../../src/ui/editorHeader.ts).
- Label text contrast: [labels.ts](../../src/core/labels.ts). Label color squares in the toolbar, menu and settings: [quickFilterColors.ts](../../src/ui/quickFilterColors.ts).
- Boards sidebar: [BoardListView.ts](../../src/obsidian/BoardListView.ts). Plugin settings tab: [settings.ts](../../src/settings.ts).
