import { uiElement } from '../ui/dom.ts';
import { destinationAdvice } from '../core/setup.ts';
import { prepareEditorModal } from '../ui/editorHeader.ts';
import { AbstractInputSuggest, Modal, setIcon, TextComponent, DropdownComponent, type App, type TFile } from 'obsidian';
import type { BoardTask } from '../core/board.ts';
import { parseBoardConfig, type BoardConfig } from '../core/boardConfig.ts';
import { draftChanged, draftFromConfig, draftToFrontmatter, type BoardDraft } from '../core/boardDraft.ts';
import { propertyValueStrings } from '../core/filters.ts';
import { renderBoardSettings, type SettingsForm, type Section } from '../ui/renderBoardSettings.ts';
import type TaskTrellisPlugin from '../../main.ts';
import { noteTags } from './noteTags.ts';
import { notice } from './notice.ts';
import { shortcutURL } from '../core/shortcut.ts';
import { DeleteBoardModal } from './DeleteBoardModal.ts';
import { DiscardChangesModal } from './DiscardChangesModal.ts';
import { DuplicateBoardModal } from './DuplicateBoardModal.ts';
import { RenameBoardModal } from './RenameBoardModal.ts';

/**
 * Edits a board note’s settings as a form instead of raw front matter.
 * Save validates and persists the draft; Cancel, Escape and the close button discard it.
 */
export class BoardSettingsModal extends Modal {
  private chrome: ReturnType<typeof prepareEditorModal> | null = null;
  private draft: BoardDraft;
  private form: SettingsForm | null = null;
  private saving = false;
  /** The warning about unsaved changes is open. */
  private confirming = false;
  /** Tasks by the column their tag names on this board, for the removed-column notes and Delete board. Counted when first needed. */
  private tagged: Map<string, BoardTask[]> | null = null;

  constructor(
    app: App,
    private plugin: TaskTrellisPlugin,
    private file: TFile,
    private config: BoardConfig,
    private initialSection: Section = 'general',
    private onClosed?: () => void,
  ) {
    super(app);
    this.draft = draftFromConfig(this.config);
  }

  /**
   * The X, Escape and clicking outside. A save in progress can't be interrupted, and unsaved changes
   * are discarded only once the user says so.
   */
  close(): void {
    if (this.saving || this.confirming) return;
    if (!draftChanged(this.draft, this.config)) { super.close(); return; }
    this.confirming = true;
    new DiscardChangesModal(this.app, this.file.basename, (discarded) => {
      this.confirming = false;
      if (discarded) super.close();
    }).open();
  }

  /** After saving, or deleting the board, nothing is left to lose. */
  private closeSettings(): void {
    super.close();
  }

  private async save(): Promise<void> {
    if (this.saving) return;
    const { errors } = draftToFrontmatter(this.draft, this.config);
    if (errors.length) { this.form?.showErrors(errors); return; }
    this.saving = true;
    this.form?.setSaving(true);
    try {
      if (draftChanged(this.draft, this.config)) {
        const failed = await this.plugin.saveBoardSettings(this.file, this.config, this.draft);
        if (failed.length) { this.form?.showErrors(failed); return; }
      }
      this.saving = false;
      this.closeSettings();
    } catch (error) {
      console.error('[Task Trellis] settings save failed', error);
      notice(this.app, 'Task Trellis: could not save board settings. Your draft is still open.', { alert: true, region: this.contentEl });
    } finally {
      this.saving = false;
      this.form?.setSaving(false);
    }
  }

