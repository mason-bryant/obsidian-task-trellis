[← UX rules](README.md)

# Wording

## Rules

- **Sentence case** everywhere: labels, buttons, menu items, commands, tabs, headings and settings. Capitalize only the first word and names, such as Task Trellis, Tasks (the plugin), Daily notes and Obsidian.
- **Name actions with a verb:** Add task, Save changes, Apply color scheme, Collapse all subtasks. A toggle is named for what it turns on. Appearance checkboxes always name what they hide: Hide column selector, Hide completed subtasks and Hide overdue bars.
- **End with "…"**, a single ellipsis character:
  - an action that opens a menu, picker or dialog asking for more: Move to…, Open board…, Details…;
  - a placeholder: Search labels…, Add a value…;
  - progress text: Saving note…, Previewing tag changes…, Applying changes….
- **Commands** are actions in sentence case, without the plugin name, which Obsidian adds in the command palette: Show boards sidebar, Open board…, Open board: ‹name›, Open current note as board, Create board, Add task, Restore board rename. The ribbon icon's tooltip has no prefix, so it includes the name: Show Task Trellis boards.
- **Accessible names and tooltips:** an icon-only control's name says what it does, such as Labels or Subtasks. Where several look alike, the name also says which item, such as Add task to ‹column›, ‹row›, Add subtask to ‹task›, Move ‹task› to…, Select ‹column› column or Rename board: ‹name›. A visible label stays at the start of the name: the Add task buttons show Add task. Obsidian shows a control's `aria-label` as its tooltip. Add a `title` only when it says more than the name, such as a badge's full date (Due 2026-11-08) or what Details… opens.
- **Counts** agree with their number: 1 card, 2 cards; 1 day overdue.
- **Notices** start with "Task Trellis: " and are full sentences. A failure says what failed, whether anything was saved or kept, and what to do next. For example: "Task Trellis: settings saved, but the board could not be opened. Open it from the boards sidebar to try again." Never leave the console as the only explanation; it's for diagnosis.
- **Help text** describes the screen as it is. When a control moves or goes away, update the text that mentions it.
- **Punctuation:** curly apostrophes and quotation marks (’ “ ”) in the plugin’s text, never straight ones.
- **Naming a command in text:** write it as the command palette shows it, in bold in the docs: Task Trellis: Restore board rename.

## Exceptions

None recorded.

## Where it lives

- Labels, names and tooltips are set where each control is drawn, mostly in `src/ui`. Notices are raised in `src/obsidian` and [main.ts](../../main.ts).
- `npm run lint` checks sentence case with the names allowed in [eslint.config.mjs](../../eslint.config.mjs). It doesn't see text set through the renderers' own element helpers, so read new strings yourself.
