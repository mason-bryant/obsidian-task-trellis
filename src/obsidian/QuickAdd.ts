import { isComposing } from '../ui/dom.ts';
import { recoverDraft } from './recoverDraft.ts';
import { notice } from './notice.ts';
import { prepareEditorModal, renderEditorHeader } from '../ui/editorHeader.ts';
import { getFrontMatterInfo, setIcon, Modal, Setting, TFile, TFolder, normalizePath, type App, type CachedMetadata, type Events } from 'obsidian';
import { buildBoard, type BoardModel, type BoardTask } from '../core/board.ts';
import { destinationFor, type BoardConfig, type NewTaskDestination } from '../core/boardConfig.ts';
import { todayISO } from '../core/dates.ts';
import { taskMatchesBoard } from '../core/filters.ts';
import { backlogCell, planNewTaskAtTop, buildNewTaskLine, finishNewTaskLine, insertUnderHeading, insertUnderHeadingAt, removeLinesAt, type NewTaskFields } from '../core/newTask.ts';
import { parseTaskLine, setDueDate, normalizeRequestMarker } from '../core/taskLine.ts';
import type { ShortcutTask } from '../core/shortcut.ts';
import type TaskTrellisPlugin from '../../main.ts';
import { noteTags } from './noteTags.ts';

type DailyNotes = { getDailyNote(): Promise<TFile | null> };

/** A task written by `addLines`: the note before and after, and the task's line (-1 when it can no longer be found). */
export type AddedLines = { file: TFile; at: number; duplicate: boolean; before: string; after: string; uncertain?: boolean; warning?: string };
type Change = { before: string; after: string };

type AppInternals = {
  internalPlugins?: { getEnabledPluginById?(id: string): unknown };
  plugins?: { enabledPlugins?: Set<string>; plugins?: Record<string, unknown> };
};

/** What Templater uses to decide whether to fill a new note from a template. Internal API. */
type Templater = {
  settings?: {
    /** In older versions. Templater 2.26 keeps this setting on each device instead. */
    trigger_on_file_creation?: unknown;
    trigger_on_file_creation_mode?: unknown;
    enable_folder_templates?: unknown;
    enable_file_templates?: unknown;
  };
  templater?: {
    get_new_file_template_for_folder?(folder: TFolder, extension?: string): string | undefined;
    get_new_file_template_for_file?(file: TFile): string | undefined;
  };
};

const TEMPLATER_ID = 'templater-obsidian';
const TEMPLATER_WAIT_MS = 3000;
const INDEX_WAIT_MS = 2000;

/** Adds new tasks to today's daily note, or a configured note, under a heading. */
export class QuickAdd {
  private stopped = false;
  private pending = new Set<() => void>();

  constructor(private plugin: TaskTrellisPlugin) {
    plugin.register(() => {
      this.stopped = true;
      for (const finish of this.pending) finish();
    });
  }

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

  /** From a board cell: the cell's column, the row's drop date, at the top of the cell, with the labels picked in its composer. */
  async addFromBoard(model: BoardModel, target: { rowId: string; columnId: string }, text: string, detailed: boolean, labels: string[] = []): Promise<boolean> {
    const { config } = model;
    const fields: NewTaskFields = {
      due: model.rows.find((r) => r.id === target.rowId)?.dropDate ?? null,
      created: await this.createdDate(),
      placement: {
        slug: config.slug,
        column: target.columnId,
      },
      labels,
    };
    const line = detailed ? await this.compose(text, fields) : text.trim() ? buildNewTaskLine(text, fields) : null;
    if (!line) return false;
    const save = (draft: string) => this.add(draft, destinationFor(config, this.defaultDestination()), config, model);
    try {
      const saved = await save(line);
      if (!saved && detailed) recoverDraft(this.app, line, save);
      return saved;
    } catch (error) {
      if (detailed) recoverDraft(this.app, line, save);
      throw error;
    }
  }

