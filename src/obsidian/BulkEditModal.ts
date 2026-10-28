import { Modal, setIcon, type App } from 'obsidian';
import type { BoardConfig } from '../core/boardConfig.ts';
import type { BulkAction, BulkKind, BulkResult } from '../core/bulkTriage.ts';
import { prepareEditorModal } from '../ui/editorHeader.ts';
import { renderBulkEditor } from '../ui/renderBulkEditor.ts';

export class BulkEditModal extends Modal {
  private busy = false;
  private chrome: ReturnType<typeof prepareEditorModal> | null = null;
  private result: BulkResult | null = null;
  constructor(app: App, private config: BoardConfig, private kind: BulkKind, private count: number,
    private apply: (action: BulkAction) => Promise<BulkResult>, private finish: (result: BulkResult | null) => void) { super(app); }
  onOpen(): void {
    this.chrome = prepareEditorModal(this.modalEl);
    renderBulkEditor(this.contentEl, this.chrome.header, this.config, this.kind, this.count, setIcon,
      async (action) => { this.result = await this.apply(action); }, () => this.close(), (busy) => { this.busy = busy; });
  }
  close(): void { if (!this.busy) super.close(); }
  onClose(): void { this.chrome?.destroy(); this.contentEl.empty(); this.finish(this.result); }
}
