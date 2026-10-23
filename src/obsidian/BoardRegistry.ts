import { TFile } from 'obsidian';
import { parseBoardConfig, type BoardConfig } from '../core/boardConfig.ts';
import { inFolder } from '../core/filters.ts';
import type TaskTrellisPlugin from '../../main.ts';

export type BoardEntry = {
  file: TFile;
  config: BoardConfig;
  warnings: string[];
  slugMissing: boolean;
};

const commandId = (slug: string) => `open-board-${slug}`;

/**
 * Board notes in the boards folder, and one "Open board" command per board. Command ids come from
 * the slug, so hotkeys survive renaming or moving the note.
 */
export class BoardRegistry {
  /** Command id → the name it was registered with. */
  private registered = new Map<string, string>();

  constructor(private plugin: TaskTrellisPlugin) {}

  isBoardPath(path: string): boolean {
    return path.endsWith('.md') && inFolder(path, this.plugin.settings.boardsFolder);
  }

  entry(file: TFile): BoardEntry {
    const fm = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter;
    const { config, warnings, slugMissing } = parseBoardConfig(file.basename, fm);
    const twins = this.boards().filter((b) => b.file !== file && b.config.slug === config.slug);
    if (twins.length > 0) {
      warnings.push(`Slug "${config.slug}" is also used by ${twins.map((b) => b.file.basename).join(', ')}; the boards share placement tags.`);
    }
    return { file, config, warnings, slugMissing };
  }

  boards(): BoardEntry[] {
    return this.plugin.app.vault
      .getMarkdownFiles()
      .filter((f) => this.isBoardPath(f.path))
      .sort((a, b) => a.basename.localeCompare(b.basename))
      .map((file) => {
        const fm = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter;
        return { file, ...parseBoardConfig(file.basename, fm) };
      });
  }

  bySlug(slug: string): BoardEntry | undefined {
    return this.boards().find((b) => b.config.slug === slug);
  }

  syncCommands(): void {
    const wanted = new Map<string, { slug: string; name: string }>();
    for (const board of this.boards()) {
      const id = commandId(board.config.slug);
      if (!wanted.has(id)) wanted.set(id, { slug: board.config.slug, name: `Open board: ${board.file.basename}` });
    }
    for (const [id, name] of this.registered) {
      if (wanted.get(id)?.name === name) continue;
      this.plugin.removeCommand(id);
      this.registered.delete(id);
    }
    for (const [id, { slug, name }] of wanted) {
      if (this.registered.has(id)) continue;
      this.plugin.addCommand({
        id,
        name,
        callback: () => {
          const board = this.bySlug(slug);
          if (board) void this.plugin.openBoard(board.file);
        },
      });
      this.registered.set(id, name);
    }
  }
}
