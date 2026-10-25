[← Task Trellis](../README.md)

# Configure a board

A board is a note in the boards folder (`Task Trellis/` by default, set in the plugin settings). Opening the note shows the board. **Settings** on the board opens a form with Columns, Dates, Filters and New tasks tabs. **Save changes** validates and writes the note's properties; **Cancel**, Escape and closing the dialog discard the draft. **Save & open note** saves first, then shows the note itself. Saving an unchanged draft does not rewrite the note. Renaming a column there retags its tasks. **Create board** in the command palette makes one with defaults.

Open the **Task Trellis boards** sidebar from the ribbon icon or the **Show boards sidebar** command. It lists your boards and offers **Create new board**. Selecting a board focuses its existing tab, including one in another window, or opens it if needed.

Use **Settings → Columns** to name your workflow stages, **Dates** to choose the planning window, **Filters** to decide which tasks appear, and **New tasks** to choose where captured tasks are saved. For filter examples, see [Choose which tasks appear](filters.md).

## Property reference

These properties are stored in the board note. The settings form handles the usual configuration; you do not need to edit YAML to get started.

| Property | Default | Meaning |
|---|---|---|
| `slug` | from the note name | Used in placement tags and the board's command id. Set once; keep it stable. |
| `labels` | Six unnamed colors | Board-specific label definitions, managed through a card’s tag icon. |
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
| `exclude-properties` | none | Same rule syntax as `filter-properties`. Any matching item excludes the note's tasks. |
| `include-tags` / `exclude-tags` | none | Tags on the task or its page; `house` also matches `#house/kitchen`. Page tags apply to every task in the note. |
| `include-folders` / `exclude-folders` | none | Folders the task's note must, or must not, be in. |
| `show-completed-days` | 7 | Completed tasks show for this many days after their done date. 0 hides them. |
| `new-tasks` | default | Where tasks added on this board go: `default` (the plugin setting), `daily` or `note`. |
| `new-tasks-note` | | The note for `new-tasks: note`, created if missing. |
| `new-tasks-heading` | | The section new tasks go at the end of; empty adds to the end of the note. |

Every board gets an **Open board: ‹name›** command, so you can give each board its own hotkey. The command id comes from the slug, so the hotkey survives renaming the note.

The column name `Label` is reserved for the `#tt/<board>/label/<id>` tag namespace. Use a different column name.
