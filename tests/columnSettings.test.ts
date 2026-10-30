// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { parseBoardConfig } from '../src/core/boardConfig.ts';
import { draftFromConfig, draftToFrontmatter } from '../src/core/boardDraft.ts';
import { renderBoardSettings, type SettingsFormHost } from '../src/ui/renderBoardSettings.ts';
import { ANNOUNCE_DELAY_MS } from '../src/ui/announce.ts';

function editor() {
  Element.prototype.scrollIntoView = vi.fn();
  const original = parseBoardConfig('House', { slug: 'house', columns: ['Backlog', 'Doing', 'Done'], 'done-column': 'done' }).config;
  const draft = draftFromConfig(original);
  const root = document.createElement('div'); document.body.replaceChildren(root);
  const host: SettingsFormHost = {
    initialSection: 'columns', icon: vi.fn(), attachKeySuggest: vi.fn(), attachValueSuggest: vi.fn(), attachTagSuggest: vi.fn(),
    attachFolderSuggest: vi.fn(), countTagged: () => 0, onSave: vi.fn(), onDiscard: vi.fn(),
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
