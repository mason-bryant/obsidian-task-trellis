// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('obsidian', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('./mocks/obsidian.ts');
  type Options = { text?: string; cls?: string; attr?: Record<string, string> };
  /** The element helpers Obsidian adds, which jsdom lacks. */
  const helpers = <T extends HTMLElement>(el: T): T => Object.assign(el, {
    empty: () => el.replaceChildren(),
    addClass: (cls: string) => el.classList.add(cls),
    appendText: (text: string) => el.append(text),
    createEl: (tag: string, o: Options = {}) => {
      const child = helpers(document.createElement(tag));
      if (o.text !== undefined) child.textContent = o.text;
      if (o.cls) child.className = o.cls;
      for (const [name, value] of Object.entries(o.attr ?? {})) child.setAttribute(name, value);
      el.append(child); return child;
    },
    createDiv: (cls?: string) => (el as unknown as { createEl(tag: string, o?: Options): HTMLElement }).createEl('div', { cls }),
  });
  /** Opens and closes like Obsidian's Modal: Escape and clicks outside call close(). */
  class Modal {
    modalEl = helpers(document.createElement('div')); contentEl = helpers(document.createElement('div'));
    open = vi.fn(() => { document.body.append(this.modalEl); this.onOpen(); });
    constructor(public app: unknown) { this.modalEl.append(this.contentEl); }
    close() { this.onClose(); this.modalEl.remove(); }
    setTitle() { return this; }
    onOpen() {}
    onClose() {}
  }
  return { ...actual, Modal, setIcon: () => undefined };
});
import { parseBoardConfig } from '../src/core/boardConfig.ts';
import { draftFromConfig } from '../src/core/boardDraft.ts';
import { renderBoardSettings } from '../src/ui/renderBoardSettings.ts';
import { DeleteBoardModal } from '../src/obsidian/DeleteBoardModal.ts';
import { notices, TFile, Workspace } from './mocks/obsidian.ts';
import type { App } from 'obsidian';

beforeEach(() => { notices.length = 0; document.body.replaceChildren(); });

describe('the General tab', () => {
  const settings = (onDeleteBoard?: () => void) => {
    const root = document.createElement('div'); document.body.append(root);
    const original = parseBoardConfig('House', { slug: 'house' }).config;
    renderBoardSettings(root, draftFromConfig(original), original, {
      icon: vi.fn(), attachKeySuggest: vi.fn(), attachValueSuggest: vi.fn(), attachTagSuggest: vi.fn(), attachFolderSuggest: vi.fn(),
      countTagged: () => 0, onSave: vi.fn(), onDiscard: vi.fn(), ...(onDeleteBoard ? { onDeleteBoard } : {}),
    });
    return root;
  };

  it('comes first, opens by default, and holds the date settings that had their own tab', () => {
    const root = settings();
    const tabs = [...root.querySelectorAll<HTMLElement>('[role=tab]')].map((tab) => tab.textContent);
    expect(tabs).toEqual(['General', 'Columns', 'Filters', 'Quick filters', 'Appearance', 'New tasks']);
    expect(root.querySelector('#tt-tab-general')!.getAttribute('aria-selected')).toBe('true');
    for (const name of ['Due now window', 'Window unit', 'Future week rows', 'Weeks start on', 'Show completed tasks for']) {
      expect(root.querySelector(`[aria-label="${name}"]`), name).not.toBeNull();
    }
  });

  it('ends with a red Delete board… button that says no tasks are deleted', () => {
    const onDeleteBoard = vi.fn();
    const root = settings(onDeleteBoard);
    const section = root.querySelector('.tt-settings-danger')!;
    expect(section.textContent).toContain('None of your tasks are deleted');
    const remove = section.querySelector<HTMLButtonElement>('button')!;
    expect(remove.textContent).toBe('Delete board…');
    expect(remove.classList.contains('tt-button--danger')).toBe(true);
    remove.click();
    expect(onDeleteBoard).toHaveBeenCalledTimes(1);
  });

  it('has no delete section where nothing can delete the board', () => {
    expect(settings().querySelector('.tt-settings-danger')).toBeNull();
  });
});

describe('the Delete board warning', () => {
  const file = new TFile('Task Trellis/House.md');
  const open = (trashFile: () => Promise<void>, tagged = 3) => {
    const app = { fileManager: { trashFile: vi.fn(trashFile) }, workspace: new Workspace() } as unknown as App;
    const onDeleted = vi.fn();
    const modal = new DeleteBoardModal(app, file as never, tagged, onDeleted);
    modal.open();
    const button = (text: string) => [...modal.contentEl.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === text)!;
    return { app, modal, onDeleted, button };
  };

  it('says the note goes to the trash and none of the tasks are deleted, with Cancel focused', () => {
    const { modal, button } = open(async () => {});
    const text = modal.contentEl.textContent!;
    expect(text).toContain('Task Trellis/House.md, will be moved to the trash');
    expect(text).toContain('None of your tasks will be deleted.');
    expect(text).toContain('The 3 tasks on this board stay in their notes, unchanged');
    expect(button('Delete board').classList.contains('tt-button--danger')).toBe(true);
    return vi.waitFor(() => expect(document.activeElement).toBe(button('Cancel')));
  });

  it('Cancel closes it without touching anything', () => {
    const { app, modal, onDeleted, button } = open(async () => {});
    button('Cancel').click();
    expect(app.fileManager.trashFile).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
    expect(modal.modalEl.isConnected).toBe(false);
  });

  it('Delete board moves only the board note to the trash, then closes the settings', async () => {
    let finish!: () => void;
    const { app, modal, onDeleted, button } = open(() => new Promise<void>((resolve) => { finish = resolve; }));
    button('Delete board').click();
    expect(app.fileManager.trashFile).toHaveBeenCalledWith(file);
    // A delete in progress can't be dismissed.
    modal.close();
    expect(modal.modalEl.isConnected).toBe(true);
    finish();
    await vi.waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(modal.modalEl.isConnected).toBe(false);
    expect(notices).toEqual(['Task Trellis: moved the House board to the trash. None of its tasks were deleted.']);
  });

  it('keeps the warning open with an explanation when the note can’t be trashed', async () => {
    const { modal, onDeleted, button } = open(async () => { throw new Error('locked'); });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    button('Delete board').click();
    await vi.waitFor(() => expect(modal.contentEl.querySelector('[role=alert]')!.textContent).toContain('nothing was changed'));
    expect(onDeleted).not.toHaveBeenCalled();
    expect(modal.modalEl.isConnected).toBe(true);
    expect(button('Delete board').disabled).toBe(false);
  });

  it('words a board with one tagged task in the singular, and one with none plainly', () => {
    expect(open(async () => {}, 1).modal.contentEl.textContent).toContain('The task on this board stays in its note, unchanged');
    expect(open(async () => {}, 0).modal.contentEl.textContent).toContain('None of your tasks will be deleted. Tasks stay in their notes, unchanged.');
  });
});
