import { uiElement, isComposing } from './dom.ts';
import { announce, clearForRedraw } from './announce.ts';
import { renderEditorHeader } from './editorHeader.ts';
import { installRowReorder } from './reorderRows.ts';
import { quickFilterColors } from './quickFilterColors.ts';
import type { BoardConfig } from '../core/boardConfig.ts';
import { labelDescription } from '../core/labels.ts';
import { newQuickFilterId, QUICK_DUES, QUICK_PRIORITIES } from '../core/quickFilters.ts';
import { convertDueNow, filterError, filterItemName, filterWarnings, removedColumnNotes, WEEKDAY_NAMES, type BoardDraft, type DraftFilter, type DraftFilterSet, type DraftGroup, type DraftNode, type DraftQuickFilter, type DraftRule } from '../core/boardDraft.ts';
import type { FilterMatch } from '../core/filters.ts';
import type { ParsedTask } from '../core/taskLine.ts';

export type SettingsFormHost = {
  header?: HTMLElement;
  initialSection?: Section;
  createTextInput?(): HTMLInputElement;
  createDropdown?(): HTMLSelectElement;
  destinationAdvice?(draft: BoardDraft): string[];
  icon(el: HTMLElement, name: string): void;
  attachKeySuggest(input: HTMLInputElement): void | (() => void);
  attachValueSuggest(input: HTMLInputElement, key: () => string): void | (() => void);
  attachTagSuggest(input: HTMLInputElement): void | (() => void);
  attachFolderSuggest(input: HTMLInputElement): void | (() => void);
  /** Tasks whose tag names this column of the board as saved. */
  taggedTasks(columnId: string): ParsedTask[];
  onDiscard(): void;
  onSave(): void;
  onCopyShortcut?(): void;
  /** Opens the board name editor, as clicking the board's name does. The draft stays open. */
  onRenameBoard?(): void;
  /** Names a new board that starts with this board's saved settings. */
  onDuplicateBoard?(): void;
  /** Asks before moving the board note to the trash. */
  onDeleteBoard?(): void;
};
export type SettingsForm = { showErrors(errors: string[]): void; setSaving(saving: boolean): void; destroy(): void };
export type Section = 'general' | 'columns' | 'filters' | 'quick' | 'appearance' | 'destination';

