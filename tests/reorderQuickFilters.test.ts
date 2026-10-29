// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installQuickFilterReorder } from '../src/ui/reorderQuickFilters.ts';

const cleanups: Array<() => void> = [];
afterEach(() => { cleanups.splice(0).forEach((fn) => fn()); vi.restoreAllMocks(); });
function setup() {
  const body = document.createElement('div');
  document.body.replaceChildren(body);
  Object.defineProperty(body, 'scrollHeight', { value: 1000 });
  Object.defineProperty(body, 'clientHeight', { value: 300 });
  body.getBoundingClientRect = () => ({ left: 0, right: 400, top: 0, bottom: 300 } as DOMRect);
  const handles = Array.from({ length: 4 }, (_, i) => {
    const row = document.createElement('section'); row.className = 'tt-quick-filter-editor';
    row.getBoundingClientRect = () => ({ top: i * 70 + 10, height: 60, left: 10, width: 380 } as DOMRect);
    const handle = document.createElement('button'); handle.className = 'tt-quick-filter-drag';
    handle.setPointerCapture = vi.fn(); handle.hasPointerCapture = () => true; handle.releasePointerCapture = vi.fn();
    row.append(handle); body.append(row); return handle;
  });
  const move = vi.fn();
  let frame: FrameRequestCallback = () => undefined;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((fn) => { frame = fn; return 1; });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  const dispose = installQuickFilterReorder(body, move); cleanups.push(dispose);
  const pointer = (index: number, type: string, y: number, extra = {}) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { pointerId: 1, isPrimary: true, button: 0, clientX: 20, clientY: y, pointerType: 'touch', ...extra });
    handles[index]!.dispatchEvent(event); return event;
  };
  return { body, handles, pointer, move, dispose, tick: () => frame(0) };
}
describe('quick-filter drag handles', () => {
  it.each(['touch', 'mouse', 'pen'])('moves across multiple rows with %s and shows an insertion marker', (pointerType) => {
    const ui = setup();
    ui.pointer(0, 'pointerdown', 30, { pointerType });
    ui.pointer(0, 'pointermove', 280, { pointerType });
    expect(ui.body.querySelector<HTMLElement>('.tt-quick-filter-drop-slot')!.style.top).toBe('220px');
    expect(ui.move).not.toHaveBeenCalled();
    ui.pointer(0, 'pointerup', 280, { pointerType });
    expect(ui.move).toHaveBeenCalledWith(0, 3);
    expect(ui.body.querySelector('.tt-quick-filter-drop-slot')).toBeNull();
  });
  it('finishes even when the host intercepts events before the handle', () => {
    const ui = setup();
    const intercept = (event: Event) => event.stopPropagation();
    ui.body.addEventListener('pointermove', intercept, true);
    ui.body.addEventListener('pointerup', intercept, true);
    ui.pointer(0, 'pointerdown', 30); ui.pointer(0, 'pointermove', 280); ui.pointer(0, 'pointerup', 280);
    expect(ui.move).toHaveBeenCalledWith(0, 3);
  });

  it('moves upward to the first row', () => {
    const ui = setup(); ui.pointer(3, 'pointerdown', 240); ui.pointer(3, 'pointerup', 20);
    expect(ui.move).toHaveBeenCalledWith(3, 0);
  });
  it.each(['pointercancel', 'lostpointercapture', 'escape', 'dispose'])('cancels safely on %s', (reason) => {
    const ui = setup(); ui.pointer(0, 'pointerdown', 30); ui.pointer(0, 'pointermove', 280);
    if (reason === 'escape') ui.handles[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    else if (reason === 'dispose') ui.dispose();
    else ui.pointer(0, reason, 280);
    ui.pointer(0, 'pointerup', 280);
    expect(ui.move).not.toHaveBeenCalled();
    expect(ui.body.querySelector('.tt-quick-filter--dragging')).toBeNull();
    expect(ui.body.querySelector('.tt-quick-filter-drop-slot')).toBeNull();
    expect([...ui.body.querySelectorAll<HTMLElement>('.tt-quick-filter-editor')].every((row) => row.style.transform === '')).toBe(true);
  });
  it('ignores stationary clicks, unrelated pointers and drops outside the editor', () => {
    const ui = setup(); ui.pointer(0, 'pointerdown', 30); ui.pointer(0, 'pointerup', 32);
    ui.pointer(0, 'pointerdown', 30); ui.pointer(0, 'pointerup', 280, { pointerId: 2 });
    expect(ui.move).not.toHaveBeenCalled();
    ui.pointer(0, 'pointerup', 280, { clientX: 500 });
    expect(ui.move).not.toHaveBeenCalled();
  });
  it('scrolls at the edges only after a drag begins', () => {
    const ui = setup(); ui.pointer(0, 'pointerdown', 30); ui.tick(); expect(ui.body.scrollTop).toBe(0);
    ui.pointer(0, 'pointermove', 280); ui.tick(); expect(ui.body.scrollTop).toBe(10);
    ui.pointer(0, 'pointermove', 20); ui.tick(); expect(ui.body.scrollTop).toBe(0);
  });
  it('follows the pointer and shifts neighbors to leave a full-sized gap', () => {
    const ui = setup(); ui.pointer(0, 'pointerdown', 30); ui.pointer(0, 'pointermove', 180, { clientX: 35 });
    const rows = [...ui.body.querySelectorAll<HTMLElement>('.tt-quick-filter-editor')];
    expect(rows.map((row) => row.style.transform)).toEqual(['translate(15px, 150px)', 'translateY(-70px)', 'translateY(-70px)', 'translateY(0px)']);
    const slot = ui.body.querySelector<HTMLElement>('.tt-quick-filter-drop-slot')!;
    expect([slot.style.top, slot.style.height, slot.style.width]).toEqual(['150px', '60px', '380px']);
    // Animated rectangles must not influence the next target calculation.
    rows[2]!.getBoundingClientRect = () => ({ top: 80, height: 60 } as DOMRect);
    ui.pointer(0, 'pointermove', 180); ui.pointer(0, 'pointerup', 180);
    expect(ui.move).toHaveBeenCalledWith(0, 2);
  });
  it('handles expanded filters of different heights', () => {
    const ui = setup(); const rows = [...ui.body.querySelectorAll<HTMLElement>('.tt-quick-filter-editor')];
    const boxes = [[10, 200], [220, 60], [290, 120], [420, 60]];
    rows.forEach((row, i) => { row.getBoundingClientRect = () => ({ top: boxes[i]![0], height: boxes[i]![1], left: 10, width: 380 } as DOMRect); });
    ui.pointer(0, 'pointerdown', 110); ui.pointer(0, 'pointermove', 370);
    expect(rows[1]!.style.transform).toBe('translateY(-210px)');
    expect(ui.body.querySelector<HTMLElement>('.tt-quick-filter-drop-slot')!.style.top).toBe('210px');
    ui.pointer(0, 'pointerup', 370); expect(ui.move).toHaveBeenCalledWith(0, 2);
  });
  it('keeps the dragged row under the pointer while scrolling and bounds auto-scroll', () => {
    const ui = setup(); ui.pointer(0, 'pointerdown', 30); ui.pointer(0, 'pointermove', 280); ui.tick();
    expect(ui.handles[0]!.parentElement!.style.transform).toBe('translate(0px, 260px)');
    for (let i = 0; i < 100; i++) ui.tick();
    expect(ui.body.scrollTop).toBe(700);
  });

  it('offers keyboard reordering with boundaries', () => {
    const ui = setup();
    const key = (index: number, key: string) => ui.handles[index]!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    key(0, 'ArrowUp'); key(3, 'ArrowDown'); expect(ui.move).not.toHaveBeenCalled();
    key(0, 'End'); expect(ui.move).toHaveBeenLastCalledWith(0, 3);
    key(3, 'Home'); expect(ui.move).toHaveBeenLastCalledWith(3, 0);
  });
});
