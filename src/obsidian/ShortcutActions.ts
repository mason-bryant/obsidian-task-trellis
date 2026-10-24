import { Notice } from 'obsidian';
import type TaskTrellisPlugin from '../../main.ts';
import { parseShortcutTask, shortcutColumn } from '../core/shortcut.ts';

/** Serialize requests so simultaneous shortcuts cannot race when creating a destination note. */
export class ShortcutActions {
  private queue: Promise<void> = Promise.resolve();
  private stopped = false;

  constructor(private plugin: TaskTrellisPlugin) {
    plugin.register(() => { this.stopped = true; });
  }

  handle(params: Record<string, string>): Promise<void> {
    this.queue = this.queue.then(async () => {
      if (this.stopped) return;
      try {
        const request = parseShortcutTask(params);
        const boards = this.plugin.boards.boards().filter(({ file, config }) =>
          config.slug === request.board || file.path === request.board || file.basename === request.board);
        if (boards.length !== 1) throw new Error(`Unknown or ambiguous board: ${request.board}. Use its unique slug or full path.`);
        const board = boards[0]!;
        const column = shortcutColumn(board.config, request.column, request.due);
        const result = await this.plugin.quickAdd.addFromShortcut(board.config, request, column);
        if (this.stopped) return;
        if (result.uncertain) {
          new Notice(`Task Trellis: ${result.warning ?? 'Check the destination note before retrying.'}`, 10000);
          return;
        }
        const message = result.duplicate ? 'This request was already saved in the destination note; no duplicate was added.' : 'Task saved on this device.';
        new Notice(`Task Trellis: ${message} ${result.warning ?? 'Keep Obsidian open until your sync indicator shows Synced.'}`, 10000);
        if (request.openBoard) {
          try { await this.plugin.openBoard(board.file); }
          catch { new Notice('Task Trellis: the task is saved, but the board could not be opened.'); }
        }
      } catch (error) {
        new Notice(`Task Trellis: ${error instanceof Error ? error.message : 'Could not save the task.'}`, 10000);
      }
    });
    return this.queue;
  }
}
