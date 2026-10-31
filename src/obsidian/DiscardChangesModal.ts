import { Modal, setIcon, type App } from 'obsidian';
import { prepareEditorModal, renderEditorHeader } from '../ui/editorHeader.ts';

/**
 * Asks before closing board settings throws away changes that aren't saved. Keep editing, the X
 * and Escape go back to the settings with the draft as it was; Discard changes closes them.
 */
export class DiscardChangesModal extends Modal {
  private chrome: ReturnType<typeof prepareEditorModal> | null = null;
  private discarded = false;

  /** `onClosed` learns whether the changes were discarded. */
  constructor(app: App, private board: string, private onClosed: (discarded: boolean) => void) {
    super(app);
  }

  onOpen(): void {
    this.setTitle(`Discard changes to the ${this.board} board’s settings?`);
    this.chrome = prepareEditorModal(this.modalEl);
    renderEditorHeader(this.chrome.header, 'Unsaved changes', setIcon, null, () => this.close());
    this.contentEl.createEl('p', { text: `You’ve changed the ${this.board} board’s settings without saving them. Discarding the changes leaves the board as it was.` });
    const actions = this.contentEl.createDiv('tt-confirm-actions');
    const keep = actions.createEl('button', { cls: 'tt-button', text: 'Keep editing', attr: { type: 'button' } });
    keep.onclick = () => this.close();
    const discard = actions.createEl('button', { cls: 'tt-button tt-button--danger', text: 'Discard changes', attr: { type: 'button' } });
    discard.onclick = () => { this.discarded = true; this.close(); };
    // The safe choice has focus first, after Obsidian focuses the dialog's first button.
    window.setTimeout(() => { if (keep.isConnected) keep.focus(); }, 0);
  }

  onClose(): void {
    this.chrome?.destroy(); this.chrome = null; this.contentEl.empty();
    this.onClosed(this.discarded);
  }
}
