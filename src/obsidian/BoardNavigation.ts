import type { Workspace, WorkspaceLeaf } from 'obsidian';

/** Reuse saved view state too: an inactive board may still be a deferred view. */
export class BoardNavigation {
  private pending = new Map<string, Promise<void>>();

  constructor(private workspace: Workspace, private viewType: string) {}

  open(path: string): Promise<void> {
    const pending = this.pending.get(path);
    if (pending) return pending;
    const opening = this.openOnce(path).finally(() => this.pending.delete(path));
    this.pending.set(path, opening);
    return opening;
  }

  private async openOnce(path: string): Promise<void> {
    let existing: WorkspaceLeaf | undefined;
    this.workspace.iterateAllLeaves((leaf) => {
      const state = leaf.getViewState();
      if (!existing && state.type === this.viewType && state.state?.file === path) existing = leaf;
    });
    const leaf = existing ?? this.workspace.getLeaf('tab');
    if (!existing) await leaf.setViewState({ type: this.viewType, state: { file: path }, active: true });
    await this.workspace.revealLeaf(leaf);
    leaf.getContainer().win.focus();
    this.workspace.setActiveLeaf(leaf, { focus: true });
  }
}
