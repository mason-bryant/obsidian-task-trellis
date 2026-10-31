// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { taskId } from '../src/core/board.ts';
import { parseBoardConfig } from '../src/core/boardConfig.ts';
import { draftFromConfig, draftToFrontmatter } from '../src/core/boardDraft.ts';
import { renderBoardSettings, type SettingsFormHost } from '../src/ui/renderBoardSettings.ts';
import { ANNOUNCE_DELAY_MS } from '../src/ui/announce.ts';
import { parseTaskLine } from '../src/core/taskLine.ts';

function editor() {
  Element.prototype.scrollIntoView = vi.fn();
  const original = parseBoardConfig('House', { slug: 'house', columns: ['Backlog', 'Doing', 'Done'], 'done-column': 'done' }).config;
  const draft = draftFromConfig(original);
  const root = document.createElement('div'); document.body.replaceChildren(root);
  const host: SettingsFormHost = {
    initialSection: 'columns', icon: vi.fn(), attachKeySuggest: vi.fn(), attachValueSuggest: vi.fn(), attachTagSuggest: vi.fn(),
    attachFolderSuggest: vi.fn(), taggedTasks: () => [], onSave: vi.fn(), onDiscard: vi.fn(),
  };
  renderBoardSettings(root, draft, original, host);
  const control = (label: string) => root.querySelector<HTMLElement>(`[aria-label="${label}"]`)!;
  const saved = () => parseBoardConfig('House', { slug: 'house', ...draftToFrontmatter(draft, original).frontmatter }).config;
  return { root, control, saved };
}

it('reorders columns with the same right-edge grip and keys as quick filters, keeping the Done column', () => {
  vi.useFakeTimers();
  const ui = editor();
  // The dialog's live region exists before the move, and the redraw keeps it.
  const live = ui.root.querySelector('.tt-live [role="status"]');
  const rows = [...ui.root.querySelectorAll('.tt-column-editor')];
  expect(rows).toHaveLength(3);
  expect(rows.every((row) => row.lastElementChild?.classList.contains('tt-reorder-grip'))).toBe(true);
  expect(ui.root.querySelector('[aria-label^="Move "]')).toBeNull();

  ui.control('Reorder Backlog').dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
  expect(ui.saved().columns.map((c) => c.label)).toEqual(['Doing', 'Done', 'Backlog']);
  expect(ui.saved().doneColumn).toBe('done');
  expect(document.activeElement).toBe(ui.control('Reorder Backlog'));
  expect(ui.root.querySelector('.tt-live [role="status"]')).toBe(live);
  vi.advanceTimersByTime(ANNOUNCE_DELAY_MS);
  expect(live?.textContent).toBe('Backlog moved to position 3 of 3.');

  ui.control('Reorder Done').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
  expect(ui.saved().columns.map((c) => c.label)).toEqual(['Done', 'Doing', 'Backlog']);
  expect(ui.saved().doneColumn).toBe('done');
  vi.useRealTimers();
});

it('says where a removed column’s open tasks will show, and keeps it current while the column they move to is renamed', () => {
  vi.useFakeTimers();
  Element.prototype.scrollIntoView = vi.fn();
  const original = parseBoardConfig('Personal', {
    slug: 'personal', columns: ['Backlog', 'This Week', 'Next', 'Done'], 'done-column': 'Done', 'undated-column': 'Backlog',
  }).config;
  const raw = '- [ ] sign 📅 2026-10-22 #tt/personal/this-week/100';
  const tagged = [{ ...parseTaskLine(raw)!, id: taskId('a.md', 0), path: 'a.md', line: 0, raw }];
  const root = document.createElement('div'); document.body.replaceChildren(root);
  renderBoardSettings(root, draftFromConfig(original), original, {
    initialSection: 'columns', icon: vi.fn(), attachKeySuggest: vi.fn(), attachValueSuggest: vi.fn(), attachTagSuggest: vi.fn(),
    attachFolderSuggest: vi.fn(), taggedTasks: (id) => (id === 'this-week' ? tagged : []), onSave: vi.fn(), onDiscard: vi.fn(),
  });
  const notes = () => [...root.querySelectorAll('.tt-column-removal')].map((p) => p.textContent);
  const live = root.querySelector('.tt-live [role="status"]')!;
  expect(notes()).toEqual([]);

  root.querySelector<HTMLElement>('[aria-label="Remove This Week column"]')!.click();
  const said = 'Removing This Week: 1 open task will show in Next. Their tags aren’t changed, so adding This Week back returns them.';
  expect(notes()).toEqual([said]);
  vi.advanceTimersByTime(ANNOUNCE_DELAY_MS);
  expect(live.textContent).toBe(said);

  const next = root.querySelector<HTMLInputElement>('[aria-label="Column 2 name"]')!;
  next.value = 'Up next'; next.dispatchEvent(new Event('input'));
  expect(notes()[0]).toContain('will show in Up next.');
  // Typing doesn't announce, and the next redraw doesn't say the renamed note either.
  root.querySelector<HTMLElement>('.tt-column-editor ~ .tt-button')!.click();
  vi.advanceTimersByTime(ANNOUNCE_DELAY_MS);
  expect(live.textContent).not.toContain('Up next');
  vi.useRealTimers();
});
