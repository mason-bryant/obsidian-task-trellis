import { uiElement } from './dom.ts';
import { applyLabelScheme, LABEL_SCHEMES, type LabelSchemeState, type PreviousScheme } from '../core/labelSchemes.ts';
import { renderEditorHeader, type EditorHeader } from './editorHeader.ts';
import { LABEL_COLORS, newLabelId, labelDescription, labelTextColor, normalizeLabelColor, type BoardLabel } from '../core/labels.ts';

export type LabelPickerHost = {
  header?: HTMLElement;
  showSearch?: boolean;
  previousScheme?: PreviousScheme;
  saveScheme?(id: string): Promise<LabelSchemeState>;
  onClose?(): void;
  onBusyChange?(busy: boolean): void;
  icon(el: HTMLElement, name: string): void;
  saveSelection(ids: string[]): Promise<void>;
  /** The board's `label-next` counter, for numbering a new label. */
  labelNext?: number;
  /** Returns the current board palette after saving just this definition, which may renumber a new label. */
  saveLabel(label: BoardLabel): Promise<BoardLabel[]>;
};

/** Shared picker/editor used by the native Obsidian modal and browser preview. */
export function renderLabelPicker(root: HTMLElement, initial: BoardLabel[], assigned: string[], host: LabelPickerHost): void {
  let labels = initial.map((l) => ({ ...l }));
  let selected = [...assigned];
  let previous = { ...host.previousScheme };
  let query = '';
  let busy = false;
  let header: EditorHeader;
  const headerSlot = host.header ?? uiElement(root.ownerDocument, 'div');
  root.classList.add('tt-label-picker');
  root.dataset.ignoreSwipe = 'true';
  const node = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => {
    const el = uiElement(root.ownerDocument, tag); el.className = cls; el.textContent = text; return el;
  };
  const button = (text: string, cls = '') => { const b = node('button', cls, text); b.type = 'button'; return b; };
  const error = node('p', 'tt-label-error'); error.setAttribute('role', 'alert'); error.hidden = true;
  async function save(action: () => Promise<void>): Promise<void> {
    if (busy) return;
    busy = true; host.onBusyChange?.(true); error.hidden = true;
    const controls = [...root.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button')];
    const disabled = controls.map((c) => c.disabled);
    header.setBusy(true);
    controls.forEach((c) => { c.disabled = true; }); root.setAttribute('aria-busy', 'true');
    try { await action(); }
    catch (e) { error.textContent = e instanceof Error ? e.message : 'Could not save labels. Please try again.'; error.hidden = false; }
    finally { busy = false; host.onBusyChange?.(false); header.setBusy(false); controls.forEach((c, i) => { c.disabled = disabled[i]!; }); root.removeAttribute('aria-busy'); }
  }
  function picker(focusId?: string): void {
    root.replaceChildren(); if (!host.header) root.append(headerSlot); error.hidden = true;
    header = renderEditorHeader(headerSlot, 'Labels', (el, name) => host.icon(el, name), null, () => host.onClose?.());
    const search = node('input', 'tt-label-search'); search.type = 'search'; search.placeholder = 'Search labels…';
    search.setAttribute('aria-label', 'Search labels'); search.value = query;
    const list = node('div', 'tt-label-list');
    const create = button('', 'tt-add-button tt-label-create');
    const addIcon = node('span', 'tt-add-icon'); addIcon.setAttribute('aria-hidden', 'true');
    host.icon(addIcon, 'plus');
    create.append(addIcon, node('span', '', 'Add Label'));
    create.onclick = () => editor({ id: newLabelId(labels, host.labelNext), name: '', color: LABEL_COLORS[0].color });
    if (host.showSearch) root.append(search);
    root.append(list, create);
    if (host.saveScheme) {
      const schemes = button('Color scheme', 'tt-label-schemes-button');
      schemes.onclick = () => schemePicker(); root.append(schemes);
    }
    root.append(error);
    function rows(): void {
      list.replaceChildren();
      for (const label of labels.filter((l) => labelDescription(l).toLowerCase().includes(query.toLowerCase()))) {
        const row = node('div', 'tt-label-row');
        const choice = node('label', 'tt-label-choice');
        const check = node('input'); check.type = 'checkbox'; check.checked = selected.includes(label.id);
        check.dataset.labelId = label.id; check.setAttribute('aria-label', labelDescription(label));
        const swatch = node('span', 'tt-label-swatch', label.name);
        swatch.style.backgroundColor = label.color; swatch.style.color = labelTextColor(label.color);
        swatch.title = labelDescription(label);
        choice.append(check, swatch);
        check.onchange = () => {
          const checked = check.checked;
          void save(async () => {
            const next = checked ? [...selected, label.id] : selected.filter((id) => id !== label.id);
            try { await host.saveSelection(next); selected = next; }
            catch (e) { check.checked = selected.includes(label.id); throw e; }
          });
        };
        const edit = button('', 'clickable-icon tt-label-edit'); edit.setAttribute('aria-label', `Edit ${labelDescription(label)}`);
        host.icon(edit, 'pencil');
        edit.onclick = () => editor(label);
        row.append(choice, edit); list.append(row);
      }
      if (!list.childElementCount) list.append(node('p', 'tt-label-empty', 'No matching labels.'));
    }
    search.oninput = () => { query = search.value; rows(); };
    rows();
    const check = [...list.querySelectorAll<HTMLInputElement>('input')].find((c) => c.dataset.labelId === focusId);
    if (focusId) (check ?? (host.showSearch ? search : create)).focus();
  }
  function schemePicker(): void {
    root.replaceChildren(); if (!host.header) root.append(headerSlot); error.hidden = true;
    let chosen: string | null = null;
    const options = node('div', 'tt-scheme-options');
    options.setAttribute('role', 'group'); options.setAttribute('aria-label', 'Available color schemes');
    const preview = node('div', 'tt-scheme-preview'); preview.setAttribute('aria-live', 'polite');
    const drawPreview = (palette: BoardLabel[]) => {
      preview.replaceChildren();
      for (const label of palette) {
        const swatch = node('div', 'tt-label-swatch', label.name || labelDescription(label));
        swatch.style.backgroundColor = label.color; swatch.style.color = labelTextColor(label.color);
        preview.append(swatch);
      }
    };
    header = renderEditorHeader(headerSlot, 'Color scheme', (el, name) => host.icon(el, name), () => {
      if (!chosen) return;
      const id = chosen;
      void save(async () => {
        const result = await host.saveScheme!(id);
        labels = result.labels; previous = result.previous;
        picker(); root.querySelector<HTMLButtonElement>('.tt-label-schemes-button')?.focus();
      });
    }, () => { picker(); root.querySelector<HTMLButtonElement>('.tt-label-schemes-button')?.focus(); }, 'Apply color scheme');
    const confirm = headerSlot.querySelector<HTMLButtonElement>('.tt-editor-save')!;
    confirm.disabled = true;
    const choices = [{ id: 'previous', name: 'Previous scheme', colors: labels.map((l) => Object.prototype.hasOwnProperty.call(previous, l.id) ? previous[l.id]! : l.color) }, ...LABEL_SCHEMES];
    for (const scheme of choices) {
      const choice = button('', 'tt-scheme-choice');
      choice.setAttribute('aria-pressed', 'false'); choice.setAttribute('aria-label', scheme.name);
      choice.disabled = !labels.length || (scheme.id === 'previous' && !labels.some((l) => Object.prototype.hasOwnProperty.call(previous, l.id)));
      const strip = node('span', 'tt-scheme-swatches'); strip.setAttribute('aria-hidden', 'true');
      for (const color of scheme.colors) { const swatch = node('span'); swatch.style.backgroundColor = color; strip.append(swatch); }
      choice.append(node('span', '', scheme.name), strip);
      choice.onclick = () => {
        chosen = scheme.id; confirm.disabled = false;
        options.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === choice)));
        drawPreview(applyLabelScheme({ labels, previous }, chosen).labels);
      };
      options.append(choice);
    }
    root.append(options, node('p', 'tt-label-help', 'Preview your labels below. Apply with the green checkmark. Names and task assignments stay the same.'));
    if (labels.length > 6) root.append(node('p', 'tt-label-help', 'Scheme colors repeat after every six labels.'));
    root.append(preview, error); drawPreview(labels);
    options.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }
  function editor(label: BoardLabel): void {
    root.replaceChildren(); if (!host.header) root.append(headerSlot); error.hidden = true;
    const form = node('form', 'tt-label-editor');
    const nameField = node('label', 'tt-label-field', 'Label name');
    const name = node('input'); name.type = 'text'; name.value = label.name; name.placeholder = 'Optional';
    nameField.append(name);
    const preview = node('div', 'tt-label-swatch tt-label-preview', label.name || 'Label preview');
    let color = label.color;
    const swatches = node('div', 'tt-label-colors'); swatches.setAttribute('role', 'group'); swatches.setAttribute('aria-label', 'Color swatches');
    const hexField = node('label', 'tt-label-field', 'HTML color code');
    const hex = node('input'); hex.type = 'text'; hex.value = color.toUpperCase();
    hex.placeholder = '#AABBCC';
    hex.autocomplete = 'off'; hex.spellcheck = false; hexField.append(hex);
    function update(): void {
      preview.textContent = name.value.trim() || 'Label preview';
      preview.style.backgroundColor = color; preview.style.color = labelTextColor(color);
      for (const b of swatches.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.color === color));
    }
    for (const swatch of LABEL_COLORS) {
      const b = button('', 'tt-label-color'); b.style.backgroundColor = swatch.color;
      b.setAttribute('aria-label', swatch.name); b.dataset.color = swatch.color;
      b.onclick = () => { color = swatch.color; hex.value = color.toUpperCase(); hex.setCustomValidity(''); update(); };
      swatches.append(b);
    }
    name.oninput = update;
    hex.oninput = () => {
      const next = normalizeLabelColor(hex.value);
      hex.setCustomValidity(next ? '' : 'Enter a hex color such as #AABBCC or #ABC.');
      if (next) { color = next; update(); }
    };
    header = renderEditorHeader(headerSlot, 'Edit label', (el, name) => host.icon(el, name), () => form.requestSubmit(), () => picker(label.id), 'Save label');
    form.append(preview, nameField, node('div', 'tt-label-field', 'Color'), swatches, hexField,
      node('p', 'tt-label-help', 'Changes apply to every task using this label on this board.'),
      node('p', 'tt-label-help', `Permanent tag ID: ${label.id}`));
    form.onsubmit = (e) => {
      e.preventDefault();
      const next = normalizeLabelColor(hex.value);
      if (!next) { hex.reportValidity(); return; }
      void save(async () => { labels = await host.saveLabel({ id: label.id, name: name.value.trim(), color: next });
        picker(labels.some((l) => l.id === label.id) ? label.id : labels[labels.length - 1]?.id); });
    };
    root.append(form, error); update(); name.focus();
  }
  picker();
}