  /**
   * From the boards sidebar: the top of the board's backlog, as if added there on the board. Cards
   * the board's quick filters hide count too, so the task goes above every one of them.
   */
  async addToBacklog(config: BoardConfig, text: string, detailed: boolean, labels: string[] = []): Promise<boolean> {
    const target = backlogCell(config);
    if (!target) return false;
    const { metadataCache } = this.app;
    const model = buildBoard(this.plugin.index.all(), config, todayISO(),
      (path) => metadataCache.getCache(path)?.frontmatter, (path) => noteTags(metadataCache.getCache(path)));
    return this.addFromBoard(model, target, text, detailed, labels);
  }

  /** A subtask goes in the parent's note, under the parent, with no date or column of its own. */
  async addSubtask(parent: BoardTask, text: string, detailed: boolean): Promise<boolean> {
    const fields: NewTaskFields = { created: await this.createdDate() };
    const line = detailed ? await this.compose(text, fields) : text.trim() ? buildNewTaskLine(text, fields) : null;
    if (!line || this.stopped) return false;
    const save = (draft: string) => this.plugin.writer.insertSubtask(parent, draft);
    try {
      const saved = await save(line);
      if (!saved && detailed) recoverDraft(this.app, line, save);
      return saved;
    } catch (error) {
      if (detailed) recoverDraft(this.app, line, save);
      throw error;
    }
  }

  /** From the command palette: no board, so the task shows in each matching board's first column. */
  async addFromCommand(): Promise<void> {
    let line: string | null = null;
    try {
      line = await this.compose('', { created: await this.createdDate() });
      if (line && !await this.add(line, this.defaultDestination(), null)) recoverDraft(this.app, line, (draft) => this.add(draft, this.defaultDestination(), null));
    } catch (error) {
      console.error('[Task Trellis] add failed', error);
      notice(this.plugin.app, 'Task Trellis: could not save the task. Your draft has been kept.', { alert: true });
      if (line) recoverDraft(this.app, line, (draft) => this.add(draft, this.defaultDestination(), null));
    }
  }

  /** URL capture uses explicit date/column inputs, never an interactive task editor. */
  async addFromShortcut(config: BoardConfig, request: ShortcutTask, column: string): Promise<{ duplicate: boolean; uncertain?: boolean; warning?: string }> {
    if (this.stopped) throw new Error('The plugin was disabled before the task could be saved.');
    // The URL's date is authoritative, including an omitted date meaning no due date.
    const line = setDueDate(buildNewTaskLine(request.text, {
      created: await this.createdDate(), placement: { slug: config.slug, column },
    }), request.due);
    const { duplicate, uncertain, warning } = await this.addLines(config, destinationFor(config, this.defaultDestination()), [line], request.requestId);
    return { duplicate, ...(uncertain ? { uncertain } : {}), ...(warning ? { warning } : {}) };
  }

