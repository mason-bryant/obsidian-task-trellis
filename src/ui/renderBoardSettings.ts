import type { BoardConfig } from '../core/boardConfig.ts';
import { convertDueNow, WEEKDAY_NAMES, type BoardDraft } from '../core/boardDraft.ts';
import { slugify } from '../core/taskLine.ts';

/** What the settings form needs from its host (the Obsidian modal, or the dev harness). */
export type SettingsFormHost = {
  icon(el: HTMLElement, name: string): void;
  attachKeySuggest(input: HTMLInputElement): void;
  attachValueSuggest(input: HTMLInputElement, key: () => string): void;
  /** Tasks whose placement tag on this board names `columnId`. */
  countTagged(columnId: string): number;
  /** Close without saving, offered when the draft has errors. */
  onDiscard(): void;
  onOpenNote(): void;
};

export type SettingsForm = {
  /** Shows why the draft can't be saved; an empty list clears them. */
  showErrors(errors: string[]): void;
};

/**
 * Board settings as a form, written with Obsidian's setting classes so it matches the app.
 * Plain DOM so the harness can render it; typing updates the draft, structural edits redraw.
 * There is no Save button: the host saves the draft when it closes, as Obsidian settings do.
 */
export function renderBoardSettings(
  root: HTMLElement,
  draft: BoardDraft,
  original: BoardConfig,
  host: SettingsFormHost,
): SettingsForm {
  let errors: string[] = [];
  let focusAfterDraw: string | null = null;

  const draw = () => {
    root.replaceChildren();
    root.classList.add('tt-settings');

    heading(root, 'Columns', 'Left to right. Renaming a column retags its tasks on this board.');
    const list = el('div', 'tt-settings-columns');
    draft.columns.forEach((column, i) => list.append(columnRow(column, i)));
    root.append(list);
    const removed = original.columns.filter((c) => !draft.columns.some((d) => d.originalId === c.id));
    for (const c of removed) {
      const n = host.countTagged(c.id);
      if (n > 0) list.append(el('div', 'tt-settings-hint', `Removing ${c.label}: its ${plural(n, 'task')} will show in the first column.`));
    }
    const addColumn = addButton('Add column');
    addColumn.addEventListener('click', () => {
      draft.columns.push({ label: '' });
      focusAfterDraw = `column-${draft.columns.length - 1}`;
      draw();
    });
    root.append(addColumn);

    const done = select(
      [{ value: '-1', label: 'None' }, ...draft.columns.map((c, i) => ({ value: String(i), label: c.label || '(unnamed)' }))],
      String(draft.doneIndex),
      (v) => (draft.doneIndex = Number(v)),
    );
    setting(root, 'Done column', 'Dropping a card here completes it, and completed tasks always show here.', done);

    const limitWrap = el('div', 'tt-settings-number');
    const limitNumber = numberInput(draft.doneLimit, 'cards', (v) => (draft.doneLimit = v));
    const limitInput = limitNumber.querySelector('input')!;
    limitInput.min = '1';
    limitInput.disabled = !draft.limitDone;
    limitWrap.append(
      toggle(draft.limitDone, (on) => {
        draft.limitDone = on;
        limitInput.disabled = !on;
      }),
      limitNumber,
    );
    setting(root, 'Limit completed cards', 'Most recently completed first, this many per row of the Done column. The rest are behind “more”.', limitWrap);

    const undated = select(
      [{ value: '-1', label: 'None: use a No due date row' }, ...draft.columns.map((c, i) => ({ value: String(i), label: c.label || '(unnamed)' }))],
      String(draft.undatedIndex),
      (v) => {
        draft.undatedIndex = Number(v);
        draw();
      },
    );
    setting(
      root,
      'No due date column',
      'Open tasks without a due date show here, down the side of the board, instead of in a row across it. Dropping a card here removes its due date.',
      undated,
    );
    if (draft.undatedIndex >= 0) {
      const undatedWrap = el('div', 'tt-settings-number');
      const undatedNumber = numberInput(draft.undatedLimit, 'cards', (v) => (draft.undatedLimit = v));
      const undatedInput = undatedNumber.querySelector('input')!;
      undatedInput.min = '1';
      undatedInput.disabled = !draft.limitUndated;
      undatedWrap.append(
        toggle(draft.limitUndated, (on) => {
          draft.limitUndated = on;
          undatedInput.disabled = !on;
        }),
        undatedNumber,
      );
      setting(root, 'Limit cards without a due date', 'This many show in the No due date column, in board order. The rest are behind “more”.', undatedWrap);
    }

    heading(root, 'Rows');
    const windowWrap = el('div', 'tt-settings-number');
    const windowNumber = numberInput(draft.dueNow, '', (v) => (draft.dueNow = v));
    windowNumber.querySelector('.tt-settings-unit')?.remove();
    windowWrap.append(
      windowNumber,
      select(
        [
          { value: 'days', label: 'days' },
          { value: 'weeks', label: 'weeks' },
        ],
        draft.dueNowUnit,
        (v) => {
          const unit = v === 'weeks' ? 'weeks' : 'days';
          draft.dueNow = convertDueNow(draft.dueNow, unit);
          draft.dueNowUnit = unit;
          draw();
        },
      ),
    );
    setting(
      root,
      'Due now window',
      draft.dueNowUnit === 'weeks'
        ? 'Overdue tasks and tasks due by the end of this week (1), next week (2), and so on.'
        : 'Overdue tasks and tasks due within this many days of today.',
      windowWrap,
    );
    setting(root, 'Week rows', 'One row per week after Due now. Anything later goes in Later.', numberInput(draft.weekHorizon, 'weeks', (v) => (draft.weekHorizon = v)));
    setting(
      root,
      'Weeks start on',
      'Dropping a card in a week row sets its due date to this day.',
      select(
        WEEKDAY_NAMES.map((name, i) => ({ value: String(i), label: name })),
        String(draft.weekStart),
        (v) => (draft.weekStart = Number(v)),
      ),
    );
    setting(root, 'Show completed tasks for', 'Days after the done date. 0 hides completed tasks.', numberInput(draft.showCompletedDays, 'days', (v) => (draft.showCompletedDays = v)));

    heading(root, 'Filters', 'A task shows only if its note matches every property filter. Values are alternatives; leave them empty to only require the property.');
    const filters = el('div', 'tt-settings-filters');
    draft.filters.forEach((f, i) => filters.append(filterRow(f, i)));
    root.append(filters);
    const addFilter = addButton('Add property filter');
    addFilter.addEventListener('click', () => {
      draft.filters.push({ key: '', values: '' });
      focusAfterDraw = `filter-${draft.filters.length - 1}`;
      draw();
    });
    root.append(addFilter);

    setting(root, 'Include tags', 'Comma-separated. A task needs one of these tags; nested tags count.', textInput(draft.includeTags, 'e.g. house, project/kitchen', (v) => (draft.includeTags = v)));
    setting(root, 'Exclude tags', 'Comma-separated. Tasks with any of these tags are left out.', textInput(draft.excludeTags, 'e.g. someday', (v) => (draft.excludeTags = v)));
    setting(root, 'Include folders', 'One per line. When set, only notes in these folders.', textArea(draft.includeFolders, 'e.g. Projects', (v) => (draft.includeFolders = v)));
    setting(root, 'Exclude folders', 'One per line.', textArea(draft.excludeFolders, 'e.g. Archive', (v) => (draft.excludeFolders = v)));

    heading(root, 'New tasks', 'Where “Add task” on this board writes new tasks.');
    setting(
      root,
      'Add new tasks to',
      draft.newTasks === 'default' ? 'The plugin setting, under Settings → Task Trellis.' : '',
      select(
        [
          { value: 'default', label: 'Plugin default' },
          { value: 'daily', label: "Today's daily note" },
          { value: 'note', label: 'A specific note' },
        ],
        draft.newTasks,
        (v) => {
          draft.newTasks = v === 'daily' || v === 'note' ? v : 'default';
          draw();
        },
      ),
    );
    if (draft.newTasks === 'note') {
      setting(root, 'Note', 'Path of the note, created if it does not exist.', textInput(draft.newTasksNote, 'e.g. Inbox.md', (v) => (draft.newTasksNote = v)));
    }
    if (draft.newTasks !== 'default') {
      setting(
        root,
        'Under heading',
        'New tasks go at the end of this section, added if missing. Empty adds to the end of the note.',
        textInput(draft.newTasksHeading, 'e.g. ## Tasks', (v) => (draft.newTasksHeading = v)),
      );
    }

    heading(root, 'Board');
    const slug = el('code', 'tt-settings-slug', original.slug);
    setting(root, 'Slug', 'Used in this board’s tags (#tt/<slug>/…) and its hotkey command. Set when the board was created.', slug);

    if (errors.length > 0) {
      const box = el('div', 'tt-settings-errors');
      box.append(el('div', 'tt-settings-errors-title', 'Fix these to save, or discard your changes:'));
      for (const e of errors) box.append(el('div', '', e));
      const discard = button('Discard changes', 'mod-warning');
      discard.addEventListener('click', () => host.onDiscard());
      box.append(discard);
      root.append(box);
    }

    const footer = el('div', 'modal-button-container tt-settings-footer');
    const openNote = button('Open note', 'tt-settings-open-note');
    openNote.addEventListener('click', () => host.onOpenNote());
    footer.append(el('span', 'tt-settings-autosave', 'Changes are saved when you close this window.'), openNote);
    root.append(footer);

    root.querySelector('.tt-settings-errors')?.scrollIntoView({ block: 'nearest' });
    if (focusAfterDraw) {
      root.querySelector<HTMLInputElement>(`[data-focus="${focusAfterDraw}"]`)?.focus();
      focusAfterDraw = null;
    }
  };

  const columnRow = (column: BoardDraft['columns'][number], i: number) => {
    const row = el('div', 'tt-settings-row');
    const input = el('input', 'tt-settings-column-input');
    input.type = 'text';
    input.value = column.label;
    input.placeholder = 'Column name';
    input.dataset.focus = `column-${i}`;
    input.addEventListener('input', () => (column.label = input.value));
    // Redraw on commit so the Done menu and rename hints catch up without stealing focus mid-word.
    input.addEventListener('change', () => draw());
    row.append(input);

    const newId = slugify(column.label);
    if (column.originalId && newId && newId !== column.originalId) {
      const n = host.countTagged(column.originalId);
      row.append(el('span', 'tt-settings-hint', n > 0 ? `retags ${plural(n, 'task')}` : 'renamed'));
    }
    if (i === draft.doneIndex) row.append(el('span', 'tt-settings-badge', 'Done'));
    if (i === draft.undatedIndex) row.append(el('span', 'tt-settings-badge', 'No due date'));

    row.append(
      iconButton('arrow-up', 'Move up', i === 0, () => move(i, i - 1)),
      iconButton('arrow-down', 'Move down', i === draft.columns.length - 1, () => move(i, i + 1)),
      iconButton('x', 'Remove column', draft.columns.length === 1, () => {
        draft.columns.splice(i, 1);
        const shift = (at: number) => (at === i ? -1 : at > i ? at - 1 : at);
        draft.doneIndex = shift(draft.doneIndex);
        draft.undatedIndex = shift(draft.undatedIndex);
        draw();
      }),
    );
    return row;
  };

  const move = (from: number, to: number) => {
    const [column] = draft.columns.splice(from, 1);
    if (!column) return;
    draft.columns.splice(to, 0, column);
    const swap = (at: number) => (at === from ? to : at === to ? from : at);
    draft.doneIndex = swap(draft.doneIndex);
    draft.undatedIndex = swap(draft.undatedIndex);
    draw();
  };

  const filterRow = (filter: BoardDraft['filters'][number], i: number) => {
    const row = el('div', 'tt-settings-row');
    const key = el('input', 'tt-settings-filter-key');
    key.type = 'text';
    key.value = filter.key;
    key.placeholder = 'Property';
    key.dataset.focus = `filter-${i}`;
    key.addEventListener('input', () => (filter.key = key.value));
    host.attachKeySuggest(key);
    const values = el('input', 'tt-settings-filter-values');
    values.type = 'text';
    values.value = filter.values;
    values.placeholder = 'Any value, or e.g. house, garden';
    values.addEventListener('input', () => (filter.values = values.value));
    host.attachValueSuggest(values, () => filter.key.trim());
    row.append(
      key,
      values,
      iconButton('x', 'Remove filter', false, () => {
        draft.filters.splice(i, 1);
        draw();
      }),
    );
    return row;
  };

  const addButton = (text: string) => {
    const b = button(text, 'tt-settings-add');
    const icon = el('span', 'tt-settings-add-icon');
    host.icon(icon, 'plus');
    b.prepend(icon);
    return b;
  };

  const iconButton = (icon: string, label: string, disabled: boolean, onClick: () => void) => {
    const b = el('button', 'clickable-icon tt-settings-icon');
    b.setAttribute('aria-label', label);
    b.title = label;
    b.disabled = disabled;
    host.icon(b, icon);
    b.addEventListener('click', onClick);
    return b;
  };

  draw();
  return {
    showErrors: (next) => {
      errors = next;
      draw();
    },
  };
}

