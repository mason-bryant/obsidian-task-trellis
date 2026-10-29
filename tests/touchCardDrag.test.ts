// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installTouchCardDrag } from '../src/ui/touchCardDrag.ts';

let scroller: HTMLElement, card: HTMLElement, handle: HTMLElement;
let host: Parameters<typeof installTouchCardDrag>[1];
let capture: number | null;
let tick: FrameRequestCallback;
let vertical: HTMLElement;
let stops: number[];
function pointer(type: string, x: number, y: number, target = handle, id = 1) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, Object.fromEntries(Object.entries({
    pointerId: id, isPrimary: id === 1, pointerType: 'touch', button: 0, clientX: x, clientY: y,
  }).map(([key, value]) => [key, { value }])));
  target.dispatchEvent(event);
  return event;
}
beforeEach(() => {
  scroller = document.createElement('div');
  vertical = scroller;
  stops = [];
  scroller.scrollTo = vi.fn((options?: ScrollToOptions | number) => {
    scroller.scrollLeft = typeof options === 'number' ? options : options?.left ?? scroller.scrollLeft;
  });
  card = document.createElement('div'); card.className = 'tt-card'; card.dataset.id = 'House.md:0';
  handle = document.createElement('span'); handle.className = 'tt-card-drag-handle';
  card.append(handle); scroller.append(card); document.body.replaceChildren(scroller);
  scroller.getBoundingClientRect = () => ({ top: 100, bottom: 700, left: 0, width: 400, height: 600, right: 400, x: 0, y: 100, toJSON: () => ({}) });
  card.getBoundingClientRect = () => ({ top: 200, bottom: 300, left: 20, width: 360, height: 100, right: 380, x: 20, y: 200, toJSON: () => ({}) });
  capture = null;
  scroller.setPointerCapture = vi.fn((id) => { capture = id; });
  scroller.hasPointerCapture = vi.fn((id) => capture === id);
  scroller.releasePointerCapture = vi.fn(() => { capture = null; });
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => { tick = callback; return 1; });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  host = { start: vi.fn(), move: vi.fn(), end: vi.fn() };
  installTouchCardDrag(scroller, host, () => vertical, () => stops);
});

describe('touch card handle', () => {
  it('edge-scrolls the separate vertical list without changing the horizontal page', () => {
    vertical = document.createElement('div');
    vertical.getBoundingClientRect = scroller.getBoundingClientRect;
    scroller.append(vertical);
    scroller.scrollLeft = 400;
    pointer('pointerdown', 350, 230);
    pointer('pointermove', 350, 690);
    tick(16);
    expect(vertical.scrollTop).toBeGreaterThan(0);
    expect(scroller.scrollTop).toBe(0);
    expect(scroller.scrollLeft).toBe(400);
    pointer('pointerup', 350, 300);
  });

  it('moves a grabbed card, updates its drop point, commits and cleans up', () => {
    expect(pointer('pointerdown', 350, 230).defaultPrevented).toBe(true);
    pointer('pointermove', 340, 400);
    expect(host.start).toHaveBeenCalledWith('House.md:0');
    expect(host.move).toHaveBeenLastCalledWith(340, 400);
    const ghost = document.querySelector<HTMLElement>('.tt-touch-drag-ghost')!;
    expect(ghost.style.top).toBe('370px');
    expect(ghost.style.width).toBe('360px');
    expect(ghost.hasAttribute('data-id')).toBe(false);
    pointer('pointerup', 340, 410);
    expect(host.move).toHaveBeenLastCalledWith(340, 410);
    expect(host.end).toHaveBeenCalledWith(true);
    expect(document.querySelector('.tt-touch-drag-ghost')).toBeNull();
    expect(card.classList.contains('is-dragging')).toBe(false);
    expect(capture).toBeNull();
  });
  it('scrolls near list edges while a card is held, then stops on release', () => {
    pointer('pointerdown', 350, 230);
    pointer('pointermove', 350, 690);
    tick(16);
    expect(scroller.scrollTop).toBeGreaterThan(0);
    pointer('pointermove', 350, 110);
    const before = scroller.scrollTop;
    tick(32);
    expect(scroller.scrollTop).toBeLessThan(before);
    pointer('pointerup', 350, 300);
    expect(window.cancelAnimationFrame).toHaveBeenCalled();
  });
  it('does not move a card for a tap or a swipe on its body', () => {
    pointer('pointerdown', 350, 230); pointer('pointerup', 350, 230);
    expect(pointer('pointerdown', 150, 230, card).defaultPrevented).toBe(false);
    pointer('pointermove', 150, 400, card); pointer('pointerup', 150, 400, card);
    expect(host.start).not.toHaveBeenCalled(); expect(host.end).not.toHaveBeenCalled();
  });
  it('cancels a drag without committing when interrupted or a second finger arrives', () => {
    for (const type of ['pointercancel', 'lostpointercapture', 'second-finger']) {
      pointer('pointerdown', 350, 230); pointer('pointermove', 350, 400);
      if (type === 'second-finger') pointer('pointerdown', 100, 400, card, 2);
      else pointer(type, 350, 400, scroller);
      expect(host.end).toHaveBeenLastCalledWith(false);
      expect(document.querySelector('.tt-touch-drag-ghost')).toBeNull();
      expect(capture).toBeNull();
    }
  });
  it('suppresses the release click, then permits the next ordinary card tap', () => {
    const edit = vi.fn(); card.addEventListener('click', edit);
    pointer('pointerdown', 350, 230); pointer('pointermove', 350, 400); pointer('pointerup', 350, 400);
    card.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(edit).not.toHaveBeenCalled();
    pointer('pointerdown', 150, 230, card); pointer('pointerup', 150, 230, card);
    card.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(edit).toHaveBeenCalledTimes(1);
  });
});


