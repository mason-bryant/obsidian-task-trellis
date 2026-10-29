// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { buildBoard, taskId, type BoardTask } from '../src/core/board.ts';
import { parseBoardConfig } from '../src/core/boardConfig.ts';
import { parseTaskLine } from '../src/core/taskLine.ts';
import { disposeBoardSelection, isDragging, renderBoard, type RenderHost } from '../src/ui/renderBoard.ts';

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
  vi.spyOn(section, 'getBoundingClientRect').mockReturnValue({top:100,bottom:300,left:0,right:300} as DOMRect);
  rows.forEach((row, i) => vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({top:100+i*60,height:56,bottom:156+i*60,left:0,width:300} as DOMRect));
  const event = (node: HTMLElement, type: string, y=0) => {
    const e = new MouseEvent(type,{bubbles:true,cancelable:true,clientY:y});
    Object.defineProperty(e,'dataTransfer',{value:{setData:vi.fn(),dropEffect:'',effectAllowed:''}}); node.dispatchEvent(e); return e;
  };
  const handles = rows.map(row => row.querySelector<HTMLButtonElement>(':scope > .tt-reorder-grip')!);
  handles.forEach(handle => { if(handle) { handle.setPointerCapture = vi.fn(); handle.hasPointerCapture = () => true; handle.releasePointerCapture = vi.fn(); } });
  const pointer = (index: number, type: string, y = 120, extra = {}) => {
    const e = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(e, { pointerId: 1, isPrimary: true, button: 0, clientX: 290, clientY: y, pointerType: 'mouse', ...extra });
    handles[index]!.dispatchEvent(e); return e;
  };
  return { root, host, section, rows, handles, pointer, event, tasks, model };
}

it('reorders siblings with a slot and shifting neighbors, without promoting them', () => {
  const f=board(); f.pointer(0,'pointerdown'); f.pointer(0,'pointermove',290);
  expect(f.section.querySelector('.tt-reorder-slot')).not.toBeNull();
  expect(f.rows[1]!.style.transform).toBe('translateY(-60px)');
  expect(f.host.onReorderSubtask).not.toHaveBeenCalled();
  f.pointer(0,'pointerup',290);
  expect(f.host.onReorderSubtask).toHaveBeenCalledWith(expect.objectContaining({taskId:'a.md:1',beforeId:null}));
  expect(f.host.onDrop).not.toHaveBeenCalled(); expect(f.section.querySelector('.tt-reorder-slot')).toBeNull();
  expect(f.rows[1]!.style.transform).toBe('');
});
it('does nothing for a no-op and clears the preview when cancelled', () => {
  const f=board(); f.pointer(0,'pointerdown'); f.pointer(0,'pointerup',120);
  expect(f.host.onReorderSubtask).not.toHaveBeenCalled();
  f.pointer(0,'pointerdown'); f.pointer(0,'pointermove',290); f.pointer(0,'pointercancel');
  expect(f.section.querySelector('.tt-reorder-slot')).toBeNull(); expect(f.rows[1]!.style.transform).toBe('');
});
it('Alt+arrows move one sibling and do not bubble into card movement', () => {
  const f=board(); f.rows[1]!.focus(); f.rows[1]!.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',altKey:true,bubbles:true}));
  expect(f.host.onReorderSubtask).toHaveBeenCalledWith(expect.objectContaining({taskId:'a.md:3',beforeId:'a.md:1'}));
  expect(f.host.onDrop).not.toHaveBeenCalled();
});
it.each(['mobile','coarse','filtered','composer','sorted','touch'])('does not reorder or accidentally promote inside a %s list', mode => {
  const f=board(mode==='filtered', mode==='sorted');
  if(mode==='mobile')document.body.classList.add('is-mobile');
  if(mode==='coarse')vi.mocked(matchMedia).mockReturnValue({matches:true} as MediaQueryList);
  if(mode==='composer'){const input=document.createElement('textarea');input.className='tt-add-input';f.section.append(input);}
  const extra = mode === 'touch' ? { pointerType: 'touch' } : {};
  f.pointer(0,'pointerdown',120,extra); f.pointer(0,'pointermove',290,extra); f.pointer(0,'pointerup',290,extra);
  expect(f.host.onReorderSubtask).not.toHaveBeenCalled();expect(f.host.onDrop).not.toHaveBeenCalled();
  expect(f.section.querySelector('.tt-reorder-slot')).toBeNull();
  if(mode !== 'touch') f.rows[0]!.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',altKey:true,bubbles:true}));
  expect(f.host.onReorderSubtask).not.toHaveBeenCalled();
});
it('rejects a drop into a different nesting level', () => {
  const f=board();const child=f.root.querySelector<HTMLElement>('[data-id="a.md:2"]')!;
  f.event(child,'dragstart');f.event(f.rows[2]!,'dragover',290);f.event(f.rows[2]!,'drop',290);
  expect(f.host.onReorderSubtask).not.toHaveBeenCalled();expect(f.host.onDrop).not.toHaveBeenCalled();
});
it('still promotes a subtask when dropped outside its list in a board cell', () => {
  const f=board(); f.event(f.rows[0]!,'dragstart'); const cell=f.root.querySelector<HTMLElement>('.tt-cell')!;
  f.event(cell,'dragover',290);f.event(cell,'drop',290);
  expect(f.host.onDrop).toHaveBeenCalled();expect(f.host.onReorderSubtask).not.toHaveBeenCalled();
});
it('does not intercept an ordinary main-card drop', () => {
  const f=board();const other=f.root.querySelector<HTMLElement>('[data-id="a.md:5"]')!;
  f.event(other,'dragstart');f.event(f.rows[2]!,'dragover',290);f.event(f.rows[2]!,'drop',290);
  expect(f.host.onDrop).toHaveBeenCalled();expect(f.host.onReorderSubtask).not.toHaveBeenCalled();
});

