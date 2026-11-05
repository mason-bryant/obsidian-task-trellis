[← UX rules](README.md)

# Look and feel

## Rules

### Color

- Colors come from Obsidian's theme variables, so Task Trellis follows the user's theme in light and dark mode.
- The board's background is `--background-secondary`. Cards, inputs and toolbar buttons sit on `--background-primary`. Borders are `--background-modifier-border`, and a hovered control fills with `--background-modifier-hover`. Secondary text is `--text-muted`.
- `--interactive-accent` marks focus, drop targets, pressed toggles, the open composer and selected cards. `--text-accent` colors highlighted text and icons: column-header icons, the Due now row's title, high priorities and the selection checkmarks.
- Red means overdue: `--color-red` for the overdue bar and due date. `--text-error` marks errors and invalid fields.
- Users choose colors only for labels and color rules, with the same color picker: the label palette, Hue, Saturation and Lightness sliders, and an HTML color code, kept in step. Each slider's track shows what moving it does, behind Obsidian's own slider thumb. Label text gets black or white, whichever contrasts more with the label's color. A color rule tints its cards with its color over the card's own background, so the card's text and badges keep the theme's colors, and an overdue card keeps its red edge. The tint is automatic, 14% (24% in dark themes), unless the rule sets its own opacity, which the picker adds for color rules with a sample card in the tint. Color rules also choose a pattern: Solid, Stripes, Dots, Grid or Checks, each a button with its name over the pattern, like the label editor's color scheme choices. A pattern's marks take the rule's opacity and the space between them a lighter tint, so no part of a patterned card is darker than the solid tint, and the contrast warning holds for both. Labels get neither opacity nor patterns, since label text needs a solid, opaque color behind it.

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
| Subtle button (`.tt-button--subtle`) | The same without a background | Secondary actions, such as Add quick filter and Add column |
| Danger button (`.tt-button--danger`) | Red fill and white text, in Obsidian's error color | Destructive actions only: Delete board… and the warning's Delete board, and Discard changes |
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

- **Board toolbar:** the board name, which renames the board when clicked, and the card count on the left. The search box ends that row, on the right. Then Subtasks, the optional column picker, the quick filters, Select (or Done selecting), What's new, and Settings last. The search box looks like a toolbar control, with the search icon inside at the start and a clear button (×) at the end once it has text. At 600px or narrower it takes a row of its own. Settings stays last in visual and keyboard order when controls are hidden or the toolbar wraps.
- **Columns and rows:** each column has a sticky header with an icon, its title and a count. Each date row has a sticky label with a chevron that collapses it.
- **Long cells:** a cell shows its first 25 cards. Below them, ▸ *N* more counts the cards not shown and shows the next 25 each time; ▾ Show fewer goes back to the first 25. Done and No due date start from their own limits (5 and 10 by default), and whether they're expanded is saved, but the extra pages aren't: a board never opens with every card drawn, which a phone can't hold. More moves focus to the first card it adds, in the button's place. A card that has focus or was just changed stays shown. Counts, Select all and Select column include every card.
- **Card:** labels at the top left, in the board's label shape, then the checkbox and text, then a metadata row: the source note, due date, priority and the card's actions. A card with subtasks puts its actions on the subtask row instead, after the count, above the subtask list.
- **Editor:** a header with the check on the left, the title in the middle and the X on the right, above the scrolling fields.
- **Board settings:** Card spacing and Hide column selector live in Appearance, use the normal draft/save flow, and are saved per board. Every checkbox for those Appearance settings is checked to hide and unchecked to show. Spacing and subtask ordering use dropdowns, since they are not visibility choices. The column selector starts visible; hiding it clears the chosen-column filter without disabling narrow-board page navigation. Tabs at the top, General first, then Columns, Filters, Quick filters, Appearance and New tasks, wrapping onto a second row on narrow settings, the chosen section below them, and a footer with Save, a green check and the word. General holds the date settings, then Rename board… and Duplicate board… after a divider, then Delete board… after another divider at the end. Appearance ends with Card color rules, after a divider. Filters is laid out like Obsidian's Bases filter editor; see [filters and selection](filters-and-selection.md), and Exceptions for its colors and buttons.
- **Menus:** Obsidian menus. Items can have an icon, active choices show a checkmark, and muted text after a choice explains what else it changes.
- **Boards sidebar:** a Boards heading, a full-width Create new board button, then a row for each board with the kanban icon. The open board uses Obsidian's active navigation colors. When two boards share a name, each shows its folder too. Under the open board's row, in line with its name, + Add task looks like a board cell's and opens the same composer.
- **New board:** the board name, then Start from: a button for each template with its name over a line on what it sets up, like the label editor's color scheme choices, in two columns or one on narrow screens. The pressed one is outlined in `--interactive-accent`. Choosing a template fills in its name until you type one. The example board adds a line saying where its sample tasks go.
- **Plugin settings tab:** Obsidian's own searchable setting rows, like other plugins' settings.
- **What's new:** the editor header with only the X, which has focus, then each feature's name over a muted line, and a button to try it where there is one, then a link, See all release notes on GitHub, which opens the browser. The toolbar button lists every recent feature, saying which version added it. After an update that added features, the first board opened shows it by itself, once, with just those features, then Don't show this again. Show what's new after updates, in the plugin settings, is the same choice.

