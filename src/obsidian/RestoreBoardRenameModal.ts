import { Modal, Notice, setIcon, type App } from 'obsidian';
import { editorBusy, prepareEditorModal, renderEditorHeader } from '../ui/editorHeader.ts';
import { BoardTagRename } from './BoardTagRename.ts';

export class RestoreBoardRenameModal extends Modal {
  private chrome: ReturnType<typeof prepareEditorModal> | null = null;
  private closed = false;
  constructor(app: App, private service: BoardTagRename) { super(app); }
  onOpen(): void {
    this.closed = false; this.setTitle('Restore board rename');
    this.chrome = prepareEditorModal(this.modalEl);
    void this.draw().catch((error: unknown) => {
      if (!this.closed) this.contentEl.createEl('p', { text: error instanceof Error ? error.message : 'Could not read recovery records.' });
    });
  }
  private async draw(): Promise<void> {
    const entries = (await this.service.history()).filter(({record}) => record.status !== 'restored');
    if (this.closed || !this.chrome) return;
    let busy = false;
    const header = renderEditorHeader(this.chrome.header, 'Restore board rename', setIcon, entries.length ? () => {
      const entry = entries[Number(select.value)];
      if (busy || !entry) return;
      busy = true; select.disabled = true; header.setBusy(true); error.textContent = '';
      void this.service.restore(entry.path).then(() => { new Notice('Task Trellis: board rename restored.'); super.close(); })
        .catch((reason: unknown) => { error.textContent = reason instanceof Error ? reason.message : 'Could not restore this rename.'; })
        .finally(() => { busy = false; select.disabled = false; header.setBusy(false); });
    } : null, () => this.close(), 'Restore selected rename');
    if (!entries.length) { this.contentEl.createEl('p', {text: 'No board renames to restore.'}); return; }
    this.contentEl.createEl('p', {text: 'Restore the original board name, tags and board settings. Notes edited since the rename are protected: restoration stops if a snapshot no longer matches. Obsidian also updates links when the filename is restored. Keep other devices idle until sync finishes.'});
    const select = this.contentEl.createEl('select', {attr: {'aria-label': 'Rename to restore'}});
    entries.forEach(({record}, i) => select.createEl('option', {value: String(i), text: `${record.oldSlug} → ${record.newSlug} · ${record.created} · ${record.status}`}));
    const details = this.contentEl.createDiv();
    const show = () => {
      const entry = entries[Number(select.value)]!;
      details.empty(); details.createEl('p', {text: `Recovery copy: ${entry.path}`});
      const list = details.createEl('ul'); entry.record.changes.forEach((c) => list.createEl('li', {text: c.path}));
      if (entry.record.problem) details.createEl('p', {text: entry.record.problem});
    };
    select.addEventListener('change', show); show();
    const error = this.contentEl.createEl('p', {attr: {role: 'alert'}});
  }
  /** Escape and clicks outside can't interrupt a restore being written. */
  close(): void { if (!editorBusy(this.modalEl)) super.close(); }
  onClose(): void { this.closed = true; this.chrome?.destroy(); this.chrome = null; this.contentEl.empty(); }
}
