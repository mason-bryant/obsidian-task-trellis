import { Modal, setIcon, type App } from 'obsidian';
import { prepareEditorModal } from '../ui/editorHeader.ts';
import { renderWhatsNew, type WhatsNewOptions } from '../ui/renderWhatsNew.ts';

/** Shown once after an update that added features, when a board opens. */
export class WhatsNewModal extends Modal {
  private chrome: ReturnType<typeof prepareEditorModal> | null = null;

  constructor(app: App, private options: WhatsNewOptions) {
    super(app);
  }

  onOpen(): void {
    this.setTitle(`What’s new in Task Trellis ${this.options.version}`);
    this.chrome = prepareEditorModal(this.modalEl);
    renderWhatsNew(this.contentEl, this.chrome.header, this.options, setIcon, () => this.close());
  }

  onClose(): void {
    this.chrome?.destroy(); this.chrome = null; this.contentEl.empty();
  }
}
