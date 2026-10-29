// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { applyEdit, buildBoard, type BoardTask } from '../src/core/board.ts';
import { parseBoardConfig } from '../src/core/boardConfig.ts';
import { BulkSelection, planBulk, triageCards } from '../src/core/bulkTriage.ts';
import { taskLabels } from '../src/core/labels.ts';
import { parseTaskLine, setClosedFallback } from '../src/core/taskLine.ts';
import { disposeBoardSelection, renderBoard, type RenderHost } from '../src/ui/renderBoard.ts';
import { renderBulkEditor } from '../src/ui/renderBulkEditor.ts';

const today = '2026-10-27';
const config = parseBoardConfig('House', { slug: 'house' }).config;
const task = (raw: string, line = 0): BoardTask => ({ ...parseTaskLine(raw)!, raw, id: `A.md:${line}`, path: 'A.md', line });
const apply = (t: BoardTask, action: Parameters<typeof planBulk>[3], cfg = config) => applyEdit(t.raw,
  planBulk([t], cfg, today, action).get(t.id)!, cfg.slug, (raw) => [setClosedFallback(raw, !parseTaskLine(raw)!.closed, today)])[0]!;

describe('bulk plans and snapshot selection', () => {
  it('adds/removes only requested labels and preserves other board tags and metadata', () => {
    const t = task('- [ ] Paint 📅 2026-11-01 #tt/house/label/green #tt/other/label/blue #tt/house/doing/100 ^paint');
    const added = apply(t, { kind: 'labels', mode: 'add', ids: ['red'] });
    expect(taskLabels(added, 'house')).toEqual(['green', 'red']);
    const removed = apply(task(added), { kind: 'labels', mode: 'remove', ids: ['green'] });
    expect(taskLabels(removed, 'house')).toEqual(['red']);
    expect(removed).toContain('#tt/other/label/blue'); expect(removed).toContain('📅 2026-11-01');
    expect(removed).toContain('#tt/house/doing/100'); expect(removed).toMatch(/\^paint$/);
  });
  it('sets and removes dates and priority without changing completion or labels', () => {
    const t = task('- [x] Paint ⏫ 📅 2026-11-01 ✅ 2026-10-26 #tt/house/label/red');
    const p = apply(t, {kind: 'priority', priority: 'low'});
    expect(parseTaskLine(p)).toMatchObject({priority:'low',closed:true,dueDate:'2026-11-01'});
    const removed = apply(task(p), {kind:'due',date:null});
    expect(parseTaskLine(removed)?.dueDate).toBeUndefined();
    expect(taskLabels(removed,'house')).toEqual(['red']);
    expect(parseTaskLine(apply(task(removed), {kind:'priority',priority:null}))?.priority).toBeUndefined();
    expect(() => apply(t, {kind:'due',date:'2026-02-30'})).toThrow();
  });
  it('follows Done and undated-column move semantics without changing children', () => {
    const c = parseBoardConfig('House', {slug:'house',columns:['Backlog','Doing','Done'], 'undated-column':'backlog','done-column':'done'}).config;
    const t = task('- [ ] Paint #tt/house/doing/100');
    expect(parseTaskLine(apply(t, {kind:'move',column:'doing'}, c))?.dueDate).toBeDefined();
    const done = apply(t, {kind:'move',column:'done'}, c);
    expect(parseTaskLine(done)?.closed).toBe(true);
    expect(parseTaskLine(done)?.dueDate).toBeUndefined();
    const reopened = apply(task(done), {kind:'move',column:'backlog'}, c);
    expect(parseTaskLine(reopened)?.closed).toBe(false);
    expect(parseTaskLine(reopened)?.dueDate).toBeUndefined();
    // A subtask shown as a card is edited like one, except that subtasks don't have labels.
    expect(planBulk([{...t,parentId:'parent'}],c,today,{kind:'priority',priority:'high'}).size).toBe(1);
    expect(planBulk([{...t,parentId:'parent'}],c,today,{kind:'labels',mode:'add',ids:['green']}).size).toBe(0);
  });
  it('selects all matching cards past row/card limits but excludes nested tasks', () => {
    const parent = task('- [ ] Paint',0), child = {...task('  - [ ] Primer',1),parentId:parent.id}, later=task('- [ ] Garden 📅 2027-01-01',2);
    const model = buildBoard([parent,child,later],config,today,()=>undefined);
    expect(triageCards(model).map(t=>t.id)).toEqual([parent.id,later.id]);
  });
  it('keeps snapshots fixed, supports ranges, and clears only when scope changes', () => {
    const a=task('- [ ] A'),b=task('- [ ] B',1),c=task('- [ ] C',2), selection=new BulkSelection();
    selection.resetScope('all'); selection.toggle(a,[a,b,c],false); selection.toggle(c,[a,b,c],true);
    expect(selection.tasks).toEqual([a,b,c]);
    expect(selection.has(task('- [ ] Replacement'))).toBe(false);
    selection.resetScope('all'); expect(selection.tasks).toHaveLength(3);
    selection.resetScope('urgent'); expect(selection.tasks).toHaveLength(0);
  });
});

