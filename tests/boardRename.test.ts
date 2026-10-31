// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import type { App, TFile as ObsidianFile } from 'obsidian';
import { TFile } from './mocks/obsidian.ts';
import { renameBoard } from '../src/obsidian/RenameBoardModal.ts';
import { renderBoardNameEditor } from '../src/ui/renderBoardNameEditor.ts';
import { renderBoard, type RenderHost } from '../src/ui/renderBoard.ts';
import { parseBoardConfig } from '../src/core/boardConfig.ts';
import { buildBoard } from '../src/core/board.ts';

function fixture(fm: Record<string, unknown> = { slug: 'original', labels: [{id: 'red', name: 'Urgent', color: '#ff0000'}] }) {
  const file = new TFile('Boards/Original.md') as unknown as ObsidianFile;
  const files = new Map([[file.path, file]]);
  const renameFile = vi.fn(async (_file: TFile, path: string) => { files.delete(file.path); file.path = path; files.set(path, file); });
  const processFrontMatter = vi.fn(async (_file: TFile, update: (fm: Record<string, unknown>) => void) => update(fm));
  const app = { vault: { getAbstractFileByPath: (path: string) => files.get(path) }, fileManager: {renameFile, processFrontMatter} } as unknown as App;
  return { app, file, files, fm, renameFile, processFrontMatter };
}
it('renames through Obsidian in the same folder and preserves the tag namespace and labels', async () => {
  const f = fixture(); const before = structuredClone(f.fm);
  await renameBoard(f.app, f.file, f.file.path, 'Home projects');
  expect(f.file.path).toBe('Boards/Home projects.md'); expect(f.fm).toEqual(before);
  expect(f.renameFile).toHaveBeenCalledTimes(1);
});
it('pins a legacy filename-derived slug before renaming', async () => {
  const f = fixture({}); await renameBoard(f.app, f.file, f.file.path, 'New name');
  expect(f.fm.slug).toBe('original');
});
it('rejects collisions, invalid names and stale files without writes', async () => {
  const f = fixture(); f.files.set('Boards/Taken.md', new TFile('Boards/Taken.md') as unknown as ObsidianFile);
  await expect(renameBoard(f.app, f.file, f.file.path, 'Taken')).rejects.toThrow('already exists');
  await expect(renameBoard(f.app, f.file, f.file.path, '../New')).rejects.toThrow('cannot contain');
  await expect(renameBoard(f.app, f.file, 'Boards/Old.md', 'New')).rejects.toThrow('elsewhere');
  f.files.delete(f.file.path);
  await expect(renameBoard(f.app, f.file, f.file.path, 'New')).rejects.toThrow('elsewhere');
  expect(f.processFrontMatter).not.toHaveBeenCalled(); expect(f.renameFile).not.toHaveBeenCalled();
});
it('does nothing for an unchanged name and does not rename if namespace preservation fails', async () => {
  const f = fixture(); await renameBoard(f.app, f.file, f.file.path, 'Original');
  expect(f.processFrontMatter).not.toHaveBeenCalled();
  f.processFrontMatter.mockRejectedValue(new Error('Read only'));
  await expect(renameBoard(f.app, f.file, f.file.path, 'New')).rejects.toThrow('Your name has been kept');
  expect(f.renameFile).not.toHaveBeenCalled();
});

