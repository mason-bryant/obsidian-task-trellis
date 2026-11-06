import { Modal, setIcon, type App } from 'obsidian';
import { notice } from './notice.ts';
import { editorBusy, prepareEditorModal, renderEditorHeader } from '../ui/editorHeader.ts';

/** A retry in progress can't be dismissed: if it fails, this is the only copy of the text. */
class DraftModal extends Modal {
  close(): void { if (!editorBusy(this.modalEl)) super.close(); }
}

/** Keep a failed external-editor/command draft available for copying or an explicit retry. */
export function recoverDraft(app: App, value: string, save: (value: string) => Promise<boolean>): Modal {
  const modal = new DraftModal(app);
  modal.setTitle('Task not saved');
  const input = modal.contentEl.createEl('textarea', { cls: 'tt-recovery-input', attr: { 'aria-label': 'Unsaved task' } });
  input.value = value;
  modal.contentEl.createEl('p', { text: 'Your draft is kept here. Correct the destination or copy this text before closing.' });
  const chrome = prepareEditorModal(modal.modalEl);
  const header = renderEditorHeader(chrome.header, 'Task not saved', setIcon, () => {
    if (editorBusy(modal.modalEl) || !input.value.trim()) return;
    // Disabling the check would drop focus to the page.
    input.focus({ preventScroll: true });
    header.setBusy(true);
    void save(input.value).then((saved) => {
      header.setBusy(false);
      if (saved) modal.close();
    }, (error: unknown) => {
      header.setBusy(false);
      console.error('[Task Trellis] retry failed', error);
      notice(app, 'Task Trellis: could not save the task. Your draft is still here; check the destination, then try again.', { alert: true, region: modal.contentEl });
    });
  }, () => modal.close(), 'Retry saving');
  modal.onClose = () => chrome.destroy();
  modal.open();
  return modal;
}