function board() {
  const root=document.createElement('div');document.body.replaceChildren(root);
  const a=task('- [ ] A ⏫'),b=task('- [ ] B',1),child={...task('  - [ ] Child',2),parentId:a.id};
  const host: RenderHost = {renderText:(el,t)=>{el.textContent=t.text;},icon:vi.fn(),sourceLabel:()=> 'A',isCollapsed:()=>false,
    onToggleRow:vi.fn(),onSetSubtasksCollapsed:vi.fn(),onDrop:vi.fn(),onToggle:vi.fn(),onEdit:vi.fn(),onOpenSource:vi.fn(),onDragEnd:vi.fn(),
    onAddTask:vi.fn(),onAddSubtask:vi.fn(),onSetQuickFilters:vi.fn(),onBulkAction:vi.fn(async(tasks)=>({tasks,message:'Updated'}))};
  const draw=(tasks=[a,b,child],active:string[]=[])=>renderBoard(root,buildBoard(tasks,config,today,()=>undefined,()=>[],active),host,{warnings:[],info:[]});
  draw();
  const click=(label:string)=>{const button=[...root.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent===label||b.getAttribute('aria-label')===label)!;button.focus();button.click();};
  return {root,host,a,b,draw,click};
}

describe('bulk board interactions',()=>{
  it('Select column adds to an existing selection without toggling or duplicating earlier cards', () => {
    const f = board();
    const doing = task('- [ ] Doing task #tt/house/doing/100', 4);
    f.draw([f.a, f.b, doing]); f.click('Select'); f.click('Select A');
    f.click('Select Doing column');
    expect(f.root.querySelector('.tt-bulk-count')?.textContent).toBe('2 selected');
    expect(f.root.querySelector('[aria-label="Select A"]')?.getAttribute('aria-checked')).toBe('true');
    expect(f.root.querySelector('[aria-label="Select Doing task"]')?.getAttribute('aria-checked')).toBe('true');
    f.click('Select Doing column');
    expect(f.root.querySelector('.tt-bulk-count')?.textContent).toBe('2 selected');
    f.click('Select Backlog column');
    expect(f.root.querySelector('.tt-bulk-count')?.textContent).toBe('3 selected');
  });
  it('uses separate selection controls, keeps completion/edit handlers untouched, and exits with Escape',()=>{
    const f=board();f.click('Select');f.click('Select A');
    expect(f.root.querySelector('.tt-bulk-count')?.textContent).toBe('1 selected');
    expect(f.root.querySelector('.tt-card-drag-handle')).toBeNull();
    expect(f.root.querySelector('.tt-subtasks')).toBeNull();
    expect(f.host.onToggle).not.toHaveBeenCalled();expect(f.host.onEdit).not.toHaveBeenCalled();
    f.root.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    expect(f.root.querySelector('.tt-bulk-bar')).toBeNull();expect(f.root.querySelector('.tt-card-drag-handle')).not.toBeNull();
  });
  it('keeps selection after a write makes tasks disappear, without redrawing stale cards',async()=>{
    const f=board();f.click('Select');f.click('Select all 2 matching tasks');
    f.host.onBulkAction=vi.fn(async(tasks)=>{f.draw([]);return {tasks,message:'2 updated'};});
    f.draw();f.click('Priority');
    await vi.waitFor(()=>expect(f.root.querySelector('.tt-bulk-status')?.textContent).toBe('2 updated. 2 selected tasks are outside the current view.'));
    expect(f.root.querySelectorAll('.tt-card')).toHaveLength(0);
    expect(f.root.querySelector('.tt-bulk-count')?.textContent).toBe('2 selected');
    f.click('Labels');await vi.waitFor(()=>expect(f.host.onBulkAction).toHaveBeenCalledTimes(2));
    expect(vi.mocked(f.host.onBulkAction!).mock.calls[1]![0]).toHaveLength(2);
  });
  it('clears selection when filters change and never selects a replacement line implicitly',()=>{
    const f=board();f.click('Select');f.click('Select A');
    f.draw([task('- [ ] Replacement'),f.b]);
    expect(f.root.querySelector('[aria-label="Select Replacement"]')?.getAttribute('aria-checked')).toBe('false');
    f.draw([f.a,f.b],['high-priority']);expect(f.root.querySelector('.tt-bulk-count')?.textContent).toBe('0 selected');
  });
});

