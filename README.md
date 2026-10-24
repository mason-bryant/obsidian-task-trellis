# Task Trellis

An Obsidian plugin that shows the tasks in your vault as cards on a kanban board: workflow columns across, due-date rows down. Everything is stored in the task lines themselves, in the Tasks plugin's emoji format, so the vault stays plain Markdown.

```
               │ Backlog      │ Doing        │ Waiting      │ Done
▾ No due date  │ [card]       │              │ [card]       │
▾ Due now      │ [card][card] │ [card]       │              │ [card]
▾ Week of 11/2 │ [card]       │              │              │
▸ Later (3)
```

## Boards

A board is a note in the boards folder (`Task Trellis/` by default, set in the plugin settings). Opening the note shows the board. **Settings** on the board opens a form with Columns, Dates, Filters and New tasks tabs. **Save changes** validates and writes the note's properties; **Cancel**, Escape and closing the dialog discard the draft. **Save & open note** saves first, then shows the note itself. Saving an unchanged draft does not rewrite the note. Renaming a column there retags its tasks. **Create board** in the command palette makes one with defaults.

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
| `exclude-properties` | none | Same rule syntax as `filter-properties`. Any matching item excludes the note's tasks. |
| `include-tags` / `exclude-tags` | none | Tags on the task or its page; `house` also matches `#house/kitchen`. Page tags apply to every task in the note. |
| `include-folders` / `exclude-folders` | none | Folders the task's note must, or must not, be in. |
| `show-completed-days` | 7 | Completed tasks show for this many days after their done date. 0 hides them. |
| `new-tasks` | default | Where tasks added on this board go: `default` (the plugin setting), `daily` or `note`. |
| `new-tasks-note` | | The note for `new-tasks: note`, created if missing. |
| `new-tasks-heading` | | The section new tasks go at the end of; empty adds to the end of the note. |

Every board gets an **Open board: ‹name›** command, so you can give each board its own hotkey. The command id comes from the slug, so the hotkey survives renaming the note.

## Filters

The Filters tab keeps **Must include** and **Must not include** visible together, with Tags, Note folders and Note properties in the same order. Each Tags box combines task and page tags. Type a value and press Enter to make a chip, or choose a suggestion. New values are allowed. Remove a chip with its × button; Backspace in an empty entry brings the last chip back for editing. Tags can also be entered as a comma-separated list. A comma inside a property-value chip stays part of that one value.

- Included tags match **any** listed tag; included folders match **any** listed folder; included property rules must **all** match. All configured inclusion categories must pass. Empty categories add no restriction.
- **Any exclusion wins**, whether it matches a task tag, source-note folder or property rule. A missing property fails an inclusion rule and passes an exclusion rule.
- Property **Exists** matches a present key even if its value is null, empty, false or zero. **Matches any value** needs at least one value and compares against any scalar or list value. Keys are case-sensitive; values are case-insensitive. Numbers and booleans compare as strings.
- A task matches the combined tags on its own checkbox line and its page. **Page tags** are the note's `tags` property and inline tags in non-task text; they apply to every task in that note. A tag on another task line does not apply to this task. `house` matches `#house` and `#house/kitchen`, but not `#household`. Internal `#tt/…` placement tags are ignored. Folders match the named folder and descendants; properties come from the source note's frontmatter.
- The boards folder and globally excluded folders are unavailable to every board. Subtasks displayed inside a visible parent follow that parent without being filtered independently. A subtask shown as a standalone card must pass the filters itself.

For example, this board shows tasks tagged `#work` on the task or page (including nested work tags) from `Projects/` whose note has `team: product` or `team: design`, and a `status` property. It hides tasks with `#blocked` on the task or page, notes under `Projects/Archive/`, archived notes and notes marked confidential:

```yaml
include-tags: [work]
include-folders: [Projects]
filter-properties:
  - "team: product, design"
  - status
exclude-tags: [blocked]
exclude-folders: [Projects/Archive]
exclude-properties:
  - "status: archived"
  - "confidential: true"
```

Both property lists accept a single string, a list of rules, or a mapping. Use a mapping with a YAML list for literal commas: `- status: ["cancelled, deferred"]` matches that complete value. Repeated rules remain separate; the editor preserves them when saving other settings. It warns when a required property's existence is also excluded, but allows deliberate overlapping rules. Empty-board diagnostics report missing required keys only.

## Cards

