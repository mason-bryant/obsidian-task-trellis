import { prepareEditorModal } from '../ui/editorHeader.ts';
import { Modal, type App } from 'obsidian';
import type { BoardLabel } from '../core/labels.ts';
import { renderLabelPicker, type LabelPickerHost } from '../ui/renderLabelPicker.ts';

export class LabelPickerModal extends Modal {
  private saving = false;
  private chrome: ReturnType<typeof prepareEditorModal> | null = null;

  constructor(app: App, private labels: BoardLabel[], private selected: string[], private host: LabelPickerHost) {
    super(app);
  }

  close(): void { if (!this.saving) super.close(); }

  onOpen(): void {
    this.setTitle('Labels');
    this.modalEl.addClass('tt-label-modal');
    this.chrome = prepareEditorModal(this.modalEl);
    renderLabelPicker(this.contentEl, this.labels, this.selected, { ...this.host, header: this.chrome.header, onClose: () => this.close(), onBusyChange: (busy) => { this.saving = busy; } });
  }

  onClose(): void { this.chrome?.destroy(); this.chrome = null; this.contentEl.empty(); }
}
