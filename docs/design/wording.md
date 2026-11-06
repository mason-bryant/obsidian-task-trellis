[← UX rules](README.md)

# Wording

## Rules

- **Sentence case** everywhere: labels, buttons, menu items, commands, tabs, headings and settings. Capitalize only the first word and names, such as Task Trellis, Tasks (the plugin), Daily notes and Obsidian.
- **Name actions with a verb:** Add task, Save changes, Apply color scheme, Collapse all subtasks. A toggle is named for what it turns on. Appearance's own checkboxes always name what they hide: Hide column selector, Hide completed subtasks and Hide overdue bars. Arrange's Show completed subtasks and What's new's Scroll this board's No due date column on its own are toggles, so they name what they turn on.
- **End with "…"**, a single ellipsis character:
  - an action that opens a menu, picker or dialog asking for more: Move to…, Open board…, Details…;
  - a placeholder that prompts for something: Search labels…, Add a value…, Property…, Open a board…;
  - progress text: Saving note…, Previewing tag changes…, Applying changes….
- **Commands** are actions in sentence case, without the plugin name, which Obsidian adds in the command palette: Show boards sidebar, Open board…, Open board: ‹name›, Open current note as board, Create board, Add task, Add task to ‹board›: ‹column›, Restore board rename. The ribbon icon's tooltip has no prefix, so it includes the name: Show Task Trellis boards.
- **Accessible names and tooltips:** an icon-only control's name says what it does, such as Labels or Arrange. Where several look alike, the name also says which item, such as Add task to ‹column›, ‹row›, Add task to ‹board›: ‹column›, No due date (in the boards sidebar), Add subtask to ‹task›, Labels for ‹task›, Defer ‹task› · due ‹date›, Move ‹task› to…, Select ‹column› column, Rename board: ‹name›, or Filter 2.1: Tags and Remove filter 2.1 in board filters. A visible label stays at the start of the name: the Add task buttons show Add task. Obsidian shows a control's `aria-label` as its tooltip. Add a `title` only when it says more than the name, such as a badge's full date (Due 2026-11-08) or what Details… opens.
- **Counts** agree with their number: 1 card, 2 cards; 1 day overdue.
- **Notices** start with "Task Trellis: " and are full sentences. A failure says what failed, whether anything was saved or kept, and what to do next. For example: "Task Trellis: settings saved, but the board could not be opened. Open it from the boards sidebar to try again." Never leave the console as the only explanation; it's for diagnosis.
- **Help text** describes the screen as it is. When a control moves or goes away, update the text that mentions it.
- **Punctuation:** curly apostrophes and quotation marks (’ “ ”) in the plugin’s text, never straight ones.
- **Naming a command in text:** write it as the command palette shows it, in bold in the docs: Task Trellis: Restore board rename.

## Exceptions

- Commands that open a dialog, such as Create board, Add task and Restore board rename, have no "…", since the command palette lists what they do rather than what they lead to. Create board… in What's new has one, as a button that opens a dialog. The sidebar's Create new board has none, as the sidebar's one main action, with room for the fuller name.
- The bulk bar's Move, Due date, Labels and Priority, and the toolbar's Filters and More filters, have no "…" though they open something. They're short buttons in crowded rows, and what they lead to is clear from their names.
- A placeholder that shows an example or says how to use a field, such as Inbox.md, #AABBCC, Optional or New task. Enter to add, Cmd/Ctrl+Enter for details, has no "…", since it isn't a prompt being continued.
- The filter editor uses Bases' lowercase words, since the maintainer wants it to match Bases: where, and and or before each filter, and the operators exists, is any of, include any of and is in any of. Its group dropdowns and buttons are in sentence case as usual.

## Where it lives

- Labels, names and tooltips are set where each control is drawn, mostly in `src/ui`. Notices are raised in `src/obsidian` and [main.ts](../../main.ts).
- `npm run lint` checks sentence case with the names allowed in [eslint.config.mjs](../../eslint.config.mjs). It doesn't see text set through the renderers' own element helpers, so read new strings yourself.
