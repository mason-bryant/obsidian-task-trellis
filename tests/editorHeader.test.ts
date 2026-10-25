// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { prepareEditorModal, renderEditorHeader } from '../src/ui/editorHeader.ts';
import { renderBoardSettings } from '../src/ui/renderBoardSettings.ts';
import { draftFromConfig } from '../src/core/boardDraft.ts';
import { parseBoardConfig } from '../src/core/boardConfig.ts';

it('keeps save and cancel in a separate header, labelled, ordered and disabled during writes', () => {
  const root = document.createElement('div');
  const save = vi.fn(), cancel = vi.fn(), icons = vi.fn();
  const header = renderEditorHeader(root, 'Edit label', icons, save, cancel, 'Save label');
  const buttons = [...root.querySelectorAll('button')];
  expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['Save label', 'Cancel']);
  expect(icons.mock.calls.map((call) => call[1])).toEqual(['check', 'x']);
  header.setBusy(true); buttons.forEach((b) => b.click());
  expect(save).not.toHaveBeenCalled(); expect(cancel).not.toHaveBeenCalled();
  header.setBusy(false); buttons.forEach((b) => b.click());
  expect(save).toHaveBeenCalledTimes(1); expect(cancel).toHaveBeenCalledTimes(1);
});

it('tracks keyboard viewport resizing and removes listeners when closed', () => {
  const viewport = Object.assign(new EventTarget(), { height: 800, offsetTop: 0 });
  vi.stubGlobal('visualViewport', viewport);
  try {
    const modal = document.createElement('div');
    const body = document.createElement('div'); body.className = 'modal-content'; modal.append(body);
    const chrome = prepareEditorModal(modal);
    expect(modal.firstElementChild).toBe(chrome.header);
    viewport.height = 340; viewport.offsetTop = 20; viewport.dispatchEvent(new Event('resize'));
    expect(modal.style.getPropertyValue('--tt-editor-height')).toBe('316px');
    expect(modal.style.getPropertyValue('--tt-editor-top')).toBe('32px');
    chrome.destroy(); viewport.height = 500; viewport.dispatchEvent(new Event('resize'));
    expect(modal.style.getPropertyValue('--tt-editor-height')).toBe('316px');
    expect(modal.children).toHaveLength(1);
  } finally { vi.unstubAllGlobals(); }
});

describe('board settings header', () => {
  it('saves the current draft from the header and preserves actions after validation and saving redraws', () => {
    Element.prototype.scrollIntoView = vi.fn();
    const root = document.createElement('div'), header = document.createElement('div');
    document.body.replaceChildren(header, root);
    const original = parseBoardConfig('House', {}).config;
    const save = vi.fn(), discard = vi.fn();
    const form = renderBoardSettings(root, draftFromConfig(original), original, {
      header, icon: vi.fn(), attachKeySuggest: vi.fn(), attachValueSuggest: vi.fn(), attachTagSuggest: vi.fn(), attachFolderSuggest: vi.fn(),
      countTagged: () => 0, onSave: save, onDiscard: discard, onOpenNote: vi.fn(),
    });
    header.querySelector<HTMLButtonElement>('.tt-editor-save')!.click(); expect(save).toHaveBeenCalledTimes(1);
    form.setSaving(true);
    header.querySelector<HTMLButtonElement>('.tt-editor-save')!.click(); expect(save).toHaveBeenCalledTimes(1);
    expect(header.querySelector<HTMLButtonElement>('.tt-editor-cancel')!.disabled).toBe(true);
    form.setSaving(false);
    form.showErrors(['Could not save.']);
    expect(root.querySelector('[role="alert"]')!.textContent).toContain('Could not save.');
    header.querySelector<HTMLButtonElement>('.tt-editor-save')!.click(); expect(save).toHaveBeenCalledTimes(2);
    header.querySelector<HTMLButtonElement>('.tt-editor-cancel')!.click(); expect(discard).toHaveBeenCalledTimes(1);
    form.destroy();
  });
});
