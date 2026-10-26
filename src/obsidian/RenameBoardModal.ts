import { Modal, Notice, setIcon, type App, type TFile } from 'obsidian';
import { BoardTagRename, type RenamePlan } from './BoardTagRename.ts';
import { boardNameError } from '../core/boardName.ts';
import { parseBoardConfig } from '../core/boardConfig.ts';
import { prepareEditorModal } from '../ui/editorHeader.ts';
import { renderBoardNameEditor } from '../ui/renderBoardNameEditor.ts';

/** Rename only the note, preserving its tag namespace and Obsidian's link-update preferences. */
export async function renameBoard(app: App, file: TFile, originalPath: string, name: string): Promise<void> {
  const invalid = boardNameError(name);
  if (invalid) throw new Error(invalid);
  if (file.path !== originalPath || app.vault.getAbstractFileByPath(originalPath) !== file) {
    throw new Error('This board was moved, renamed, or deleted elsewhere. Close this editor and reopen the board.');
  }
  const folder = originalPath.slice(0, originalPath.lastIndexOf('/') + 1);
  const target = `${folder}${name.trim()}.md`;
  if (target === originalPath) return;
  const existing = app.vault.getAbstractFileByPath(target);
  if (existing && existing !== file) throw new Error('A note or folder with that name already exists. Choose another board name.');
  try {
    // Older/hand-authored boards may still derive their namespace from the filename.
    // Persist it before changing that filename, without replacing an existing slug.
    await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
      const parsed = parseBoardConfig(file.basename, fm);
      if (parsed.slugMissing) fm.slug = parsed.config.slug;
    });
    if (file.path !== originalPath || app.vault.getAbstractFileByPath(originalPath) !== file) {
      throw new Error('Board changed while saving');
    }
    await app.fileManager.renameFile(file, target);
  } catch (error) {
    console.error('[Task Trellis] board rename failed', error);
    throw new Error('Could not rename the board. Your name has been kept; check the destination and try again.');
  }
}

export class RenameBoardModal extends Modal {
  private chrome: ReturnType<typeof prepareEditorModal> | null = null;
  constructor(app: App, private file: TFile, private migration?: BoardTagRename) { super(app); }
  onOpen(): void {
    const originalPath = this.file.path;
    this.setTitle('Rename board');
    this.chrome = prepareEditorModal(this.modalEl);
    let plan: RenamePlan | null = null;
    const migration = this.migration;
    renderBoardNameEditor(this.contentEl, this.chrome.header, this.file.basename, setIcon,
      async (name) => {
        if (migration?.busy) throw new Error('Another board rename is running.');
        await renameBoard(this.app, this.file, originalPath, name);
      }, () => this.close(), migration ? {
        preview: async (name) => { plan = await migration.preview(this.file, originalPath, name); return plan; },
        apply: async () => {
          if (!plan) throw new Error('Preview the changes first.');
          const path = await migration.apply(plan);
          new Notice(`Task Trellis: board and tags renamed. Recovery copy: ${path}`, 10000);
        },
      } : undefined);
  }
  onClose(): void { this.chrome?.destroy(); this.chrome = null; this.contentEl.empty(); }
}