function editor(save: (name: string) => Promise<void>) {
  const body = document.createElement('div'); const header = document.createElement('div');
  document.body.replaceChildren(header, body); const close = vi.fn();
  renderBoardNameEditor(body, header, 'Original', () => {}, save, close);
  const input = body.querySelector('input')!;
  const enter = (options: KeyboardEventInit = {}) => input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true, cancelable: true, ...options}));
  return { input, enter, close, header, body };
}
it('takes focus back, with the name selected, after Obsidian focuses the dialog’s first button', async () => {
  const ui = editor(vi.fn());
  ui.header.querySelector<HTMLButtonElement>('.tt-editor-save')!.focus();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(document.activeElement).toBe(ui.input);
  expect([ui.input.selectionStart, ui.input.selectionEnd]).toEqual([0, 'Original'.length]);
});
it('retains a failed name for retry, prevents overlapping saves, and ignores IME Enter', async () => {
  let reject!: (error: Error) => void;
  const save = vi.fn(() => new Promise<void>((_resolve, fail) => { reject = fail; }));
  const ui = editor(save); ui.input.value = 'New name'; ui.enter({isComposing: true}); ui.enter({keyCode: 229});
  expect(save).not.toHaveBeenCalled(); ui.enter(); ui.enter(); expect(save).toHaveBeenCalledTimes(1);
  expect(ui.input.readOnly).toBe(true); reject(new Error('Disk full'));
  await vi.waitFor(() => expect(ui.input.readOnly).toBe(false));
  expect(ui.input.value).toBe('New name'); expect(ui.body.textContent).toContain('Disk full'); expect(ui.close).not.toHaveBeenCalled();
  save.mockImplementation(async () => {}); ui.enter(); await vi.waitFor(() => expect(ui.close).toHaveBeenCalledTimes(1));
});
it('cancel performs no writes and invalid names stay in the editor', () => {
  const save = vi.fn(async () => {}); const ui = editor(save); ui.input.value = 'Bad/name'; ui.enter();
  expect(ui.input.getAttribute('aria-invalid')).toBe('true'); expect(save).not.toHaveBeenCalled();
  ui.header.querySelector<HTMLButtonElement>('.tt-editor-cancel')!.click(); expect(ui.close).toHaveBeenCalledOnce();
});
it('exposes the board title as an accessible rename button', () => {
  const root = document.createElement('div'); const onRename = vi.fn();
  const host = {onRename, icon: () => {}, isCollapsed: () => false} as unknown as RenderHost;
  renderBoard(root, buildBoard([], parseBoardConfig('Original', {}).config, '2026-10-25', () => undefined), host, {warnings: [], info: []});
  const button = root.querySelector<HTMLButtonElement>('button.tt-board-name')!;
  expect(button.getAttribute('aria-label')).toBe('Rename board: Original'); button.click(); expect(onRename).toHaveBeenCalledOnce();
});
it('requires preview before migrating, invalidates it on edit, and defaults to a title-only rename', async () => {
  const body = document.createElement('div'), header = document.createElement('div'); document.body.replaceChildren(header, body);
  const save = vi.fn(async () => {}), apply = vi.fn(async () => {}), close = vi.fn();
  const preview = vi.fn(async () => ({oldSlug: 'old', newSlug: 'new', tagCount: 2, paths: ['Tasks.md', 'Boards/Old.md'], referencePaths: ['Queries.md']}));
  renderBoardNameEditor(body, header, 'Old', () => {}, save, close, {preview, apply});
  const checkbox = body.querySelector<HTMLInputElement>('input[type=checkbox]')!;
  expect(checkbox.checked).toBe(false);
  checkbox.click(); header.querySelector<HTMLButtonElement>('.tt-editor-save')!.click();
  await vi.waitFor(() => expect(body.textContent).toContain('Tasks.md'));
  expect(apply).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled();
  const input = body.querySelector<HTMLInputElement>('input[type=text]')!; input.value = 'New'; input.dispatchEvent(new Event('input'));
  header.querySelector<HTMLButtonElement>('.tt-editor-save')!.click();
  await vi.waitFor(() => expect(preview).toHaveBeenCalledTimes(2)); expect(apply).not.toHaveBeenCalled();
  await vi.waitFor(() => expect(input.readOnly).toBe(false));
  header.querySelector<HTMLButtonElement>('.tt-editor-save')!.click();
  await vi.waitFor(() => expect(apply).toHaveBeenCalledOnce()); expect(close).toHaveBeenCalledOnce();
});

it('shows distinct pending preview/apply states and clears spinners on failure and completion', async () => {
  const body = document.createElement('div'), header = document.createElement('div'); document.body.replaceChildren(header, body);
  const result = {oldSlug: 'old', newSlug: 'new', tagCount: 1, paths: ['Tasks.md'], referencePaths: []};
  let rejectPreview!: (error: Error) => void, finishApply!: () => void;
  const preview = vi.fn(() => new Promise<typeof result>((_resolve, reject) => { rejectPreview = reject; }));
  const apply = vi.fn(() => new Promise<void>((resolve) => { finishApply = resolve; })), close = vi.fn();
  renderBoardNameEditor(body, header, 'New', () => {}, vi.fn(), close, {preview, apply});
  body.querySelector<HTMLInputElement>('input[type=checkbox]')!.click();
  const button = body.querySelector<HTMLButtonElement>('button')!, save = header.querySelector<HTMLButtonElement>('.tt-editor-save')!;
  const progress = body.querySelector<HTMLElement>('[role=status]')!;
  button.click(); button.click();
  expect(progress.hidden).toBe(false); expect(progress.textContent).toBe('Previewing tag changes…');
  expect(button.textContent).toBe('Previewing tag changes…'); expect(save.classList.contains('tt-rename-saving')).toBe(true);
  expect(preview).toHaveBeenCalledOnce(); expect(save.disabled).toBe(true);
  rejectPreview(new Error('Could not read note'));
  await vi.waitFor(() => expect(progress.hidden).toBe(true));
  expect(save.classList.contains('tt-rename-saving')).toBe(false); expect(button.textContent).toBe('Preview tag changes');
  expect(body.textContent).toContain('Could not read note'); expect(close).not.toHaveBeenCalled();
  preview.mockResolvedValue(result); button.click();
  await vi.waitFor(() => expect(save.getAttribute('aria-label')).toBe('Rename board and tags'));
  save.click(); save.click();
  expect(progress.textContent).toBe('Applying changes…'); expect(progress.hidden).toBe(false);
  expect(save.classList.contains('tt-rename-saving')).toBe(true); expect(apply).toHaveBeenCalledOnce();
  finishApply(); await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(progress.hidden).toBe(true); expect(save.classList.contains('tt-rename-saving')).toBe(false);
});
