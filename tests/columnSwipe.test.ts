// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installColumnSwipe } from '../src/ui/columnSwipe.ts';

let scroller: HTMLElement;
let card: HTMLButtonElement;
let enabled: boolean;
let captured: number | null;
let time: number;
let swipe: ReturnType<typeof installColumnSwipe>;
function pointer(type: string, x: number, y: number, options: Record<string, unknown> = {}, target: HTMLElement = card) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, Object.fromEntries(Object.entries({
    pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, timeStamp: time += 40, ...options,
  }).map(([key, value]) => [key, { value }])));
  target.dispatchEvent(event);
  return event;
}
beforeEach(() => {
  scroller = document.createElement('div');
  card = document.createElement('button');
  scroller.append(card);
  document.body.replaceChildren(scroller);
  enabled = true;
  captured = null;
  time = 0;
  Object.defineProperty(scroller, 'clientWidth', { value: 400 });
  scroller.scrollLeft = 400;
  scroller.scrollTop = 300;
  scroller.scrollTo = vi.fn((options?: ScrollToOptions | number) => {
    scroller.scrollLeft = typeof options === 'number' ? options : options?.left ?? scroller.scrollLeft;
  });
  scroller.setPointerCapture = vi.fn((id) => { captured = id; });
  scroller.hasPointerCapture = vi.fn((id) => captured === id);
  scroller.releasePointerCapture = vi.fn(() => { captured = null; });
  window.matchMedia = vi.fn().mockReturnValue({ matches: false });
  swipe = installColumnSwipe(scroller, () => enabled, () => [0, 400, 800, 1200]);
});

