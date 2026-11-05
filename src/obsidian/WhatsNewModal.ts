import { Modal, setIcon, type App } from 'obsidian';
import { prepareEditorModal } from '../ui/editorHeader.ts';
import { renderWhatsNew, type WhatsNewOptions } from '../ui/renderWhatsNew.ts';

/** Opened by a board's toolbar, or by itself on a board after an update that added features. */
export class WhatsNewModal extends Modal {
  private chrome: ReturnType<typeof prepareEditorModal> | null = null;

  constructor(app: App, private options: WhatsNewOptions, private onClosed: () => void) {
    super(app);
  }

  onOpen(): void {
    const { update } = this.options;
    this.setTitle(update ? `What’s new in Task Trellis ${update.version}` : 'What’s new in Task Trellis');
    this.chrome = prepareEditorModal(this.modalEl);
    renderWhatsNew(this.contentEl, this.chrome.header, this.options, setIcon, () => this.close());
  }

  onClose(): void {
    this.chrome?.destroy(); this.chrome = null; this.contentEl.empty();
    this.onClosed();
  }
}
