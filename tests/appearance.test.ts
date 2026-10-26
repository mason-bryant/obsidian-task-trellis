// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { newBoardFrontmatter, parseBoardConfig } from '../src/core/boardConfig.ts';
import { draftChanged, draftFromConfig, draftToFrontmatter } from '../src/core/boardDraft.ts';
import { renderBoardSettings } from '../src/ui/renderBoardSettings.ts';

it('defaults to note-order subtasks, all shown, with the overdue bar', () => {
  expect(parseBoardConfig('House', {}).config).toMatchObject({ sortCompletedSubtasks: false, hideCompletedSubtasks: false, overdueBar: true });
  expect(parseBoardConfig('House', newBoardFrontmatter('house')).config).toMatchObject({ sortCompletedSubtasks: false, hideCompletedSubtasks: false, overdueBar: true });
});

it('saves the Appearance checkboxes to the board note', () => {
  const config = parseBoardConfig('House', { slug: 'house' }).config, draft = draftFromConfig(config);
  const root = document.createElement('div'); document.body.replaceChildren(root);
  renderBoardSettings(root, draft, config, {
    initialSection: 'appearance', icon: vi.fn(), attachKeySuggest: vi.fn(), attachValueSuggest: vi.fn(), attachTagSuggest: vi.fn(),
    attachFolderSuggest: vi.fn(), countTagged: () => 0, onSave: vi.fn(), onDiscard: vi.fn(), onOpenBoard: vi.fn(),
  });
  const box = (label: string) => [...root.querySelectorAll('label')].find((l) => l.textContent === label)!.querySelector('input')!;
  expect(box('Add red bar to overdue tasks').checked).toBe(true);
  expect(draftChanged(draft, config)).toBe(false);
  for (const label of ['Sort completed subtasks to end of list', 'Hide completed subtasks', 'Add red bar to overdue tasks']) {
    box(label).click();
  }
  const { frontmatter, errors } = draftToFrontmatter(draft, config);
  expect(errors).toEqual([]);
  expect(frontmatter).toMatchObject({ 'sort-completed-subtasks': true, 'hide-completed-subtasks': true, 'overdue-bar': false });
});