it.each(['narrow', 'selected-column'])('supports grip keys and dragging in a %s desktop pane', mode => {
  const f = board();
  if (mode === 'narrow') f.root.querySelector<HTMLElement>('.tt-scroll')!.style.setProperty('--tt-column-paging', '1');
  else f.root.querySelectorAll('.tt-col-header').forEach((header, i) => { if (i) header.remove(); });
  f.handles[2]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
  expect(f.host.onReorderSubtask).toHaveBeenLastCalledWith(expect.objectContaining({ taskId: 'a.md:4', beforeId: 'a.md:1' }));
  f.pointer(0, 'pointerdown'); f.pointer(0, 'pointerup', 290);
  expect(f.host.onReorderSubtask).toHaveBeenLastCalledWith(expect.objectContaining({ taskId: 'a.md:1', beforeId: null }));
});
it.each(['Escape','lostpointercapture','dispose','redraw'])('cancels grip movement on %s without saving or leaving drag state', reason => {
  const f = board(); f.pointer(0,'pointerdown'); f.pointer(0,'pointermove',290);
  expect(isDragging()).toBe(true);
  if (reason === 'Escape') f.handles[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: reason, bubbles: true }));
  else if (reason === 'dispose') disposeBoardSelection(f.root);
  else if (reason === 'redraw') renderBoard(f.root, f.model, f.host, { warnings: [], info: [] });
  else f.pointer(0,reason);
  expect(isDragging()).toBe(false);
  expect(f.host.onReorderSubtask).not.toHaveBeenCalled();
  expect(f.section.querySelector('.tt-reorder-slot')).toBeNull();
});
it('does not edit or start native promotion when interacting with the grip', () => {
  const f = board(); f.handles[0]!.click();
  expect(f.host.onEdit).not.toHaveBeenCalled();
  expect(f.event(f.handles[0]!, 'dragstart').defaultPrevented).toBe(true);
  f.pointer(0, 'pointerdown'); f.pointer(0, 'pointerup',290,{clientX:500});
  f.pointer(0, 'pointerdown'); f.pointer(0, 'pointerup',500);
  expect(f.host.onDrop).not.toHaveBeenCalled(); expect(f.host.onReorderSubtask).not.toHaveBeenCalled();
});

it.each(['sorted', 'filtered', 'composer'])('an unavailable %s grip cannot fall through to the row native drag', mode => {
  const f = board(mode === 'filtered', mode === 'sorted');
  if (mode === 'composer') {
    const input = document.createElement('textarea'); input.className = 'tt-add-input'; f.section.append(input);
  }
  expect(f.pointer(0, 'pointerdown').defaultPrevented).toBe(true);
  // Browsers target the draggable ancestor, not its disabled button, on dragstart.
  expect(f.event(f.rows[0]!, 'dragstart').defaultPrevented).toBe(true);
  expect(isDragging()).toBe(false);
  expect(f.host.onReorderSubtask).not.toHaveBeenCalled();
  expect(f.host.onDrop).not.toHaveBeenCalled();
  // A fresh press on the row itself still permits promotion outside the list.
  f.rows[0]!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  expect(f.event(f.rows[0]!, 'dragstart').defaultPrevented).toBe(false);
  f.event(f.rows[0]!, 'dragend');
});

it('names disabled grips after the visible tasks when completed siblings are hidden', () => {
  const f = board(true);
  expect(f.handles.map(handle => handle.getAttribute('aria-label'))).toEqual(['Reorder subtask: A', 'Reorder subtask: C']);
  expect(f.handles[1]!.dataset.boardFocus).toBe('subtask-reorder:a.md:4');
});
