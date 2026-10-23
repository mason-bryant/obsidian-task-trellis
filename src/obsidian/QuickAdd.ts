import { Modal, Notice, Setting, TFile, TFolder, normalizePath, type App, type Events } from 'obsidian';
import type { BoardModel, BoardTask } from '../core/board.ts';
import { destinationFor, type BoardConfig, type NewTaskDestination } from '../core/boardConfig.ts';
import { todayISO } from '../core/dates.ts';
import { taskMatchesBoard } from '../core/filters.ts';
import { appendSort, buildNewTaskLine, finishNewTaskLine, insertUnderHeading, type NewTaskFields } from '../core/newTask.ts';
import { parseTaskLine } from '../core/taskLine.ts';
import type TaskTrellisPlugin from '../../main.ts';
import { noteTags } from './noteTags.ts';

type DailyNotes = { getDailyNote(): Promise<TFile | null> };

type AppInternals = {
  internalPlugins?: { getEnabledPluginById?(id: string): unknown };
  plugins?: { enabledPlugins?: Set<string> };
};

const TEMPLATER_ID = 'templater-obsidian';
const TEMPLATER_WAIT_MS = 3000;

/** Adds new tasks to today's daily note, or a configured note, under a heading. */
export class QuickAdd {
  constructor(private plugin: TaskTrellisPlugin) {}

  private get app(): App {
    return this.plugin.app;
  }

  /**
   * The core Daily notes plugin's own find-or-create (what "Open today's daily note" uses), so the
   * note gets the same name, folder and template as always. Internal API; null when unavailable.
   */
  private dailyNotes(): DailyNotes | null {
    const instance = (this.app as unknown as AppInternals).internalPlugins?.getEnabledPluginById?.('daily-notes');
    return instance && typeof (instance as DailyNotes).getDailyNote === 'function' ? (instance as DailyNotes) : null;
  }

  dailyNotesAvailable(): boolean {
    return this.dailyNotes() !== null;
  }

  defaultDestination(): NewTaskDestination {
    const s = this.plugin.settings;
    return { kind: s.newTaskKind, note: s.newTaskNote, heading: s.newTaskHeading };
  }

  /** From a board cell: the cell's column, the row's drop date, at the bottom of the cell. */
  async addFromBoard(model: BoardModel, target: { rowId: string; columnId: string }, text: string, detailed: boolean): Promise<void> {
    const { config } = model;
    const cards = model.cells[target.rowId]?.[target.columnId] ?? [];
    const last = cards[cards.length - 1];
    const fields: NewTaskFields = {
      due: model.rows.find((r) => r.id === target.rowId)?.dropDate ?? null,
      created: await this.createdDate(),
      placement: {
        slug: config.slug,
        column: target.columnId,
        sort: appendSort(last?.placements[config.slug]?.sort, cards.length === 0),
      },
    };
    const line = detailed ? await this.compose(text, fields) : text.trim() ? buildNewTaskLine(text, fields) : null;
    if (line) await this.add(line, destinationFor(config, this.defaultDestination()), config);
  }

  /** A subtask goes in the parent's note, under the parent, with no date or column of its own. */
  async addSubtask(parent: BoardTask, text: string, detailed: boolean): Promise<void> {
    const fields: NewTaskFields = { created: await this.createdDate() };
    const line = detailed ? await this.compose(text, fields) : text.trim() ? buildNewTaskLine(text, fields) : null;
    if (line) await this.plugin.writer.insertSubtask(parent, line);
  }

  /** From the command palette: no board, so the task shows in each matching board's first column. */
  async addFromCommand(): Promise<void> {
    const line = await this.compose('', { created: await this.createdDate() });
    if (line) await this.add(line, this.defaultDestination(), null);
  }

  /** The Tasks modal when available (prefilled with the text and due date), else a plain prompt. */
  private async compose(text: string, fields: NewTaskFields): Promise<string | null> {
    const api = this.plugin.writer.tasksApi();
    if (!api) {
      const typed = text.trim() || (await promptForText(this.app));
      return typed ? buildNewTaskLine(typed, fields) : null;
    }
    const result =
      !text.trim() && !fields.due
        ? await api.createTaskLineModal()
        : await api.editTaskLineModal(buildNewTaskLine(text, { due: fields.due ?? null }));
    const first = result.split('\n')[0];
    if (!first || !parseTaskLine(first)?.text) return null;
    return finishNewTaskLine(first, fields);
  }

