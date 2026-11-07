import { Modal, setIcon, type App } from 'obsidian';
import type { BoardTemplateId } from '../core/boardTemplates.ts';
import { editorBusy, prepareEditorModal } from '../ui/editorHeader.ts';
import { renderNewBoardEditor, type NewBoardOptions } from '../ui/renderBoardNameEditor.ts';

/** Names a new board and chooses its template. The dialog stays open, with the name, until the board is made. */
export class NewBoardModal extends Modal {
  private chrome: ReturnType<typeof prepareEditorModal> | null = null;

  constructor(app: App, private options: NewBoardOptions,
    private create: (name: string, template: BoardTemplateId) => Promise<void>) {
    super(app);
  }

  onOpen(): void {
    this.setTitle('New Task Trellis board');
    this.chrome = prepareEditorModal(this.modalEl);
    renderNewBoardEditor(this.contentEl, this.chrome.header, this.options, setIcon, this.create, () => super.close());
  }

  /** Escape and clicks outside wait until the board is created. */
  close(): void { if (!editorBusy(this.modalEl)) super.close(); }

  onClose(): void {
    this.chrome?.destroy(); this.chrome = null;
    this.contentEl.empty();
  }
}