- Each board places a task with one tag, `#tt/<board>/<column>/<n>`, at the end of the line. `<n>` orders cards within a cell. A task can sit in different columns on different boards.
- Dragging a card to another row sets its due date: Due now → the last day of the window; a week row → the first day of that week (or the day after the window for a partial first week); Later → the first day after the last week row; No due date → removes it.
- The arrow at a card's bottom right is a shortcut for the most common drag: a Due now card moves to the next row, and a card in any other row moves into Due now. It keeps its column and goes to the end of the cell. Completed cards don't have one.
- With a No due date column (`undated-column`), undated tasks live in that column instead of a row. Dropping a card there removes its due date, and its tag keeps the column it had before, which is where its arrow sends it; dragging one out gives it the date of the row you drop it in. Completed undated tasks show in Done, in Due now.
- Dragging into the Done column completes the task, and dragging out reopens it. Checked tasks always show in Done. A recurring task's next occurrence keeps the column it was in.
- Clicking a card opens the Tasks plugin's edit modal. Without the Tasks plugin it opens the source line.
- The note name on a card jumps to the task's line, reusing a tab that already shows the note in any window. Cmd/Ctrl-click opens a new tab.
- Cards use theme-aware surfaces, line icons and a single metadata footer. Overdue cards have a slim red edge and a relative overdue label. A partial first week displays its actual date range.
- Tasks indented under a task are its subtasks. They show inside the parent's card, in note order, and go wherever the parent goes, whatever their own date or column. Completed ones stay visible, struck through. A chevron and completion count (for example **1/3**) above each list shares a row with the add-subtask button. Its tooltip says **Hide subtasks** or **Show subtasks**. The board remembers each list’s visibility. **Collapse all subtasks** and **Expand all subtasks** apply to the whole board, including nested lists and hidden columns or rows, and are remembered when you reopen it. If the parent isn't on the board (filtered out, or completed long ago), its open subtasks show as cards of their own.
- **Compact** reduces card spacing without changing which subtask lists are expanded. Use the column picker to focus on one workflow column, especially in a narrow pane. These display choices last for the open board view.
- On a board under 600px wide (a phone, or a narrow pane on desktop), each column fills the board and a sideways swipe moves one column; the dots above the board show which column is in view. Column headers and row labels stay in view on every column.
- On touch screens and narrow boards, open cards have a ⋯ button. **Move to…** lists the board's columns (in the card's row) and rows (in its column), with what the move also does, such as the due date it sets. The card goes to the end of the chosen cell, as if dragged there. On touch screens the card buttons are 44px tap targets, and the add buttons show without hovering.
- After moving or completing a task, **Undo** restores the latest change, including a recurring task's generated occurrence. To protect subsequent edits, Undo skips any note whose content has changed since that action.

## Adding tasks

- **On a board:** "+ Add task" at the bottom of every cell. Enter adds the task and keeps the box open for the next one; Cmd/Ctrl+Enter or **Details…** opens the Tasks editor first; Esc closes it. The task gets the cell's column and the date a drop into that row would set, unless you type a 📅 date yourself. Done has no add button.
- **Subtasks:** the list-plus icon on an open card (or, on hover, on a subtask) opens the same box under its subtasks. The subtask goes in the parent's note, after its last subtask, indented the way the editor indents (Settings → Editor → Indent using tabs), with no date or column of its own.
- **Anywhere:** the **Add task** command opens the Tasks editor and files the task with no column, so it shows in each matching board's first column.
- **Where they go:** by default, the end of `### 🚀 things I plan to accomplish` in today's daily note (Settings → Task Trellis → New tasks). The note comes from the core Daily notes plugin's own find-or-create, so it has your usual name, folder and template, and Templater runs on it as it always does. A board can send its tasks to a specific note and heading instead. If the board's filters would hide tasks from the destination note, you get a notice.
- New tasks get a `➕` created date when the Tasks plugin's "set created date" setting is on.

## Development

Use Node.js 22.13 or a newer supported even-numbered release (CI uses Node.js 22). This is a development requirement; it does not change the plugin's minimum Obsidian version. The Moment override keeps the Obsidian API packages' development dependency patched; Moment is not bundled in the plugin.

```bash
npm ci
npm run lint      # official Obsidian review rules
npm test           # vitest
npm run build      # typecheck + main.js
npm run check:release # manifest, versions, release files and license notices
npm run package    # build and prepare dist/task-trellis/ locally
npm run dev        # rebuild on change
npm run harness    # dev/harness.js, then open dev/harness.html over http
```

`dev/harness.html` runs the real board model and renderer against an in-memory vault, for checking the UI without Obsidian. It includes light/dark themes, the shared settings editor, filter suggestions and task-action Undo. The Source checkbox reveals the resulting task lines.

