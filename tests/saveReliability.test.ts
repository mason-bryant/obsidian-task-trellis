// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { renderBoard, type RenderHost } from '../src/ui/renderBoard.ts';
import { buildBoard } from '../src/core/board.ts';
import { parseBoardConfig } from '../src/core/boardConfig.ts';
import { boardNameError } from '../src/core/boardName.ts';

const model = buildBoard([], parseBoardConfig('Review', {}).config, '2026-10-25', () => undefined);
function setup(save: RenderHost['onAddTask'], extra: Partial<RenderHost> = {}) {
  const root = document.createElement('div'); document.body.replaceChildren(root);
  const host: RenderHost = { renderText: () => {}, icon: () => {}, sourceLabel: () => '', isCollapsed: () => false,
    onToggleRow: () => {}, onSetSubtasksCollapsed: () => {}, onDrop: () => {}, onToggle: () => {}, onEdit: () => {},
    onOpenSource: () => {}, onDragEnd: () => {}, onAddTask: save, onAddSubtask: () => false, ...extra };
  const draw = () => renderBoard(root, model, host, { warnings: [], info: [] }); draw();
  root.querySelector<HTMLButtonElement>('.tt-add-button')!.click();
  const input = () => root.querySelector<HTMLTextAreaElement>('.tt-add-input')!;
  const type = (text: string) => { input().value = text; input().dispatchEvent(new Event('input')); };
  const enter = (init: KeyboardEventInit = {}) => input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...init }));
  type('Keep my draft');
  return { root, input, type, enter, draw };
}
afterEach(() => {
  document.querySelector<HTMLButtonElement>('.tt-add-cancel')?.click(); document.body.replaceChildren();
});
it.each([false, 'throw'])('retains the draft when save fails (%s)', async (failure) => {
  const save = vi.fn(async () => { if (failure === 'throw') throw new Error('Disk full'); return false; });
  const ui = setup(save); ui.enter(); await vi.waitFor(() => expect(ui.input().readOnly).toBe(false));
  expect(ui.input().value).toBe('Keep my draft'); ui.draw(); expect(ui.input().value).toBe('Keep my draft');
});
it('blocks duplicate submissions and clears the current composer only after success, including a redraw during saving', async () => {
  let finish!: (saved: boolean) => void;
  const save = vi.fn(() => new Promise<boolean>((resolve) => { finish = resolve; }));
  const ui = setup(save); ui.enter(); ui.draw(); ui.enter();
  expect(save).toHaveBeenCalledTimes(1); expect(ui.input().readOnly).toBe(true); expect(ui.input().value).toBe('Keep my draft');
  finish(true); await vi.waitFor(() => expect(ui.input().value).toBe(''));
});
it('an old successful save cannot clear a replacement draft', async () => {
  let finish!: (saved: boolean) => void;
  const ui = setup(() => new Promise<boolean>((resolve) => { finish = resolve; })); ui.enter();
  ui.root.querySelector<HTMLButtonElement>('.tt-add-cancel')!.click();
  ui.root.querySelector<HTMLButtonElement>('.tt-add-button')!.click(); ui.type('Newer draft');
  finish(true); await Promise.resolve(); expect(ui.input().value).toBe('Newer draft');
});
it.each([false, 'throw'])('hands the text to the host when the composer closed before its save failed (%s)', async (failure) => {
  let fail!: () => void;
  const save = vi.fn((_target: unknown, _text: string, _detailed: boolean) => new Promise<boolean>((resolve, reject) => {
    fail = () => { if (failure === 'throw') reject(new Error('Disk full')); else resolve(false); };
  }));
  const onUnsavedText = vi.fn();
  const ui = setup(save, { onUnsavedText }); ui.enter();
  ui.root.querySelector<HTMLButtonElement>('.tt-add-cancel')!.click();
  fail(); await vi.waitFor(() => expect(onUnsavedText).toHaveBeenCalledWith('Keep my draft', expect.any(Function)));
  save.mockResolvedValueOnce(true);
  await expect(onUnsavedText.mock.calls[0]![1]('Keep my draft, fixed')).resolves.toBe(true);
  expect(save).toHaveBeenLastCalledWith(expect.anything(), 'Keep my draft, fixed', false);
});
it('keeps a failed draft in the open composer rather than handing it over', async () => {
  const onUnsavedText = vi.fn();
  const ui = setup(async () => false, { onUnsavedText }); ui.enter();
  await vi.waitFor(() => expect(ui.input().readOnly).toBe(false));
  expect(onUnsavedText).not.toHaveBeenCalled(); expect(ui.input().value).toBe('Keep my draft');
});
it.each([{ isComposing: true }, { keyCode: 229 }])('does not submit IME confirmation %j', (event) => {
  const save = vi.fn(() => true); const ui = setup(save); ui.enter(event);
  expect(save).not.toHaveBeenCalled(); expect(ui.input().value).toBe('Keep my draft');
});
it.each(['Question?', 'a/b', 'a\\b', 'a:b', 'a*b', 'a"b', 'a<b', 'a>b', 'a|b', 'a#b', 'a^b', 'a[b]', 'CON', 'lpt1', 'Trailing.', 'Trailing ', ''])('rejects nonportable board name %s', (name) => {
  expect(boardNameError(name)).not.toBeNull();
});
it.each(['House projects', '日本語', 'Financial planning 2026'])('accepts board name %s', (name) => expect(boardNameError(name)).toBeNull());