  /**
   * Writes a finished task line, with any lines that go under it, without an editor (URL capture and
   * the CLI). Refuses an existing note whose filters would hide the task, so nothing is added there.
   * `at` is the task's line in the note.
   */
  async addLines(config: BoardConfig, dest: NewTaskDestination, lines: string[], requestId?: string): Promise<AddedLines> {
    if (this.stopped) throw new Error('The plugin was disabled before the task could be saved.');
    if (dest.kind === 'note') {
      const path = normalizePath(dest.note.endsWith('.md') ? dest.note : `${dest.note}.md`);
      if (this.plugin.isExcludedFromIndex(path)) throw new Error('The destination note is excluded from task indexing. Change the board’s new-task destination.');
    }
    const target = await this.resolve(dest);
    if (!target) throw new Error('Could not resolve the board’s new-task destination. Check its settings.');
    if (this.stopped) throw new Error('The plugin was disabled before the task could be saved.');
    const { file, created } = target;
    if (this.plugin.isExcludedFromIndex(file.path)) throw new Error('The destination note is excluded from task indexing.');
    const templated = created && await this.waitForTemplate(file);
    if (this.stopped) throw new Error('The plugin was disabled before the task could be saved.');
    const line = lines[0]!;
    const cache = this.app.metadataCache.getFileCache(file);
    const filtered = !taskMatchesBoard({ path: file.path, tags: parseTaskLine(line)?.tags ?? [] }, config, cache?.frontmatter, noteTags(cache));
    if (filtered && !created) throw new Error('The board’s filters would hide this task. Adjust its text/tags or new-task destination; no task was added.');
    const marker = requestId ? `<!-- task-trellis-request:${requestId} -->` : '';
    const saved = [normalizeRequestMarker(marker ? `${line} ${marker}` : line), ...lines.slice(1)];
    let duplicate = false;
    let at = -1;
    let before = '', after = '';
    // Folder filters need only the path. Tag and property filters also read the note, and a new note
    // has its template's properties and tags only once Obsidian has indexed it, a moment after each
    // write. Listen from before writing, so the check below can wait for the note as the add left it.
    const readsNote = config.includeTags.length + config.excludeTags.length +
      config.propertyFilters.length + config.excludedPropertyFilters.length > 0;
    const index = created && readsNote ? this.watchIndex(file) : null;
    try {
      await this.app.vault.process(file, (content) => {
        if (this.stopped) throw new Error('The plugin was disabled before the task could be saved.');
        before = after = content;
        if (marker && content.includes(marker)) {
          duplicate = true;
          at = content.split(/\r?\n/).findIndex((l) => l.includes(marker));
          return content;
        }
        ({ content: after, at } = insertUnderHeadingAt(content, dest.heading, saved));
        return after;
      });
      if (created && !duplicate && !templated) {
        let readded: Change | null;
        try { readded = await this.keepThroughTemplater(file, dest.heading, saved); }
        catch { return { file, at, duplicate, before, after, uncertain: true, warning: 'The task was written, but template processing could not be verified. Check the destination note before retrying. Sync is not confirmed.' }; }
        // Templater may have rewritten the note around the task. `before` and `after` then describe the
        // note as it left it, so undoing the add keeps the template's content.
        if (this.templaterOn()) {
          const final = await this.app.vault.read(file);
          const current = final.split(/\r?\n/);
          if (current[at] !== saved[0]) at = current.indexOf(saved[0]!);
          if (readded?.after === final) ({ before, after } = readded);
          else if (final !== after) {
            // Without the lines together to remove, there is no undo: `before` equals `after`.
            before = removeLinesAt(final, at, saved) ?? final;
            after = final;
          }
        }
      }
      const latestCache = index ? await index.indexed(after) : this.app.metadataCache.getFileCache(file);
      const visibilityUnknown = index !== null && !latestCache;
      const hidden = !taskMatchesBoard({ path: file.path, tags: parseTaskLine(line)?.tags ?? [] }, config, latestCache?.frontmatter, noteTags(latestCache));
      return { file, at, duplicate, before, after, warning: hidden || visibilityUnknown ? 'The task may be hidden by this board’s filters; check the destination note and its properties. Sync is not confirmed.' : undefined };
    } finally {
      index?.stop();
    }
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

  private async add(line: string, dest: NewTaskDestination, board: BoardConfig | null, model?: BoardModel): Promise<boolean> {
    if (this.stopped) return false;
    const target = await this.resolve(dest);
    if (!target || this.stopped) return false;
    const { file, created } = target;
    const templated = created && await this.waitForTemplate(file);
    if (this.stopped) return false;
    if (model) {
      const plan = planNewTaskAtTop(line, model);
      if (plan.edits.size) {
        const cards = Object.values(model.cells).flatMap((columns) => Object.values(columns).flat());
        const result = await this.plugin.writer.applyEdits(cards, plan.edits, model.config.slug);
        if (result.skippedIds.length) throw new Error('Some tasks changed before the new task could be ordered. Please retry.');
      }
      line = plan.line;
    }
    await this.app.vault.process(file, (content) => insertUnderHeading(content, dest.heading, [line]));
    if (created) {
      if (!templated) void this.keepThroughTemplater(file, dest.heading, [line]).catch((error: unknown) => {
        console.error('Task Trellis: could not preserve the new task after template processing.', error);
        notice(this.plugin.app, 'Task Trellis: template processing may have replaced the new task. Check the destination note.', { alert: true });
      });
      if (!board) notice(this.plugin.app, `Task Trellis: added to ${file.basename}.`);
      return true;
    }
    const cache = this.app.metadataCache.getFileCache(file);
    const tags = parseTaskLine(line)?.tags ?? [];
    if (board && !taskMatchesBoard({ path: file.path, tags }, board, cache?.frontmatter, noteTags(cache))) {
      notice(this.plugin.app, `Task Trellis: added to ${file.basename}, but this board’s filters hide tasks from that note.`);
    } else if (!board) {
      notice(this.plugin.app, `Task Trellis: added to ${file.basename}.`);
    }
    return true;
  }

  private async resolve(dest: NewTaskDestination): Promise<{ file: TFile; created: boolean } | null> {
    const { vault } = this.app;
    if (dest.kind === 'daily') {
      const daily = this.dailyNotes();
      if (!daily) {
        notice(this.plugin.app, 'Task Trellis: turn on the core Daily notes plugin, or choose a specific note for new tasks.', { alert: true });
        return null;
      }
      let createdPath: string | null = null;
      const ref = vault.on('create', (f) => (createdPath = f.path));
      try {
        const file = await daily.getDailyNote();
        if (!file) {
          notice(this.plugin.app, 'Task Trellis: couldn’t open today’s daily note. Check the Daily notes settings.', { alert: true });
          return null;
        }
        return { file, created: createdPath === file.path };
      } finally {
        vault.offref(ref);
      }
    }

    if (!dest.note.trim()) {
      notice(this.plugin.app, 'Task Trellis: choose the note new tasks go to, in the plugin or board settings.', { alert: true });
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
   * Templater fills a new note from its folder or file-name template only if the note is still empty
   * ~300 ms after creation. When it will, wait for it, so the task goes into the filled note rather
   * than stopping the template. True when this waited.
   */
  private async waitForTemplate(file: TFile): Promise<boolean> {
    if (this.stopped || !await this.templaterWillFill(file)) return false;
    await this.templaterWrote(file);
    return true;
  }

  /**
   * Templater's own check on a new note, short of its templates and excluded folders, where a wrong
   * guess costs only the wait. False when its settings can't be read: the task is then written at
   * once and `keepThroughTemplater` looks after it.
   */
  private async templaterWillFill(file: TFile): Promise<boolean> {
    if (!this.templaterOn()) return false;
    const templater = (this.app as unknown as AppInternals).plugins?.plugins?.[TEMPLATER_ID] as Templater | undefined;
    const settings = templater?.settings;
    if (!settings) return false;
    try {
      const local = this.app.loadLocalStorage('templater-local-settings') as { trigger_on_file_creation?: unknown } | null;
      if ((local?.trigger_on_file_creation ?? settings.trigger_on_file_creation) !== true) return false;
      const mode = settings.trigger_on_file_creation_mode
        ?? (settings.enable_folder_templates === true ? 'folder' : settings.enable_file_templates === true ? 'regex' : 'none');
      const find = templater.templater;
      const template = mode === 'folder' ? file.parent && find?.get_new_file_template_for_folder?.(file.parent, file.extension)
        : mode === 'regex' ? find?.get_new_file_template_for_file?.(file) : undefined;
      if (!template) return false;
      const content = await this.app.vault.read(file);
      return content.length === getFrontMatterInfo(content).contentStart;
    } catch {
      return false;
    }
  }

  /** Waits until Templater has written `file`, up to `TEMPLATER_WAIT_MS`, or the plugin unloads. */
  private templaterWrote(file: TFile): Promise<void> {
    const workspace = this.app.workspace as unknown as Events;
    return new Promise<void>((resolve) => {
      let timer = 0;
      // A template filling an empty note, or the commands already in a note run in place.
      const refs = ['templater:new-note-from-template', 'templater:overwrite-file'].map((name) =>
        workspace.on(name, (data: unknown) => {
          if ((data as { file?: TFile } | undefined)?.file?.path === file.path) finish();
        }));
      const finish = () => {
        for (const ref of refs) workspace.offref(ref);
        window.clearTimeout(timer);
        this.pending.delete(finish);
        resolve();
      };
      this.pending.add(finish);
      timer = window.setTimeout(finish, TEMPLATER_WAIT_MS);
    });
  }

  /**
   * Until Obsidian indexes a write, it reports a new note's properties and tags as unknown, or a
   * changed note's as they were. Start this before writing `file`: `indexed(content)` then gives the
   * note's metadata once Obsidian has indexed `content`, or null after `INDEX_WAIT_MS` or if the
   * plugin unloads. `stop` stops listening.
   */
  private watchIndex(file: TFile): { indexed(content: string): Promise<CachedMetadata | null>; stop(): void } {
    const { metadataCache } = this.app;
    let latest: { content: string; cache: CachedMetadata } | null = null;
    let seen = (): void => undefined;
    // Obsidian passes the content it read, so an index of an earlier write isn't taken for this one.
    const ref = metadataCache.on('changed', (changed, content, cache) => {
      if (changed.path !== file.path) return;
      latest = { content, cache };
      seen();
    });
    const indexed = (content: string) => new Promise<CachedMetadata | null>((resolve) => {
      const current = () => (latest?.content === content ? latest.cache : null);
      let timer = 0;
      const finish = () => {
        window.clearTimeout(timer);
        this.pending.delete(finish);
        resolve(current());
      };
      if (this.stopped || current()) return finish();
      seen = () => { if (current()) finish(); };
      this.pending.add(finish);
      timer = window.setTimeout(finish, INDEX_WAIT_MS);
    });
    return { indexed, stop: () => metadataCache.offref(ref) };
  }

  /**
   * Templater rewrites a new note that isn't empty from what it reads ~300 ms after creation. The task
   * is written before that, so it normally survives; if the rewrite dropped it, add it again. Returns
   * the note before and after adding it again, if that was needed.
   */
  private async keepThroughTemplater(file: TFile, heading: string, lines: string[]): Promise<Change | null> {
    if (this.stopped || !this.templaterOn()) return null;
    await this.templaterWrote(file);
    if (this.stopped) return null;
    const content = await this.app.vault.read(file);
    let readded: Change | null = null;
    if (!this.stopped && !content.split(/\r?\n/).includes(lines[0]!)) {
      await this.app.vault.process(file, (c) => {
        if (this.stopped || c.split(/\r?\n/).includes(lines[0]!)) return c;
        readded = { before: c, after: insertUnderHeading(c, heading, lines) };
        return readded.after;
      });
    }
    return readded;
  }

  private templaterOn(): boolean {
    return (this.app as unknown as AppInternals).plugins?.enabledPlugins?.has(TEMPLATER_ID) === true;
  }

  /** Follows the Tasks setting for created dates (`➕`); none when Tasks isn't installed. */
  async createdDate(): Promise<string | undefined> {
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
        if (!isComposing(e) && e.key === 'Enter') submit();
      });
      window.setTimeout(() => text.inputEl.focus(), 0);
    });
    const chrome = prepareEditorModal(modal.modalEl);
    renderEditorHeader(chrome.header, 'New task', setIcon, submit, () => modal.close(), 'Add task');
    modal.onClose = () => { chrome.destroy(); resolve(submitted ? value.trim() : ''); };
    modal.open();
  });
}
