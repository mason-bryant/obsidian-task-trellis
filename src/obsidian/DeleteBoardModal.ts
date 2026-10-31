import { Modal, setIcon, type App, type TFile } from 'obsidian';
import { editorBusy, prepareEditorModal, renderEditorHeader } from '../ui/editorHeader.ts';
import { notice } from './notice.ts';

/**
 * Asks before moving a board note to the trash. Only the board note goes: task lines, and the
 * board's tags on them, are left exactly as they are.
 */
export class DeleteBoardModal extends Modal {
  private chrome: ReturnType<typeof prepareEditorModal> | null = null;

  constructor(app: App, private file: TFile, private taggedTasks: number, private onDeleted: () => void) {
    super(app);
  }

  onOpen(): void {
    const name = this.file.basename;
    this.setTitle(`Delete the ${name} board`);
    this.modalEl.addClass('tt-delete-board-modal');
    this.chrome = prepareEditorModal(this.modalEl);
    const header = renderEditorHeader(this.chrome.header, 'Delete board', setIcon, null, () => this.close());
    this.contentEl.createEl('p', { text: `The ${name} board’s note, ${this.file.path}, will be moved to the trash.` });
    const kept = this.contentEl.createEl('p', { cls: 'tt-delete-board-kept' });
    kept.createEl('strong', { text: 'None of your tasks will be deleted.' });
    const one = this.taggedTasks === 1;
    kept.appendText(this.taggedTasks
      ? ` ${one ? 'The task on this board stays in its note' : `The ${this.taggedTasks} tasks on this board stay in their notes`}, unchanged, with this board’s tags. Restoring the note from the trash, or creating a board with the same name, shows ${one ? 'it' : 'them'} again.`
      : ' Tasks stay in their notes, unchanged.');
    const error = this.contentEl.createEl('p', { cls: 'tt-field-error', attr: { role: 'alert' } });
    const actions = this.contentEl.createDiv('tt-delete-board-actions');
    const cancel = actions.createEl('button', { cls: 'tt-button', text: 'Cancel', attr: { type: 'button' } });
    cancel.onclick = () => this.close();
    const remove = actions.createEl('button', { cls: 'tt-button tt-button--danger', text: 'Delete board', attr: { type: 'button' } });
    remove.onclick = () => {
      header.setBusy(true, 'Moving the board to the trash…');
      remove.disabled = true; cancel.disabled = true; error.textContent = '';
      void this.app.fileManager.trashFile(this.file).then(() => {
        notice(this.app, `Task Trellis: moved the ${name} board to the trash. None of its tasks were deleted.`);
        header.setBusy(false);
        this.close();
        this.onDeleted();
      }).catch((reason: unknown) => {
        console.error('[Task Trellis] moving the board to the trash failed', reason);
        header.setBusy(false); remove.disabled = false; cancel.disabled = false; remove.focus();
        error.textContent = 'Task Trellis: couldn’t move the board to the trash, so nothing was changed. Check that its note still exists, then try again.';
      });
    };
    // The safe choice has focus first, after Obsidian focuses the dialog's first button.
    window.setTimeout(() => { if (cancel.isConnected) cancel.focus(); }, 0);
  }

  /** Escape and clicks outside can't interrupt a delete in progress. */
  close(): void { if (!editorBusy(this.modalEl)) super.close(); }

  onClose(): void { this.chrome?.destroy(); this.chrome = null; this.contentEl.empty(); }
}