function heading(root: HTMLElement, name: string, desc?: string): void {
  const item = el('div', 'setting-item setting-item-heading');
  const info = el('div', 'setting-item-info');
  info.append(el('div', 'setting-item-name', name));
  if (desc) info.append(el('div', 'setting-item-description', desc));
  item.append(info);
  root.append(item);
}

function setting(root: HTMLElement, name: string, desc: string, control: HTMLElement): void {
  const item = el('div', 'setting-item');
  const info = el('div', 'setting-item-info');
  info.append(el('div', 'setting-item-name', name), el('div', 'setting-item-description', desc));
  const controlEl = el('div', 'setting-item-control');
  controlEl.append(control);
  item.append(info, controlEl);
  root.append(item);
}

function select(options: { value: string; label: string }[], value: string, onChange: (v: string) => void): HTMLSelectElement {
  const s = el('select', 'dropdown');
  for (const o of options) {
    const opt = el('option', '', o.label);
    opt.value = o.value;
    s.append(opt);
  }
  s.value = value;
  s.addEventListener('change', () => onChange(s.value));
  return s;
}

function numberInput(value: string, unit: string, onInput: (v: string) => void): HTMLElement {
  const wrap = el('div', 'tt-settings-number');
  const input = el('input', '');
  input.type = 'number';
  input.min = '0';
  input.value = value;
  input.addEventListener('input', () => onInput(input.value));
  wrap.append(input, el('span', 'tt-settings-unit', unit));
  return wrap;
}

