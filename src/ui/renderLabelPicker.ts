import { LABEL_COLORS, labelDescription, labelTextColor, normalizeLabelColor, type BoardLabel } from '../core/labels.ts';

export type LabelPickerHost = {
  icon(el: HTMLElement, name: string): void;
  saveSelection(ids: string[]): Promise<void>;
  /** Returns the current board palette after saving just this definition. */
  saveLabel(label: BoardLabel): Promise<BoardLabel[]>;
};

/** Shared picker/editor used by the native Obsidian modal and browser preview. */
export function renderLabelPicker(root: HTMLElement, initial: BoardLabel[], assigned: string[], host: LabelPickerHost): void {
  let labels = initial.map((l) => ({ ...l }));
  let selected = [...assigned];
  let query = '';
  let busy = false;
  root.classList.add('tt-label-picker');
  root.dataset.ignoreSwipe = 'true';
  const node = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => {
    const el = root.ownerDocument.createElement(tag); el.className = cls; el.textContent = text; return el;
  };
  const button = (text: string, cls = '') => { const b = node('button', cls, text); b.type = 'button'; return b; };
  const error = node('p', 'tt-label-error'); error.setAttribute('role', 'alert'); error.hidden = true;
  async function save(action: () => Promise<void>): Promise<void> {
    if (busy) return;
    busy = true; error.hidden = true;
    const controls = [...root.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button')];
    controls.forEach((c) => { c.disabled = true; }); root.setAttribute('aria-busy', 'true');
    try { await action(); }
    catch (e) { error.textContent = e instanceof Error ? e.message : 'Could not save labels. Please try again.'; error.hidden = false; }
    finally { busy = false; controls.forEach((c) => { c.disabled = false; }); root.removeAttribute('aria-busy'); }
  }
  function picker(focusId?: string): void {
    root.replaceChildren(); error.hidden = true;
    const search = node('input', 'tt-label-search'); search.type = 'search'; search.placeholder = 'Search labels…';
    search.setAttribute('aria-label', 'Search labels'); search.value = query;
    const list = node('div', 'tt-label-list');
    const create = button('Create a new label', 'tt-label-create');
    create.onclick = () => editor({ id: `label-${crypto.randomUUID()}`, name: '', color: LABEL_COLORS[0].color });
    root.append(search, list, create, error);
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
        const edit = button('', 'clickable-icon tt-label-edit'); edit.title = `Edit ${labelDescription(label)}`;
        edit.setAttribute('aria-label', edit.title); host.icon(edit, 'pencil');
        edit.onclick = () => editor(label);
        row.append(choice, edit); list.append(row);
      }
      if (!list.childElementCount) list.append(node('p', 'tt-label-empty', 'No matching labels.'));
    }
    search.oninput = () => { query = search.value; rows(); };
    rows();
    const check = [...list.querySelectorAll<HTMLInputElement>('input')].find((c) => c.dataset.labelId === focusId);
    if (focusId) (check ?? search).focus();
  }
  function editor(label: BoardLabel): void {
    root.replaceChildren(); error.hidden = true;
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
      b.title = swatch.name; b.setAttribute('aria-label', swatch.name); b.dataset.color = swatch.color;
      b.onclick = () => { color = swatch.color; hex.value = color.toUpperCase(); hex.setCustomValidity(''); update(); };
      swatches.append(b);
    }
    name.oninput = update;
    hex.oninput = () => {
      const next = normalizeLabelColor(hex.value);
      hex.setCustomValidity(next ? '' : 'Enter a hex color such as #AABBCC or #ABC.');
      if (next) { color = next; update(); }
    };
    const actions = node('div', 'tt-label-editor-actions');
    const cancel = button('Cancel'); cancel.onclick = () => picker(label.id);
    const submit = button('Save label', 'mod-cta'); submit.type = 'submit';
    actions.append(cancel, submit);
    form.append(preview, nameField, node('div', 'tt-label-field', 'Color'), swatches, hexField,
      node('p', 'tt-label-help', 'Changes apply to every task using this label on this board.'), actions);
    form.onsubmit = (e) => {
      e.preventDefault();
      const next = normalizeLabelColor(hex.value);
      if (!next) { hex.reportValidity(); return; }
      void save(async () => { labels = await host.saveLabel({ id: label.id, name: name.value.trim(), color: next }); picker(label.id); });
    };
    root.append(form, error); update(); name.focus();
  }
  picker();
}
