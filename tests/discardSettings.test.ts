// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
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
  /** Opens and closes like Obsidian's Modal: the X, Escape and clicks outside call close(). */
  class Modal {
    modalEl = helpers(document.createElement('div')); contentEl = helpers(document.createElement('div'));
    title = '';
    open = vi.fn(() => { document.body.append(this.modalEl); this.onOpen(); });
    constructor(public app: unknown) { this.modalEl.append(this.contentEl); }
    close() { this.onClose(); this.modalEl.remove(); }
    setTitle(title: string) { this.title = title; return this; }
    onOpen() {}
    onClose() {}
  }
  class TextComponent { inputEl = document.createElement('input'); }
  class DropdownComponent { selectEl = document.createElement('select'); }
  class AbstractInputSuggest { close() {} }
  return { ...actual, Modal, TextComponent, DropdownComponent, AbstractInputSuggest, setIcon: () => undefined };
});
import { parseBoardConfig } from '../src/core/boardConfig.ts';
import { BoardSettingsModal } from '../src/obsidian/BoardSettingsModal.ts';
import { notices, TFile, Workspace } from './mocks/obsidian.ts';
import type { App } from 'obsidian';

beforeEach(() => { notices.length = 0; document.body.replaceChildren(); });

function setup() {
  const file = new TFile('Task Trellis/House.md');
  const app = {
    workspace: new Workspace(),
    vault: { getMarkdownFiles: () => [], getName: () => 'Vault', getAbstractFileByPath: () => null },
    metadataCache: { getFileCache: () => null, getCache: () => null },
    fileManager: { trashFile: vi.fn(async () => {}) },
  } as unknown as App;
  const plugin = {
    index: { all: () => [] }, boards: { boards: () => [] }, isExcludedFromIndex: () => false,
    quickAdd: { defaultDestination: () => ({ kind: 'note', note: 'Inbox.md', heading: '' }), dailyNotesAvailable: () => false },
    saveBoardSettings: vi.fn(async (..._args: unknown[]) => []),
  };
  const onClosed = vi.fn();
  const settings = new BoardSettingsModal(app, plugin as never, file as never, parseBoardConfig('House', { slug: 'house' }).config, 'general', onClosed);
  settings.open();
  const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === text)!;
  const edit = () => {
    const due = settings.contentEl.querySelector<HTMLInputElement>('input[aria-label="Due now window"]')!;
    due.value = '10'; due.dispatchEvent(new Event('input'));
  };
  const cancel = () => settings.modalEl.querySelector<HTMLButtonElement>('.tt-editor-cancel')!.click();
  const warning = () => [...document.body.children].find((el) => el !== settings.modalEl && el.textContent?.includes('Discard changes')) as HTMLElement | undefined;
  return { app, plugin, settings, onClosed, button, edit, cancel, warning };
}

it('closes at once when nothing has changed', () => {
  const ui = setup();
  ui.cancel();
  expect(ui.settings.modalEl.isConnected).toBe(false);
  expect(ui.warning()).toBeUndefined();
  expect(ui.onClosed).toHaveBeenCalledTimes(1);
});

it('asks before the X, Escape or a click outside throws away changes, with Keep editing focused first', async () => {
  const ui = setup();
  ui.edit();
  ui.cancel();
  expect(ui.settings.modalEl.isConnected).toBe(true);
  const warning = ui.warning()!;
  expect(warning.textContent).toContain('You’ve changed the House board’s settings without saving them. Discarding the changes leaves the board as it was.');
  expect(warning.querySelector('.tt-editor-title')!.textContent).toBe('Unsaved changes');
  expect(ui.button('Discard changes').classList.contains('tt-button--danger')).toBe(true);
  await vi.waitFor(() => expect(document.activeElement).toBe(ui.button('Keep editing')));
  // Escape and clicks outside reach close() too; while the warning is open they don't open another.
  ui.settings.close();
  expect(document.querySelectorAll('.tt-confirm-actions')).toHaveLength(1);

  ui.button('Keep editing').click();
  expect(ui.warning()).toBeUndefined();
  expect(ui.settings.modalEl.isConnected).toBe(true);
  expect(ui.settings.contentEl.querySelector<HTMLInputElement>('input[aria-label="Due now window"]')!.value).toBe('10');
  expect(ui.onClosed).not.toHaveBeenCalled();

  ui.settings.close();
  expect(ui.warning()).not.toBeUndefined();
});

it('Discard changes closes the settings without saving', () => {
  const ui = setup();
  ui.edit();
  ui.cancel();
  ui.button('Discard changes').click();
  expect(ui.warning()).toBeUndefined();
  expect(ui.settings.modalEl.isConnected).toBe(false);
  expect(ui.plugin.saveBoardSettings).not.toHaveBeenCalled();
  expect(ui.onClosed).toHaveBeenCalledTimes(1);
});

it('doesn’t ask after saving, or after deleting the board', async () => {
  const saved = setup();
  saved.edit();
  saved.button('Save').click();
  await vi.waitFor(() => expect(saved.settings.modalEl.isConnected).toBe(false));
  expect(saved.plugin.saveBoardSettings).toHaveBeenCalledTimes(1);
  expect(saved.warning()).toBeUndefined();

  document.body.replaceChildren();
  const deleted = setup();
  deleted.edit();
  deleted.button('Delete board…').click();
  deleted.button('Delete board').click();
  await vi.waitFor(() => expect(deleted.settings.modalEl.isConnected).toBe(false));
  expect(deleted.app.fileManager.trashFile).toHaveBeenCalledTimes(1);
  expect(deleted.warning()).toBeUndefined();
});
