import { Modal, type App } from 'obsidian';
import type { BoardLabel } from '../core/labels.ts';
import { renderLabelPicker, type LabelPickerHost } from '../ui/renderLabelPicker.ts';

export class LabelPickerModal extends Modal {
  constructor(app: App, private labels: BoardLabel[], private selected: string[], private host: LabelPickerHost) {
    super(app);
  }

  onOpen(): void {
    this.setTitle('Labels');
    this.modalEl.addClass('tt-label-modal');
    renderLabelPicker(this.contentEl, this.labels, this.selected, this.host);
  }

  onClose(): void { this.contentEl.empty(); }
}
