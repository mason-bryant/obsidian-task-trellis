import { uiElement } from '../ui/dom.ts';
import { destinationAdvice } from '../core/setup.ts';
import { prepareEditorModal } from '../ui/editorHeader.ts';
import { AbstractInputSuggest, Modal, setIcon, TextComponent, DropdownComponent, type App, type TFile } from 'obsidian';
import { parseBoardConfig, type BoardConfig } from '../core/boardConfig.ts';
import { draftChanged, draftFromConfig, draftToFrontmatter, type BoardDraft } from '../core/boardDraft.ts';
import { propertyValueStrings } from '../core/filters.ts';
import { renderBoardSettings, type SettingsForm, type Section } from '../ui/renderBoardSettings.ts';
import type TaskTrellisPlugin from '../../main.ts';
import { noteTags } from './noteTags.ts';
import { notice } from './notice.ts';
import { shortcutURL } from '../core/shortcut.ts';
import { DeleteBoardModal } from './DeleteBoardModal.ts';

/**
 * Edits a board note’s settings as a form instead of raw front matter.
 * Save validates and persists the draft; Cancel, Escape and the close button discard it.
 */
export class BoardSettingsModal extends Modal {
  private chrome: ReturnType<typeof prepareEditorModal> | null = null;
  private draft: BoardDraft;
  private form: SettingsForm | null = null;
  private saving = false;

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

  close(): void {
    if (!this.saving) super.close();
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
      this.close();
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
    const slug = this.config.slug;
    const tagged = new Map<string, number>();
    for (const task of this.plugin.index.all()) {
      const column = task.placements[slug]?.column;
      if (column) tagged.set(column, (tagged.get(column) ?? 0) + 1);
    }

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
      countTagged: (columnId) => tagged.get(columnId) ?? 0,
      onDiscard: () => this.close(),
      onSave: () => void this.save(),
      onDeleteBoard: () => {
        const tagged = this.plugin.index.all().filter((task) => task.placements[this.config.slug]).length;
        new DeleteBoardModal(this.app, this.file, tagged, () => this.close()).open();
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
