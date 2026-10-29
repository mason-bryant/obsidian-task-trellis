[← Task Trellis](../README.md)

# Use Task Trellis from AI agents and scripts

Task Trellis adds commands to Obsidian's command line interface. An AI agent that can run shell commands, such as Claude Code or Codex, can list your boards, read cards and add, move and update tasks. A script can do the same. The commands run inside Obsidian, so they see each board exactly as you do and change notes the same way the board does: through the Tasks plugin when it's installed, with the same checks against overwriting newer edits, and with Undo.

This page is written for both you and the agent. Point your agent at it, or copy the [instructions for agents](#instructions-for-agents) into its project or memory file.

## Set up once

1. Use Obsidian **1.13.7 or later** on desktop (macOS, Windows or Linux). If Obsidian says your installer is out of date when you use the command line, download the latest installer from obsidian.md.
2. In Obsidian, turn on **Settings → General → Advanced → Command line interface**, and follow its prompt to add `obsidian` to your PATH. Open a new terminal afterwards.
3. Keep Obsidian running with the vault open. The commands talk to the running app.

Check it works:

```bash
obsidian task-trellis:boards format=text
```

With several vaults open, name one first: `obsidian vault="My vault" task-trellis:boards`. `obsidian help task-trellis` lists every command with its options.

If it answers “The CLI is unable to find Obsidian” while Obsidian is open, the command line interface is off, or Obsidian hasn't restarted since you turned it on. Quit Obsidian fully and open it again; on macOS, closing its window or reloading it isn't enough.

The commands are not available on iPhone, iPad or Android, where Obsidian has no command line. Use the [iOS shortcut](ios-shortcuts.md) to capture tasks there.

## Commands

Options are `key=value`; quote values with spaces. `dry-run` on its own turns that option on.

| Command | What it does | Options |
|---|---|---|
| `task-trellis:boards` | Lists boards with their slug, path, columns, labels, quick filters and new-task note. | |
| `task-trellis:show` | Shows a board's cards in board order: each card's id, `raw` line, text, row, column, due date, priority, labels and subtasks. | `board` (required), `filter` (quick filter ids), `column`, `row` |
| `task-trellis:task` | Shows one task with its `raw` line and subtasks, and its column, row and labels on each board it's on. | `id` (required), `expect` |
| `task-trellis:add` | Adds a task to a board, optionally with subtasks, in one write. | `board`, `text` (required), `column`, `due`, `priority`, `labels`, `note`, `heading`, `subtasks`, `parent`, `expect`, `request-id`, `dry-run` |
| `task-trellis:move` | Moves a card to another column, row or position, as dragging it would. | `board`, `id` (both required), `expect`, `column`, `row`, `position`, `dry-run` |
| `task-trellis:set` | Changes a task's due date, priority, text or labels. | `id` (required), `expect`, `due`, `priority`, `text`, `board` with `labels`, `labels-add` or `labels-remove`, `dry-run` |
| `task-trellis:complete` | Completes a task, or reopens it with `done=false`. Recurring tasks get their next occurrence through the Tasks plugin. | `id` (required), `expect`, `done`, `dry-run` |
| `task-trellis:bulk` | Applies one change to several cards, like [bulk triage](tasks.md#bulk-triage). | `board` (required); cards by `ids`, `filter` or `column`; one of `move`, `due`, `priority`, `labels-add`, `labels-remove`; `dry-run` |
| `task-trellis:undo` | Undoes the last change made through these commands. | |

Every command also takes `format=json` (the default) or `format=text`.

**Values**

- `board`: the slug from `task-trellis:boards`, the board note's path, or its name.
- `column`, `row`, `labels` and `filter`: ids from `task-trellis:boards` or `task-trellis:show`, or their names. Label ids differ by board, such as `7` or `green`. Lists are comma-separated, such as `labels=green,blue`. Rows are `none` (No due date), `now` (Due now), a week row such as `week-2026-11-02`, and `later`. `filter` takes only the quick filters shown on the board's toolbar, which are the ones `task-trellis:boards` lists.
- `text` for `set`: the task's new words. The task keeps its fields and its tags; tags in the new text are added.
- `due`: `YYYY-MM-DD`; `none` removes the date. `priority`: `highest`, `high`, `medium`, `low`, `lowest` or `none`.
- `position`: `top`, `bottom` (the default), `before:<id>` or `after:<id>`, naming a card in the target cell.
- `subtasks`: a JSON array of texts, such as `subtasks='["Buy paint","Tape the edges"]'`.

### Adding tasks

`add` uses the board's first workflow column unless you give `column`, and refuses Done. The task goes to the note and heading set under the board's **Settings → New tasks**. `note` sends it to another note and `heading` puts it under another heading. A heading that doesn't exist is added at the end of the note, and a note that doesn't exist is created.

If the board's filters would hide tasks in the destination note, nothing is added and the command says so. A newly created note may still be hidden, for example when the board filters by a property the note doesn't have yet; the result then includes a `warning`.

```bash
obsidian task-trellis:add board=home note="Projects/Kitchen.md" heading="## To do" text="Paint kitchen" due=2026-11-08 labels=green subtasks='["Buy paint","Tape the edges","Paint the walls"]'
```

```markdown
## To do
- [ ] Paint kitchen 📅 2026-11-08 #tt/home/label/green #tt/home/backlog
	- [ ] Buy paint
	- [ ] Tape the edges
	- [ ] Paint the walls
```

With `parent=<id>`, the task becomes the last subtask of that task, and `subtasks` go under it in turn. `board`, `column`, `labels`, `note` and `heading` don't apply to subtasks.

`request-id` makes an add safe to retry. The id is saved in the task's line as a hidden comment, `<!-- task-trellis-request:<id> -->`, and a second add with the same id to the same note finds it and adds nothing. The comment stays in the line, so pass it only when nobody will see whether the first add worked, as in an unattended script.

### Moving cards

`move` with only `column` keeps the card in its row, so its due date stays. Giving `row` sets the due date that dropping the card in that row would: the last day of Due now, the first day a week row shows, or none for No due date. A partial week shows only the days after Due now, so `week-2026-11-02` labeled `Nov 5 – Nov 8` sets 2026-11-05. Moving to Done completes the task; moving out of Done reopens it. Subtasks move with their card, so `move` refuses them; change a subtask with `set` or `complete` instead.

## Results

JSON results start with `"ok": true`, or are `{"ok": false, "error": "…"}` with a message saying what to fix. Commands that change notes return the changed lines with their current ids:

```json
{
  "ok": true,
  "changed": [
    { "id": "Inbox.md:4", "raw": "- [ ] Buy furnace filters 📅 2026-11-01 ⏫ #tt/home/backlog" }
  ]
}
```

`skipped` lists tasks left alone because they changed since they were read. A `bulk` label change also leaves subtask cards alone, because subtasks don’t have labels; their ids are listed in `unchanged`, with a `warning`. `dry-run` returns `"dryRun": true` and the lines that would be written, without writing them: `changes` with their ids, or for `add`, `destination` and `lines`.

`task-trellis:undo` undoes only the last change made through the commands, not changes made on a board. It leaves alone any note that changed again since, and says so. Undoing an add into a note it created leaves the note in place rather than deleting it: empty, or with what its template added.

## Task ids and safe writes

A task's id is its note path and zero-based line number, such as `Inbox.md:4` for the note's fifth line. Ids change when lines above the task are added or removed, so read them shortly before using them, and use the ids returned by a change for the next one.

Pass `expect` with the task's `raw` line to make sure the command changes the task you read. Pass the whole line: a subtask's starts with its indentation, such as a tab, and in a shell `expect=$'\t- [ ] Buy paint'` keeps it. If the line no longer reads that way, the command is refused. If the note only shifted, the one task that still reads that way is used. Writes also check the note itself before changing it, so a task edited in the meantime is skipped rather than overwritten.

Commands run one at a time, so two agents or scripts can't interleave their writes.

## How tasks are stored

The commands are the safest way to change tasks, but everything lives in your Markdown:

- A task is an ordinary checkbox line. Tasks fields such as `📅 2026-11-08` (due), `⏫` (priority) and `✅ 2026-10-27` (done) go after the text.
- `#tt/<board>/<column>/<n>` places the task on a board. `<n>` orders cards within a cell. Without a tag, a task matching the board's filters shows in its first workflow column.
- `#tt/<board>/label/<id>` assigns a label; the board note's `labels` property names and colors each id.
- Tasks indented under a task are its subtasks.

See [Tasks and cards](tasks.md) and [Labels](labels.md) for the details.

## Instructions for agents

- Use `obsidian task-trellis:…` commands to read and change Task Trellis tasks, rather than editing the Markdown yourself.
- Start with `task-trellis:boards`, then `task-trellis:show board=<slug>` for card ids. Take board, column, label, row and quick filter ids from those results.
- Pass `expect` with the task's whole `raw` line when changing a task, including a subtask's leading tab. Use the ids returned by a change for the next command, or run `show` again.
- Check `ok`. When it's false, read `error`; it says what to change. Report `skipped` tasks and any `warning` to the user.
- Use `dry-run` to show the user a change before making it. Use `request-id` only when an add might be retried with no one watching; otherwise run `show` to check before adding again.
- If `obsidian` isn't found, Obsidian isn't running, the result says the command line interface is off, or it says “The CLI is unable to find Obsidian”, tell the user. Don't fall back to editing notes unless they ask; if they do, follow [How tasks are stored](#how-tasks-are-stored).

## Privacy

The commands only run when something on this computer invokes Obsidian's command line, and they read and write only your vault. Task Trellis still has no network service; see [Privacy and integrations](privacy.md).
