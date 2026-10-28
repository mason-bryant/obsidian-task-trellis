import { around } from 'monkey-around';
import { WorkspaceLeaf, type App, type MarkdownFileInfo, type MarkdownView } from 'obsidian';

/**
 * Obsidian has no public embedded-editor factory. Keep the unsupported leaf constructor
 * in this adapter; callers fall back to normal navigation if opening it fails.
 */
export function createPopupLeaf(app: App): WorkspaceLeaf {
  const Constructor = WorkspaceLeaf as unknown as new (app: App) => WorkspaceLeaf;
  if (typeof Constructor !== 'function') throw new Error('Embedded editor is unavailable.');
  const leaf = new Constructor(app);
  if (typeof leaf.openFile !== 'function' || typeof leaf.detach !== 'function') {
    throw new Error('Embedded editor is incompatible with this Obsidian version.');
  }
  return leaf;
}

/** Give native editor commands a file/editor context without activating a workspace tab. */
export function claimPopupEditor(app: App, view: MarkdownView): () => void {
  const workspace = app.workspace;
  const previous = workspace.activeEditor;
  const info: MarkdownFileInfo & { getMode(): string } = {
    app,
    get file() { return view.file; },
    editor: view.editor,
    hoverPopover: null,
    getMode: () => view.getMode(),
  };
  const claim = () => { workspace.activeEditor = info; };
  view.containerEl.addEventListener('focusin', claim);
  claim();
  return () => {
    view.containerEl.removeEventListener('focusin', claim);
    if (workspace.activeEditor === info) workspace.activeEditor = previous;
  };
}

/**
 * macOS menu accelerators can bypass DOM key handlers and Scope. Guard only Obsidian's
 * close-tab command while this popup has focus; other commands and dialogs delegate.
 * Like the leaf constructor, the registry is unsupported and checked before mounting.
 */
export function guardPopupClose(app: App, modal: HTMLElement, close: () => void): () => void {
  const command = (app as unknown as {
    commands?: { commands?: Record<string, { checkCallback?: (checking: boolean) => boolean | void }> };
  }).commands?.commands?.['workspace:close'];
  if (typeof command?.checkCallback !== 'function') throw new Error('Popup close protection is unavailable.');
  return around(command, {
    checkCallback(next) {
      return function (checking: boolean) {
        if (modal.isConnected && modal.contains(modal.ownerDocument.activeElement)) {
          if (!checking) close();
          return true;
        }
        return next?.call(command, checking);
      };
    },
  });
}