  onOpen(): void {
    this.setTitle(`${this.file.basename} board settings`);
    this.modalEl.addClass('tt-settings-modal');
    this.chrome = prepareEditorModal(this.modalEl);
    const properties = collectProperties(this.app);

    const tags = [...new Set(this.plugin.index.all().flatMap((task) => task.tags))].sort();
    const sourceTags = [...new Set(this.app.vault.getMarkdownFiles().filter((file) => !this.plugin.isExcludedFromIndex(file.path))
      .flatMap((file) => noteTags(this.app.metadataCache.getFileCache(file))))].sort();
    const folders = [...new Set(this.app.vault.getMarkdownFiles().filter((file) => !this.plugin.isExcludedFromIndex(file.path)).flatMap((file) => {
      const parts = file.path.split('/').slice(0, -1);
      return parts.map((_, i) => parts.slice(0, i + 1).join('/'));
    }))].sort();
    const suggest = (input: HTMLInputElement, items: () => string[]) => {
      const suggestion = new ListSuggest(this.app, input, items);
      return () => suggestion.close();
    };
    this.form = renderBoardSettings(this.contentEl, this.draft, this.config, {
      header: this.chrome.header,
      createTextInput: () => new TextComponent(uiElement(this.contentEl.ownerDocument, 'div')).inputEl,
      createDropdown: () => new DropdownComponent(uiElement(this.contentEl.ownerDocument, 'div')).selectEl,
      initialSection: this.initialSection,
      destinationAdvice: (draft) => {
        const config = parseBoardConfig(this.config.name, { slug: this.config.slug, ...draftToFrontmatter(draft, this.config).frontmatter }).config;
        return destinationAdvice(config, this.plugin.quickAdd.defaultDestination(), {
          dailyAvailable: this.plugin.quickAdd.dailyNotesAvailable(),
          excluded: (path) => this.plugin.isExcludedFromIndex(path),
          metadata: (path) => { const cache = this.app.metadataCache.getCache(path); return { frontmatter: cache?.frontmatter, tags: noteTags(cache) }; },
        });
      },
      icon: (el, name) => setIcon(el, name),
      attachKeySuggest: (input) => suggest(input, () => [...properties.keys()]),
      attachValueSuggest: (input, key) => suggest(input, () => [...(properties.get(key()) ?? [])]),
      attachTagSuggest: (input) => suggest(input, () => [...new Set([...tags, ...sourceTags])].sort()),
      attachFolderSuggest: (input) => suggest(input, () => folders),
      taggedTasks: (columnId) => this.taggedTasks().get(columnId) ?? [],
      onDiscard: () => this.close(),
      onSave: () => void this.save(),
      onRenameBoard: () => new RenameBoardModal(this.app, this.file, this.plugin.boardRenames, (slug) => this.renamed(slug)).open(),
      onDuplicateBoard: () => {
        const unsaved = draftChanged(this.draft, this.config);
        new DuplicateBoardModal(this.app, this.plugin, this.file, this.config, unsaved, (copy) => {
          // Closing would discard unsaved changes, so then the settings stay open over the new board.
          if (!unsaved) this.close();
          else notice(this.app, `Task Trellis: created the ${copy.basename} board. It’s open behind these settings.`, { region: this.contentEl });
          void this.plugin.openBoard(copy).catch((error: unknown) => {
            console.error('[Task Trellis] opening the duplicated board failed', error);
            notice(this.app, `Task Trellis: created ${copy.path}, but the board could not be opened. Open it from the boards sidebar.`, { alert: true });
          });
        }).open();
      },
      onDeleteBoard: () => {
        const count = [...this.taggedTasks().values()].reduce((sum, list) => sum + list.length, 0);
        new DeleteBoardModal(this.app, this.file, count, () => this.closeSettings()).open();
      },
      onCopyShortcut: () => {
        const matches = this.plugin.boards.boards().filter((b) => b.config.slug === this.config.slug);
        const board = matches.length === 1 ? this.config.slug : this.file.path;
        void navigator.clipboard.writeText(shortcutURL(this.app.vault.getName(), board))
          .then(() => { notice(this.app, 'Task Trellis: shortcut URL copied. Replace the example text before using it.', { region: this.contentEl }); })
          .catch(() => { notice(this.app, 'Task Trellis: could not copy the shortcut URL. See the setup instructions in the readme.', { alert: true, region: this.contentEl }); });
      },
    });
  }

  private taggedTasks(): Map<string, BoardTask[]> {
    if (this.tagged) return this.tagged;
    const tagged = this.tagged = new Map<string, BoardTask[]>();
    for (const task of this.plugin.index.all()) {
      const column = task.placements[this.config.slug]?.column;
      if (!column) continue;
      const list = tagged.get(column);
      if (list) list.push(task); else tagged.set(column, [task]);
    }
    return tagged;
  }

  /**
   * After Rename board…, the draft stays as it was. Renaming the tags too wrote the new slug, so
   * saving and the counts of tagged tasks use it from here on.
   */
  private renamed(slug = this.config.slug): void {
    this.config = { ...this.config, name: this.file.basename, slug };
    this.setTitle(`${this.file.basename} board settings`);
    this.tagged = null;
  }

  onClose(): void {
    this.chrome?.destroy(); this.chrome = null;
    this.form?.destroy();
    this.form = null;
    this.contentEl.empty();
    this.onClosed?.();
  }
}

/** Suggests one property name or chip value at a time, while allowing new values. */
class ListSuggest extends AbstractInputSuggest<string> {
  constructor(
    app: App,
    private input: HTMLInputElement,
    private items: () => string[],
  ) {
    super(app, input);
    this.limit = 50;
  }

  protected getSuggestions(query: string): string[] {
    const current = query.trim().toLowerCase();
    return this.items()
      .filter((item) => item.toLowerCase().includes(current))
      .slice(0, this.limit);
  }

  renderSuggestion(value: string, el: HTMLElement): void {
    el.setText(value);
  }

  selectSuggestion(value: string): void {
    this.input.value = value;
    this.input.dispatchEvent(new Event('input'));
    this.close();
    this.input.dispatchEvent(new Event('change'));
  }
}

/** Every front matter key in the vault, with its distinct values, sorted case-insensitively. */
function collectProperties(app: App): Map<string, string[]> {
  const byKey = new Map<string, Set<string>>();
  for (const file of app.vault.getMarkdownFiles()) {
    const fm = app.metadataCache.getFileCache(file)?.frontmatter;
    if (!fm) continue;
    for (const [key, raw] of Object.entries(fm)) {
      if (key === 'position') continue;
      const values = byKey.get(key) ?? new Set<string>();
      for (const v of propertyValueStrings(raw)) values.add(v);
      byKey.set(key, values);
    }
  }
  const compare = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });
  return new Map([...byKey.keys()].sort(compare).map((key) => [key, [...byKey.get(key)!].sort(compare)]));
}
