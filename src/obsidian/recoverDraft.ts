import { Modal, setIcon, type App } from 'obsidian';
import { notice } from './notice.ts';
import { prepareEditorModal, renderEditorHeader } from '../ui/editorHeader.ts';

/** Keep a failed external-editor/command draft available for copying or an explicit retry. */
export function recoverDraft(app: App, value: string, save: (value: string) => Promise<boolean>): void {
  const modal = new Modal(app);
  modal.setTitle('Task not saved');
  const input = modal.contentEl.createEl('textarea', { cls: 'tt-recovery-input', attr: { 'aria-label': 'Unsaved task' } });
  input.value = value;
  modal.contentEl.createEl('p', { text: 'Your draft is kept here. Correct the destination or copy this text before closing.' });
  const chrome = prepareEditorModal(modal.modalEl);
  let busy = false;
  const header = renderEditorHeader(chrome.header, 'Task not saved', setIcon, () => {
    if (busy || !input.value.trim()) return;
    busy = true; header.setBusy(true);
    void save(input.value).then((saved) => { if (saved) modal.close(); })
      .catch((error: unknown) => { console.error('[Task Trellis] retry failed', error); notice(app, 'Task Trellis: could not save. Your draft is still available.', { alert: true }); })
      .finally(() => { busy = false; header.setBusy(false); });
  }, () => modal.close(), 'Retry saving');
  modal.onClose = () => chrome.destroy();
  modal.open();
}