describe('touch column paging', () => {
  it('locks a vertical gesture even when the finger later drifts sideways', () => {
    pointer('pointerdown', 200, 300);
    expect(pointer('pointermove', 205, 270).defaultPrevented).toBe(false);
    pointer('pointermove', 90, 200);
    pointer('pointerup', 90, 200);
    expect(scroller.scrollLeft).toBe(400);
    expect(scroller.setPointerCapture).not.toHaveBeenCalled();
  });
  it('tracks a held drag halfway, then advances exactly one column without changing vertical position', () => {
    pointer('pointerdown', 300, 300);
    expect(pointer('pointermove', 100, 305).defaultPrevented).toBe(true);
    expect(scroller.scrollLeft).toBe(600);
    expect(scroller.classList.contains('tt-scroll--swiping')).toBe(true);
    time += 1000;
    pointer('pointerup', 100, 305);
    expect(scroller.scrollLeft).toBe(800);
    expect(scroller.scrollTop).toBe(300);
    expect(captured).toBeNull();
    expect(scroller.classList.contains('tt-scroll--swiping')).toBe(false);
  });
  it('returns a short held drag to the original column', () => {
    pointer('pointerdown', 300, 300);
    pointer('pointermove', 250, 300);
    time += 1000;
    pointer('pointerup', 250, 300);
    expect(scroller.scrollLeft).toBe(400);
  });
  it('accepts a short deliberate flick in either direction', () => {
    for (const [end, destination] of [[240, 800], [360, 0]]) {
      scroller.scrollLeft = 400;
      pointer('pointerdown', 300, 300);
      pointer('pointermove', end!, 300);
      pointer('pointerup', end!, 300);
      expect(scroller.scrollLeft).toBe(destination);
    }
  });
  it('clamps a long drag to one adjacent column and never overscrolls the ends', () => {
    pointer('pointerdown', 300, 300);
    pointer('pointermove', -800, 300);
    expect(scroller.scrollLeft).toBe(800);
    pointer('pointerup', -800, 300);
    expect(scroller.scrollLeft).toBe(800);
    scroller.scrollLeft = 0;
    pointer('pointerdown', 200, 300);
    pointer('pointermove', 400, 300);
    pointer('pointerup', 400, 300);
    expect(scroller.scrollLeft).toBe(0);
  });
  it('cancels safely on interruption or a second finger', () => {
    for (const type of ['pointercancel', 'lostpointercapture', 'second-finger']) {
      pointer('pointerdown', 300, 300);
      pointer('pointermove', 100, 300);
      if (type === 'second-finger') pointer('pointerdown', 150, 300, { pointerId: 2, isPrimary: false });
      else pointer(type, 100, 300, {}, scroller);
      expect(scroller.scrollLeft).toBe(400);
      expect(captured).toBeNull();
    }
  });
  it('does not cancel when implicit capture transfers from a card to the scroller', () => {
    pointer('pointerdown', 300, 300);
    pointer('pointermove', 100, 300);
    pointer('lostpointercapture', 100, 300);
    expect(scroller.scrollLeft).toBe(600);
    expect(captured).toBe(1);
    pointer('pointerup', 100, 300);
    expect(scroller.scrollLeft).toBe(800);
  });
  it('suppresses swipe clicks but allows taps and keyboard activation', () => {
    const activate = vi.fn();
    card.addEventListener('click', activate);
    pointer('pointerdown', 300, 300);
    pointer('pointermove', 100, 300);
    pointer('pointerup', 100, 300);
    card.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(activate).not.toHaveBeenCalled();
    pointer('pointerdown', 300, 300);
    pointer('pointerup', 300, 300);
    card.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    card.click();
    expect(activate).toHaveBeenCalledTimes(2);
  });
  it('leaves mouse gestures, wide boards and text editing alone', () => {
    pointer('pointerdown', 300, 300, { pointerType: 'mouse' });
    pointer('pointermove', 100, 300, { pointerType: 'mouse' });
    enabled = false;
    pointer('pointerdown', 300, 300);
    pointer('pointermove', 100, 300);
    enabled = true;
    const input = document.createElement('textarea');
    scroller.append(input);
    pointer('pointerdown', 300, 300, {}, input);
    pointer('pointermove', 100, 300, {}, input);
    expect(scroller.scrollLeft).toBe(400);
    expect(scroller.scrollTo).not.toHaveBeenCalled();
  });
  it('respects reduced motion when settling on the next column', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    pointer('pointerdown', 300, 300);
    pointer('pointermove', 100, 300);
    pointer('pointerup', 100, 300);
    expect(scroller.scrollTo).toHaveBeenLastCalledWith({ left: 800, behavior: 'instant' });
  });
  it('leaves touch drag handles alone and yields to native card dragging', () => {
    const handle = document.createElement('span');
    handle.className = 'tt-card-drag-handle';
    card.append(handle);
    pointer('pointerdown', 300, 300, {}, handle);
    pointer('pointermove', 100, 300, {}, handle);
    expect(scroller.scrollLeft).toBe(400);
    expect(scroller.setPointerCapture).not.toHaveBeenCalled();
    pointer('pointerdown', 300, 300);
    card.dispatchEvent(new Event('dragstart', { bubbles: true }));
    pointer('pointermove', 100, 300);
    expect(scroller.scrollLeft).toBe(400);
  });
});

describe('paging without touch', () => {
  function wheel(deltaX: number, deltaY = 0, at = time += 16) {
    const event = new WheelEvent('wheel', { deltaX, deltaY, bubbles: true, cancelable: true });
    Object.defineProperty(event, 'timeStamp', { value: at });
    card.dispatchEvent(event);
    return event;
  }
  it('pages once per sideways trackpad swipe, ignoring its momentum, and leaves vertical scrolling alone', () => {
    expect(wheel(0, 30).defaultPrevented).toBe(false);
    expect(wheel(25).defaultPrevented).toBe(true); expect(scroller.scrollTo).not.toHaveBeenCalled();
    wheel(25); expect(scroller.scrollTo).toHaveBeenLastCalledWith({ left: 800, behavior: 'smooth' });
    for (let i = 0; i < 10; i++) wheel(30);
    expect(scroller.scrollTo).toHaveBeenCalledTimes(1);
    time += 400; wheel(-50);
    expect(scroller.scrollTo).toHaveBeenLastCalledWith({ left: 400, behavior: 'smooth' });
  });
  it('pages from the indicator buttons, stopping at either end, and only on a one-column board', () => {
    swipe.page(-1); expect(scroller.scrollLeft).toBe(0);
    swipe.page(-1); expect(scroller.scrollLeft).toBe(0);
    enabled = false; swipe.page(1); wheel(80);
    expect(scroller.scrollLeft).toBe(0);
  });
});
