// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { parseBoardConfig } from '../src/core/boardConfig.ts';
import { draftFromConfig } from '../src/core/boardDraft.ts';
import { renderBoardSettings, type SettingsFormHost } from '../src/ui/renderBoardSettings.ts';

it('opens first-run settings at New tasks and updates advice without resetting the caret', () => {
  const config = parseBoardConfig('First board', {}).config;
  const draft = draftFromConfig(config); draft.newTasks = 'note';
  const root = document.createElement('div'); document.body.replaceChildren(root);
  const host: SettingsFormHost = {
    initialSection: 'destination', icon: () => {}, attachKeySuggest: () => {}, attachValueSuggest: () => {},
    attachTagSuggest: () => {}, attachFolderSuggest: () => {}, countTagged: () => 0,
    destinationAdvice: (draft) => [draft.newTasksNote ? `Destination: ${draft.newTasksNote}` : 'Choose a note'],
    onDiscard: vi.fn(), onSave: vi.fn(), onOpenBoard: vi.fn(),
  };
  const form = renderBoardSettings(root, draft, config, host);
  expect(root.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('New tasks');
  expect(root.querySelector('[role="status"]')?.textContent).toBe('Choose a note');
  const input = root.querySelector<HTMLInputElement>('input[aria-label="Note path"]')!;
  input.focus(); input.value = 'Tasks/Inbox.md'; input.dispatchEvent(new Event('input', { bubbles: true }));
  expect(document.activeElement).toBe(input);
  expect(root.querySelector('[role="status"]')?.textContent).toBe('Destination: Tasks/Inbox.md');
  root.querySelector<HTMLButtonElement>('button[aria-label="Save changes"]')!.click();
  expect(host.onSave).toHaveBeenCalledOnce();
  form.destroy();
});
