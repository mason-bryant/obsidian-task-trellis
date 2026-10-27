// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('obsidian', async () => {
  const original = await vi.importActual<Record<string, unknown>>('obsidian');
  class Modal {
    modalEl = document.createElement('div'); contentEl = document.createElement('div');
    scope: unknown;
    constructor(public app: unknown) { this.modalEl.append(this.contentEl); }
    setTitle() {}
    open() { document.body.append(this.modalEl); this.onOpen(); }
    close() { this.onClose(); this.modalEl.remove(); }
    onOpen() {} onClose() {}
  }
  class MarkdownView {
    containerEl = document.createElement('div'); data = 'original';
    editor = { lineCount: () => 2, getLine: () => 'original', setCursor: vi.fn(), focus: vi.fn() };
    getViewData() { return this.data; }
    save = vi.fn(async () => {});
  }
  return { ...original, Modal, MarkdownView, Scope: class { register() {} } };
});
import { MarkdownView, type App, type WorkspaceLeaf } from 'obsidian';
import { TFile } from './mocks/obsidian.ts';
import { NotePopup, NotePopups } from '../src/obsidian/NotePopup.ts';

beforeEach(() => {
  document.body.replaceChildren();
  Object.assign(HTMLElement.prototype, {
    addClass(this: HTMLElement, name: string) { this.classList.add(name); },
    empty(this: HTMLElement) { this.replaceChildren(); },
    createEl(this: HTMLElement, tag: string, options: { cls?: string; attr?: Record<string, string>; text?: string } = {}) {
      const node = document.createElement(tag); if (options.cls) node.className = options.cls;
      for (const [key,value] of Object.entries(options.attr ?? {})) node.setAttribute(key,value);
      if (options.text) node.textContent = options.text;
      this.append(node); return node;
    },
    createDiv(this: HTMLElement, options: object) { return this.createEl('div',options); },
  });
  vi.spyOn(console,'error').mockImplementation(() => {});
});
function file(path: string) { return new TFile(path) as unknown as import('obsidian').TFile; }
function deferred() { let resolve!: () => void, reject!: (e: Error) => void; const promise = new Promise<void>((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; }
function fixture(loading = Promise.resolve()) {
  const view = new (MarkdownView as unknown as new () => MarkdownView)() as MarkdownView & {data:string};
  const parent = document.body.appendChild(document.createElement('div')); parent.append(view.containerEl);
  const previous = {} as WorkspaceLeaf;
  const leaf = { view, openFile: vi.fn(() => loading), detach: vi.fn(), setEphemeralState: vi.fn() };
  let active: unknown = previous;
  const workspace = {
    getLeaf: vi.fn(() => leaf), getMostRecentLeaf: () => active,
    setActiveLeaf: vi.fn((value: unknown) => { active = value; }),
    iterateAllLeaves: (cb: (leaf: unknown) => void) => [previous,leaf].forEach(cb),
  };
  const app = { workspace, scope: {}, keymap: { popScope: vi.fn(), pushScope: vi.fn() } } as unknown as App;
  const navigate = vi.fn(), finished = vi.fn();
  const popup = new NotePopup(app,file('Test.md'),{line:99},navigate,finished);
  const ready = async () => { popup.open(); await vi.waitFor(() => expect(view.editor.focus).toHaveBeenCalled()); };
  return { app, workspace, view, leaf, parent, previous, popup, navigate, finished, ready };
}
it('uses a managed tab and real active leaf, clamps a stale source line, then saves before closing', async () => {
  const f=fixture(); await f.ready();
  expect(f.workspace.getLeaf).toHaveBeenCalledWith('tab');
  expect(f.workspace.setActiveLeaf).toHaveBeenCalledWith(f.leaf,{focus:false});
  expect(f.view.editor.setCursor).toHaveBeenCalledWith({line:1,ch:8});
  f.popup.close(); await vi.waitFor(() => expect(f.finished).toHaveBeenCalledOnce());
  expect(f.view.save).toHaveBeenCalledOnce(); expect(f.leaf.detach).toHaveBeenCalledOnce();
  expect(f.view.containerEl.parentElement).toBe(f.parent);
  expect(f.workspace.getMostRecentLeaf()).toBe(f.previous);
});
it.each(['resolve','reject'] as const)('closing during loading suppresses late %s navigation and cleans the pending pane', async (settle) => {
  const d=deferred(), f=fixture(d.promise); f.popup.open(); f.popup.close();
  if (settle==='resolve') d.resolve(); else d.reject(new Error('gone'));
  await vi.waitFor(() => expect(f.leaf.detach).toHaveBeenCalledOnce());
  expect(f.navigate).not.toHaveBeenCalled(); expect(f.finished).toHaveBeenCalledOnce();
  expect(f.view.editor.focus).not.toHaveBeenCalled();
});
it('a genuine load failure falls back once and removes the popup', async () => {
  const d=deferred(), f=fixture(d.promise); f.popup.open(); d.reject(new Error('gone'));
  await vi.waitFor(() => expect(f.navigate).toHaveBeenCalledOnce());
  expect(f.finished).toHaveBeenCalledOnce(); expect(f.popup.modalEl.isConnected).toBe(false);
});
it('keeps an unsaved draft open after a failed save and allows retry', async () => {
  const f=fixture(); await f.ready(); f.view.data='valuable draft';
  vi.mocked(f.view.save).mockRejectedValueOnce(new Error('Disk full'));
  f.popup.close(); await vi.waitFor(() => expect(f.popup.contentEl.textContent).toContain('Could not save'));
  expect(f.popup.modalEl.isConnected).toBe(true); expect(f.leaf.detach).not.toHaveBeenCalled();
  expect(f.view.data).toBe('valuable draft'); expect(f.finished).not.toHaveBeenCalled();
  f.popup.close(); await vi.waitFor(() => expect(f.finished).toHaveBeenCalledOnce());
});
it('blocks duplicate close/expand actions and includes typing during an awaited save', async () => {
  const f=fixture(), d=deferred(); await f.ready(); vi.mocked(f.view.save).mockReturnValueOnce(d.promise);
  f.popup.close(); f.popup.close(); f.popup.modalEl.querySelector('button')!.click();
  expect(f.view.save).toHaveBeenCalledOnce(); expect(f.leaf.detach).not.toHaveBeenCalled();
  f.view.data='typed during save'; d.resolve();
  await vi.waitFor(() => expect(f.finished).toHaveBeenCalledOnce()); expect(f.view.save).toHaveBeenCalledTimes(2);
});
it('expands only after save succeeds and retains the same managed editor', async () => {
  const f=fixture(), d=deferred(); await f.ready(); vi.mocked(f.view.save).mockReturnValueOnce(d.promise);
  f.popup.modalEl.querySelector('button')!.click(); expect(f.popup.modalEl.isConnected).toBe(true);
  d.resolve(); await vi.waitFor(() => expect(f.finished).toHaveBeenCalledOnce());
  expect(f.view.containerEl.parentElement).toBe(f.parent); expect(f.leaf.detach).not.toHaveBeenCalled();
  expect(f.workspace.getMostRecentLeaf()).toBe(f.leaf); expect(f.navigate).not.toHaveBeenCalled();
});
it('unloading during a failed save hands the live draft back to its normal tab', async () => {
  const f=fixture(), d=deferred(); await f.ready(); f.view.data='unsaved'; vi.mocked(f.view.save).mockReturnValueOnce(d.promise);
  f.popup.close(); f.popup.releaseToTab(); d.reject(new Error('Disk full'));
  await vi.waitFor(() => expect(f.popup.modalEl.isConnected).toBe(false));
  expect(f.view.containerEl.parentElement).toBe(f.parent); expect(f.view.data).toBe('unsaved');
  expect(f.leaf.detach).not.toHaveBeenCalled(); expect(f.navigate).not.toHaveBeenCalled(); expect(f.finished).toHaveBeenCalledOnce();
});
it('does not steal focus from a newer active pane on close', async () => {
  const f=fixture(); await f.ready(); const other={} as WorkspaceLeaf; f.workspace.setActiveLeaf(other);
  f.popup.close(); await vi.waitFor(() => expect(f.finished).toHaveBeenCalledOnce());
  expect(f.workspace.getMostRecentLeaf()).toBe(other);
});
it('manager unload removes owned popups, keeps loaded editors in tabs and ignores future opens', async () => {
  const f=fixture(), manager=new NotePopups(f.app); manager.open(file('Test.md'),{},f.navigate);
  await vi.waitFor(() => expect(f.view.editor.focus).toHaveBeenCalled()); manager.destroy();
  expect(document.querySelector('.tt-note-popup')).toBeNull(); expect(f.leaf.detach).not.toHaveBeenCalled();
  expect(f.view.containerEl.parentElement).toBe(f.parent);
  manager.open(file('Test.md'),{},f.navigate); expect(f.workspace.getLeaf).toHaveBeenCalledOnce();
});
it('manager unload while loading cancels without opening a fallback', async () => {
  const d=deferred(), f=fixture(d.promise), manager=new NotePopups(f.app);
  manager.open(file('Test.md'),{},f.navigate); manager.destroy(); d.reject(new Error('gone'));
  await vi.waitFor(() => expect(f.leaf.detach).toHaveBeenCalledOnce()); expect(f.navigate).not.toHaveBeenCalled();
});
it('non-markdown links retain their normal navigation', () => {
  const f=fixture(), manager=new NotePopups(f.app); manager.open(file('Image.png'),{},f.navigate);
  expect(f.navigate).toHaveBeenCalledOnce(); expect(f.workspace.getLeaf).not.toHaveBeenCalled();
});
it.each([{key:'Escape'},{key:'w',metaKey:true}])('dismissal key waits for a successful save: %j', async (key) => {
  const f=fixture(), d=deferred(); await f.ready(); vi.mocked(f.view.save).mockReturnValueOnce(d.promise);
  const event=new KeyboardEvent('keydown',{...key,bubbles:true,cancelable:true}); f.view.containerEl.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true); expect(f.leaf.detach).not.toHaveBeenCalled();
  d.resolve(); await vi.waitFor(() => expect(f.finished).toHaveBeenCalledOnce());
});
it('does not consume composition Escape or dismissal from another dialog, and removes its handler on close', async () => {
  const f=fixture(); await f.ready();
  const composing=new KeyboardEvent('keydown',{key:'Escape',isComposing:true,bubbles:true,cancelable:true});
  f.view.containerEl.dispatchEvent(composing); expect(composing.defaultPrevented).toBe(false);
  const other=document.body.appendChild(document.createElement('input'));
  const elsewhere=new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true});
  other.dispatchEvent(elsewhere); expect(elsewhere.defaultPrevented).toBe(false); expect(f.view.save).not.toHaveBeenCalled();
  f.popup.releaseToTab();
  const after=new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true});
  f.view.containerEl.dispatchEvent(after); expect(after.defaultPrevented).toBe(false);
});
