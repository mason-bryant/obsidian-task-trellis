import { prepareEditorModal } from '../ui/editorHeader.ts';
import { Modal, setIcon, type App, type TFile } from 'obsidian';
import { FM, type BoardConfig } from '../core/boardConfig.ts';
import { applyLabelScheme, parsePreviousScheme, type LabelSchemeState } from '../core/labelSchemes.ts';
import { parseLabels, saveLabelDefinition, type BoardLabel } from '../core/labels.ts';
import { renderLabelPicker, type LabelPickerHost } from '../ui/renderLabelPicker.ts';

export class LabelPickerModal extends Modal {
  private saving = false;
  private chrome: ReturnType<typeof prepareEditorModal> | null = null;

  constructor(app: App, private labels: BoardLabel[], private selected: string[], private host: LabelPickerHost) {
    super(app);
  }

  close(): void { if (!this.saving) super.close(); }

  onOpen(): void {
    this.setTitle('Labels');
    this.modalEl.addClass('tt-label-modal');
    this.chrome = prepareEditorModal(this.modalEl);
    renderLabelPicker(this.contentEl, this.labels, this.selected, { ...this.host, header: this.chrome.header, onClose: () => this.close(), onBusyChange: (busy) => { this.saving = busy; } });
  }

  onClose(): void { this.chrome?.destroy(); this.chrome = null; this.contentEl.empty(); this.host.onClose?.(); }
}

/**
 * The picker's palette edits for the board in `file`: a color scheme, or one label's definition,
 * each read and written in the board note's front matter. `saved` runs after each write.
 */
export function boardPalette(app: App, file: TFile, saved: () => void): Pick<LabelPickerHost, 'saveScheme' | 'saveLabel'> {
  return {
    saveScheme: async (id) => {
      let updated!: LabelSchemeState;
      await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
        const current = { labels: parseLabels(fm[FM.labels], []), previous: parsePreviousScheme(fm[FM.previousLabelScheme]) };
        updated = applyLabelScheme(current, id);
        if (updated !== current) {
          fm[FM.labels] = updated.labels;
          fm[FM.previousLabelScheme] = updated.previous;
        }
      });
      saved();
      return updated;
    },
    saveLabel: async (label, intent) => {
      let result = { labels: [] as BoardLabel[], savedId: label.id, next: 1 };
      await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
        const palette = parseLabels(fm[FM.labels], []);
        const stored = fm[FM.labelNext];
        const counter = typeof stored === 'number' && Number.isSafeInteger(stored) && stored > 0 ? stored : 1;
        result = saveLabelDefinition(palette, label, intent, counter);
        fm[FM.labels] = result.labels;
        if (intent === 'create') fm[FM.labelNext] = result.next;
      });
      saved();
      return result;
    },
  };
}

/**
 * Picks labels for a task still in its composer: choosing changes only the draft, through `choose`.
 * Adding or editing a label, or applying a color scheme, still saves the board's palette.
 */
export function pickComposerLabels(app: App, board: { file: TFile; config: BoardConfig }, showSearch: boolean,
  selected: string[], choose: (ids: string[]) => void, onClose: () => void, saved: () => void = () => undefined): void {
  const { config } = board;
  new LabelPickerModal(app, config.labels, selected, {
    showSearch,
    labelNext: config.labelNext,
    previousScheme: config.previousLabelScheme,
    ...boardPalette(app, board.file, saved),
    icon: (el, name) => setIcon(el, name),
    saveSelection: async (ids) => choose(ids),
    onClose,
  }).open();
}
