import { AbstractInputSuggest, Modal, Notice, setIcon, type App, type TFile } from 'obsidian';
import type { BoardConfig } from '../core/boardConfig.ts';
import { draftChanged, draftFromConfig, draftToFrontmatter, type BoardDraft } from '../core/boardDraft.ts';
import { propertyValueStrings } from '../core/filters.ts';
import { renderBoardSettings, type SettingsForm } from '../ui/renderBoardSettings.ts';
import type TaskTrellisPlugin from '../../main.ts';

/**
 * Edits a board note’s settings as a form instead of raw front matter.
 * Save validates and persists the draft; Cancel, Escape and the close button discard it.
 */
export class BoardSettingsModal extends Modal {
  private draft: BoardDraft;
  private form: SettingsForm | null = null;
  private saving = false;
  private afterClose: (() => void) | null = null;

  constructor(
    app: App,
    private plugin: TaskTrellisPlugin,
    private file: TFile,
    private config: BoardConfig,
  ) {
    super(app);
    this.draft = draftFromConfig(config);
  }

  close(): void {
    if (!this.saving) super.close();
  }

  private async save(openNote = false): Promise<void> {
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
      if (openNote) this.afterClose = () => void this.plugin.openNoteBesideBoard(this.file);
      this.saving = false;
      this.close();
    } catch (error) {
      console.error('[Task Trellis] settings save failed', error);
      new Notice('Task Trellis: could not save board settings. Your draft is still open.');
    } finally {
      this.saving = false;
      this.form?.setSaving(false);
    }
  }

  onOpen(): void {
    this.setTitle(`${this.file.basename} board settings`);
    this.modalEl.addClass('tt-settings-modal');
    const properties = collectProperties(this.app);
    const slug = this.config.slug;
    const tagged = new Map<string, number>();
    for (const task of this.plugin.index.all()) {
      const column = task.placements[slug]?.column;
      if (column) tagged.set(column, (tagged.get(column) ?? 0) + 1);
    }

    const tags = [...new Set(this.plugin.index.all().flatMap((task) => task.tags))].sort();
    const folders = [...new Set(this.app.vault.getMarkdownFiles().filter((file) => !this.plugin.isExcludedFromIndex(file.path)).flatMap((file) => {
      const parts = file.path.split('/').slice(0, -1);
      return parts.map((_, i) => parts.slice(0, i + 1).join('/'));
    }))].sort();
    const suggest = (input: HTMLInputElement, items: () => string[]) => {
      const suggestion = new ListSuggest(this.app, input, items);
      return () => suggestion.close();
    };
    this.form = renderBoardSettings(this.contentEl, this.draft, this.config, {
      icon: (el, name) => setIcon(el, name),
      attachKeySuggest: (input) => suggest(input, () => [...properties.keys()]),
      attachValueSuggest: (input, key) => suggest(input, () => [...(properties.get(key()) ?? [])]),
      attachTagSuggest: (input) => suggest(input, () => tags),
      attachFolderSuggest: (input) => suggest(input, () => folders),
      countTagged: (columnId) => tagged.get(columnId) ?? 0,
      onDiscard: () => this.close(),
      onSave: () => void this.save(),
      onOpenNote: () => void this.save(true),
    });
  }

  onClose(): void {
    this.form?.destroy();
    this.form = null;
    this.contentEl.empty();
    this.afterClose?.();
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
