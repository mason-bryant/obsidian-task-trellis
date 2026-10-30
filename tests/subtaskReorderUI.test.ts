// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { buildBoard, taskId, type BoardTask } from '../src/core/board.ts';
import { parseBoardConfig } from '../src/core/boardConfig.ts';
import { parseTaskLine } from '../src/core/taskLine.ts';
import { disposeBoardSelection, renderBoard, type RenderHost } from '../src/ui/renderBoard.ts';

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
});
afterEach(() => { document.querySelectorAll<HTMLElement>('.tt-board').forEach(disposeBoardSelection); document.body.className = ''; vi.unstubAllGlobals(); });
function board(hidden = false, sorted = false) {
  const raw = ['- [ ] Parent', '  - [ ] A', '    - [ ] Child', '  - [x] B', '  - [ ] C', '- [ ] Other'];
  const tasks: BoardTask[] = raw.map((line, i) => ({ ...parseTaskLine(line)!, raw: line, path: 'a.md', line: i, id: taskId('a.md', i),
    ...i > 0 && i < 5 ? { parentId: taskId('a.md', i === 2 ? 1 : 0) } : {} }));
  const config = parseBoardConfig('House', { slug: 'house', columns: ['Backlog', 'Doing'], 'hide-completed-subtasks': hidden }).config;
  // Explicitly set the option because frontmatter names are unrelated to the interaction under test.
  config.hideCompletedSubtasks = hidden; config.sortCompletedSubtasks = sorted;
  const model = buildBoard(tasks, config, '2026-10-29', () => undefined);
  const host: RenderHost = { renderText: (el,t) => {el.textContent=t.text;}, icon: vi.fn(), sourceLabel: ()=>'a', isCollapsed: ()=>false,
    onToggleRow: vi.fn(), onSetSubtasksCollapsed: vi.fn(), onDrop: vi.fn(), onToggle: vi.fn(), onEdit: vi.fn(), onOpenSource: vi.fn(),
    onDragEnd: vi.fn(), onAddTask: vi.fn(), onAddSubtask: vi.fn(), onReorderSubtask: vi.fn() };
  const root = document.createElement('div'); document.body.replaceChildren(root);
  renderBoard(root, model, host, {warnings:[],info:[]});
  const section = root.querySelector<HTMLElement>('.tt-subtasks')!;
  const rows = [...section.querySelectorAll<HTMLElement>(':scope > .tt-subtask')];
  // Rows sit 60px apart, so their midpoints are at 128, 188 and 248.
  rows.forEach((row, i) => vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({top:100+i*60,height:56,bottom:156+i*60,left:0,width:300} as DOMRect));
  const event = (node: HTMLElement, type: string, y=0) => {
    const e = new MouseEvent(type,{bubbles:true,cancelable:true,clientY:y});
    Object.defineProperty(e,'dataTransfer',{value:{setData:vi.fn(),dropEffect:'',effectAllowed:''}}); node.dispatchEvent(e); return e;
  };
  const drag = (from: HTMLElement, to: HTMLElement, y: number) => {
    event(from, 'dragstart'); const over = event(to, 'dragover', y);
    const marker = section.querySelector(':scope > .tt-drop-indicator');
    const [after, before] = [marker?.previousElementSibling, marker?.nextElementSibling];
    event(to, 'drop', y); event(from, 'dragend');
    return { over, marker, after, before };
  };
  const ids = () => rows.map(row => row.dataset.id);
  return { root, host, section, rows, event, drag, ids };
}
const effect = (e: Event) => (e as unknown as { dataTransfer: DataTransfer }).dataTransfer.dropEffect;