  private async add(line: string, dest: NewTaskDestination, board: BoardConfig | null): Promise<void> {
    const target = await this.resolve(dest);
    if (!target) return;
    const { file, created } = target;
    await this.app.vault.process(file, (content) => insertUnderHeading(content, dest.heading, [line]));
    if (created) {
      void this.keepThroughTemplater(file, dest.heading, line);
      if (!board) new Notice(`Task Trellis: added to ${file.basename}.`);
      return;
    }
    const cache = this.app.metadataCache.getFileCache(file);
    const tags = parseTaskLine(line)?.tags ?? [];
    if (board && !taskMatchesBoard({ path: file.path, tags }, board, cache?.frontmatter, noteTags(cache))) {
      new Notice(`Task Trellis: added to ${file.basename}, but this board's filters hide tasks from that note.`);
    } else if (!board) {
      new Notice(`Task Trellis: added to ${file.basename}.`);
    }
  }

  private async resolve(dest: NewTaskDestination): Promise<{ file: TFile; created: boolean } | null> {
    const { vault } = this.app;
    if (dest.kind === 'daily') {
      const daily = this.dailyNotes();
      if (!daily) {
        new Notice('Task Trellis: turn on the core Daily notes plugin, or choose a specific note for new tasks.');
        return null;
      }
      let createdPath: string | null = null;
      const ref = vault.on('create', (f) => (createdPath = f.path));
      try {
        const file = await daily.getDailyNote();
        if (!file) {
          new Notice("Task Trellis: couldn't open today's daily note. Check the Daily notes settings.");
          return null;
        }
        return { file, created: createdPath === file.path };
      } finally {
        vault.offref(ref);
      }
    }

    if (!dest.note.trim()) {
      new Notice('Task Trellis: choose the note new tasks go to, in the plugin or board settings.');
      return null;
    }
    const path = normalizePath(dest.note.endsWith('.md') ? dest.note : `${dest.note}.md`);
    const existing = vault.getFileByPath(path);
    if (existing) return { file: existing, created: false };
    const folder = path.split('/').slice(0, -1).join('/');
    if (folder && !(vault.getAbstractFileByPath(folder) instanceof TFolder)) await vault.createFolder(folder);
    return { file: await vault.create(path, ''), created: true };
  }

  /**
   * Templater rewrites a new note from what it reads ~300 ms after creation. The task is written
   * before that, so it normally survives; if the rewrite dropped it, add it again.
   */
  private async keepThroughTemplater(file: TFile, heading: string, line: string): Promise<void> {
    if (!(this.app as unknown as AppInternals).plugins?.enabledPlugins?.has(TEMPLATER_ID)) return;
    const workspace = this.app.workspace as unknown as Events;
    await new Promise<void>((resolve) => {
      let timer = 0;
      const ref = workspace.on('templater:overwrite-file', (data: unknown) => {
        if ((data as { file?: TFile } | undefined)?.file?.path === file.path) finish();
      });
      const finish = () => {
        workspace.offref(ref);
        window.clearTimeout(timer);
        resolve();
      };
      timer = window.setTimeout(finish, TEMPLATER_WAIT_MS);
    });
    const content = await this.app.vault.read(file);
    if (!content.split(/\r?\n/).includes(line)) {
      await this.app.vault.process(file, (c) => insertUnderHeading(c, heading, [line]));
    }
  }

  /** Follows the Tasks setting for created dates (`➕`); none when Tasks isn't installed. */
  private async createdDate(): Promise<string | undefined> {
    try {
      const raw = await this.app.vault.adapter.read(`${this.app.vault.configDir}/plugins/obsidian-tasks-plugin/data.json`);
      return (JSON.parse(raw) as { setCreatedDate?: unknown }).setCreatedDate === true ? todayISO() : undefined;
    } catch {
      return undefined;
    }
  }
}

/** Asks for the task text when the Tasks plugin isn't there to do it. */
function promptForText(app: App): Promise<string> {
  return new Promise((resolve) => {
    const modal = new Modal(app);
    let value = '';
    let submitted = false;
    modal.setTitle('New task');
    const submit = () => {
      submitted = true;
      modal.close();
    };
    new Setting(modal.contentEl).setName('Task').addText((text) => {
      text.onChange((v) => (value = v));
      text.inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submit();
      });
      window.setTimeout(() => text.inputEl.focus(), 0);
    });
    new Setting(modal.contentEl).addButton((b) => b.setButtonText('Add').setCta().onClick(submit));
    modal.onClose = () => resolve(submitted ? value.trim() : '');
    modal.open();
  });
}
