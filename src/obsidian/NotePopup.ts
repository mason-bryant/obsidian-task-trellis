import { MarkdownView, Modal, Notice, Scope, setIcon, type App, type TFile, type WorkspaceLeaf } from 'obsidian';

/** Own every popup so plugin reload cannot leave an editor or hotkey scope behind. */
export class NotePopups {
  private openPopups = new Set<NotePopup>();
  private stopped = false;

  constructor(private app: App) {}

  open(file: TFile | null, state: Record<string, unknown>, navigate: () => void): void {
    if (this.stopped) return;
    if (!file || file.extension !== 'md') { navigate(); return; }
    const popup = new NotePopup(this.app, file, state, navigate, () => this.openPopups.delete(popup));
    this.openPopups.add(popup);
    popup.open();
  }

  destroy(): void {
    this.stopped = true;
    for (const popup of [...this.openPopups]) popup.releaseToTab();
  }
}

/** A managed workspace pane temporarily presented in a modal. No private leaf constructor. */
export class NotePopup extends Modal {
  private leaf: WorkspaceLeaf | null = null;
  private view: MarkdownView | null = null;
  private parent: HTMLElement | null = null;
  private previous: WorkspaceLeaf | null;
  private closed = false;
  private saving = false;
  private expand: HTMLButtonElement | null = null;
  private status: HTMLElement | null = null;
  private removeKeys: (() => void) | null = null;

  constructor(app: App, private file: TFile, private eState: Record<string, unknown>,
    private onFail: () => void, private onFinished: () => void) {
    super(app);
    this.previous = app.workspace.getMostRecentLeaf();
    this.scope = new Scope(app.scope);
    this.scope.register([], 'Escape', () => { this.close(); return false; });
  }

  onOpen(): void {
    this.modalEl.addClass('tt-note-popup');
    this.setTitle(this.file.basename);
    // Activating a real leaf installs its editor key scope. Catch dismissal here before it
    // reaches that scope, while leaving other editor shortcuts to Obsidian.
    const win = this.modalEl.ownerDocument.defaultView;
    const dismissKey = (event: KeyboardEvent) => {
      if (!this.modalEl.contains(event.target as Node)) return;
      if (event.isComposing || !(event.key === 'Escape' || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'w'))) return;
      event.preventDefault(); event.stopPropagation(); this.close();
    };
    win?.addEventListener('keydown', dismissKey, { capture: true });
    this.removeKeys = () => win?.removeEventListener('keydown', dismissKey, { capture: true });
    this.expand = this.modalEl.createEl('button', { cls: 'clickable-icon tt-note-popup-expand', attr: { 'aria-label': 'Save and open note in tab' } });
    setIcon(this.expand, 'maximize-2');
    this.expand.disabled = true;
    this.expand.addEventListener('click', () => void this.finish(true));
    this.status = this.contentEl.createDiv({ cls: 'tt-note-popup-status', attr: { role: 'status' }, text: 'Opening note…' });
    void this.mount();
  }

  close(): void { void this.finish(false); }

  private async mount(): Promise<void> {
    let leaf: WorkspaceLeaf | null = null;
    try {
      // Use the documented workspace factory: commands, saves and unloads see a real tab.
      leaf = this.leaf = this.app.workspace.getLeaf('tab');
      await leaf.openFile(this.file, { active: false, state: { mode: 'source' }, eState: this.eState });
      if (this.closed) { leaf.detach(); this.leaf = null; return; }
      if (!(leaf.view instanceof MarkdownView)) throw new Error('The note did not open as a Markdown editor.');
      this.view = leaf.view;
      this.parent = this.view.containerEl.parentElement;
      this.contentEl.append(this.view.containerEl);
      this.app.workspace.setActiveLeaf(leaf, { focus: false });
      leaf.setEphemeralState(this.eState);
      if (typeof this.eState.line === 'number') {
        const line = Math.max(0, Math.min(this.eState.line, this.view.editor.lineCount() - 1));
        this.view.editor.setCursor({ line, ch: this.view.editor.getLine(line).length });
      }
      this.view.editor.focus();
      // Focusing the pane puts its scope above the modal's. Restore the modal's dismissal
      // scope last; its parent still supplies the application's editing commands.
      this.app.keymap.popScope(this.scope);
      this.app.keymap.pushScope(this.scope);
      this.status!.textContent = '';
      this.expand!.disabled = false;
    } catch (error) {
      leaf?.detach(); this.leaf = null;
      if (this.closed) return;
      console.error('[Task Trellis] pop-up editor failed', error);
      this.dismiss(false);
      this.onFail();
    }
  }

  /** Do not destroy the editor or navigate away until its latest contents are saved. */
  private async finish(inTab: boolean): Promise<void> {
    if (this.closed || this.saving) return;
    if (!this.view) { this.dismiss(false); return; }
    this.saving = true;
    this.expand!.disabled = true;
    this.status!.textContent = 'Saving note…';
    this.modalEl.setAttribute('aria-busy', 'true');
    try {
      // Typing may continue while a save awaits the vault; include those edits before closing.
      let saved: string;
      do {
        saved = this.view.getViewData();
        await this.view.save();
        if (this.closed) return;
      } while (this.view.getViewData() !== saved);
      this.dismiss(inTab);
    } catch (error) {
      console.error('[Task Trellis] pop-up save failed', error);
      if (!this.closed) {
        this.status!.textContent = 'Could not save. Your text is still here. Close or open in a tab again to retry.';
        new Notice('Task Trellis: could not save the note. Your editor is still open.');
      }
    } finally {
      this.saving = false;
      if (!this.closed) { this.expand!.disabled = false; this.modalEl.removeAttribute('aria-busy'); }
    }
  }

  /** Plugin unload is synchronous: hand the live editor back to Obsidian, never discard it. */
  releaseToTab(): void { this.dismiss(true); }

  private dismiss(inTab: boolean): void {
    if (this.closed) return;
    this.closed = true;
    const leaf = this.leaf;
    if (this.view && this.parent) this.parent.append(this.view.containerEl);
    super.close();
    if (this.view && leaf) {
      if (inTab) {
        this.app.workspace.setActiveLeaf(leaf, { focus: true });
      } else {
        const ownedFocus = this.app.workspace.getMostRecentLeaf() === leaf;
        leaf.detach();
        if (ownedFocus && this.previous) {
          let present = false;
          this.app.workspace.iterateAllLeaves((candidate) => { if (candidate === this.previous) present = true; });
          if (present) this.app.workspace.setActiveLeaf(this.previous, { focus: true });
        }
      }
      this.leaf = null;
    }
    // If opening is still pending, mount will detach it after settlement without navigating.
    this.onFinished();
  }

  onClose(): void { this.removeKeys?.(); this.removeKeys = null; this.contentEl.empty(); }
}
