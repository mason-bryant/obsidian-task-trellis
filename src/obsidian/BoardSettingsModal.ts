import { AbstractInputSuggest, Modal, setIcon, type App, type TFile } from 'obsidian';
import type { BoardConfig } from '../core/boardConfig.ts';
import { draftChanged, draftFromConfig, draftToFrontmatter, type BoardDraft } from '../core/boardDraft.ts';
import { propertyValueStrings } from '../core/filters.ts';
import { renderBoardSettings, type SettingsForm } from '../ui/renderBoardSettings.ts';
import type TaskTrellisPlugin from '../../main.ts';

/**
 * Edits a board note's settings as a form instead of raw front matter. Saves on close, however it
 * is closed; a draft with errors keeps the modal open until it is fixed or discarded.
 */
export class BoardSettingsModal extends Modal {
  private draft: BoardDraft;
  private form: SettingsForm | null = null;
  private discard = false;
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
    if (!this.discard) {
      const { errors } = draftToFrontmatter(this.draft, this.config);
      if (errors.length > 0) {
        this.afterClose = null;
        this.form?.showErrors(errors);
        return;
      }
      if (draftChanged(this.draft, this.config)) {
        void this.plugin.saveBoardSettings(this.file, this.config, this.draft);
      }
    }
    super.close();
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

    this.form = renderBoardSettings(this.contentEl, this.draft, this.config, {
      icon: (el, name) => setIcon(el, name),
      attachKeySuggest: (input) => {
        new ListSuggest(this.app, input, () => [...properties.keys()], false);
      },
      attachValueSuggest: (input, key) => {
        new ListSuggest(this.app, input, () => [...(properties.get(key()) ?? [])], true);
      },
      countTagged: (columnId) => tagged.get(columnId) ?? 0,
      onDiscard: () => {
        this.discard = true;
        this.close();
      },
      onOpenNote: () => {
        this.afterClose = () => void this.plugin.openNoteBesideBoard(this.file);
        this.close();
      },
    });
  }

  onClose(): void {
    this.contentEl.empty();
    this.afterClose?.();
  }
}

/**
 * Suggests from a fixed list. With `commaList`, the input holds comma-separated values and
 * suggestions complete the last one.
 */
class ListSuggest extends AbstractInputSuggest<string> {
  constructor(
    app: App,
    private input: HTMLInputElement,
    private items: () => string[],
    private commaList: boolean,
  ) {
    super(app, input);
    this.limit = 50;
  }

  protected getSuggestions(query: string): string[] {
    const parts = this.commaList ? query.split(',').map((p) => p.trim()) : [query.trim()];
    const current = (parts.pop() ?? '').toLowerCase();
    const taken = new Set(parts.map((p) => p.toLowerCase()));
    return this.items()
      .filter((item) => !taken.has(item.toLowerCase()) && item.toLowerCase().includes(current))
      .slice(0, this.limit);
  }

  renderSuggestion(value: string, el: HTMLElement): void {
    el.setText(value);
  }

  selectSuggestion(value: string): void {
    if (this.commaList) {
      const parts = this.input.value.split(',').map((p) => p.trim());
      parts.pop();
      this.input.value = [...parts.filter(Boolean), value].join(', ');
    } else {
      this.input.value = value;
    }
    this.input.dispatchEvent(new Event('input'));
    this.close();
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