describe('dragging into off-screen columns', () => {
  beforeEach(() => { stops = [0, 400, 800]; });

  it.each([-1, 1])('pages in direction %s only after an edge hold, then refreshes the drop target', (direction) => {
    scroller.scrollLeft = 400;
    scroller.scrollTop = 150;
    pointer('pointerdown', 350, 300);
    const x = direction === 1 ? 380 : 20;
    pointer('pointermove', x, 300);
    tick(0); tick(499);
    expect(scroller.scrollLeft).toBe(400);
    tick(500);
    expect(scroller.scrollLeft).toBe(direction === 1 ? 800 : 0);
    expect(scroller.scrollTop).toBe(150);
    expect(host.move).toHaveBeenLastCalledWith(x, 300);
    expect(host.end).not.toHaveBeenCalled();
    pointer('pointerup', x, 300);
    expect(host.end).toHaveBeenCalledWith(true);
  });

  it('allows a multi-column move with a pause between pages and stops at the last column', () => {
    pointer('pointerdown', 350, 300); pointer('pointermove', 380, 300);
    tick(0); tick(500);
    expect(scroller.scrollLeft).toBe(400);
    tick(1249);
    expect(scroller.scrollLeft).toBe(400);
    tick(1250);
    expect(scroller.scrollLeft).toBe(800);
    tick(3000);
    expect(scroller.scrollLeft).toBe(800);
    expect(scroller.scrollTo).toHaveBeenCalledTimes(2);
    pointer('pointerup', 200, 300);
  });

  it('does not page on a vertical reorder even though the handle starts at the right edge', () => {
    pointer('pointerdown', 375, 300); pointer('pointermove', 382, 400);
    tick(0); tick(1000);
    expect(scroller.scrollLeft).toBe(0);
    pointer('pointerup', 382, 400);
  });

  it('resets the hold when leaving the edge and can reverse direction', () => {
    scroller.scrollLeft = 400;
    pointer('pointerdown', 350, 300); pointer('pointermove', 380, 300);
    tick(0); tick(400);
    pointer('pointermove', 200, 300); tick(450);
    pointer('pointermove', 380, 300); tick(500); tick(900);
    expect(scroller.scrollLeft).toBe(400);
    pointer('pointermove', 20, 300); tick(950); tick(1450);
    expect(scroller.scrollLeft).toBe(0);
    pointer('pointerup', 200, 300);
  });

  it.each(['pointerup', 'pointercancel', 'lostpointercapture'])('stops edge navigation after %s and never commits cancellation', (type) => {
    pointer('pointerdown', 350, 300); pointer('pointermove', 380, 300);
    tick(0); tick(500);
    pointer(type, 380, 300, scroller);
    tick(1500);
    expect(scroller.scrollLeft).toBe(400);
    expect(host.end).toHaveBeenCalledWith(type === 'pointerup');
    expect(capture).toBeNull();
  });

  it('leaves wide boards and a filtered single column unchanged', () => {
    for (const positions of [[], [0]]) {
      stops = positions;
      pointer('pointerdown', 350, 300); pointer('pointermove', 380, 300);
      tick(0); tick(1000);
      expect(scroller.scrollTo).not.toHaveBeenCalled();
      pointer('pointerup', 380, 300);
    }
  });

  it('scrolls a board wider than the screen sideways near its edges, after an outward movement', () => {
    stops = [];
    Object.defineProperties(scroller, { scrollWidth: { value: 1200 }, clientWidth: { value: 400 } });
    pointer('pointerdown', 390, 300); pointer('pointermove', 398, 300); tick(0);
    expect(scroller.scrollLeft).toBe(0);
    pointer('pointermove', 399, 290); pointer('pointermove', 399, 300); tick(16);
    expect(scroller.scrollLeft).toBe(0);
    // Holding at the edge after only a small movement doesn't scroll; a press cancels that drag.
    pointer('pointerdown', 380, 300);
    pointer('pointerdown', 380, 300); pointer('pointermove', 399, 300); tick(16); tick(32);
    expect(scroller.scrollLeft).toBeGreaterThan(0);
    const right = scroller.scrollLeft;
    pointer('pointermove', 5, 300); tick(48);
    expect(scroller.scrollLeft).toBeLessThan(right);
    expect(scroller.scrollTo).not.toHaveBeenCalled();
    pointer('pointerup', 200, 300);
  });

  it('does not navigate while the pointer is outside the board', () => {
    pointer('pointerdown', 350, 300); pointer('pointermove', 410, 300);
    tick(0); tick(1000);
    pointer('pointermove', 380, 50); tick(1500); tick(2500);
    expect(scroller.scrollTo).not.toHaveBeenCalled();
    pointer('pointercancel', 380, 50, scroller);
  });
});
