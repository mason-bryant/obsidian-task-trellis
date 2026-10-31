[← Task Trellis](../README.md)

# Troubleshooting

## A task is missing from a board

Search for its text in the vault first. Check **Settings → New tasks** for its destination, then **Filters**. Filters combine as their group says: All needs every filter, Any needs one, and None hides a task that matches any. Within a filter, any listed value can match. A task's tags and its note's tags can match tag filters; property filters read the note's properties. Tasks in the boards folder or plugin-wide excluded folders are never indexed. Completed-task age and card limits can also hide cards; use **Show more** when offered. Subtasks normally stay inside a visible parent.

If a board shows no tasks on one device only, and its filter uses groups, update Task Trellis on that device. Versions before groups show no tasks for a filter they can't read, rather than the wrong ones.

If the destination advice says a plain task would be hidden, change the destination or filters, or include the required tags in the task text. Saving a task and displaying it on a board are separate operations.

## Adding a task does nothing

Choose **A specific note** in New tasks, or enable the **Daily notes** core plugin. Keep the destination outside the boards folder. Read any notice Obsidian displays. If using a template, check the destination after template processing finishes. Avoid immediately closing the app during a write.

## iOS shortcut opens Obsidian but creates no task

Confirm Task Trellis is installed and enabled in that phone's vault, and use the [current shortcut](ios-shortcuts.md). Its configured vault and board must match your names exactly. A “Specify a board” notice means the shortcut did not send a board value. Read the notice, check the destination note, and avoid retrying blindly if a save might have succeeded. Opening the app is not confirmation of a saved or synced task.

## Changes have not reached my other device

Task Trellis writes locally; your vault's sync service carries those changes. Check Obsidian's sync status and leave it open until the sync service reports completion. Task Trellis cannot confirm remote delivery. Also verify that the same plugin version is enabled on both devices.

## A move or label change was refused

An editor, sync update or another action may have changed the task since the board loaded. Refresh or reopen the board and retry. This safeguard prevents a stale action from overwriting a changed task or targeting a different task with identical text. Undo also refuses to overwrite notes changed since its original action.

## Mobile layout or dragging is wrong

Update the three plugin files and disable/re-enable Task Trellis. Try the default theme with CSS snippets off. Swipe the card body to change columns; use its right-edge handle for dragging. The **⋯** menu is an alternative to dragging. Report your device, Obsidian version, theme and exact gesture if the problem persists.

## Report a problem safely

Use the [issue forms](https://github.com/mason-bryant/obsidian-task-trellis/issues/new/choose). Provide a minimal example with fictional tasks, relevant board settings, versions, expected/actual behavior and reproduction steps. Please do not attach your entire vault or private notes. Back up affected notes before recovery or migration work. See [privacy and integrations](privacy.md).