/** Obsidian's toggle switch markup, so it picks up the app's styling. */
function toggle(on: boolean, onChange: (on: boolean) => void): HTMLElement {
  const container = el('div', `checkbox-container${on ? ' is-enabled' : ''}`);
  const input = el('input', '');
  input.type = 'checkbox';
  input.checked = on;
  input.tabIndex = 0;
  container.append(input);
  container.addEventListener('click', (e) => {
    e.preventDefault();
    const next = !container.classList.contains('is-enabled');
    container.classList.toggle('is-enabled', next);
    input.checked = next;
    onChange(next);
  });
  return container;
}

function textInput(value: string, placeholder: string, onInput: (v: string) => void): HTMLInputElement {
  const input = el('input', '');
  input.type = 'text';
  input.value = value;
  input.placeholder = placeholder;
  input.addEventListener('input', () => onInput(input.value));
  return input;
}

function textArea(value: string, placeholder: string, onInput: (v: string) => void): HTMLTextAreaElement {
  const area = el('textarea', '');
  area.rows = 2;
  area.value = value;
  area.placeholder = placeholder;
  area.addEventListener('input', () => onInput(area.value));
  return area;
}

function button(text: string, cls = ''): HTMLButtonElement {
  const b = el('button', cls, text);
  b.type = 'button';
  return b;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}
