import { Modal, setIcon, type App, type TFile } from 'obsidian';
import { copyName, siblingPath } from '../core/boardName.ts';
import { untaggedColumn, type BoardConfig } from '../core/boardConfig.ts';
import { editorBusy, prepareEditorModal } from '../ui/editorHeader.ts';
import { renderDuplicateBoardEditor } from '../ui/renderBoardNameEditor.ts';
import type TaskTrellisPlugin from '../../main.ts';

/**
 * Names a new board, next to this one, that starts with this board's saved settings. No task is
 * changed. Once the copy exists, `onDuplicated` gets it as the dialog closes.
 */
export class DuplicateBoardModal extends Modal {
  private chrome: ReturnType<typeof prepareEditorModal> | null = null;
  private copy: TFile | null = null;

  constructor(app: App, private plugin: TaskTrellisPlugin, private file: TFile, private config: BoardConfig,
    private unsaved: boolean, private onDuplicated: (copy: TFile) => void) {
    super(app);
  }

  onOpen(): void {
    const { basename } = this.file;
    this.setTitle(`Duplicate the ${basename} board`);
    this.chrome = prepareEditorModal(this.modalEl);
    const name = copyName(basename, (n) => !!this.app.vault.getAbstractFileByPath(siblingPath(this.file.path, n)));
    const start = untaggedColumn(this.config).label;
    renderDuplicateBoardEditor(this.contentEl, this.chrome.header, name, { name: basename, start, unsaved: this.unsaved }, setIcon,
      async (name) => { this.copy = await this.plugin.duplicateBoard(this.file, name); }, () => super.close());
  }

  /** Escape and clicks outside can't interrupt a copy being written. */
  close(): void { if (!editorBusy(this.modalEl)) super.close(); }

  onClose(): void {
    this.chrome?.destroy(); this.chrome = null; this.contentEl.empty();
    if (this.copy) this.onDuplicated(this.copy);
  }
}
