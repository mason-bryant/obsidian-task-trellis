// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installTouchCardDrag } from '../src/ui/touchCardDrag.ts';

let scroller: HTMLElement, card: HTMLElement, handle: HTMLElement;
let host: Parameters<typeof installTouchCardDrag>[1];
let capture: number | null;
let tick: FrameRequestCallback;
let vertical: HTMLElement;
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
  installTouchCardDrag(scroller, host, () => vertical);
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
