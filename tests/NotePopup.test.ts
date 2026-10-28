// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('obsidian', async () => {
  const original = await vi.importActual<Record<string, unknown>>('obsidian');
  class Modal {
    modalEl = document.createElement('div');
    contentEl = document.createElement('div');
    scope: unknown;

    constructor(public app: unknown) {
      this.modalEl.append(this.contentEl);
    }

    setTitle() {}
    open() {
      document.body.append(this.modalEl);
      this.onOpen();
    }
    close() {
      this.onClose();
      this.modalEl.remove();
    }
    onOpen() {}
    onClose() {}
  }
  class MarkdownView {
    containerEl = document.createElement('div');
    data = 'original';
    file = { path: 'Test.md' };
    editor = {
      lineCount: () => 2,
      getLine: () => 'original',
      getCursor: () => ({ line: 1, ch: 8 }),
      setCursor: vi.fn(),
      focus: vi.fn(),
    };
    getViewData() { return this.data; }
    getMode() { return 'source'; }
    save = vi.fn(async () => {});
  }
  class WorkspaceLeaf {
    constructor(app: { detachedLeaf(): object }) {
      return app.detachedLeaf();
    }
  }
  return { ...original, Modal, MarkdownView, WorkspaceLeaf, Scope: class { register() {} } };
});

import { MarkdownView, type App } from 'obsidian';
import { TFile } from './mocks/obsidian.ts';
import { NotePopup, NotePopups } from '../src/obsidian/NotePopup.ts';

