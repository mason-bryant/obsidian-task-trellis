import type { BoardConfig } from '../core/boardConfig.ts';
import type { BulkAction, BulkKind } from '../core/bulkTriage.ts';
import { labelDescription } from '../core/labels.ts';
import { QUICK_PRIORITIES } from '../core/quickFilters.ts';
import type { Priority } from '../core/taskLine.ts';
import { uiElement } from './dom.ts';
import { renderEditorHeader } from './editorHeader.ts';

export const BULK_TITLES: Record<BulkKind, string> = { move: 'Move tasks', due: 'Set due date', labels: 'Change labels', priority: 'Set priority' };
export function renderBulkEditor(root: HTMLElement, header: HTMLElement, config: BoardConfig, kind: BulkKind, count: number,
  icon: (el: HTMLElement, name: string) => void, save: (action: BulkAction) => Promise<void>, close: () => void,
  busyChanged: (busy: boolean) => void): void {
  const node = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '') => { const e = uiElement(root.ownerDocument, tag); e.textContent = text; return e; };
  root.append(node('p', `Apply to ${count} selected ${count === 1 ? 'task' : 'tasks'}.`));
  const select = (name: string, choices: [string, string][]) => {
    const label = node('label', name); label.className = 'tt-bulk-field';
    const input = node('select'); input.setAttribute('aria-label', name);
    for (const [value, text] of choices) { const option = node('option', text); option.value = value; input.append(option); }
    label.append(input); root.append(label); return input;
  };
  let action: () => BulkAction;
  if (kind === 'move') {
    const column = select('Destination column', config.columns.map((c) => [c.id, c.label]));
    action = () => ({ kind, column: column.value });
    root.append(node('p', 'Moving to Done completes tasks; moving out reopens them. Dates stay unchanged except when entering or leaving the No due date column. Undated tasks leaving it get the end date of Due now.'));
  } else if (kind === 'due') {
    const mode = select('Due date action', [['set', 'Set date'], ['remove', 'Remove due date']]);
    const label = node('label', 'Due date'); label.className = 'tt-bulk-field';
    const date = node('input'); date.type = 'date'; date.setAttribute('aria-label', 'Due date'); label.append(date); root.append(label);
    mode.onchange = () => { date.disabled = mode.value === 'remove'; };
    action = () => {
      if (mode.value === 'set' && !date.value) throw new Error('Choose a due date.');
      return { kind, date: mode.value === 'remove' ? null : date.value };
    };
  } else if (kind === 'priority') {
    const priority = select('Priority', QUICK_PRIORITIES);
    action = () => ({ kind, priority: priority.value === 'none' ? null : priority.value as Priority });
  } else {
    const mode = select('Label action', [['add', 'Add labels'], ['remove', 'Remove labels']]);
    const choices = node('div'); choices.className = 'tt-bulk-labels'; root.append(choices);
    const ids = new Set<string>();
    for (const label of config.labels) {
      const row = node('label'); row.className = 'tt-bulk-label';
      const box = node('input'); box.type = 'checkbox'; box.setAttribute('aria-label', labelDescription(label));
      box.onchange = () => { if (box.checked) ids.add(label.id); else ids.delete(label.id); };
      const square = node('span'); square.className = 'tt-quick-filter-color'; square.style.backgroundColor = label.color;
      row.append(box, square, node('span', label.name || labelDescription(label))); choices.append(row);
    }
    root.append(node('p', 'Other labels and labels belonging to other boards stay unchanged.'));
    action = () => {
      if (!ids.size) throw new Error('Choose at least one label.');
      return { kind, mode: mode.value as 'add' | 'remove', ids: [...ids] };
    };
  }
  const error = node('p'); error.setAttribute('role', 'alert'); root.append(error);
  let busy = false;
  const chrome = renderEditorHeader(header, BULK_TITLES[kind], icon, () => {
    if (busy) return;
    let next: BulkAction;
    try { next = action(); } catch (e) { error.textContent = e instanceof Error ? e.message : 'Check your choices.'; return; }
    busy = true; busyChanged(true); chrome.setBusy(true); error.textContent = '';
    const controls = [...root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select')].map((input) => ({ input, disabled: input.disabled }));
    controls.forEach(({ input }) => { input.disabled = true; });
    void save(next).then(() => { busyChanged(false); close(); }).catch((e: unknown) => {
      error.textContent = e instanceof Error ? e.message : 'Could not apply changes. Try again.';
      busy = false; busyChanged(false); chrome.setBusy(false);
      controls.forEach(({ input, disabled }) => { input.disabled = disabled; });
    });
  }, close, `Apply to ${count} tasks`);
}
