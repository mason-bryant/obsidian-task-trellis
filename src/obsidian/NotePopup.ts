import { MarkdownView, Modal, Scope, setIcon, WorkspaceLeaf, type App, type MarkdownFileInfo, type TFile } from 'obsidian';

/** Not in the public typings; Hover Editor and others build leaves the same way. */
type LeafCtor = new (app: App) => WorkspaceLeaf;

/**
 * The note's own editor in a modal, for small edits without leaving the board. The leaf is never
 * attached to the layout, so it never shows up as a tab.
 */
export class NotePopup extends Modal {
  private leaf: WorkspaceLeaf | null = null;
  private restoreEditor: (() => void) | null = null;

  constructor(app: App, private file: TFile, private eState: Record<string, unknown>, private onExpand: () => void, private onFail: () => void) {
    super(app);
    // A modal's own scope swallows Obsidian's hotkeys; editing needs them.
    this.scope = new Scope(app.scope);
    this.scope.register([], 'Escape', () => { this.close(); return false; });
  }

  onOpen(): void {
    this.modalEl.addClass('tt-note-popup');
    this.setTitle(this.file.basename);
    const expand = this.modalEl.createDiv({ cls: 'clickable-icon tt-note-popup-expand', attr: { role: 'button', tabindex: '0', 'aria-label': 'Open note' } });
    setIcon(expand, 'maximize-2');
    const go = () => { this.close(); this.onExpand(); };
    expand.addEventListener('click', go);
    expand.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    void this.mount();
  }

  private async mount(): Promise<void> {
    try {
      const leaf = this.leaf = new (WorkspaceLeaf as unknown as LeafCtor)(this.app);
      await leaf.openFile(this.file, { state: { mode: 'source' }, eState: this.eState });
      if (this.leaf !== leaf) return;
      if (!(leaf.view instanceof MarkdownView)) throw new Error('not a markdown view');
      const view = leaf.view;
      this.contentEl.append(view.containerEl);
      // Editor hotkeys and commands act on the workspace's active editor, which is otherwise the board.
      // Obsidian ignores a MarkdownView here (it expects one in a tab), so hand it the view's parts.
      const { workspace } = this.app, previous = workspace.activeEditor;
      // Commands also ask for the mode, as they do of canvas cards.
      const info: MarkdownFileInfo & { getMode(): string } = { app: this.app, get file() { return view.file; }, editor: view.editor, hoverPopover: null, getMode: () => view.getMode() };
      const claim = () => { workspace.activeEditor = info; };
      view.containerEl.addEventListener('focusin', claim);
      this.restoreEditor = () => { if (workspace.activeEditor === info) workspace.activeEditor = previous; };
      // Opening hid the cursor's line until the view was in the page.
      leaf.setEphemeralState(this.eState);
      // At the end of the task's line, where a small edit usually goes.
      if (typeof this.eState.line === 'number') view.editor.setCursor({ line: this.eState.line, ch: view.editor.getLine(this.eState.line).length });
      view.editor.focus();
      claim();
    } catch (error) {
      console.error('[Task Trellis] pop-up editor failed', error);
      this.close();
      this.onFail();
    }
  }

  onClose(): void {
    this.restoreEditor?.();
    this.restoreEditor = null;
    // Detaching saves any pending edit.
    this.leaf?.detach();
    this.leaf = null;
    this.contentEl.empty();
  }
}

/** Where a link opens: the pop-up editor for notes, or Obsidian's own handling for anything else. */
export function openInPopup(app: App, file: TFile | null, eState: Record<string, unknown>, navigate: () => void): void {
  if (!file || file.extension !== 'md') { navigate(); return; }
  new NotePopup(app, file, eState, navigate, navigate).open();
}