it('reorders an open subtask by dragging its row, with the insertion marker cards use', () => {
  const f = board(); f.event(f.rows[0]!, 'dragstart');
  const over = f.event(f.rows[2]!, 'dragover', 290);
  expect(over.defaultPrevented).toBe(true); expect(effect(over)).toBe('move');
  expect(f.section.querySelector(':scope > .tt-drop-indicator')!.previousElementSibling).toBe(f.rows[2]);
  f.event(f.rows[2]!, 'drop', 290);
  expect(f.host.onReorderSubtask).toHaveBeenCalledWith(expect.objectContaining({ taskId: 'a.md:1', beforeId: null }));
  expect(f.host.onDrop).not.toHaveBeenCalled(); expect(f.root.querySelector('.tt-drop-indicator')).toBeNull();
  f.drag(f.rows[2]!, f.rows[0]!, 110);
  expect(f.host.onReorderSubtask).toHaveBeenLastCalledWith(expect.objectContaining({ taskId: 'a.md:4', beforeId: 'a.md:1' }));
});
it('does nothing when dropped beside itself', () => {
  const f = board(); f.drag(f.rows[0]!, f.rows[1]!, 150); f.drag(f.rows[0]!, f.rows[0]!, 110);
  expect(f.host.onReorderSubtask).not.toHaveBeenCalled(); expect(f.host.onDrop).not.toHaveBeenCalled();
});
it('reorders open subtasks among themselves when completed ones are listed last', () => {
  const f = board(false, true);
  expect(f.ids()).toEqual(['a.md:1', 'a.md:4', 'a.md:3']);
  // Below the last open subtask means just before the completed ones, and in the note just after C.
  const { after, before } = f.drag(f.rows[0]!, f.rows[2]!, 290);
  expect(after).toBe(f.rows[1]); expect(before).toBe(f.rows[2]);
  expect(f.host.onReorderSubtask).toHaveBeenLastCalledWith(expect.objectContaining({ taskId: 'a.md:1', beforeId: null }));
  f.drag(f.rows[1]!, f.rows[0]!, 110);
  expect(f.host.onReorderSubtask).toHaveBeenLastCalledWith(expect.objectContaining({ taskId: 'a.md:4', beforeId: 'a.md:1',
    siblings: [expect.objectContaining({ id: 'a.md:1' }), expect.objectContaining({ id: 'a.md:3' }), expect.objectContaining({ id: 'a.md:4' })] }));
  // C is already the last open subtask, so dropping it under the completed one changes nothing.
  f.drag(f.rows[1]!, f.rows[2]!, 290);
  expect(f.host.onReorderSubtask).toHaveBeenCalledTimes(2);
});
it('reorders around hidden completed subtasks', () => {
  const f = board(true);
  expect(f.ids()).toEqual(['a.md:1', 'a.md:4']);
  f.drag(f.rows[1]!, f.rows[0]!, 110);
  expect(f.host.onReorderSubtask).toHaveBeenCalledWith(expect.objectContaining({ taskId: 'a.md:4', beforeId: 'a.md:1' }));
  f.drag(f.rows[1]!, f.rows[1]!, 290);
  expect(f.host.onReorderSubtask).toHaveBeenCalledTimes(1);
});
it('keeps a completed subtask in place, without promoting it inside its list', () => {
  const f = board(); const { over, marker } = f.drag(f.rows[1]!, f.rows[0]!, 110);
  expect(over.defaultPrevented).toBe(true); expect(effect(over)).toBe('none'); expect(marker).toBeNull();
  expect(f.host.onReorderSubtask).not.toHaveBeenCalled(); expect(f.host.onDrop).not.toHaveBeenCalled();
  f.rows[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true }));
  expect(f.host.onReorderSubtask).not.toHaveBeenCalled();
});
it('Alt+arrows move an open subtask past its visible neighbor and do not bubble into card movement', () => {
  const f = board(); f.rows[2]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true }));
  expect(f.host.onReorderSubtask).toHaveBeenLastCalledWith(expect.objectContaining({ taskId: 'a.md:4', beforeId: 'a.md:3' }));
  f.rows[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true }));
  expect(f.host.onReorderSubtask).toHaveBeenLastCalledWith(expect.objectContaining({ taskId: 'a.md:1', beforeId: 'a.md:4' }));
  expect(f.host.onDrop).not.toHaveBeenCalled();
  const sorted = board(false, true);
  sorted.rows[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true }));
  expect(sorted.host.onReorderSubtask).not.toHaveBeenCalled();
});
it.each(['mobile', 'coarse', 'composer'])('does not reorder or accidentally promote inside a %s list', mode => {
  const f = board();
  if (mode === 'mobile') document.body.classList.add('is-mobile');
  if (mode === 'coarse') vi.mocked(matchMedia).mockReturnValue({ matches: true } as MediaQueryList);
  if (mode === 'composer') { const input = document.createElement('textarea'); input.className = 'tt-add-input'; f.section.append(input); }
  const { over } = f.drag(f.rows[0]!, f.rows[2]!, 290);
  expect(effect(over)).toBe('none');
  f.rows[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true }));
  expect(f.host.onReorderSubtask).not.toHaveBeenCalled(); expect(f.host.onDrop).not.toHaveBeenCalled();
});
it('lets a nested list pass a parent-level drag to its own list', () => {
  const f = board(); const child = f.root.querySelector<HTMLElement>('[data-id="a.md:2"]')!;
  const { before } = f.drag(f.rows[2]!, child, 110);
  expect(before).toBe(f.rows[0]);
  expect(f.host.onReorderSubtask).toHaveBeenCalledWith(expect.objectContaining({ taskId: 'a.md:4', beforeId: 'a.md:1' }));
});
it('rejects a drop into a different nesting level', () => {
  const f = board(); const child = f.root.querySelector<HTMLElement>('[data-id="a.md:2"]')!;
  f.drag(child, f.rows[2]!, 290);
  expect(f.host.onReorderSubtask).not.toHaveBeenCalled(); expect(f.host.onDrop).not.toHaveBeenCalled();
});
it('still promotes a subtask when dropped outside its list in a board cell', () => {
  const f = board(); f.event(f.rows[0]!, 'dragstart'); const cell = f.root.querySelector<HTMLElement>('.tt-cell')!;
  f.event(cell, 'dragover', 290); f.event(cell, 'drop', 290);
  expect(f.host.onDrop).toHaveBeenCalled(); expect(f.host.onReorderSubtask).not.toHaveBeenCalled();
});
it('does not intercept an ordinary main-card drop', () => {
  const f = board(); const other = f.root.querySelector<HTMLElement>('[data-id="a.md:5"]')!;
  f.drag(other, f.rows[2]!, 290);
  expect(f.host.onDrop).toHaveBeenCalled(); expect(f.host.onReorderSubtask).not.toHaveBeenCalled();
});