it('bulk date editor retains choices on failure and prevents empty-date submission',async()=>{
  const root=document.createElement('div'),header=document.createElement('div');document.body.replaceChildren(header,root);
  const save=vi.fn().mockRejectedValue(new Error('Disk full')),close=vi.fn();
  renderBulkEditor(root,header,config,'due',2,vi.fn(),save,close,vi.fn());
  header.querySelector<HTMLButtonElement>('button')!.click();expect(save).not.toHaveBeenCalled();
  const date=root.querySelector<HTMLInputElement>('input')!;date.value='2026-11-10';
  header.querySelector<HTMLButtonElement>('button')!.click();
  await vi.waitFor(()=>expect(root.querySelector('[role="alert"]')?.textContent).toBe('Disk full'));
  expect(date.value).toBe('2026-11-10');expect(close).not.toHaveBeenCalled();
});

it('Command-click and Ctrl-click enter selection and toggle cards without editing or completing them',()=>{
  for(const modifier of ['metaKey','ctrlKey']) {
    const f=board();
    f.root.querySelector('.tt-card')!.dispatchEvent(new MouseEvent('click',{bubbles:true,[modifier]:true}));
    expect(f.root.querySelector('.tt-bulk-count')?.textContent).toBe('1 selected');
    expect(f.host.onEdit).not.toHaveBeenCalled();expect(f.host.onToggle).not.toHaveBeenCalled();
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Select A');
    f.root.querySelector('.tt-card')!.dispatchEvent(new MouseEvent('click',{bubbles:true,[modifier]:true}));
    expect(f.root.querySelector('.tt-bulk-count')?.textContent).toBe('0 selected');
  }
});

it('Shift-click selects the displayed range and can start selection without an anchor',()=>{
  const f=board(),c=task('- [ ] C',3);f.draw([f.a,f.b,c]);
  f.root.querySelector('.tt-card')!.dispatchEvent(new MouseEvent('click',{bubbles:true,metaKey:true}));
  f.root.querySelectorAll('.tt-card')[2]!.dispatchEvent(new MouseEvent('click',{bubbles:true,shiftKey:true}));
  expect(f.root.querySelector('.tt-bulk-count')?.textContent).toBe('3 selected');
  expect(f.host.onEdit).not.toHaveBeenCalled();
  f.click('Done selecting');
  f.root.querySelectorAll('.tt-card')[1]!.dispatchEvent(new MouseEvent('click',{bubbles:true,shiftKey:true}));
  expect(f.root.querySelector('.tt-bulk-count')?.textContent).toBe('1 selected');
});

it('modifier-clicking a source link preserves navigation and does not start selection',()=>{
  const f=board();
  f.root.querySelector('.tt-source')!.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,metaKey:true}));
  expect(f.host.onOpenSource).toHaveBeenCalledWith(f.a,true);
  expect(f.root.querySelector('.tt-bulk-bar')).toBeNull();
});

it('Command-clicking a rendered link still follows the link in selection mode',()=>{
  const f=board();const follow=vi.fn();
  f.host.renderText=(el,t)=>{const link=document.createElement('a');link.textContent=t.text;link.href='#test';link.onclick=e=>{e.preventDefault();follow();};el.append(link);};
  f.draw();f.click('Select');
  f.root.querySelector('.tt-card a')!.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,metaKey:true}));
  expect(follow).toHaveBeenCalledOnce();expect(f.root.querySelector('.tt-bulk-count')?.textContent).toBe('0 selected');
});