/** Shared by the Obsidian modal and harness. Drafts are written only by an explicit save. */
export function renderBoardSettings(root: HTMLElement, draft: BoardDraft, original: BoardConfig, host: SettingsFormHost): SettingsForm {
  let section: Section = host.initialSection ?? 'general';
  let errors: string[] = [];
  let validation = false;
  let saving = false;
  let focusNext: string | null = null;
  let drawnSection: Section = section;
  const scrollPositions = new Map<Section, number>();
  /** Ids of the quick filters whose editors are expanded. */
  const openQuick = new Set<string>();
  let disposers: Array<() => void> = [];
  const attach = (dispose: void | (() => void)) => { if (dispose) disposers.push(dispose); };
  const dispose = () => { disposers.forEach((fn) => fn()); disposers = []; };
  const icon = (name: string) => { const span = el('span', 'tt-icon'); host.icon(span, name); return span; };
  const iconButton = (name: string, label: string, run: () => void, disabled = false) => {
    const b = button('', 'tt-icon-button');
    b.setAttribute('aria-label', label); b.disabled = disabled;
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
    const node = host.createTextInput?.() ?? el('input', ''); node.classList.add('tt-input'); node.type = type; node.value = value;
    node.dataset.focus = label;
    node.setAttribute('aria-label', label); node.oninput = () => change(node.value); return node;
  };
  const select = (label: string, values: [string, string][], value: string, change: (v: string) => void) => {
    const node = host.createDropdown?.() ?? el('select', ''); node.classList.add('tt-input'); node.setAttribute('aria-label', label);
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
    let composing = false;
    entry.addEventListener('compositionstart', () => { composing = true; });
    entry.addEventListener('compositionend', () => { composing = false; });
    const commit = () => {
      if (composing) return;
      const value = entry.value.trim();
      if (!value) return;
      for (const item of (splitCommas ? value.split(',') : [value]).map((v) => v.trim()).filter(Boolean)) {
        if (!current.includes(item)) current.push(item);
      }
      entry.value = ''; changed([...current]); update();
    };
    entry.onkeydown = (event) => {
      if (isComposing(event)) return;
      if (event.key === 'Enter') { event.preventDefault(); commit(); }
      if (event.key === 'Backspace' && !entry.value && current.length) {
        entry.value = current.pop()!; changed([...current]); update();
      }
    };
    entry.onblur = commit;
    entry.onchange = commit;
    attach(suggest(entry)); update(); wrap.append(list, entry); return wrap;
  }

  function updateDestinationAdvice(): void {
    root.querySelector('.tt-destination-advice')?.replaceChildren(...(host.destinationAdvice?.(draft) ?? []).map((text) => el('p', 'tt-help', text)));
  }

  function updateWarnings(): void {
    root.querySelector('.tt-filter-warnings')?.replaceChildren(...filterWarnings(draft).map((text) => el('p', 'tt-filter-warning', text)));
    sayNewWarnings();
  }

  const removalNotes = () => removedColumnNotes(draft, original, (id) => host.taggedTasks(id));
  const notes = () => [...filterWarnings(draft), ...removalNotes()];
  /** Refreshes the notes on removed columns; `say` is false while a column name is being typed. */
  function updateRemovals(say = true): void {
    root.querySelector('.tt-column-removals')?.replaceChildren(...removalNotes().map((text) => el('p', 'tt-column-removal', text)));
    if (say) sayNewWarnings(); else warned = new Set(notes());
  }

  /** Warnings and removal notes shown when the form opened, or already said, aren't said again. */
  let warned = new Set(notes());
  function sayNewWarnings(): void {
    const now = notes();
    announce(root, now.filter((text) => !warned.has(text)).join(' '));
    warned = new Set(now);
  }

  /** Keeps focus keys and labels distinct between the board's filters and each quick filter's. */
  type Scope = { key: string; label: string };
  const boardScope: Scope = { key: '', label: '' };
  const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
  const rulesChanged = (set: DraftFilterSet) => { if (set === draft) updateWarnings(); };
  const blankRule = (kind: DraftRule['kind']): DraftRule => kind === 'property' ? { kind, key: '', condition: 'exists', values: [] } : { kind, values: [] };

  /**
   * One filter, laid out like a condition in Obsidian's Bases filter editor: a single box holding
   * what it tests, how, the values, then its trash button. `replace` swaps it for another kind of
   * filter, and `remove` takes it out of its group.
   */
  function ruleEditor(set: DraftFilterSet, rule: DraftRule, path: number[], scope: Scope, replace: (next: DraftRule) => void, remove: () => void): HTMLElement {
    const name = `${scope.label}${capitalized(filterItemName(rule, path))}`;
    const statement = el('div', 'tt-filter-statement');
    const expression = el('div', 'tt-filter-expression'); expression.setAttribute('role', 'group'); expression.setAttribute('aria-label', name);
    const field = select(`${name}: Field`, [['tags', 'Tags'], ['folders', 'Note folder'], ['property', 'Note property']], rule.kind, (kind) => {
      replace(blankRule(kind as DraftRule['kind'])); rulesChanged(set); redraw(`${name}: Field`);
    });
    field.classList.add('tt-filter-field');
    expression.append(field);
    let error: HTMLElement | null = null;
    if (rule.kind !== 'property') {
      const tags = rule.kind === 'tags';
      expression.append(el('span', 'tt-filter-operator', tags ? 'include any of' : 'is in any of'),
        chips(rule.values, `${name}: ${tags ? 'Tags' : 'Note folders'}`, (values) => { rule.values = values; },
          (node) => tags ? host.attachTagSuggest(node) : host.attachFolderSuggest(node), tags));
    } else {
      const key = input(rule.key, `${name}: Property`, (v) => { rule.key = v; refreshError(); rulesChanged(set); });
      key.classList.add('tt-filter-key'); key.placeholder = 'Property';
      attach(host.attachKeySuggest(key));
      const condition = select(`${name}: Condition`, [['exists', 'exists'], ['matches', 'is any of']], rule.condition, (v) => {
        rule.condition = v as DraftFilter['condition']; rulesChanged(set); redraw(`${name}: Condition`);
      });
      condition.classList.add('tt-filter-operator');
      expression.append(key, condition);
      const shown = el('div', 'tt-field-error'); shown.id = `${scope.key}filter-${path.join('-')}-error`; shown.setAttribute('role', 'status');
      error = shown;
      let valueControl: HTMLElement | undefined;
      const refreshError = () => {
        const message = validation ? filterError(rule) : null;
        shown.textContent = message ? `${name}: ${message}` : ''; shown.hidden = !message;
        key.setAttribute('aria-invalid', String(!!message && !rule.key.trim()));
        key.setAttribute('aria-describedby', shown.id);
        valueControl?.querySelector('input')?.setAttribute('aria-invalid', String(!!message && !!rule.key.trim()));
      };
      if (rule.condition === 'matches') {
        valueControl = chips(rule.values, `${name}: Values`, (values) => { rule.values = values; refreshError(); }, (node) => host.attachValueSuggest(node, () => rule.key.trim()));
        valueControl.querySelector('input')?.setAttribute('aria-describedby', shown.id);
        expression.append(valueControl);
      }
      refreshError();
    }
    const actions = el('div', 'tt-filter-row-actions');
    actions.append(iconButton('trash-2', `Remove ${name.toLowerCase()}`, remove));
    expression.append(actions);
    statement.append(expression);
    if (error) statement.append(error);
    return statement;
  }

  /**
   * A group of filters, laid out like a group in Obsidian's Bases filter editor: All, Any or None at
   * the top, then each filter or group after where, and or or. The outermost group is the whole
   * filter; `remove` takes any other out of its parent, whose controls `parentKey` names.
   */
  function groupEditor(set: DraftFilterSet, group: DraftGroup, path: number[], scope: Scope, remove?: () => void, parentKey = ''): HTMLElement {
    const nested = !!remove;
    const name = nested ? `${scope.label}${capitalized(filterItemName(group, path))}` : `${scope.label}${scope.label ? 'filters' : 'Filters'}`;
    const key = `${scope.key}filter${path.map((i) => `-${i}`).join('')}`;
    const section = el('section', `tt-filter-group${nested ? ' tt-filter-group--nested' : ''}`);
    section.setAttribute('aria-label', name);
    const header = el('div', 'tt-filter-group-header');
    const match = select(`${name}: Match`, [['all', 'All the following are true'], ['any', 'Any of the following are true'], ['none', 'None of the following are true']], group.match, (v) => {
      group.match = v as FilterMatch; rulesChanged(set); redraw(`${name}: Match`);
    });
    match.classList.add('tt-filter-conjunction');
    header.append(match);
    if (remove) {
      const actions = el('div', 'tt-filter-group-header-actions');
      actions.append(iconButton('trash-2', `Remove ${name.toLowerCase()}`, () => { remove(); rulesChanged(set); redraw(`${parentKey}-add`); }));
      header.append(actions);
    }
    // Like Bases, taking out a group's last filter takes out the group.
    const removeItem = (i: number) => () => {
      group.items.splice(i, 1);
      if (!group.items.length && remove) { remove(); rulesChanged(set); redraw(`${parentKey}-add`); return; }
      rulesChanged(set); redraw(`${key}-add`);
    };
    const statements = el('div', 'tt-filter-group-statements');
    group.items.forEach((item, i) => {
      const row = el('div', `tt-filter-row${item.kind === 'group' ? ' tt-filter-row--group' : ''}`);
      row.append(el('span', 'tt-filter-conjunction-label', i === 0 ? 'where' : group.match === 'all' ? 'and' : 'or'));
      row.append(item.kind === 'group'
        ? groupEditor(set, item, [...path, i], scope, removeItem(i), key)
        : ruleEditor(set, item, [...path, i], scope, (next) => { group.items[i] = next; }, removeItem(i)));
      statements.append(row);
    });
    if (!group.items.length) statements.append(el('p', 'tt-filter-empty', 'No filters, so every task can show.'));
    const added = (item: DraftNode, focus: string) => {
      group.items.push(item); rulesChanged(set);
      redraw(`${scope.label}${capitalized(filterItemName(item, [...path, group.items.length - 1]))}: ${focus}`);
    };
    const actions = el('div', 'tt-filter-group-actions');
    const add = button('Add filter', 'tt-button tt-button--subtle'); add.prepend(icon('plus'));
    add.setAttribute('aria-label', `${name}: Add filter`); add.dataset.focus = `${key}-add`;
    add.onclick = () => added(blankRule('tags'), 'Field');
    actions.append(add);
    // Three levels: the whole filter, a group in it, and a group in that.
    if (path.length < 2) {
      const addGroup = button('Add filter group', 'tt-button tt-button--subtle'); addGroup.prepend(icon('plus'));
      addGroup.setAttribute('aria-label', `${name}: Add filter group`);
      // A new group matches the other way from its parent, with a filter to fill in, as in Bases.
      addGroup.onclick = () => added({ kind: 'group', match: group.match === 'any' ? 'all' : 'any', items: [blankRule('tags')] }, 'Match');
      actions.append(addGroup);
    }
    section.append(header, statements, actions);
    return section;
  }

  function quickFilterEditor(body: HTMLElement): void {
    heading(body, 'Quick filters', 'Turn these on and off with buttons at the top of the board. Each one that is on narrows the board further, on top of its filters.');
    body.append(check('Group filters in a menu', draft.quickFiltersMenu, (on) => { draft.quickFiltersMenu = on; redraw('Group filters in a menu'); }));
    if (draft.quickFiltersMenu) {
      const count = (label: string, value: string, change: (v: string) => void, help: string) => {
        const node = input(value, label, change, 'number'); node.min = '0'; node.step = '1';
        return field(label, node, help);
      };
      body.append(count('Filters to keep visible', draft.quickFiltersVisible, (v) => { draft.quickFiltersVisible = v; },
        'Keep the first N enabled filters on the toolbar. Blank or 0 puts all filters in the menu.'));
      body.append(count('Filters to keep visible in single-column view', draft.quickFiltersVisibleMobile, (v) => { draft.quickFiltersVisibleMobile = v; },
        'Optional override for narrow boards and a single selected column. Blank uses the main value; 0 puts all filters in the menu.'));
    }
    const list = draft.quickFilters;
    const quickCheck = (label: string, focus: string, checked: boolean, change: (v: boolean) => void) => {
      const wrap = check(label, checked, change); wrap.querySelector('input')!.dataset.focus = focus; return wrap;
    };
    const choices = <T extends string>(legend: string, focus: string, options: [T, string, string?][], selected: T[], changed?: () => void) => {
      const group = el('fieldset', 'tt-quick-choices'); group.append(el('legend', 'tt-field-label', legend));
      for (const [value, label, color] of options) {
        const item = quickCheck(label, `${focus}-${value}`, selected.includes(value), (on) => {
          const at = selected.indexOf(value);
          if (on && at < 0) selected.push(value); else if (!on && at >= 0) selected.splice(at, 1);
          changed?.();
        });
        if (color) { const swatch = el('span', 'tt-quick-swatch'); swatch.style.backgroundColor = color; item.insertBefore(swatch, item.lastChild); }
        group.append(item);
      }
      return group;
    };
    list.forEach((quick, i) => {
      const key = `quick-${i}`;
      const open = openQuick.has(quick.id);
      const item = el('section', 'tt-quick-filter-editor'); item.setAttribute('aria-label', `Quick filter ${i + 1}`);
      const top = el('div', 'tt-quick-filter-header');
      const toggle = button('', 'tt-quick-filter-toggle'); toggle.dataset.focus = `${key}-toggle`;
      toggle.setAttribute('aria-expanded', String(open));
      let colors = quickFilterColors(root.ownerDocument, original.labels, quick.labels);
      const updateColors = () => {
        const next = quickFilterColors(root.ownerDocument, original.labels, quick.labels);
        colors.replaceWith(next); colors = next;
      };
      toggle.append(icon(open ? 'chevron-down' : 'chevron-right'), icon('filter'), colors, el('span', '', quick.name.trim() || '(unnamed)'));
      toggle.onclick = () => { if (open) openQuick.delete(quick.id); else openQuick.add(quick.id); redraw(`${key}-toggle`); };
      const show = quickCheck('Show on board', `${key}-show`, quick.show, (v) => { quick.show = v; });
      const name = quick.name.trim() || `quick filter ${i + 1}`;
      const drag = iconButton('grip-vertical', `Reorder ${name}`, () => undefined);
      drag.classList.add('tt-reorder-grip'); drag.dataset.focus = `${key}-drag`;
      drag.title = 'Drag to reorder. Or use the up and down arrow keys.';
      drag.setAttribute('aria-description', 'Drag to reorder, or use the arrow, home and end keys.');
      const actions = el('div', 'tt-quick-filter-actions');
      actions.append(show,
        iconButton('copy', `Clone ${name}`, () => {
          const copy: DraftQuickFilter = structuredClone(quick);
          copy.id = newQuickFilterId(list); copy.name = `${quick.name.trim()} copy`;
          list.splice(i + 1, 0, copy); openQuick.add(copy.id); redraw(`quick-${i + 1}-name`);
        }),
        iconButton('trash-2', `Remove ${name}`, () => {
          list.splice(i, 1); openQuick.delete(quick.id); redraw(list.length ? `quick-${Math.min(i, list.length - 1)}-toggle` : 'quick-add');
        }));
      top.append(toggle, actions);
      item.append(top, drag);
      if (open) {
        const nameInput = input(quick.name, `Quick filter ${i + 1} name`, (v) => { quick.name = v; toggle.lastElementChild!.textContent = v.trim() || '(unnamed)'; });
        nameInput.dataset.focus = `${key}-name`;
        nameInput.setAttribute('aria-invalid', String(validation && !quick.name.trim()));
        item.append(field('Name', nameInput));
        item.append(quickCheck('Match subtasks', `${key}-match-subtasks`, quick.matchSubtasks, (on) => { quick.matchSubtasks = on; }));
        item.append(el('p', 'tt-help', 'Allow a matching subtask to show its parent for context. Otherwise, only main tasks can match this filter.'));
        item.append(choices('Priority', `${key}-priority`, QUICK_PRIORITIES, quick.priorities));
        const labels = choices('Labels', `${key}-label`, original.labels.map((l) => [l.id, labelDescription(l), l.color] as [string, string, string]), quick.labels, updateColors);
        labels.append(quickCheck('No labels', `${key}-no-labels`, quick.noLabels, (on) => { quick.noLabels = on; }));
        item.append(labels, el('p', 'tt-help', 'No labels matches tasks with no labels assigned for this board.'));
        item.append(choices('Due', `${key}-due`, QUICK_DUES, quick.due));
        item.append(groupEditor(quick, quick.filter, [], { key: `${key}-`, label: `Quick filter ${i + 1}, ` }));
        item.append(el('p', 'tt-help', 'Within Priority, Labels or Due, any checked choice can match. Every part you fill in must match. With nothing chosen, the filter matches every task.'));
      }
      body.append(item);
    });
    attach(installRowReorder(body, '.tt-quick-filter-editor', (from, to) => {
      const [moved] = list.splice(from, 1); list.splice(to, 0, moved!);
      redraw(`quick-${to}-drag`);
      announce(root, `${moved!.name || 'Quick filter'} moved to position ${to + 1} of ${list.length}.`);
    }));
    if (!list.length) body.append(el('p', 'tt-filter-empty', 'No quick filters.'));
    const add = button('Add quick filter', 'tt-button tt-button--subtle'); add.prepend(icon('plus')); add.dataset.focus = 'quick-add';
    add.onclick = () => {
      const id = newQuickFilterId(list);
      list.push({ id, name: '', show: true, priorities: [], labels: [], noLabels: false, matchSubtasks: false, due: [], filter: { kind: 'group', match: 'all', items: [] } });
      openQuick.add(id); redraw(`quick-${list.length - 1}-name`);
    };
    body.append(add);
  }

  function draw(): void {
    const bodyBefore = root.querySelector<HTMLElement>('.tt-settings-body');
    if (bodyBefore) scrollPositions.set(drawnSection, bodyBefore.scrollTop);
    const scroll = scrollPositions.get(section) ?? 0;
    drawnSection = section;
    const focused = root.ownerDocument.activeElement as HTMLInputElement | null;
    const restoreKey = focusNext ?? (focused && root.contains(focused) ? focused.dataset.focus : undefined);
    const selection = focused?.selectionStart;
    dispose(); clearForRedraw(root); root.classList.add('tt-settings');
    const nav = el('div', 'tt-settings-tabs'); nav.setAttribute('role', 'tablist'); nav.setAttribute('aria-label', 'Board settings sections');
    const sections: [Section, string, string][] = [['general', 'General', 'sliders-horizontal'], ['columns', 'Columns', 'columns-3'], ['filters', 'Filters', 'list-filter'], ['quick', 'Quick filters', 'filter'], ['appearance', 'Appearance', 'palette'], ['destination', 'New tasks', 'file-plus-2']];
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
        const row = el('div', 'tt-column-editor');
        const name = input(column.label, `Column ${i + 1} name`, (v) => column.label = v); name.dataset.focus = `column-${i}`;
        name.addEventListener('input', () => {
          for (const menu of root.querySelectorAll<HTMLSelectElement>('select')) {
            if (!['Done column', 'No due date column'].includes(menu.getAttribute('aria-label') ?? '')) continue;
            const option = [...menu.options].find((o) => o.value === String(i));
            if (option) option.textContent = name.value || '(unnamed)';
          }
          updateRemovals(false);
        });
        const label = column.label.trim() || `column ${i + 1}`;
        const drag = iconButton('grip-vertical', `Reorder ${label}`, () => undefined);
        drag.classList.add('tt-reorder-grip'); drag.dataset.focus = `column-${i}-drag`;
        drag.title = 'Drag to reorder. Or use the up and down arrow keys.';
        drag.setAttribute('aria-description', 'Drag to reorder, or use the arrow, home and end keys.');
        row.append(name, iconButton('trash-2', `Remove ${label} column`, () => {
          draft.columns.splice(i, 1); const shift = (at: number) => at === i ? -1 : at > i ? at - 1 : at;
          draft.doneIndex = shift(draft.doneIndex); draft.undatedIndex = shift(draft.undatedIndex); redraw(`column-${Math.max(0, i - 1)}`);
        }, draft.columns.length === 1), drag);
        body.append(row);
      });
      attach(installRowReorder(body, '.tt-column-editor', (from, to) => {
        const [moved] = draft.columns.splice(from, 1); draft.columns.splice(to, 0, moved!);
        // The Done and No due date columns follow their column to its new place.
        const follow = (at: number) => at === from ? to : from < to && at > from && at <= to ? at - 1 : from > to && at >= to && at < from ? at + 1 : at;
        draft.doneIndex = follow(draft.doneIndex); draft.undatedIndex = follow(draft.undatedIndex);
        redraw(`column-${to}-drag`);
        announce(root, `${moved!.label.trim() || 'Column'} moved to position ${to + 1} of ${draft.columns.length}.`);
      }));
      const add = button('Add column', 'tt-button tt-button--subtle'); add.prepend(icon('plus')); add.onclick = () => { draft.columns.push({ label: '' }); redraw(`column-${draft.columns.length - 1}`); }; body.append(add);
      const removals = el('div', 'tt-column-removals');
      removals.append(...removalNotes().map((text) => el('p', 'tt-column-removal', text))); body.append(removals);
      const choices: [string, string][] = [['-1', 'None'], ...draft.columns.map((c, i) => [String(i), c.label || '(unnamed)'] as [string, string])];
      body.append(field('Done column', select('Done column', choices, String(draft.doneIndex), (v) => { draft.doneIndex = Number(v); updateRemovals(); }), 'Moving a task here completes it.'));
      body.append(field('No due date column', select('No due date column', choices, String(draft.undatedIndex), (v) => { draft.undatedIndex = Number(v); redraw(); }), 'Choose None to use a No due date row instead.'));
      body.append(check('Limit completed cards per row', draft.limitDone, (v) => { draft.limitDone = v; redraw(); }));
      if (draft.limitDone) body.append(field('Completed cards per row', input(draft.doneLimit, 'Completed cards per row', (v) => draft.doneLimit = v, 'number')));
      if (draft.undatedIndex >= 0) {
        body.append(check('Limit cards without a due date', draft.limitUndated, (v) => { draft.limitUndated = v; redraw(); }));
        if (draft.limitUndated) body.append(field('Undated card limit', input(draft.undatedLimit, 'Undated card limit', (v) => draft.undatedLimit = v, 'number')));
      }
    } else if (section === 'general') {
      heading(body, 'Plan your time', 'Overdue tasks stay in Due now. Future tasks are grouped into weekly rows.');
      body.append(field('Due now window', input(draft.dueNow, 'Due now window', (v) => draft.dueNow = v, 'number')));
      body.append(field('Window unit', select('Window unit', [['days', 'Days'], ['weeks', 'Weeks']], draft.dueNowUnit, (v) => { draft.dueNowUnit = v as 'days' | 'weeks'; draft.dueNow = convertDueNow(draft.dueNow, draft.dueNowUnit); redraw(); }), draft.dueNowUnit === 'weeks' ? 'This week counts as week 1.' : 'Includes today through this many days ahead.'));
      body.append(field('Future week rows', input(draft.weekHorizon, 'Future week rows', (v) => draft.weekHorizon = v, 'number')));
      body.append(field('Weeks start on', select('Weeks start on', WEEKDAY_NAMES.map((name, i) => [String(i), name]), String(draft.weekStart), (v) => draft.weekStart = Number(v))));
      body.append(field('Show completed tasks for', input(draft.showCompletedDays, 'Show completed tasks for', (v) => draft.showCompletedDays = v, 'number'), 'Days after completion. Set to 0 to hide completed cards.'));
      if (host.onRenameBoard || host.onDuplicateBoard) {
        const board = el('div', 'tt-settings-board-actions');
        heading(board, 'Rename or duplicate', 'Duplicating makes a new board with this board’s saved settings. No tasks are copied or changed.');
        const actions = el('div', 'tt-settings-board-buttons');
        const action = (text: string, glyph: string, key: string, run: () => void) => {
          const b = button(text, 'tt-button'); b.prepend(icon(glyph));
          b.dataset.focus = key; b.onclick = run; actions.append(b);
        };
        if (host.onRenameBoard) action('Rename board…', 'pencil', 'rename-board', () => host.onRenameBoard?.());
        if (host.onDuplicateBoard) action('Duplicate board…', 'copy', 'duplicate-board', () => host.onDuplicateBoard?.());
        board.append(actions); body.append(board);
      }
      if (host.onDeleteBoard) {
        const danger = el('div', 'tt-settings-danger');
        heading(danger, 'Delete board', 'Moves this board’s note to the trash. None of your tasks are deleted: they stay in their notes, just as they are.');
        const remove = button('Delete board…', 'tt-button tt-button--danger'); remove.prepend(icon('trash-2'));
        remove.dataset.focus = 'delete-board'; remove.onclick = () => host.onDeleteBoard?.();
        danger.append(remove); body.append(danger);
      }
    } else if (section === 'filters') {
      heading(body, 'Choose what belongs here', 'Filter by tags, note folders and note properties. Put filters in a group to combine them another way.');
      body.append(groupEditor(draft, draft.filter, [], boardScope));
      const warnings = el('div', 'tt-filter-warnings');
      warnings.append(...filterWarnings(draft).map((text) => el('p', 'tt-filter-warning', text))); body.append(warnings);
      body.append(el('p', 'tt-scope-note', 'Tags match the task or its page, including nested tags. Folders include their descendants. Properties belong to the source note. Press Enter or choose a suggestion to add a value. Plugin-wide excluded folders and the boards folder are unavailable even when included here. Subtasks stay inside a visible parent without being filtered independently; when their parent is absent, they must pass these filters to appear as cards.'));
    } else if (section === 'quick') {
      quickFilterEditor(body);
    } else if (section === 'appearance') {
      heading(body, 'Choose how cards look', 'Saved in the board note, so they follow the board to other devices.');
      body.append(field('Label shape', select('Label shape', [['circle', 'Circles'], ['pill', 'Pills'], ['square', 'Squares']], draft.labelShape, (v) => { draft.labelShape = v as BoardConfig['labelShape']; })));
      body.append(field('Card spacing', select('Card spacing', [['comfortable', 'Comfortable'], ['compact', 'Compact']], draft.compact ? 'compact' : 'comfortable', (v) => { draft.compact = v === 'compact'; }),
        'Compact spacing does not change expanded subtask lists.'));
      body.append(check('Hide column selector', !draft.showColumnSelector, (v) => { draft.showColumnSelector = !v; }));
      body.append(el('p', 'tt-help', 'Hide the column dropdown and show all columns. Narrow boards still have column navigation.'));
      body.append(field('Subtask order', select('Subtask order', [['note', 'Note order'], ['completed-last', 'Completed last']], draft.sortCompletedSubtasks ? 'completed-last' : 'note', (v) => { draft.sortCompletedSubtasks = v === 'completed-last'; })));
      body.append(check('Hide completed subtasks', draft.hideCompletedSubtasks, (v) => { draft.hideCompletedSubtasks = v; }));
      body.append(el('p', 'tt-help', 'A completed subtask with open subtasks stays visible.'));
      body.append(check('Hide overdue bars', !draft.overdueBar, (v) => { draft.overdueBar = !v; }));
      body.append(field('Open notes and links in', select('Open notes and links in', [['popup', 'Pop-up editor'], ['tab', 'A tab']], draft.openLinks, (v) => { draft.openLinks = v === 'tab' ? 'tab' : 'popup'; }),
        'A card’s note and the links in its text. The pop-up editor edits the note without leaving the board. Cmd/Ctrl-click always opens a new tab.'));
    } else {
      heading(body, 'Give new tasks a home', 'Tasks added on this board go to this note and section.');
      body.append(field('Add new tasks to', select('Add new tasks to', [['default', 'Plugin default'], ['daily', 'Today’s daily note'], ['note', 'A specific note']], draft.newTasks, (v) => { draft.newTasks = v as BoardConfig['newTasks']; redraw(); })));
      if (draft.newTasks === 'note') body.append(field('Note path', input(draft.newTasksNote, 'Note path', (v) => { draft.newTasksNote = v; updateDestinationAdvice(); }), 'The note is created if it does not exist.'));
      if (draft.newTasks !== 'default') body.append(field('Under heading', input(draft.newTasksHeading, 'Under heading', (v) => draft.newTasksHeading = v), 'Leave empty to append to the note. Missing headings are created.'));
      const advice = el('div', 'tt-destination-advice'); advice.setAttribute('role', 'status');
      advice.append(...(host.destinationAdvice?.(draft) ?? []).map((text) => el('p', 'tt-help', text)));
      body.append(advice);
      if (host.onCopyShortcut) {
        const copy = button('Copy shortcut URL', 'tt-button');
        copy.onclick = () => host.onCopyShortcut?.();
        body.append(field('iOS Shortcuts', copy, 'Copy an example link for this board. Replace the example text in Shortcuts. Save destination changes before running it.'));
      }
    }
    if (errors.length) {
      const box = el('div', 'tt-settings-errors'); box.setAttribute('role', 'alert');
      errors.forEach((error) => box.append(el('div', '', error))); body.append(box);
    }
    const headerSlot = host.header ?? el('div', 'tt-editor-header-slot');
    const header = renderEditorHeader(headerSlot, 'Board settings', (el, name) => host.icon(el, name), () => host.onSave(), () => host.onDiscard());
    header.setBusy(saving, 'Saving settings…');
    const footer = el('div', 'tt-settings-footer');
    // The same save as the header's check, at the end of a long form.
    const save = button('Save', 'tt-button tt-settings-save'); save.prepend(icon('check')); save.onclick = () => host.onSave();
    save.disabled = saving;
    footer.append(save);
    if (!host.header) root.append(headerSlot);
    root.append(nav, body, footer);
    if (saving) root.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('input, select, button').forEach((control) => control.disabled = true);
    body.scrollTop = scroll;
    if (restoreKey) {
      const target = [...root.querySelectorAll<HTMLElement>('[data-focus]')].find((node) => node.dataset.focus === restoreKey);
      target?.focus({ preventScroll: true });
      if (selection != null && target?.tagName === 'INPUT' && (target as HTMLInputElement).type === 'text') {
        (target as HTMLInputElement).setSelectionRange(selection, selection);
      }
      if (focusNext && !focusNext.startsWith('tt-tab-')) target?.scrollIntoView({ block: 'nearest' });
    }
    focusNext = null;
    sayNewWarnings();
  }
  draw();
  return {
    showErrors(next) {
      // Property errors live beside their controls and update as the user fixes them.
      errors = next.filter((message) => !/^(Quick filter \d+, filter|Filter) [\d.]+:/.test(message)); validation = true;
      const unfinished = (group: DraftGroup): boolean => group.items.some((item) => item.kind === 'group' ? unfinished(item) : item.kind === 'property' && !!filterError(item));
      const quickInvalid = draft.quickFilters.filter((q) => !q.name.trim() || unfinished(q.filter));
      if (unfinished(draft.filter)) section = 'filters';
      else if (quickInvalid.length) { section = 'quick'; for (const q of quickInvalid) openQuick.add(q.id); }
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
  // Shared with the standalone browser harness; nodes are adopted by the destination document.
  const node = uiElement(document, tag); node.className = cls; if (text !== undefined) node.textContent = text; return node;
}
function button(text: string, cls: string): HTMLButtonElement {
  const node = el('button', cls, text); node.type = 'button'; return node;
}
