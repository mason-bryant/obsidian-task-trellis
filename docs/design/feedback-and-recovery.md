[← UX rules](README.md)

# Feedback and recovery

## Rules

- Respond as soon as work starts. Longer operations, such as previewing or applying board-tag changes, show an inline spinner and a busy label. Disable actions that would repeat or conflict with the work, expose the busy state to assistive technology, and clear it on success and on failure.
- Skip success notices when the changed screen already shows the result.
- When an action fails, say so on screen, and to screen readers; the console is never the only sign. Keep what the user entered, and where they were, whenever a retry is possible. How the message reads is in [wording](wording.md).
- Tell a failed write apart from a failed follow-up. If the settings were saved but the board couldn't be opened, say that, so the user doesn't save again.

### Previews, writes and Undo

- Notes are the source of truth. A card that moves as soon as it's dropped is a preview, not proof that the write worked. Previews of skipped and failed writes are removed, and successful ones are reconciled with the index. A local action doesn't rebuild the whole vault's index.
- Writes check the task's snapshot before changing a note, including duplicate task lines and edits from sync. When a bulk edit partly succeeds, the result reports which tasks were updated and which were skipped.
- Undo restores only writes that succeeded, and never overwrites newer edits: a note that changed after the action is skipped as a whole. There's no history to step back through; the board offers its latest action.
- Renaming a board's tags is a bigger operation, with a preview of the affected notes and a recovery copy. Keep both, rather than treating it like a title edit.
- Removing a column in board settings doesn't rewrite its tasks, so adding it back undoes it. Before saving, the Columns tab says how many open cards the column shows and which column they'll show in, and keeps that note current as other columns are renamed.
- Applying a color scheme keeps one Previous scheme: the outgoing colors, by label id. Names and assignments don't change. Editing a single label's name or color updates the palette without keeping a copy. Neither is task Undo.

## Exceptions

None recorded.

## Where it lives

- The spinner and busy label of a saving editor: `setBusy` in [editorHeader.ts](../../src/ui/editorHeader.ts).
- Card move previews, notices for task actions and the Undo action: [BoardView.ts](../../src/obsidian/BoardView.ts). The Undo bar and the bulk status line: [renderBoard.ts](../../src/ui/renderBoard.ts).
- Writes, snapshot checks, Undo and the notices for skipped tasks: [TaskWriter.ts](../../src/obsidian/TaskWriter.ts).
- Board rename: progress and errors in [renderBoardNameEditor.ts](../../src/ui/renderBoardNameEditor.ts), shown by [RenameBoardModal.ts](../../src/obsidian/RenameBoardModal.ts). Snapshots, applying and restoring in [BoardTagRename.ts](../../src/obsidian/BoardTagRename.ts), with the restore dialog in [RestoreBoardRenameModal.ts](../../src/obsidian/RestoreBoardRenameModal.ts).
- Drafts: the inline composer keeps its draft in [renderBoard.ts](../../src/ui/renderBoard.ts). When saving text from the Tasks editor, the New task prompt or Details… fails, [recoverDraft.ts](../../src/obsidian/recoverDraft.ts) reopens it. The source-note popup keeps its own ([NotePopup.ts](../../src/obsidian/NotePopup.ts)).
- Previous scheme: [labelSchemes.ts](../../src/core/labelSchemes.ts).
- Notes on removed columns: `removedColumnNotes` in [boardDraft.ts](../../src/core/boardDraft.ts), which places cards with `columnOf` from [board.ts](../../src/core/board.ts), shown in the Columns tab of [renderBoardSettings.ts](../../src/ui/renderBoardSettings.ts).