beforeEach(() => {
  document.body.replaceChildren();
  Object.assign(HTMLElement.prototype, {
    addClass(this: HTMLElement, name: string) { this.classList.add(name); },
    empty(this: HTMLElement) { this.replaceChildren(); },
    createEl(this: HTMLElement, tag: string, options: { cls?: string; attr?: Record<string, string>; text?: string } = {}) {
      const node = document.createElement(tag);
      if (options.cls) node.className = options.cls;
      for (const [key, value] of Object.entries(options.attr ?? {})) node.setAttribute(key, value);
      if (options.text) node.textContent = options.text;
      this.append(node);
      return node;
    },
    createDiv(this: HTMLElement, options: object) { return this.createEl('div', options); },
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

function file(path: string) {
  return new TFile(path) as unknown as import('obsidian').TFile;
}

function deferred() {
  let resolve!: () => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<void>((success, failure) => { resolve = success; reject = failure; });
  return { promise, resolve, reject };
}

function fixture(loading = Promise.resolve()) {
  const view = new (MarkdownView as unknown as new () => MarkdownView)() as MarkdownView & { data: string };
  const leaf = { view, openFile: vi.fn(() => loading), detach: vi.fn(), setEphemeralState: vi.fn() };
  const target = {
    view,
    openFile: vi.fn(async () => {}),
    detach: vi.fn(),
    setEphemeralState: vi.fn(),
    getViewState: () => ({ state: { file: 'Test.md' } }),
  };
  const previous = { editor: {} };
  const workspace = {
    activeEditor: previous,
    getLeaf: vi.fn(() => target),
    getLeavesOfType: vi.fn(() => [] as typeof target[]),
    revealLeaf: vi.fn(async (_leaf: unknown) => {}),
    setActiveLeaf: vi.fn(),
  };
  const app = {
    workspace,
    commands: { commands: { 'workspace:close': { checkCallback: vi.fn((_checking: boolean) => true) } } },
    detachedLeaf: vi.fn(() => leaf),
    scope: {},
    keymap: { popScope: vi.fn(), pushScope: vi.fn() },
  };
  const navigate = vi.fn();
  const finished = vi.fn();
  const popup = new NotePopup(app as unknown as App, file('Test.md'), { line: 99 }, navigate, finished);
  const ready = async () => {
    popup.open();
    await vi.waitFor(() => expect(view.editor.focus).toHaveBeenCalled());
  };
  return { app, workspace, view, leaf, target, previous, popup, navigate, finished, ready };
}

it('opens without adding or activating a tab, supplies editor commands, and saves before closing', async () => {
  const f = fixture();
  await f.ready();
  expect(f.workspace.getLeaf).not.toHaveBeenCalled();
  expect(f.workspace.setActiveLeaf).not.toHaveBeenCalled();
  expect(f.workspace.activeEditor.editor).toBe(f.view.editor);
  expect(f.view.editor.setCursor).toHaveBeenCalledWith({ line: 1, ch: 8 });

  f.popup.close();
  await vi.waitFor(() => expect(f.finished).toHaveBeenCalledOnce());
  expect(f.view.save).toHaveBeenCalledOnce();
  expect(f.leaf.detach).toHaveBeenCalledOnce();
  expect(f.workspace.activeEditor).toBe(f.previous);
});

it.each(['resolve', 'reject'] as const)('closing during loading suppresses late %s navigation', async (settle) => {
  const pending = deferred();
  const f = fixture(pending.promise);
  f.popup.open();
  f.popup.close();
  if (settle === 'resolve') pending.resolve();
  else pending.reject(new Error('Gone'));
  await vi.waitFor(() => expect(f.leaf.detach).toHaveBeenCalledOnce());
  expect(f.navigate).not.toHaveBeenCalled();
  expect(f.finished).toHaveBeenCalledOnce();
  expect(f.view.editor.focus).not.toHaveBeenCalled();
});

it('falls back once if the unsupported editor constructor is unavailable', async () => {
  const f = fixture();
  f.app.detachedLeaf.mockImplementation(() => { throw new Error('Unsupported'); });
  f.popup.open();
  await vi.waitFor(() => expect(f.navigate).toHaveBeenCalledOnce());
  expect(f.popup.modalEl.isConnected).toBe(false);
  expect(f.finished).toHaveBeenCalledOnce();
});

it('cleans up a genuine load failure and restores normal navigation', async () => {
  const pending = deferred();
  const f = fixture(pending.promise);
  f.popup.open();
  pending.reject(new Error('Gone'));
  await vi.waitFor(() => expect(f.navigate).toHaveBeenCalledOnce());
  expect(f.leaf.detach).toHaveBeenCalledOnce();
  expect(f.finished).toHaveBeenCalledOnce();
  expect(f.popup.modalEl.isConnected).toBe(false);
});

it.each([false, true])('keeps an unsaved draft after failed close/expand (%s) and allows retry', async (expand) => {
  const f = fixture();
  await f.ready();
  f.view.data = 'valuable draft';
  vi.mocked(f.view.save).mockRejectedValueOnce(new Error('Disk full'));
  if (expand) f.popup.modalEl.querySelector('button')!.click();
  else f.popup.close();
  await vi.waitFor(() => expect(f.popup.contentEl.textContent).toContain('Could not save'));
  expect(f.popup.modalEl.isConnected).toBe(true);
  expect(f.leaf.detach).not.toHaveBeenCalled();
  expect(f.target.openFile).not.toHaveBeenCalled();
  expect(f.view.data).toBe('valuable draft');
  expect(f.finished).not.toHaveBeenCalled();
  f.popup.close();
  await vi.waitFor(() => expect(f.finished).toHaveBeenCalledOnce());
});

it('serializes close/expand and includes typing during an awaited save', async () => {
  const f = fixture();
  const pending = deferred();
  await f.ready();
  vi.mocked(f.view.save).mockReturnValueOnce(pending.promise);
  f.popup.close();
  f.popup.close();
  f.popup.modalEl.querySelector('button')!.click();
  expect(f.view.save).toHaveBeenCalledOnce();
  expect(f.leaf.detach).not.toHaveBeenCalled();
  f.view.data = 'typed during save';
  pending.resolve();
  await vi.waitFor(() => expect(f.finished).toHaveBeenCalledOnce());
  expect(f.view.save).toHaveBeenCalledTimes(2);
});

it.each([false, true])('expands only after saving, reusing an existing tab when present (%s)', async (existing) => {
  const f = fixture();
  const pending = deferred();
  if (existing) f.workspace.getLeavesOfType.mockReturnValue([f.target]);
  await f.ready();
  vi.mocked(f.view.save).mockReturnValueOnce(pending.promise);
  f.popup.modalEl.querySelector('button')!.click();
  expect(f.target.openFile).not.toHaveBeenCalled();
  pending.resolve();
  await vi.waitFor(() => expect(f.finished).toHaveBeenCalledOnce());
  expect(f.workspace.getLeaf).toHaveBeenCalledTimes(existing ? 0 : 1);
  expect(f.workspace.revealLeaf).toHaveBeenCalledWith(f.target);
  expect(f.target.setEphemeralState).toHaveBeenCalledWith({ line: 1, col: 8 });
  expect(f.leaf.detach).toHaveBeenCalledOnce();
});

it('reuses a deferred tab whose Markdown view has not loaded yet', async () => {
  const f = fixture();
  f.workspace.getLeavesOfType.mockReturnValue([{ ...f.target, view: {} as MarkdownView & { data: string } }]);
  await f.ready();
  f.popup.modalEl.querySelector('button')!.click();
  await vi.waitFor(() => expect(f.finished).toHaveBeenCalledOnce());
  expect(f.workspace.getLeaf).not.toHaveBeenCalled();
});

it('keeps the popup usable when opening the destination fails', async () => {
  const f = fixture();
  await f.ready();
  f.target.openFile.mockRejectedValueOnce(new Error('Could not open tab'));
  f.popup.modalEl.querySelector('button')!.click();
  await vi.waitFor(() => expect(f.popup.contentEl.textContent).toContain('tab could not open'));
  expect(f.view.containerEl.inert).toBe(false);
  expect(f.leaf.detach).not.toHaveBeenCalled();
  expect(f.target.detach).toHaveBeenCalledOnce();
  f.popup.modalEl.querySelector('button')!.click();
  await vi.waitFor(() => expect(f.finished).toHaveBeenCalledOnce());
});

it('does not replace a newer editor context and removes its focus handler on close', async () => {
  const f = fixture();
  await f.ready();
  const other = { editor: {} };
  f.workspace.activeEditor = other;
  f.popup.close();
  await vi.waitFor(() => expect(f.finished).toHaveBeenCalledOnce());
  f.view.containerEl.dispatchEvent(new Event('focusin'));
  expect(f.workspace.activeEditor).toBe(other);
});

it('manager unload waits for saving before detaching and ignores future opens', async () => {
  const f = fixture();
  const pending = deferred();
  const manager = new NotePopups(f.app as unknown as App);
  manager.open(file('Test.md'), {}, f.navigate);
  await vi.waitFor(() => expect(f.view.editor.focus).toHaveBeenCalled());
  vi.mocked(f.view.save).mockReturnValueOnce(pending.promise);
  manager.destroy();
  manager.open(file('Test.md'), {}, f.navigate);
  expect(f.app.detachedLeaf).toHaveBeenCalledOnce();
  expect(f.leaf.detach).not.toHaveBeenCalled();
  expect(document.querySelector('.tt-note-popup')).not.toBeNull();
  pending.resolve();
  await vi.waitFor(() => expect(document.querySelector('.tt-note-popup')).toBeNull());
  expect(f.leaf.detach).toHaveBeenCalledOnce();
});

it('unload during a failed save retains the live draft and allows a recovery retry', async () => {
  const f = fixture();
  const pending = deferred();
  const manager = new NotePopups(f.app as unknown as App);
  manager.open(file('Test.md'), {}, f.navigate);
  await vi.waitFor(() => expect(f.view.editor.focus).toHaveBeenCalled());
  f.view.data = 'unsaved';
  vi.mocked(f.view.save).mockReturnValueOnce(pending.promise);
  f.view.containerEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  manager.destroy();
  pending.reject(new Error('Disk full'));
  await vi.waitFor(() => expect(document.body.textContent).toContain('Could not save'));
  expect(f.leaf.detach).not.toHaveBeenCalled();
  expect(f.view.data).toBe('unsaved');
  f.view.containerEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await vi.waitFor(() => expect(f.leaf.detach).toHaveBeenCalledOnce());
  expect(f.navigate).not.toHaveBeenCalled();
});

it('manager unload while loading cancels without opening a fallback', async () => {
  const pending = deferred();
  const f = fixture(pending.promise);
  const manager = new NotePopups(f.app as unknown as App);
  manager.open(file('Test.md'), {}, f.navigate);
  manager.destroy();
  pending.reject(new Error('Gone'));
  await vi.waitFor(() => expect(f.leaf.detach).toHaveBeenCalledOnce());
  expect(f.navigate).not.toHaveBeenCalled();
});

it('non-markdown links retain normal navigation', () => {
  const f = fixture();
  const manager = new NotePopups(f.app as unknown as App);
  manager.open(file('Image.png'), {}, f.navigate);
  expect(f.navigate).toHaveBeenCalledOnce();
  expect(f.app.detachedLeaf).not.toHaveBeenCalled();
});

it.each([{ key: 'Escape' }, { key: 'w', metaKey: true }])('dismissal waits for saving: %j', async (key) => {
  const f = fixture();
  const pending = deferred();
  await f.ready();
  vi.mocked(f.view.save).mockReturnValueOnce(pending.promise);
  const event = new KeyboardEvent('keydown', { ...key, bubbles: true, cancelable: true });
  f.view.containerEl.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  expect(f.leaf.detach).not.toHaveBeenCalled();
  pending.resolve();
  await vi.waitFor(() => expect(f.finished).toHaveBeenCalledOnce());
});

it('ignores IME dismissal and other dialogs, and removes its key handler on close', async () => {
  const f = fixture();
  await f.ready();
  const composing = new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true, cancelable: true });
  f.view.containerEl.dispatchEvent(composing);
  expect(composing.defaultPrevented).toBe(false);
  const other = document.body.appendChild(document.createElement('input'));
  const elsewhere = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  other.dispatchEvent(elsewhere);
  expect(elsewhere.defaultPrevented).toBe(false);
  expect(f.view.save).not.toHaveBeenCalled();
  f.popup.close();
  await vi.waitFor(() => expect(f.finished).toHaveBeenCalledOnce());
  const after = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  f.view.containerEl.dispatchEvent(after);
  expect(after.defaultPrevented).toBe(false);
});


it('routes the native close-tab command through save protection only while its popup owns focus', async () => {
  const f = fixture();
  const command = f.app.commands.commands['workspace:close'];
  const original = command.checkCallback;
  const pending = deferred();
  await f.ready();
  f.view.containerEl.tabIndex = 0;
  f.view.containerEl.focus();
  vi.mocked(f.view.save).mockReturnValueOnce(pending.promise);
  expect(command.checkCallback(true)).toBe(true);
  expect(f.view.save).not.toHaveBeenCalled();
  command.checkCallback(false);
  expect(f.view.save).toHaveBeenCalledOnce();
  expect(original).not.toHaveBeenCalled();
  expect(f.leaf.detach).not.toHaveBeenCalled();
  pending.resolve();
  await vi.waitFor(() => expect(f.finished).toHaveBeenCalledOnce());
  command.checkCallback(false);
  expect(original).toHaveBeenCalledOnce();
});

it('leaves native close-tab handling alone when another dialog has focus', async () => {
  const f = fixture();
  const command = f.app.commands.commands['workspace:close'];
  const original = command.checkCallback;
  await f.ready();
  const other = document.body.appendChild(document.createElement('input'));
  other.focus();
  command.checkCallback(false);
  expect(original).toHaveBeenCalledOnce();
  expect(f.view.save).not.toHaveBeenCalled();
  f.popup.close();
  await vi.waitFor(() => expect(f.finished).toHaveBeenCalledOnce());
});

it('falls back to ordinary navigation when native close-command protection is unavailable', async () => {
  const f = fixture();
  Object.defineProperty(f.app, 'commands', { value: undefined });
  f.popup.open();
  await vi.waitFor(() => expect(f.navigate).toHaveBeenCalledOnce());
  expect(f.app.detachedLeaf).not.toHaveBeenCalled();
  expect(f.popup.modalEl.isConnected).toBe(false);
});
