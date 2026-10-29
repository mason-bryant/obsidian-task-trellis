[← Shared UX guidance](README.md)

# Editing and saving

## Expected behavior

Editors with an explicit commit use a green checkmark on the left, the title in the middle, and an X on the right. Save and dismiss stay outside the scrolling fields and visible above a phone keyboard. Give icon buttons meaningful accessible names such as Save changes, Add task or Apply color scheme.

Use [editorHeader.ts](../../src/ui/editorHeader.ts) for the header and `prepareEditorModal` for native modal viewport sizing. Destroy viewport listeners when the modal closes. Do not create a second set of primary Save buttons below a long form.

| Interaction | Commit and dismissal contract |
| --- | --- |
| Board settings, label definition, color scheme, bulk editor | Changes are drafts until explicit Save/Apply. Cancel discards that editor's uncommitted draft. |
| Quick-filter reordering | Changes settings draft order; saving the settings commits it. |
| Label assignment checkbox | Saves immediately. Closing the picker does not undo already saved assignments. Failed writes restore the previous checkbox state. |
| Inline task/subtask composer | Save adds the task, clears text only after success, and keeps the composer ready for another task. X/Escape closes it. |
| Source-note popup | Uses Obsidian's editor and saves on close or expansion into a tab. Close is not discard; a failed save keeps the editor available. |
| Tasks plugin editor | Supplied by another plugin. Preserve its own controls and behavior rather than replacing its chrome. |

Keep draft text when a destination is unavailable or a write fails. Do not close the editor merely because a save was attempted. Prevent duplicate submissions while saving; restore controls and display a recoverable error on failure. A successful write followed by failed navigation must be reported as saved, with navigation failing separately.

Save and open board means the regular Task Trellis board view, not its raw configuration note. Reuse board navigation so an already-open board is activated where possible.

## Keyboard and focus

Check [isComposing](../../src/ui/dom.ts) before interpreting Enter as submission; IME confirmation must not submit unfinished text. In the inline composer, Enter submits, Shift+Enter adds a newline, and Cmd/Ctrl+Enter opens Details. Do not give multiline editors an unconditional Enter-to-save handler.

Restore focus to the edited item or originating control after returning from a nested editor. Preserve valid draft state through UI redraws; focus restoration must not unexpectedly steal focus from another window.

## Reuse and verify

Renderers: [board settings](../../src/ui/renderBoardSettings.ts), [label picker](../../src/ui/renderLabelPicker.ts), [bulk editor](../../src/ui/renderBulkEditor.ts), [board name editor](../../src/ui/renderBoardNameEditor.ts). Hosts: [BoardSettingsModal](../../src/obsidian/BoardSettingsModal.ts), [QuickAdd](../../src/obsidian/QuickAdd.ts), [NotePopup](../../src/obsidian/NotePopup.ts), [recoverDraft](../../src/obsidian/recoverDraft.ts).

- Check Save, Cancel, Escape, nested-editor return and successful navigation.
- Inject unavailable destinations and write failures; verify draft retention and retry without duplicate creation.
- Test the keyboard open at phone width, long forms and enlarged text. Browser resizing cannot prove native keyboard clearance.
- Check IME confirmation, multiline entry and focus after redraw.
- Run [editor header](../../tests/editorHeader.test.ts), [save reliability](../../tests/saveReliability.test.ts), [label picker](../../tests/labelPicker.test.ts) and [note popup](../../tests/NotePopup.test.ts) tests as relevant.
