[← UX rules](README.md)

# Feedback and recovery

## Rules

- Respond as soon as work starts. Longer operations, such as previewing or applying board-tag changes, show an inline spinner and a busy label. Disable actions that would repeat or conflict with the work, expose the busy state to assistive technology, and clear it on success and on failure.
- Skip success notices when the changed screen already shows the result. A task added from somewhere its board may not be in view says where it went: the sidebar says Task added to ‹board› from its status region, and its box clearing shows it to everyone else, and an Add task to ‹board›: ‹column› command shows a notice naming the board and column.
- When an action fails, say so on screen, and to screen readers; the console is never the only sign. Keep what the user entered, and where they were, whenever a retry is possible. How the message reads is in [wording](wording.md).
- Tell a failed write apart from a failed follow-up. If the settings were saved but the board couldn't be opened, say that, so the user doesn't save again.

### Previews, writes and Undo

- Notes are the source of truth. A card that moves as soon as it's dropped is a preview, not proof that the write worked. Previews of skipped and failed writes are removed, and successful ones are reconciled with the index. A local action doesn't rebuild the whole vault's index.
- Writes check the task's snapshot before changing a note, including duplicate task lines and edits from sync. When a bulk edit partly succeeds, the result says how many were updated, and names the tasks that were skipped, up to three and then how many more.
- Undo restores only writes that succeeded, and never overwrites newer edits: a note that changed after the action is skipped as a whole. There's no history to step back through; the board offers its latest action.
- When a note can't be written during Undo, Undo still restores every other note it can, names the ones it couldn't, up to three and then how many more, and stays, so choosing it again tries just those. A note that changed in between is still left alone.
- Renaming a board's tags is a bigger operation, with a preview of the affected notes and a recovery copy. Keep both, rather than treating it like a title edit.
- A recovery copy that can't be used is named when Task Trellis starts and in Restore board rename, and left as it is. The others can still be restored. Since it might be a rename that never finished, a new tag rename won't start until it's gone, and its error says which file and what to do.
- Removing a column in board settings doesn't rewrite its tasks, so adding it back undoes it. Before saving, Columns in the Setup tab says how many open cards the column shows and which column they'll show in, and keeps that note current as other columns are renamed.
- Duplicating a board writes one new note, with its settings, so a failure leaves nothing behind and keeps the name to try again. It never edits a task, and its dialog says so. The new board opening is the confirmation; there's a notice only when the settings stay open in front of it.
- Closing board settings with unsaved changes asks before discarding them, with keeping them as the default.
- Deleting a board moves only its note to the trash, and its warning says that no tasks are deleted. The trash is how it's undone: restoring the note restores the board. A failure keeps the warning open and says nothing was changed.
- Applying a color scheme keeps one Previous scheme: the outgoing colors, by label id. Names and assignments don't change. Editing a single label's name or color updates the palette without keeping a copy. Neither is task Undo.
- Plugin settings survive a reinstall. Every save also writes a copy outside the plugin's folder, to `Task Trellis recovery/plugin-settings.json`, which rename recovery leaves out. A failed copy is logged and doesn't fail the save. Loading with no settings restores the copy and says so in a notice, without saving yet, so newer settings arriving by Sync win; a new install, with no copy, starts from the defaults.
- With no settings and no copy, a boards folder that holds no boards isn't taken as an empty vault. When the board notes are all in one other folder, that becomes the boards folder, saved, with a notice saying so; with several, the boards sidebar offers each, and the first-run notice points there instead of to the templates.
- Settings that Sync replaces are taken up in place, redrawing the boards and the sidebar, so a later save on this device doesn't put the old ones back. A deleted settings file, as uninstalling on another device leaves, doesn't reset the settings in use; the next save writes them again.

## Exceptions

- After Rename board… changes a board's tags from its settings, the notes on removed columns in Setup can be out of date until the settings are reopened. It's a rare combination, and saving doesn't rely on those notes.

## Where it lives

- The spinner and busy label of a saving editor: `setBusy` in [editorHeader.ts](../../src/ui/editorHeader.ts).
- Card move previews, notices for task actions and the Undo action: [BoardView.ts](../../src/obsidian/BoardView.ts). The Undo bar and the bulk status line: [renderBoard.ts](../../src/ui/renderBoard.ts).
- Writes, snapshot checks, Undo and the notices for skipped tasks: [TaskWriter.ts](../../src/obsidian/TaskWriter.ts).
- Board rename: progress and errors in [renderBoardNameEditor.ts](../../src/ui/renderBoardNameEditor.ts), shown by [RenameBoardModal.ts](../../src/obsidian/RenameBoardModal.ts). Snapshots, applying and restoring in [BoardTagRename.ts](../../src/obsidian/BoardTagRename.ts), with the restore dialog in [RestoreBoardRenameModal.ts](../../src/obsidian/RestoreBoardRenameModal.ts).
- Drafts: the inline composer keeps its draft in [renderBoard.ts](../../src/ui/renderBoard.ts). When saving text from the Tasks editor, the New task prompt or Details… fails, or a composer closes while its save is failing, [recoverDraft.ts](../../src/obsidian/recoverDraft.ts) reopens it. The source-note popup keeps its own ([NotePopup.ts](../../src/obsidian/NotePopup.ts)).
- Previous scheme: [labelSchemes.ts](../../src/core/labelSchemes.ts).
- Notes on removed columns: `removedColumnNotes` in [boardDraft.ts](../../src/core/boardDraft.ts), which places cards with `columnOf` from [board.ts](../../src/core/board.ts), shown in Columns in the Setup tab of [renderBoardSettings.ts](../../src/ui/renderBoardSettings.ts).
- The settings copy: [settingsBackup.ts](../../src/obsidian/settingsBackup.ts), written from `saveData` and restored by `loadSettings` in [main.ts](../../main.ts), which also has `onExternalSettingsChange` and `adoptBoardsFolder`. Finding boards outside the boards folder: [boardFolders.ts](../../src/core/boardFolders.ts).
