import { ItemView, Notice, setIcon, type WorkspaceLeaf } from 'obsidian';
import { backlogCell } from '../core/newTask.ts';
import { renderBoardList, type BoardListHost } from '../ui/renderBoardList.ts';
import { pickComposerLabels } from './LabelPickerModal.ts';
import { notice } from './notice.ts';
import { recoverDraft } from './recoverDraft.ts';
import type TaskTrellisPlugin from '../../main.ts';

export const VIEW_TYPE_BOARD_LIST = 'task-trellis-board-list';

export class BoardListView extends ItemView {
  /** The board marked open when the list was last drawn. */
  private openPath: string | null = null;

  constructor(leaf: WorkspaceLeaf, private plugin: TaskTrellisPlugin) {
    super(leaf);
  }

  getViewType(): string { return VIEW_TYPE_BOARD_LIST; }
  getDisplayText(): string { return 'Task Trellis boards'; }
  getIcon(): string { return 'kanban'; }

  onload(): void {
    super.onload();
    // Clicking in the sidebar makes it the active leaf, but the board stays the active file.
    const update = () => { if (this.activePath() !== this.openPath) this.render(); };
    this.registerEvent(this.app.workspace.on('active-leaf-change', update));
    this.registerEvent(this.app.workspace.on('file-open', update));
    this.render();
  }

  render(): void {
    const boards = this.plugin.boards.boards();
    this.openPath = this.activePath();
    const open = boards.find((b) => b.file.path === this.openPath);
    const cell = open && backlogCell(open.config);
    renderBoardList(this.contentEl,
      boards.map(({ file }) => ({ path: file.path, name: file.basename, folder: file.parent?.path ?? '' })),
      open && cell ? { path: open.file.path, place: cell.place, labels: { palette: open.config.labels, shape: open.config.labelShape } } : null,
      this.host);
  }

  private activePath(): string | null {
    return this.app.workspace.getActiveFile()?.path ?? null;
  }

  /** The board as it is now, not as it was drawn. */
  private board(path: string) {
    return this.plugin.boards.boards().find((b) => b.file.path === path);
  }

  private readonly host: BoardListHost = {
    icon: (el, name) => setIcon(el, name),
    onCreateBoard: () => this.plugin.promptNewBoard(),
    onOpenBoard: (path) => {
      const board = this.board(path);
      const failed = () => new Notice('Task Trellis: could not open this board. Check that its note still exists, then try again.');
      if (!board) { failed(); return; }
      void this.plugin.openBoard(board.file).catch(failed);
    },
    onAddTask: async (path, text, detailed, labels) => {
      try {
        const board = this.board(path);
        if (!board) throw new Error(`No board at ${path}.`);
        return await this.plugin.quickAdd.addToBacklog(board.config, text, detailed, labels);
      } catch (error) {
        console.error('[Task Trellis] add failed', error);
        notice(this.app, 'Task Trellis: could not save the task. Your text has been kept; check the destination and try again.', { alert: true, region: this.contentEl });
        return false;
      }
    },
    onComposerLabels: (path, selected, choose, onClose) => {
      const board = this.board(path);
      if (board) pickComposerLabels(this.app, board, this.plugin.settings.showLabelSearch, selected, choose, onClose);
      else onClose();
    },
    onUnsavedText: (text, retry) => recoverDraft(this.app, text, retry),
  };
}
