[← UX rules](README.md)

# Editing and saving

## Rules

An editor that saves explicitly has a header with a green check on the left, the title in the middle and an X on the right. The header stays outside the scrolling fields and visible above a phone keyboard. Its buttons are named for what they do, such as Save changes, Add task or Apply color scheme. The X is named Cancel, or Close when there is nothing to save. The header holds the only primary save control; don't add a second Save below a long form.

| Editor | Saving | Cancelling and closing |
| --- | --- | --- |
| Board settings | The check saves the draft and closes the dialog. Save, at the end of the form, does the same; see Exceptions. | Cancel, Escape and closing discard the draft. |
| Label definition (pencil), color scheme, bulk editor | The check (Save label, Apply color scheme, Apply to ‹n› tasks) commits the draft. | Cancel discards it. |
| Quick-filter order | Reordering changes the settings draft; saving the settings commits it. | Cancelling the settings discards it. |
| Label checkboxes | Each checkbox saves as soon as it changes. A failed write restores the checkbox. | Closing the picker keeps what was saved. |
| Inline task and subtask composer, also under the open board in the boards sidebar | The check adds the task. The text, and any labels picked with its Labels button, clear only once it's saved, and the composer stays open for the next task, with focus in its text box. Picking labels changes only the draft. | X or Escape closes it. |
| New board | Create board makes the board note, then opens the board and its settings. | X closes it. |
| Delete board warning (Delete board… in General) | Delete board moves the board note to the trash, then closes the warning and the settings. It never edits a task. | Cancel, X and Escape close it. While the note is being moved, it can't be dismissed. |
| Board name (click the board's name) | Save board name renames the board. With Also rename board tags on, the check first previews the affected notes, then renames the board and its tags. | X closes it. Nothing changes until the rename is applied. |
| Restore board rename (command) | Restore selected rename restores a saved rename from its recovery copy. | X closes it. |
| New task prompt (Add task command, without the Tasks plugin) | Submitting adds the task. | Closing adds nothing. |
| Task not saved | Opens with the text when saving from the Tasks editor, the New task prompt or Details… fails. Retry saving tries again. | X closes it. |
| Source-note popup | Obsidian's own editor. It saves when it closes or expands into a tab. A failed save keeps it open. | Closing saves; it doesn't discard. |
| Tasks plugin editor | Another plugin's editor, with its own controls. | |
| Plugin settings tab | Each change saves as it's made, like Obsidian's own settings. | |

Saving board settings writes only the settings you edited. A change made elsewhere while the dialog was open, such as a toolbar toggle or a Properties edit, survives the save.

Keep the draft when the destination is unavailable or the write fails. Don't close an editor just because a save was attempted. While saving, block a second submission. If the save fails, re-enable the controls and show an error the user can recover from. When the write succeeds but what follows fails, such as opening the board, report the write as saved and the follow-up as failed.


### Keyboard and focus

Don't treat Enter as submit while an input method is composing text. In the inline composer, Enter adds the task, Shift+Enter starts a new line, and Cmd/Ctrl+Enter does what Details… does. Don't give a multiline editor an Enter-to-save handler.

After a nested editor closes, focus returns to the item that was edited or the control that opened it. Saving or cancelling a label's definition returns focus to that label's checkbox; closing the inline composer returns it to the Add task or add-subtask button that opened it, and closing a composer's label picker returns it to the composer's Labels button. Valid drafts survive redraws. A composer with text or picked labels stays open when focus leaves it, and while its label picker is open. Restoring focus never takes it from another window.

## Exceptions

- Board settings repeats its save at the end of the form, as a button with a green check and the word Save. It does exactly what the header's check does. The form is long, and the maintainer wants a save where it ends.
- The source-note popup and the Tasks plugin editor aren't Task Trellis editors. They keep Obsidian's and the Tasks plugin's own controls and saving.
- The plugin settings tab follows Obsidian's settings, which save each change immediately.
- The inline composer sits in its cell, or under its board in the sidebar, not in a dialog, so it has no header or title. Its buttons are in a row above the text box: the check on the left, then Details…, then, for a task, the Labels tag icon, then the X at the right. The labels picked show between that row and the text box, as on a card. A subtask composer has no Labels button, since subtasks don't show labels.
- The boards sidebar keeps its own composer draft, apart from the board's, so opening one doesn't close the other. Its key names the board, so a draft stays with its board when another board is opened.
- The Tasks plugin editor and the New task prompt close before Task Trellis writes the task: the Tasks editor is another plugin's dialog and closes itself, and the prompt hands its text to the same path. If the write fails, Task not saved opens with the text, so nothing is lost.

## Where it lives

- Header and keyboard-safe modal sizing: `renderEditorHeader` and `prepareEditorModal` in [editorHeader.ts](../../src/ui/editorHeader.ts). A modal destroys its viewport listeners when it closes. The IME check is `isComposing` in [dom.ts](../../src/ui/dom.ts).
- Editors: [renderBoardSettings.ts](../../src/ui/renderBoardSettings.ts) in [BoardSettingsModal.ts](../../src/obsidian/BoardSettingsModal.ts), [renderLabelPicker.ts](../../src/ui/renderLabelPicker.ts) in [LabelPickerModal.ts](../../src/obsidian/LabelPickerModal.ts), [renderBulkEditor.ts](../../src/ui/renderBulkEditor.ts) in [BulkEditModal.ts](../../src/obsidian/BulkEditModal.ts), [renderBoardNameEditor.ts](../../src/ui/renderBoardNameEditor.ts) in [RenameBoardModal.ts](../../src/obsidian/RenameBoardModal.ts), [RestoreBoardRenameModal.ts](../../src/obsidian/RestoreBoardRenameModal.ts), and the New board dialog in [main.ts](../../main.ts).
- Inline composer: `addBox` in [renderBoard.ts](../../src/ui/renderBoard.ts), saving through [BoardView.ts](../../src/obsidian/BoardView.ts) and [QuickAdd.ts](../../src/obsidian/QuickAdd.ts), which also owns Details… and the New task prompt. The sidebar's: [renderBoardList.ts](../../src/ui/renderBoardList.ts) and `addToBacklog` in QuickAdd.ts, with the backlog cell from `backlogCell` in [newTask.ts](../../src/core/newTask.ts). A composer's label picker: `pickComposerLabels` in [LabelPickerModal.ts](../../src/obsidian/LabelPickerModal.ts).
- Task not saved: [recoverDraft.ts](../../src/obsidian/recoverDraft.ts). Source-note popup: [NotePopup.ts](../../src/obsidian/NotePopup.ts).
- Delete board warning: [DeleteBoardModal.ts](../../src/obsidian/DeleteBoardModal.ts), opened from General in [renderBoardSettings.ts](../../src/ui/renderBoardSettings.ts).
- Saving only edited settings: `changedFrontmatter` in [boardDraft.ts](../../src/core/boardDraft.ts). Opening a board: [BoardNavigation.ts](../../src/obsidian/BoardNavigation.ts).
