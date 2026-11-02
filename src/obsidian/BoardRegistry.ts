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

/**
 * Board notes in the boards folder, with an Open board command for each, and an Add task to ‹board›:
 * ‹column› command for each column but Done, which a hotkey can run from anywhere. Command ids come
 * from the slug and column id, so hotkeys survive renaming or moving the note; `--` can't occur in
 * either, so it keeps one board's ids apart from another's.
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
    const wanted = new Map<string, { name: string; run: () => void }>();
    for (const { file, config } of this.boards()) {
      const { slug } = config;
      // Two boards with one slug share tags; the first, by name, keeps the commands.
      if (wanted.has(`open-board-${slug}`)) continue;
      wanted.set(`open-board-${slug}`, { name: `Open board: ${file.basename}`, run: () => {
        const board = this.bySlug(slug);
        if (board) void this.plugin.openBoard(board.file);
      } });
      for (const column of config.columns) {
        if (column.id === config.doneColumn) continue;
        wanted.set(`add-task-${slug}--${column.id}`, { name: `Add task to ${file.basename}: ${column.label}`, run: () => {
          const board = this.bySlug(slug);
          if (board?.config.columns.some((c) => c.id === column.id)) void this.plugin.quickAdd.addToColumn(board.config, column.id, board.file.basename);
        } });
      }
    }
    for (const [id, name] of this.registered) {
      if (wanted.get(id)?.name === name) continue;
      this.plugin.removeCommand(id);
      this.registered.delete(id);
    }
    for (const [id, { name, run }] of wanted) {
      if (this.registered.has(id)) continue;
      this.plugin.addCommand({ id, name, callback: run });
      this.registered.set(id, name);
    }
  }
}