### Motion

Motion is brief and only decorates what already happened: a card lifting on hover, an outline settling on an updated card, rows sliding aside while reordering, columns settling after a swipe, and the spinner. Reduced motion turns all of it off.

## Exceptions

- The filter editor (the Filters tab, and each quick filter's and color rule's filters) takes its colors from Obsidian's Bases filter editor, which the maintainer wants it to match: a nested group is a card in `--background-primary-alt` with Obsidian's `--table-border-color` border, and each filter's box is outlined in `--background-modifier-border-hover`.
- The filter editor's Add filter and Add filter group are subtle buttons without a border as well as a background, as in Bases.
- The save check is a fixed green, `#15803d`, or `#4ade80` in dark themes, so it stays legible in both of Obsidian's built-in themes.
- Card color rules is in the Appearance tab because it changes how cards look, but its Priority, Labels and Due checkboxes choose what a rule matches, like a quick filter's, rather than hiding something.
- A color rule's opacity can be set high enough that card text loses contrast. The picker warns when it would (see [accessibility](accessibility.md)) but allows it, since how strongly to tint is the user's choice.
- The shadows of a hovered card, a dragged quick-filter row and the touch drag copy are translucent black, and label color squares have a faint white inner ring. Both read on any theme, so they don't come from theme variables. Cards at rest use Obsidian's `--shadow-s`.

## Where it lives

- All styles: [styles.css](../../styles.css), scoped by component class.
- Board, toolbar and cards: [renderBoard.ts](../../src/ui/renderBoard.ts), where `cell` and `CELL_PAGE` limit long cells. Editor headers: [editorHeader.ts](../../src/ui/editorHeader.ts).
- Label text contrast: [labels.ts](../../src/core/labels.ts). The color picker, for labels and color rules: [colorPicker.ts](../../src/ui/colorPicker.ts), with conversions and contrast in [colorMath.ts](../../src/core/colorMath.ts). Color rule tints and patterns: `paintCard` in [renderBoard.ts](../../src/ui/renderBoard.ts), `CARD_PATTERNS` in [colorRules.ts](../../src/core/colorRules.ts), and the shared tint and `tt-tint--` pattern rules in [styles.css](../../styles.css). Label color squares in the toolbar, menu and settings: [quickFilterColors.ts](../../src/ui/quickFilterColors.ts).
- What's new: `renderWhatsNew` in [renderWhatsNew.ts](../../src/ui/renderWhatsNew.ts) (the harness's toolbar, and `?whats-new` for how an update opens it), with the features and suggested color rules in [whatsNew.ts](../../src/core/whatsNew.ts), the buttons' actions in `openWhatsNew` in [BoardView.ts](../../src/obsidian/BoardView.ts), and when an update shows it in `showWhatsNew` in [main.ts](../../main.ts).
- New board: `renderNewBoardEditor` in [renderBoardNameEditor.ts](../../src/ui/renderBoardNameEditor.ts), shared with the harness (Create new board in `?sidebar`), with the templates in [boardTemplates.ts](../../src/core/boardTemplates.ts) and the dialog in [NewBoardModal.ts](../../src/obsidian/NewBoardModal.ts).
- Boards sidebar: `renderBoardList` in [renderBoardList.ts](../../src/ui/renderBoardList.ts), shared with the harness (`?sidebar`), drawn by [BoardListView.ts](../../src/obsidian/BoardListView.ts). Plugin settings tab: [settings.ts](../../src/settings.ts).
