// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
vi.mock('obsidian', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('./mocks/obsidian.ts');
  type Options = { text?: string; value?: string; attr?: Record<string, string> };
  /** The element helpers Obsidian adds, which jsdom lacks. */
  const helpers = <T extends HTMLElement>(el: T): T => Object.assign(el, {
    empty: () => el.replaceChildren(),
    createEl: (tag: string, o: Options = {}) => {
      const child = helpers(document.createElement(tag));
      if (o.text !== undefined) child.textContent = o.text;
      if (o.value !== undefined) (child as unknown as HTMLInputElement).value = o.value;
      for (const [name, value] of Object.entries(o.attr ?? {})) child.setAttribute(name, value);
      el.append(child); return child;
    },
    createDiv: () => (el as unknown as { createEl(tag: string): HTMLElement }).createEl('div'),
  });
  /** Opens and closes like Obsidian's Modal: Escape and clicks outside call close(). */
  class Modal {
    modalEl = helpers(document.createElement('div')); contentEl = helpers(document.createElement('div'));
    constructor(public app: unknown) { this.modalEl.append(this.contentEl); }
    open() { this.onOpen(); }
    close() { this.onClose(); }
    setTitle() { return this; }
    onOpen() {}
    onClose() {}
  }
  return { ...actual, Modal };
});
import { RenameBoardModal } from '../src/obsidian/RenameBoardModal.ts';
import { RestoreBoardRenameModal } from '../src/obsidian/RestoreBoardRenameModal.ts';
import type { BoardTagRename } from '../src/obsidian/BoardTagRename.ts';
import { TFile } from './mocks/obsidian.ts';
import type { App } from 'obsidian';

it('a board rename being written ignores close until it finishes, then closes itself', async () => {
  const file = new TFile('Boards/House.md');
  let write!: () => void;
  const app = {
    vault: { getAbstractFileByPath: (path: string) => path === file.path ? file : null },
    fileManager: {
      processFrontMatter: vi.fn(() => new Promise<void>((resolve) => { write = resolve; })),
      renameFile: vi.fn(async () => {}),
    },
  } as unknown as App;
  const modal = new RenameBoardModal(app, file as never);
  modal.open();
  const input = modal.contentEl.querySelector<HTMLInputElement>('input[aria-label="Board name"]')!;
  input.value = 'Home';
  modal.modalEl.querySelector<HTMLButtonElement>('.tt-editor-save')!.click();
  await vi.waitFor(() => expect(app.fileManager.processFrontMatter).toHaveBeenCalled());
  modal.close();
  expect(modal.contentEl.childElementCount).toBeGreaterThan(0);
  write();
  await vi.waitFor(() => expect(app.fileManager.renameFile).toHaveBeenCalledWith(file, 'Boards/Home.md'));
  await vi.waitFor(() => expect(modal.contentEl.childElementCount).toBe(0));
});

it('a restore being written ignores close until it finishes', async () => {
  let restored!: () => void;
  const record = { oldSlug: 'house', newSlug: 'home', created: '2026-10-28', status: 'applied', changes: [{ path: 'Tasks.md' }] };
  const service = {
    history: async () => [{ path: 'Task Trellis recovery/1.json', record }],
    restore: vi.fn(() => new Promise<void>((resolve) => { restored = resolve; })),
  } as unknown as BoardTagRename;
  const modal = new RestoreBoardRenameModal({} as App, service);
  modal.open();
  await vi.waitFor(() => expect(modal.modalEl.querySelector('.tt-editor-save')).not.toBeNull());
  modal.modalEl.querySelector<HTMLButtonElement>('.tt-editor-save')!.click();
  modal.close();
  expect(modal.contentEl.childElementCount).toBeGreaterThan(0);
  restored();
  await vi.waitFor(() => expect(modal.contentEl.childElementCount).toBe(0));
});