Every pull request runs lint, the full test suite, TypeScript checking, the production build, release validation, and the browser harness build in GitHub Actions. The `Tests and build` check is required on `main` before merging, including for administrators, and the branch must be up to date.

To try it in a vault, copy `main.js`, `manifest.json` and `styles.css` into `<vault>/.obsidian/plugins/task-trellis/` and enable **Task Trellis** under Community plugins.

## Privacy and integrations

Task Trellis works locally and has no remote service integration. It collects no telemetry, includes no ads, requires no account or payment, and does not access files outside the vault. It does not install or update plugins or dependencies. Its runtime dependency is bundled in `main.js`. Obsidian renders card text as Markdown, so remote images or embeds included in your task text can cause Obsidian to load that content from its source.

The plugin reads Markdown tasks and metadata throughout the vault, except configured exclusions and the boards folder. Board actions edit task lines; board settings edit the board note's properties. Plugin preferences are saved through Obsidian's plugin data API.

The **Tasks** community plugin is optional: it provides the task editor and recurring-task behavior when available. Task Trellis reads its `setCreatedDate` preference from `<vault>/<configDir>/plugins/obsidian-tasks-plugin/data.json`. Without Tasks, cards open the source note and new tasks use a plain text prompt. The **Daily notes** core plugin is needed only when the destination is today's daily note; choosing a specific note works without it. If **Templater** is enabled, Task Trellis waits briefly for template processing so newly added tasks survive it. These integrations operate inside the vault.

## License and credits

Task Trellis is licensed under the [MIT license](LICENSE). Portions of the sorting and filtering logic are adapted from [4D Eisenhower Matrix](https://github.com/krcaljaroslav/4D-eisenhower-matrix) by Jaroslav Krčál (MIT). The runtime also includes [monkey-around](https://github.com/pjeby/monkey-around) by PJ Eby (ISC). See [third-party notices](THIRD_PARTY_NOTICES.txt); all notices are embedded in the generated bundle.

## Submission readiness

This repository has not been submitted to the Community directory. The preparation review on October 23, 2026 covered the official [developer policies](https://docs.obsidian.md/community-directory/developer-policies), [submission requirements](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins), [plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin%20guidelines), [manifest reference](https://docs.obsidian.md/Reference/Manifest), and [submission procedure](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin). Automated checks help prevent regressions; they do not imply acceptance by Obsidian.

Before submission:

- **Resolve code provenance eligibility.** The MIT attribution above preserves the original license, but the directory has a separate fork policy. Because this plugin contains adapted code, obtain publicly verifiable approval from the original author or clarify eligibility with Obsidian before applying. No approval is recorded in this repository. The repository's GitHub `fork: false` flag alone does not settle this requirement.
- **Complete native compatibility testing.** Test on Obsidian 1.8.7 (the declared minimum) and the current stable version, in a disposable vault. Check desktop light/dark themes, keyboard interaction, pop-out windows, reload/disable/re-enable with boards open, and task editing with and without Tasks, Daily notes, and Templater. Test iOS and Android, especially card movement and narrow layouts. No Node.js or Electron APIs are bundled, but mobile interaction has not been verified. Fix failures or adjust compatibility claims before release.
- **Review internal integrations.** Automatic board opening patches `WorkspaceLeaf.setViewState`; preserving board tabs uses the internal view registry with a public API fallback. Daily notes and tag search also use guarded internal interfaces. Smoke-test them after Obsidian updates; the declared API version alone cannot guarantee those interfaces.
- **Check the listing again.** The public repository has the required README, license and manifest. `task-trellis` / `Task Trellis` had no exact match in the public plugin catalog at review time; availability and naming still need confirmation when applying. There is no funding URL because the plugin does not request donations.
- **Prepare a release only when ready.** Keep `manifest.json`, `package.json` and `versions.json` synchronized. Run `npm ci`, `npm run lint`, `npm test`, `npm run harness`, and `npm run package`. Inspect `dist/task-trellis/` and install those exact files in the test vault. The build checks mobile-incompatible runtime imports and preserves notices; packaging validates metadata and assets.
- **Publish and submit only with maintainer authorization.** A GitHub release must have a tag exactly matching the manifest version (for example `0.1.0`, without `v`) and attach `main.js`, `manifest.json` and `styles.css` as individual assets. The default branch must contain the matching manifest and reviewable source. Apply through the [Community directory](https://community.obsidian.md/) using an Obsidian account linked to GitHub. Address the automated review and any reviewer requests before publication. No release or submission is created by this repo's CI or package command.
