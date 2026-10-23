import type { BoardConfig } from '../core/boardConfig.ts';
import { convertDueNow, filterError, filterWarnings, WEEKDAY_NAMES, type BoardDraft, type DraftFilter } from '../core/boardDraft.ts';

export type SettingsFormHost = {
  icon(el: HTMLElement, name: string): void;
  attachKeySuggest(input: HTMLInputElement): void | (() => void);
  attachValueSuggest(input: HTMLInputElement, key: () => string): void | (() => void);
  attachTagSuggest(input: HTMLInputElement): void | (() => void);
  attachFolderSuggest(input: HTMLInputElement): void | (() => void);
  countTagged(columnId: string): number;
  onDiscard(): void;
  onSave(): void;
  onOpenNote(): void;
};
export type SettingsForm = { showErrors(errors: string[]): void; setSaving(saving: boolean): void; destroy(): void };
type Section = 'columns' | 'dates' | 'filters' | 'destination';

/** Shared by the Obsidian modal and harness. Drafts are written only by an explicit save. */
export function renderBoardSettings(root: HTMLElement, draft: BoardDraft, original: BoardConfig, host: SettingsFormHost): SettingsForm {
  let section: Section = 'columns';
  let errors: string[] = [];
  let validation = false;
  let saving = false;
  let focusNext: string | null = null;
  let drawnSection: Section = section;
  const scrollPositions = new Map<Section, number>();
  let disposers: Array<() => void> = [];
  const attach = (dispose: void | (() => void)) => { if (dispose) disposers.push(dispose); };
  const dispose = () => { disposers.forEach((fn) => fn()); disposers = []; };
  const icon = (name: string) => { const span = el('span', 'tt-icon'); host.icon(span, name); return span; };
  const iconButton = (name: string, label: string, run: () => void, disabled = false) => {
    const b = button('', 'tt-icon-button');
    b.title = label; b.setAttribute('aria-label', label); b.disabled = disabled;
    b.append(icon(name)); b.onclick = run; return b;
  };
  const field = (label: string, control: HTMLElement, help = '') => {
    const wrap = el('div', 'tt-field');
    wrap.setAttribute('role', 'group'); wrap.setAttribute('aria-label', label);
    wrap.append(el('span', 'tt-field-label', label), control);
    if (help) wrap.append(el('span', 'tt-help', help));
    return wrap;
  };
  const input = (value: string, label: string, change: (v: string) => void, type = 'text') => {
    const node = el('input', 'tt-input'); node.type = type; node.value = value;
    node.dataset.focus = label;
    node.setAttribute('aria-label', label); node.oninput = () => change(node.value); return node;
  };
  const select = (label: string, values: [string, string][], value: string, change: (v: string) => void) => {
    const node = el('select', 'tt-input'); node.setAttribute('aria-label', label);
    node.dataset.focus = label;
    for (const [v, text] of values) { const opt = el('option', '', text); opt.value = v; node.append(opt); }
    node.value = value; node.onchange = () => change(node.value); return node;
  };
  const check = (label: string, checked: boolean, change: (v: boolean) => void) => {
    const wrap = el('label', 'tt-check-field'); const node = el('input', ''); node.type = 'checkbox'; node.checked = checked;
    node.dataset.focus = label;
    node.onchange = () => change(node.checked); wrap.append(node, el('span', '', label)); return wrap;
  };
  const heading = (parent: HTMLElement, title: string, help: string) => {
    parent.append(el('h3', 'tt-section-title', title), el('p', 'tt-help', help));
  };
  const redraw = (focus?: string) => { focusNext = focus ?? null; draw(); };

  function chips(values: string[], label: string, changed: (values: string[]) => void, suggest: (node: HTMLInputElement) => void | (() => void), splitCommas = false): HTMLElement {
    const wrap = el('div', 'tt-chips');
    const list = el('div', 'tt-chip-list');
    const entry = input('', label, () => undefined);
    entry.placeholder = 'Add a value…'; entry.dataset.focus = label;
    entry.setAttribute('aria-description', 'Type a value and press Enter. You can enter new values.');
    let current = [...values];
    const update = () => {
      list.replaceChildren();
      current.forEach((value, i) => {
        const chip = el('span', 'tt-chip'); chip.append(el('span', 'tt-chip-text', value));
        chip.append(iconButton('x', `Remove ${value} from ${label}`, () => {
          current.splice(i, 1); changed([...current]); update(); entry.focus();
        }));
        list.append(chip);
      });
    };
    const commit = () => {
      const value = entry.value.trim();
      if (!value) return;
      for (const item of (splitCommas ? value.split(',') : [value]).map((v) => v.trim()).filter(Boolean)) {
        if (!current.includes(item)) current.push(item);
      }
      entry.value = ''; changed([...current]); update();
    };
    entry.onkeydown = (event) => {
      if (event.key === 'Enter') { event.preventDefault(); commit(); }
      if (event.key === 'Backspace' && !entry.value && current.length) {
        entry.value = current.pop()!; changed([...current]); update();
      }
    };
    entry.onblur = commit;
    entry.onchange = commit;
    attach(suggest(entry)); update(); wrap.append(list, entry); return wrap;
  }

  function updateWarnings(): void {
    root.querySelector('.tt-filter-warnings')?.replaceChildren(...filterWarnings(draft).map((text) => el('p', 'tt-filter-warning', text)));
  }

  function propertyRow(rule: DraftFilter, index: number, excluded: boolean): HTMLElement {
    const group = excluded ? 'Must not include' : 'Must include';
    const rules = excluded ? draft.excludedFilters : draft.filters;
    const id = `${excluded ? 'exclude' : 'include'}-property-${index}`;
    const row = el('div', 'tt-property-rule');
    const key = input(rule.key, `${group}: Property ${index + 1}`, (v) => { rule.key = v; refreshError(); updateWarnings(); });
    key.dataset.focus = id; attach(host.attachKeySuggest(key));
    const condition = select(`${group}: Condition ${index + 1}`, [['exists', 'Exists'], ['matches', 'Matches any value']], rule.condition, (v) => {
      rule.condition = v as DraftFilter['condition']; redraw(`${id}-condition`);
    });
    condition.dataset.focus = `${id}-condition`;
    row.append(field('Property', key), field('Condition', condition), iconButton('trash-2', `Remove ${group.toLowerCase()} property ${index + 1}`, () => {
      rules.splice(index, 1); redraw(rules.length ? `${excluded ? 'exclude' : 'include'}-property-${Math.min(index, rules.length - 1)}` : `${excluded ? 'exclude' : 'include'}-add`);
    }));
    const error = el('div', 'tt-field-error'); error.id = `${id}-error`; error.setAttribute('role', 'status');
    let valueControl: HTMLElement | undefined;
    const refreshError = () => {
      const message = validation ? filterError(rule) : null;
      error.textContent = message ? `${group}: ${message}` : ''; error.hidden = !message;
      key.setAttribute('aria-invalid', String(!!message && !rule.key.trim()));
      key.setAttribute('aria-describedby', error.id);
      valueControl?.querySelector('input')?.setAttribute('aria-invalid', String(!!message && !!rule.key.trim()));
    };
    if (rule.condition === 'matches') {
      valueControl = chips(rule.values, `${group}: Values ${index + 1}`, (values) => { rule.values = values; refreshError(); }, (node) => host.attachValueSuggest(node, () => rule.key.trim()));
      const valueField = field('Values', valueControl, 'Match any value. Press Enter to add; a comma stays inside its value.');
      valueField.classList.add('tt-property-values'); row.append(valueField);
      valueControl.querySelector('input')?.setAttribute('aria-describedby', error.id);
    }
    refreshError(); row.append(error); return row;
  }

  function filterGroup(excluded: boolean): HTMLElement {
    const name = excluded ? 'Must not include' : 'Must include';
    const group = el('section', `tt-filter-group${excluded ? ' tt-filter-group--exclude' : ''}`);
    group.setAttribute('aria-label', name);
    const title = el('h4', 'tt-filter-title'); title.append(icon(excluded ? 'circle-minus' : 'circle-plus'), el('span', '', name));
    group.append(title, el('p', 'tt-help', excluded ? 'Any matching exclusion keeps a card off the board.' : 'All configured categories must pass. Empty categories add no restriction.'));
    const tagKey = excluded ? 'excludeTags' : 'includeTags';
    const folderKey = excluded ? 'excludeFolders' : 'includeFolders';
    group.append(field('Task tags', chips(draft[tagKey].split(',').map((v) => v.trim()).filter(Boolean), `${name}: Task tags`, (values) => draft[tagKey] = values.join(', '), host.attachTagSuggest, true), 'Match any tag on the task line, including nested tags. Placement tags are not included.'));
    group.append(field('Note folders', chips(draft[folderKey].split('\n').filter(Boolean), `${name}: Note folders`, (values) => draft[folderKey] = values.join('\n'), host.attachFolderSuggest), 'Match any source-note folder, including its descendants.'));
    group.append(el('div', 'tt-field-label', 'Note properties'), el('p', 'tt-help', excluded ? 'Any matching property rule excludes the note. A missing property does not match.' : 'Every property rule must match the source note. “Exists” includes empty or null values.'));
    const rules = excluded ? draft.excludedFilters : draft.filters;
    rules.forEach((rule, i) => group.append(propertyRow(rule, i, excluded)));
    if (!rules.length) group.append(el('div', 'tt-filter-empty', 'No property rules'));
    const add = button('Add property rule', 'tt-button tt-button--subtle'); add.prepend(icon('plus'));
    add.dataset.focus = `${excluded ? 'exclude' : 'include'}-add`;
    add.onclick = () => { rules.push({ key: '', condition: 'exists', values: [] }); redraw(`${excluded ? 'exclude' : 'include'}-property-${rules.length - 1}`); };
    group.append(add); return group;
  }

  function draw(): void {
    const bodyBefore = root.querySelector<HTMLElement>('.tt-settings-body');
    if (bodyBefore) scrollPositions.set(drawnSection, bodyBefore.scrollTop);
    const scroll = scrollPositions.get(section) ?? 0;
    drawnSection = section;
    const focused = root.ownerDocument.activeElement as HTMLInputElement | null;
    const restoreKey = focusNext ?? (focused && root.contains(focused) ? focused.dataset.focus : undefined);
    const selection = focused?.selectionStart;
    dispose(); root.replaceChildren(); root.classList.add('tt-settings');
    const nav = el('div', 'tt-settings-tabs'); nav.setAttribute('role', 'tablist'); nav.setAttribute('aria-label', 'Board settings sections');
    const sections: [Section, string, string][] = [['columns', 'Columns', 'columns-3'], ['dates', 'Dates', 'calendar-days'], ['filters', 'Filters', 'list-filter'], ['destination', 'New tasks', 'file-plus-2']];
    for (const [id, title, glyph] of sections) {
      const tab = button(title, 'tt-settings-tab'); tab.prepend(icon(glyph));
      tab.setAttribute('role', 'tab'); tab.setAttribute('aria-selected', String(section === id)); tab.setAttribute('aria-controls', 'tt-settings-panel');
      tab.id = `tt-tab-${id}`; tab.tabIndex = section === id ? 0 : -1; tab.dataset.focus = tab.id;
      tab.onclick = () => { section = id; redraw(tab.id); };
      tab.onkeydown = (e) => {
        const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!step && e.key !== 'Home' && e.key !== 'End') return;
        e.preventDefault();
        const next = e.key === 'Home' ? 0 : e.key === 'End' ? sections.length - 1 : (sections.findIndex(([key]) => key === id) + step + sections.length) % sections.length;
        section = sections[next]![0]; redraw(`tt-tab-${section}`);
      };
      nav.append(tab);
    }
    const body = el('div', 'tt-settings-body'); body.id = 'tt-settings-panel'; body.setAttribute('role', 'tabpanel'); body.setAttribute('aria-labelledby', `tt-tab-${section}`);
    if (section === 'columns') {
      heading(body, 'Shape your workflow', 'Arrange columns from left to right. Renaming a column updates its task tags.');
      draft.columns.forEach((column, i) => {
        const row = el('div', 'tt-settings-row');
        const name = input(column.label, `Column ${i + 1} name`, (v) => column.label = v); name.dataset.focus = `column-${i}`;
        name.addEventListener('input', () => {
          for (const menu of root.querySelectorAll<HTMLSelectElement>('select')) {
            if (!['Done column', 'No due date column'].includes(menu.getAttribute('aria-label') ?? '')) continue;
            const option = [...menu.options].find((o) => o.value === String(i));
            if (option) option.textContent = name.value || '(unnamed)';
          }
        });
        const move = (to: number) => {
          [draft.columns[i], draft.columns[to]] = [draft.columns[to]!, draft.columns[i]!];
          const swap = (at: number) => at === i ? to : at === to ? i : at;
          draft.doneIndex = swap(draft.doneIndex); draft.undatedIndex = swap(draft.undatedIndex); redraw(`column-${to}`);
        };
        row.append(name, iconButton('arrow-up', `Move ${column.label} up`, () => move(i - 1), i === 0), iconButton('arrow-down', `Move ${column.label} down`, () => move(i + 1), i === draft.columns.length - 1), iconButton('trash-2', `Remove ${column.label} column`, () => {
          draft.columns.splice(i, 1); const shift = (at: number) => at === i ? -1 : at > i ? at - 1 : at;
          draft.doneIndex = shift(draft.doneIndex); draft.undatedIndex = shift(draft.undatedIndex); redraw(`column-${Math.max(0, i - 1)}`);
        }, draft.columns.length === 1));
        body.append(row);
      });
      const add = button('Add column', 'tt-button tt-button--subtle'); add.prepend(icon('plus')); add.onclick = () => { draft.columns.push({ label: '' }); redraw(`column-${draft.columns.length - 1}`); }; body.append(add);
      for (const c of original.columns.filter((c) => !draft.columns.some((d) => d.originalId === c.id))) {
        const n = host.countTagged(c.id); if (n) body.append(el('p', 'tt-help', `Removing ${c.label}: ${n} tasks will use the first column.`));
      }
      const choices: [string, string][] = [['-1', 'None'], ...draft.columns.map((c, i) => [String(i), c.label || '(unnamed)'] as [string, string])];
      body.append(field('Done column', select('Done column', choices, String(draft.doneIndex), (v) => draft.doneIndex = Number(v)), 'Moving a task here completes it.'));
      body.append(field('No due date column', select('No due date column', choices, String(draft.undatedIndex), (v) => { draft.undatedIndex = Number(v); redraw(); }), 'Choose None to use a No due date row instead.'));
      body.append(check('Limit completed cards per row', draft.limitDone, (v) => { draft.limitDone = v; redraw(); }));
      if (draft.limitDone) body.append(field('Completed cards per row', input(draft.doneLimit, 'Completed cards per row', (v) => draft.doneLimit = v, 'number')));
      if (draft.undatedIndex >= 0) {
        body.append(check('Limit cards without a due date', draft.limitUndated, (v) => { draft.limitUndated = v; redraw(); }));
        if (draft.limitUndated) body.append(field('Undated card limit', input(draft.undatedLimit, 'Undated card limit', (v) => draft.undatedLimit = v, 'number')));
      }
    } else if (section === 'dates') {
      heading(body, 'Plan your time', 'Overdue tasks stay in Due now. Future tasks are grouped into weekly rows.');
      body.append(field('Due now window', input(draft.dueNow, 'Due now window', (v) => draft.dueNow = v, 'number')));
      body.append(field('Window unit', select('Window unit', [['days', 'Days'], ['weeks', 'Weeks']], draft.dueNowUnit, (v) => { draft.dueNowUnit = v as 'days' | 'weeks'; draft.dueNow = convertDueNow(draft.dueNow, draft.dueNowUnit); redraw(); }), draft.dueNowUnit === 'weeks' ? 'This week counts as week 1.' : 'Includes today through this many days ahead.'));
      body.append(field('Future week rows', input(draft.weekHorizon, 'Future week rows', (v) => draft.weekHorizon = v, 'number')));
      body.append(field('Weeks start on', select('Weeks start on', WEEKDAY_NAMES.map((name, i) => [String(i), name]), String(draft.weekStart), (v) => draft.weekStart = Number(v))));
      body.append(field('Show completed tasks for', input(draft.showCompletedDays, 'Show completed tasks for', (v) => draft.showCompletedDays = v, 'number'), 'Days after completion. Set to 0 to hide completed cards.'));
    } else if (section === 'filters') {
      heading(body, 'Choose what belongs here', 'Cards must satisfy the inclusion conditions. Any matching exclusion keeps a card off this board.');
      const groups = el('div', 'tt-filter-groups'); groups.append(filterGroup(false), filterGroup(true)); body.append(groups);
      const warnings = el('div', 'tt-filter-warnings'); warnings.setAttribute('role', 'status');
      warnings.append(...filterWarnings(draft).map((text) => el('p', 'tt-filter-warning', text))); body.append(warnings);
      body.append(el('p', 'tt-scope-note', 'Plugin-wide excluded folders and the boards folder are unavailable even when included here. Subtasks stay inside a visible parent without being filtered independently; when their parent is absent, they must pass these filters to appear as cards.'));
    } else {
      heading(body, 'Give new tasks a home', 'Tasks added on this board go to this note and section.');
      body.append(field('Add new tasks to', select('Add new tasks to', [['default', 'Plugin default'], ['daily', 'Today’s daily note'], ['note', 'A specific note']], draft.newTasks, (v) => { draft.newTasks = v as BoardConfig['newTasks']; redraw(); })));
      if (draft.newTasks === 'note') body.append(field('Note path', input(draft.newTasksNote, 'Note path', (v) => draft.newTasksNote = v), 'The note is created if it does not exist.'));
      if (draft.newTasks !== 'default') body.append(field('Under heading', input(draft.newTasksHeading, 'Under heading', (v) => draft.newTasksHeading = v), 'Leave empty to append to the note. Missing headings are created.'));
    }
    if (errors.length) {
      const box = el('div', 'tt-settings-errors'); box.setAttribute('role', 'alert');
      errors.forEach((error) => box.append(el('div', '', error))); body.append(box);
    }
    const footer = el('div', 'tt-settings-footer');
    const open = button('Save & open note', 'tt-button tt-button--subtle'); open.onclick = host.onOpenNote;
    const cancel = button('Cancel', 'tt-button'); cancel.onclick = host.onDiscard;
    const save = button(saving ? 'Saving…' : 'Save changes', 'tt-button mod-cta'); save.onclick = host.onSave;
    save.disabled = saving; cancel.disabled = saving; open.disabled = saving;
    footer.append(open, cancel, save); root.append(nav, body, footer);
    if (saving) root.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('input, select, button').forEach((control) => control.disabled = true);
    body.scrollTop = scroll;
    if (restoreKey) {
      const target = [...root.querySelectorAll<HTMLElement>('[data-focus]')].find((node) => node.dataset.focus === restoreKey);
      target?.focus({ preventScroll: true });
      if (selection != null && target instanceof HTMLInputElement && target.type === 'text') target.setSelectionRange(selection, selection);
      if (focusNext && !focusNext.startsWith('tt-tab-')) target?.scrollIntoView({ block: 'nearest' });
    }
    focusNext = null;
  }
  draw();
  return {
    showErrors(next) {
      // Property errors live beside their controls and update as the user fixes them.
      errors = next.filter((message) => !/^Must (not )?include, property \d+:/.test(message)); validation = true;
      if (draft.filters.some(filterError) || draft.excludedFilters.some(filterError)) section = 'filters';
      draw();
      const invalid = root.querySelector<HTMLElement>('[aria-invalid="true"]');
      if (invalid) { invalid.focus(); invalid.scrollIntoView({ block: 'nearest' }); }
      else root.querySelector('.tt-settings-errors')?.scrollIntoView({ block: 'nearest' });
    },
    setSaving(value) { saving = value; draw(); },
    destroy: dispose,
  };
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); node.className = cls; if (text !== undefined) node.textContent = text; return node;
}
function button(text: string, cls: string): HTMLButtonElement {
  const node = el('button', cls, text); node.type = 'button'; return node;
}
