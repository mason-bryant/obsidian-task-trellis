[← Shared UX guidance](README.md)

# Feedback and recovery

## Expected behavior

Show a response as soon as work begins. Longer operations such as previewing or applying board-tag changes need an inline spinner and a meaningful busy label. Disable duplicate/conflicting actions, expose busy state to assistive technology, and remove it on both success and failure. Avoid transient success notices for every routine interaction when the changed UI already confirms the result.

An error should say what failed, whether anything was saved, and what the user can do next. Keep details in the console for diagnosis, but never make the console the only indication of a failed user action. Preserve entered text and editing context whenever retry is possible.

Distinguish a failed write from a failed follow-up action. For example, if board settings were saved but opening the board failed, say so rather than encouraging a duplicate save.

## Previews, writes and Undo

Notes remain the source of truth. Optimistic card movement is temporary feedback, not proof that a write succeeded. Remove previews for skipped tasks and failed writes; reconcile successful previews against the index. Avoid unnecessary full-vault rebuilds for local actions.

Use [TaskWriter.ts](../../src/obsidian/TaskWriter.ts) and the existing atomic write paths. Check task snapshots before changing notes, including duplicate task lines and sync edits. Partial bulk success must report successful and skipped tasks separately.

Undo restores successful writes only and must not overwrite newer edits. The current safety boundary can skip a whole note when its content changed after the action. Do not promise arbitrary history: the board offers its latest supported action. Undo invalidates selected task snapshots.

Board-tag renaming is a larger operation with an explicit preview and recovery workflow. Preserve its affected-note review and recoverable changes rather than treating it as an ordinary title edit. Recoloring labels has a separate Previous scheme mechanism preserving names and assignments; it is not task Undo.

## Reuse and verify

Use [BoardView.ts](../../src/obsidian/BoardView.ts) for previews and action feedback, [RenameBoardModal.ts](../../src/obsidian/RenameBoardModal.ts) and [BoardTagRename.ts](../../src/obsidian/BoardTagRename.ts) for rename progress/recovery, and [recoverDraft.ts](../../src/obsidian/recoverDraft.ts) for task drafts. Note popup recovery is owned by [NotePopup.ts](../../src/obsidian/NotePopup.ts).

- Force a destination failure, write failure, stale snapshot and mixed-success bulk edit in synthetic tests or a disposable vault.
- Check no input loss, false success, stuck spinner, duplicate submission or permanently misplaced card preview.
- Make an intervening note edit before Undo; confirm it is preserved.
- Test save success followed by navigation failure, plus retry after failure.
- Relevant suites: [save reliability](../../tests/saveReliability.test.ts), [TaskWriter](../../tests/TaskWriter.test.ts), [BoardView](../../tests/BoardView.test.ts), [board-tag rename](../../tests/boardTagRename.test.ts) and [NotePopup](../../tests/NotePopup.test.ts).