it('clicking empty board space exits selection and clears its cards and range anchor',()=>{
  const f=board();f.click('Select');f.click('Select A');
  f.root.querySelector<HTMLElement>('.tt-grid')!.click();
  expect(f.root.querySelector('.tt-bulk-bar')).toBeNull();
  expect(f.root.classList.contains('tt-board--selecting')).toBe(false);
  f.root.querySelectorAll('.tt-card')[1]!.dispatchEvent(new MouseEvent('click',{bubbles:true,shiftKey:true}));
  expect(f.root.querySelector('.tt-bulk-count')?.textContent).toBe('1 selected');
  expect(f.root.querySelector('[aria-label="Select A"]')?.getAttribute('aria-checked')).toBe('false');
});

it('outside clicks exit selection without consuming the click or stealing focus',()=>{
  const f=board();f.click('Select');f.click('Select A');
  const outside=document.createElement('button'),action=vi.fn();document.body.append(outside);
  outside.onclick=e=>{e.stopPropagation();action();};outside.focus();outside.click();
  expect(f.root.querySelector('.tt-bulk-bar')).toBeNull();
  expect(action).toHaveBeenCalledOnce();expect(document.activeElement).toBe(outside);
});

it('keeps selection for board controls and clicks in an open bulk editor',async()=>{
  const f=board();f.click('Select');f.click('Select A');f.root.querySelector<HTMLSelectElement>('.tt-column-picker')!.click();
  expect(f.root.querySelector('.tt-bulk-count')?.textContent).toBe('1 selected');
  let close!: (result:null)=>void;
  f.host.onBulkAction=vi.fn(()=>new Promise<null>(resolve=>{close=resolve;}));f.draw();f.click('Priority');
  const dialog=document.createElement('div');dialog.setAttribute('role','dialog');document.body.append(dialog);dialog.click();
  expect(f.root.querySelector('.tt-bulk-count')?.textContent).toBe('1 selected');
  close(null);await vi.waitFor(()=>expect(f.root.querySelector('.tt-bulk-status')?.textContent).not.toContain('Choose changes'));
  dialog.remove();document.body.click();expect(f.root.querySelector('.tt-bulk-bar')).toBeNull();
});

it('removes document click listeners when the board is disposed',()=>{
  const f=board();f.click('Select');
  disposeBoardSelection(f.root);f.root.replaceChildren();document.body.click();
  expect(f.root.childElementCount).toBe(0);
  f.draw();expect(f.root.querySelector('.tt-bulk-bar')).toBeNull();
});

it('does not resurrect a closed board when its bulk dialog finishes',async()=>{
  const f=board();f.click('Select');f.click('Select A');
  let finish!: (result:null)=>void;
  f.host.onBulkAction=vi.fn(()=>new Promise<null>(resolve=>{finish=resolve;}));f.draw();f.click('Priority');
  disposeBoardSelection(f.root);f.root.textContent='A different view';
  finish(null);await new Promise(resolve=>setTimeout(resolve,0));
  expect(f.root.textContent).toBe('A different view');expect(f.host.onDragEnd).not.toHaveBeenCalled();
});

it('keeps the date field disabled after a failed remove-date save',async()=>{
  const root=document.createElement('div'),header=document.createElement('div');document.body.replaceChildren(header,root);
  const save=vi.fn().mockRejectedValue(new Error('Disk full'));
  renderBulkEditor(root,header,config,'due',2,vi.fn(),save,vi.fn(),vi.fn());
  const mode=root.querySelector('select')!,date=root.querySelector('input')!;
  mode.value='remove';mode.dispatchEvent(new Event('change'));header.querySelector('button')!.click();
  await vi.waitFor(()=>expect(root.querySelector('[role="alert"]')?.textContent).toBe('Disk full'));
  expect(save).toHaveBeenCalledWith({kind:'due',date:null});expect(date.disabled).toBe(true);expect(mode.disabled).toBe(false);
});

it.each([[1,'Apply to 1 task'],[3,'Apply to 3 tasks']])('names the apply button for %i selected',(count,name)=>{
  const root=document.createElement('div'),header=document.createElement('div');document.body.replaceChildren(header,root);
  renderBulkEditor(root,header,config,'due',count,vi.fn(),vi.fn(),vi.fn(),vi.fn());
  expect(header.querySelector('.tt-editor-save')?.getAttribute('aria-label')).toBe(name);
});
