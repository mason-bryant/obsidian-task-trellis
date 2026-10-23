# Task Trellis

An Obsidian plugin that shows the tasks in your vault as cards on a kanban board: workflow columns across, due-date rows down. Everything is stored in the task lines themselves, in the Tasks plugin's emoji format, so the vault stays plain markdown.

```
               │ Backlog      │ Doing        │ Waiting      │ Done
▾ No due date  │ [card]       │              │ [card]       │
▾ Due now      │ [card][card] │ [card]       │              │ [card]
▾ Week of 11/2 │ [card]       │              │              │
▸ Later (3)
```

## Boards

A board is a note in the boards folder (`Task Trellis/` by default, set in the plugin settings). Opening the note shows the board. **Board settings** (the gear in the view header) edits the board in a form and writes the note's properties when you close it; **Open note** in that form shows the note itself. Renaming a column there retags its tasks. **Create board** in the command palette makes one with defaults.

The settings are stored as these properties:

| Property | Default | Meaning |
|---|---|---|
| `slug` | from the note name | Used in placement tags and the board's command id. Set once; keep it stable. |
| `columns` | Backlog, Doing, Waiting, Done | Columns, left to right. |
| `done-column` | `Done` if there is one | Column kept in step with the checkbox. Leave empty for none. Listed newest completed first. |
| `limit-done` | true | Cap the completed cards shown in each row of the Done column. |
| `done-limit` | 5 | How many completed cards show per row before the rest go behind "more". |
| `undated-column` | none | Column that holds every open task with no due date, as one list down the board, in place of the No due date row. |
| `limit-undated` | true | Cap the cards shown in the No due date column. |
| `undated-limit` | 10 | How many show there before the rest go behind "more". |
| `due-now` | 7 | Size of the Due now window, in `due-now-unit`s. Due now also holds overdue tasks. |
| `due-now-unit` | days | `days`: through today + `due-now` days. `weeks`: through the last day of the `due-now`-th week, counting this week as 1 (Sunday, with Monday week starts). |
| `week-horizon` | 6 | Number of week rows after Due now. Everything later goes in Later. |
| `week-start` | monday | First day of a week row. |
| `filter-properties` | none | `key: value1, value2` per item. The task's note must match every item. |
| `include-tags` / `exclude-tags` | none | Task tags; `house` also matches `#house/kitchen`. |
| `include-folders` / `exclude-folders` | none | Folders the task's note must, or must not, be in. |
| `show-completed-days` | 7 | Completed tasks show for this many days after their done date. 0 hides them. |
| `new-tasks` | default | Where tasks added on this board go: `default` (the plugin setting), `daily` or `note`. |
| `new-tasks-note` | | The note for `new-tasks: note`, created if missing. |
| `new-tasks-heading` | | The section new tasks go at the end of; empty adds to the end of the note. |

Every board gets an **Open board: ‹name›** command, so you can give each board its own hotkey. The command id comes from the slug, so the hotkey survives renaming the note.

## Cards

- Each board places a task with one tag, `#tt/<board>/<column>/<n>`, at the end of the line. `<n>` orders cards within a cell. A task can sit in different columns on different boards.
- Dragging a card to another row sets its due date: Due now → the last day of the window; a week row → the first day of that week (or the day after the window for a partial first week); Later → the first day after the last week row; No due date → removes it.
- The arrow at a card's bottom right is a shortcut for the most common drag: a Due now card moves to the next row, and a card in any other row moves into Due now. It keeps its column and goes to the end of the cell. Completed cards don't have one.
- With a No due date column (`undated-column`), undated tasks live in that column instead of a row. Dropping a card there removes its due date, and its tag keeps the column it had before, which is where its arrow sends it; dragging one out gives it the date of the row you drop it in. Completed undated tasks show in Done, in Due now.
- Dragging into the Done column completes the task, and dragging out reopens it. Checked tasks always show in Done. A recurring task's next occurrence keeps the column it was in.
- Clicking a card opens the Tasks plugin's edit modal. Without the Tasks plugin it opens the source line.
- The note name on a card jumps to the task's line, reusing a tab that already shows the note in any window. Cmd/Ctrl-click opens a new tab.
- Overdue cards get a red border.
- Tasks indented under a task are its subtasks. They show inside the parent's card, in note order, and go wherever the parent goes, whatever their own date or column. Completed ones stay visible, struck through. "▾ 1/3" on the parent (done of total) hides or shows them, and the board remembers. If the parent isn't on the board (filtered out, or completed long ago), its open subtasks show as cards of their own.

## Adding tasks

- **On a board:** "+ Add task" at the bottom of every cell, faint until you hover the cell. Enter adds the task and keeps the box open for the next one; Cmd/Ctrl+Enter or **Details…** opens the Tasks editor first; Esc closes it. The task gets the cell's column and the date a drop into that row would set, unless you type a 📅 date yourself. Done has no add button.
- **Subtasks:** the list-plus icon on an open card (or, on hover, on a subtask) opens the same box under its subtasks. The subtask goes in the parent's note, after its last subtask, indented the way the editor indents (Settings → Editor → Indent using tabs), with no date or column of its own.
- **Anywhere:** the **Add task** command opens the Tasks editor and files the task with no column, so it shows in each matching board's first column.
- **Where they go:** by default, the end of `### 🚀 things I plan to accomplish` in today's daily note (Settings → Task Trellis → New tasks). The note comes from the core Daily notes plugin's own find-or-create, so it has your usual name, folder and template, and Templater runs on it as it always does. A board can send its tasks to a specific note and heading instead. If the board's filters would hide tasks from the destination note, you get a notice.
- New tasks get a `➕` created date when the Tasks plugin's "set created date" setting is on.

## Development

```bash
npm install
npm test           # vitest
npm run build      # typecheck + main.js
npm run dev        # rebuild on change
npm run harness    # dev/harness.js, then open dev/harness.html over http
```

`dev/harness.html` runs the real board model and renderer against an in-memory vault, for checking the UI without Obsidian.

Every pull request runs the full test suite, TypeScript checking, the production build, and the browser harness build in GitHub Actions. The `Tests and build` check is required on `main` before merging, including for administrators, and the branch must be up to date.

To try it in a vault, copy `main.js`, `manifest.json` and `styles.css` into `<vault>/.obsidian/plugins/task-trellis/` and enable **Task Trellis** under Community plugins.
