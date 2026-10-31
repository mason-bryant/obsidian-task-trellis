[← Task Trellis](../README.md)

# Configure a board

A board is a note in the boards folder (`Task Trellis/` by default, set in the plugin settings). Opening the note shows the board. **Settings** on the board opens a form with Columns, Dates, Filters, Quick filters, Appearance and New tasks tabs. The **green checkmark** at the top validates and writes the note's properties; The **X**, Escape and closing the dialog discard the draft. **Save** at the end of the form does the same as the checkmark. Saving an unchanged draft does not rewrite the note. Renaming a column there retags its tasks. **Create board** in the command palette makes one with defaults.

Open the **Task Trellis boards** sidebar from the ribbon icon or the **Show boards sidebar** command. It lists your boards and offers **Create new board**. Selecting a board focuses its existing tab, including one in another window, or opens it if needed.

Use **Settings → Columns** to name your workflow stages and drag the grip at a column’s right edge to put them in order (or focus it and use the arrow keys), **Dates** to choose the planning window, **Filters** to decide which tasks appear, **Quick filters** for toolbar toggles that narrow the board, **Appearance** for label shape, card spacing, column-selector visibility, and how subtasks and overdue cards look, and **New tasks** to choose where captured tasks are saved. Appearance checkboxes all mean **hide when checked, show when unchecked**. Card spacing and subtask order use dropdowns. The toolbar always puts **Settings** last, after **Select** or **Done selecting**. These labels do not change the existing frontmatter keys or their meaning. For filter examples, see [Choose which tasks appear](filters.md).

## Rename a board

Click or tap the board title in the upper left. Edit its name and select the **green checkmark** to save, or **X** to cancel. Enter also saves, except while confirming an input-method conversion. Invalid or already-used filenames are rejected; a failed save keeps your draft available to retry.

By default, this renames only the board note in its existing folder. Obsidian updates links according to your link-update preferences. Task tags, label assignments and the board's internal `slug` stay unchanged. If an iOS shortcut identifies the board by its old name or file path, update that shortcut; shortcuts using the stable slug keep working.

To change the tags too, select **Also rename board tags**, then **Preview tag changes**. Review the old and new prefixes, the tag count and the affected notes. The green checkmark applies the reviewed changes. Editing the name requires a new preview; closing the editor cancels without changing notes.

For example, renaming House to Home changes `#tt/house/doing/100` to `#tt/home/doing/100` and `#tt/house/label/red` to `#tt/home/label/red`. Column positions, label IDs, names and colors are preserved. The migration includes completed tasks and subtasks, even in folders excluded from the board, and updates other boards' include/exclude tag filters. It rejects a prefix already used by another board, tag or reference.

Saved searches, queries, prose and ordinary note properties are not rewritten. The preview lists notes containing those references for you to check. Also update shortcuts and custom board hotkeys that use the old name or prefix. Keep other devices idle during the rename and allow sync to finish afterward: several note writes cannot be one atomic operation across devices.

Before writing, Task Trellis saves full snapshots of affected notes in **Task Trellis recovery/** inside the vault. Use **Task Trellis: Restore board rename** from the command palette to review and restore a rename, including one interrupted by an error or restart. Restoration refuses to overwrite later edits or ignore new tasks using the new prefix; those cases require reconciling the notes with the saved snapshots. Recovery files remain until you remove them. They contain full note content; see [Privacy and integrations](privacy.md).

## Property reference

On desktop and tablet multi-column layouts, drag a column header's right boundary to resize it. Other columns keep their widths. Widths are saved with the board and survive reopening or renaming a column. Double-click a boundary to return all columns to equal, responsive widths. Keyboard users can focus a boundary and press Left/Right (10 pixels), Shift+Left/Right (50 pixels), or Home to reset all widths. Escape cancels an active drag. Boards 600px wide or narrower, and a single column chosen in the column picker, keep full-width columns and can’t be resized.

These properties are stored in the board note. The settings form handles the usual configuration; you do not need to edit YAML to get started.

| Property | Default | Meaning |
|---|---|---|
| `slug` | from the note name | Used in placement tags and the board's command id. Keep it stable, or change it through the reviewed tag-rename flow above. |
| `labels` | Six unnamed colors | Board-specific label definitions, managed through a card’s tag icon. |
| `previous-label-scheme` | none | Exact previous colors keyed by label ID, managed by the color scheme picker. |
| `columns` | Backlog, Doing, Waiting, Done | Columns, left to right. |
| `column-widths` | automatic | Optional column-ID-to-pixel-width map, managed by dragging header boundaries. Widths are limited to 240–1000 pixels; boards 600px wide or narrower ignore them. |
| `done-column` | `Done` if there is one | Column kept in step with the checkbox. Leave empty for none. Listed newest completed first. |
| `limit-done` | true | Cap the completed cards shown in each row of the Done column. |
| `done-limit` | 5 | How many completed cards show per row before the rest go behind "more". |
| `undated-column` | none | Column that holds every open task with no due date, as one list down the board, in place of the No due date row. |
| `limit-undated` | true | Cap the cards shown in the No due date column. |
| `undated-limit` | 10 | How many show there before the rest go behind "more". |
| `due-now` | 7 | Size of the Due now window, in `due-now-unit`s. Due now also holds overdue tasks. |
| `due-now-unit` | days | `days`: through today + `due-now` days. `weeks`: through the last day of the `due-now`-th week, counting this week as 1 (Sunday, with Monday week starts). |
| `week-horizon` | 2 | Number of week rows after Due now. Everything later goes in Later. |
| `week-start` | monday | First day of a week row. |
| `filter-properties` | none | `key: value1, value2` per item. The task's note must match every item. |
| `exclude-properties` | none | Same rule syntax as `filter-properties`. Any matching item excludes the note's tasks. |
| `include-tags` / `exclude-tags` | none | Tags on the task or its page; `house` also matches `#house/kitchen`. Page tags apply to every task in the note. |
| `include-folders` / `exclude-folders` | none | Folders the task's note must, or must not, be in. |
| `compact` | false | Compact card spacing. |
| `label-shape` | pill | How labels show on cards: `pill`, `circle` or `square`. |
| `show-column-selector` | true | Show the toolbar column dropdown. Hiding it clears the chosen-column filter; narrow-board navigation stays available. |
| `show-completed-days` | 7 | Completed tasks show for this many days after their done date. 0 hides them. |
| `new-tasks` | default | Where tasks added on this board go: `default` (the plugin setting), `daily` or `note`. |
| `new-tasks-note` | | The note for `new-tasks: note`, created if missing. |
| `new-tasks-heading` | | The section new tasks go at the end of; empty adds to the end of the note. |

A cell with more than 25 cards shows the first 25, then **N more**, which shows the next 25 each time you select it; **Show fewer** goes back. Done and No due date start from `done-limit` and `undated-limit` instead. The extra cards stay shown while the board is open, but not after you close it, so a large board opens without drawing every card. Column and row counts, **Select all** and **Select column** still include every card.

Every board gets an **Open board: ‹name›** command, so you can give each board its own hotkey. The command id comes from the slug, so the hotkey survives renaming the note.

The column name `Label` is reserved for the `#tt/<board>/label/<id>` tag namespace. Use a different column name.
