import { ItemView, Notice, setIcon, type WorkspaceLeaf } from 'obsidian';
import type TaskTrellisPlugin from '../../main.ts';

export const VIEW_TYPE_BOARD_LIST = 'task-trellis-board-list';

export class BoardListView extends ItemView {
  constructor(leaf: WorkspaceLeaf, private plugin: TaskTrellisPlugin) {
    super(leaf);
  }

  getViewType(): string { return VIEW_TYPE_BOARD_LIST; }
  getDisplayText(): string { return 'Task Trellis boards'; }
  getIcon(): string { return 'kanban'; }

  onload(): void {
    super.onload();
    this.contentEl.addClass('tt-board-list');
    this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.updateActive()));
    this.render();
  }

  render(): void {
    const focused = this.contentEl.doc.activeElement;
    const focusedPath = this.contentEl.contains(focused) ? focused?.getAttribute('data-board-path') : null;
    const focusCreate = focused === this.contentEl.querySelector('.tt-board-list-create');
    this.contentEl.empty();
    this.contentEl.createEl('h2', { text: 'Boards', cls: 'tt-board-list-title' });
    const create = this.contentEl.createEl('button', { text: 'Create new board', cls: 'tt-board-list-create' });
    create.addEventListener('click', () => this.plugin.promptNewBoard());
    if (focusCreate) create.focus();
    const boards = this.plugin.boards.boards();
    if (boards.length === 0) {
      this.contentEl.createEl('p', { text: 'No boards yet. Create a board to get started.', cls: 'tt-board-list-empty' });
      return;
    }
    const names = new Map<string, number>();
    for (const { file } of boards) names.set(file.basename, (names.get(file.basename) ?? 0) + 1);
    const list = this.contentEl.createEl('ul', { cls: 'tt-board-list-items', attr: { 'aria-label': 'Boards' } });
    for (const { file } of boards) {
      const row = list.createEl('li');
      const button = row.createEl('button', { cls: 'tt-board-list-item', attr: { title: file.path } });
      button.dataset.boardPath = file.path;
      setIcon(button.createSpan({ cls: 'tt-board-list-icon', attr: { 'aria-hidden': 'true' } }), 'kanban');
      const label = button.createSpan({ cls: 'tt-board-list-label' });
      label.createSpan({ text: file.basename });
      if (names.get(file.basename)! > 1) label.createSpan({ text: file.parent?.path ?? '', cls: 'tt-board-list-folder' });
      button.addEventListener('click', () => {
        void this.plugin.openBoard(file).catch(() => new Notice('Task Trellis: could not open this board.'));
      });
      if (focusedPath === file.path) button.focus();
    }
    this.updateActive();
  }

  private updateActive(): void {
    const activePath = this.app.workspace.getActiveFile()?.path;
    for (const button of this.contentEl.querySelectorAll<HTMLButtonElement>('[data-board-path]')) {
      const active = button.dataset.boardPath === activePath;
      button.toggleClass('is-active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
  }
}
