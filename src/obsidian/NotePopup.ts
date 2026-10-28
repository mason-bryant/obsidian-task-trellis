import { MarkdownView, Modal, Notice, Scope, setIcon, type App, type TFile, type WorkspaceLeaf } from 'obsidian';
import { isComposing } from '../ui/dom.ts';
import { claimPopupEditor, createPopupLeaf, guardPopupClose } from './popupEditor.ts';

/** Own every popup so plugin reload can save and clean up, or retain a recovery draft. */
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

  /** Unload may start a save, but a failed save must leave its recovery editor alive. */
  destroy(): void {
    this.stopped = true;
    for (const popup of [...this.openPopups]) popup.close();
  }
}

/** A native note editor over the board; no workspace tab is created until expansion. */
export class NotePopup extends Modal {
  private leaf: WorkspaceLeaf | null = null;
  private view: MarkdownView | null = null;
  private restoreClose: (() => void) | null = null;
  private restoreEditor: (() => void) | null = null;
  private closed = false;
  private saving = false;
  private expand: HTMLButtonElement | null = null;
  private status: HTMLElement | null = null;
  private removeKeys: (() => void) | null = null;

  constructor(app: App, private file: TFile, private eState: Record<string, unknown>,
    private onFail: () => void, private onFinished: () => void) {
    super(app);
    this.scope = new Scope(app.scope);
    const dismiss = (event: KeyboardEvent) => {
      if (isComposing(event)) return;
      this.close();
      return false;
    };
    this.scope.register([], 'Escape', dismiss);
    this.scope.register(['Mod'], 'w', dismiss);
  }

  onOpen(): void {
    this.modalEl.addClass('tt-note-popup');
    this.setTitle(this.file.basename);
    // Catch dismissal before the native editor consumes it; other shortcuts use Obsidian.
    const win = this.modalEl.ownerDocument.defaultView;
    const dismissKey = (event: KeyboardEvent) => {
      if (!this.modalEl.contains(event.target as Node)) return;
      if (isComposing(event) || !(event.key === 'Escape' || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'w'))) return;
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
      this.restoreClose = guardPopupClose(this.app, this.modalEl, () => this.close());
      leaf = this.leaf = createPopupLeaf(this.app);
      await leaf.openFile(this.file, { active: false, state: { mode: 'source' }, eState: this.eState });
      if (this.closed) { leaf.detach(); this.leaf = null; return; }
      if (!(leaf.view instanceof MarkdownView)) throw new Error('The note did not open as a Markdown editor.');
      this.view = leaf.view;
      this.contentEl.append(this.view.containerEl);
      this.restoreEditor = claimPopupEditor(this.app, this.view);
      leaf.setEphemeralState(this.eState);
      if (typeof this.eState.line === 'number') {
        const line = Math.max(0, Math.min(this.eState.line, this.view.editor.lineCount() - 1));
        this.view.editor.setCursor({ line, ch: this.view.editor.getLine(line).length });
      }
      this.view.editor.focus();
      // Keep dismissal above the editor scope, with native editing commands in the parent.
      this.app.keymap.popScope(this.scope);
      this.app.keymap.pushScope(this.scope);
      this.status!.textContent = '';
      this.expand!.disabled = false;
    } catch (error) {
      leaf?.detach(); this.leaf = null;
      if (this.closed) return;
      console.error('[Task Trellis] pop-up editor failed', error);
      this.dismiss();
      this.onFail();
    }
  }

  /** Do not destroy the editor or navigate away until its latest contents are saved. */
  private async finish(inTab: boolean): Promise<void> {
    if (this.closed || this.saving) return;
    if (!this.view) { this.dismiss(); return; }
    this.saving = true;
    this.expand!.disabled = true;
    this.status!.textContent = 'Saving note…';
    this.modalEl.setAttribute('aria-busy', 'true');
    let savedSuccessfully = false;
    try {
      // Typing may continue while a save awaits the vault; include those edits before closing.
      let saved: string;
      do {
        saved = this.view.getViewData();
        await this.view.save();
        if (this.closed) return;
      } while (this.view.getViewData() !== saved);
      savedSuccessfully = true;
      if (inTab) {
        // No more typing between the final save and navigation. Re-enable on failure.
        this.view.containerEl.inert = true;
        await this.openInTab();
      }
      this.dismiss();
    } catch (error) {
      console.error('[Task Trellis] pop-up close failed', error);
      if (!this.closed) {
        this.status!.textContent = savedSuccessfully
          ? 'Your note was saved, but the tab could not open. Try again, or close this editor.'
          : 'Could not save. Your text is still here. Close or open in a tab again to retry.';
        new Notice(savedSuccessfully
          ? 'Task Trellis: could not open the note in a tab. Your editor is still open.'
          : 'Task Trellis: could not save the note. Your editor is still open.');
      }
    } finally {
      this.saving = false;
      if (!this.closed) { this.view.containerEl.inert = false; this.expand!.disabled = false; this.modalEl.removeAttribute('aria-busy'); }
    }
  }

  private async openInTab(): Promise<void> {
    const workspace = this.app.workspace;
    const existing = workspace.getLeavesOfType('markdown').find((leaf) =>
      leaf.view instanceof MarkdownView && leaf.view.file?.path === this.file.path ||
      leaf.getViewState().state?.file === this.file.path);
    const target = existing ?? workspace.getLeaf('tab');
    const cursor = this.view!.editor.getCursor();
    const eState = { ...this.eState, line: cursor.line, col: cursor.ch };
    try {
      await target.openFile(this.file, { active: false, eState });
      await workspace.revealLeaf(target);
      target.setEphemeralState(eState);
    } catch (error) {
      if (!existing) target.detach();
      throw error;
    }
  }

  private dismiss(): void {
    if (this.closed) return;
    this.closed = true;
    this.restoreClose?.();
    this.restoreClose = null;
    this.restoreEditor?.();
    this.restoreEditor = null;
    super.close();
    if (this.view) {
      this.leaf?.detach();
      this.leaf = null;
    }
    // If opening is still pending, mount detaches after settlement without navigating.
    this.onFinished();
  }

  onClose(): void { this.removeKeys?.(); this.removeKeys = null; this.contentEl.empty(); }
}
