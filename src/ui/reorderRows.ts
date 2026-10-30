import { uiElement } from './dom.ts';

/**
 * Reorders the rows of a settings list, such as columns or quick filters, by the `.tt-reorder-grip`
 * on each row's right edge, or by its arrow, Home and End keys. Pointer capture supports mouse, pen
 * and touch without making the rows themselves draggable.
 */
export function installRowReorder(body: HTMLElement, rowSelector: string, move: (from: number, to: number) => void): () => void {
  const rows = [...body.querySelectorAll<HTMLElement>(rowSelector)];
  const view = body.ownerDocument.defaultView!;
  type Box = { top: number; height: number; left: number; width: number };
  let drag: {
    from: number; id: number; handle: HTMLElement; startY: number; startX: number;
    y: number; x: number; to: number; moved: boolean; scroll: number; maxScroll: number;
    boxes: Box[]; gap: number; placeholder: HTMLElement | null;
  } | null = null;
  let frame = 0;
  const target = () => {
    if (!drag?.moved) return;
    const current = drag;
    const scrollDelta = body.scrollTop - current.scroll;
    // Hit-test the original layout, never the animated rectangles. Otherwise the
    // rows moving out of the way can repeatedly flip the target under the pointer.
    const others = current.boxes.filter((_, index) => index !== current.from);
    const at = others.findIndex((box) => current.y + scrollDelta < box.top + box.height / 2);
    current.to = at < 0 ? others.length : at;
    const source = current.boxes[current.from]!;
    const stride = source.height + current.gap;
    rows.forEach((row, index) => {
      if (index === current.from) {
        row.style.transform = `translate(${current.x - current.startX}px, ${current.y - current.startY + scrollDelta}px)`;
      } else {
        const offset = current.to > current.from && index > current.from && index <= current.to ? -stride :
          current.to < current.from && index >= current.to && index < current.from ? stride : 0;
        row.style.transform = `translateY(${offset}px)`;
      }
    });
    const destination = current.boxes[current.to]!;
    const top = current.to > current.from ? destination.top + destination.height - source.height : destination.top;
    const bodyBox = body.getBoundingClientRect();
    const marker = current.placeholder!;
    marker.style.top = `${top - bodyBox.top + current.scroll}px`;
    marker.style.left = `${source.left - bodyBox.left + body.scrollLeft}px`;
    marker.style.width = `${source.width}px`;
    marker.style.height = `${source.height}px`;
  };
  const tick = () => {
    if (!drag) return;
    if (drag.moved) {
      const rect = body.getBoundingClientRect();
      const speed = drag.y < rect.top + 48 ? -10 : drag.y > rect.bottom - 48 ? 10 : 0;
      if (speed) body.scrollTop = Math.max(0, Math.min(drag.maxScroll, body.scrollTop + speed));
      target();
    }
    frame = view.requestAnimationFrame(tick);
  };
  const finish = (commit: boolean) => {
    const current = drag;
    drag = null;
    view.cancelAnimationFrame(frame);
    if (!current) return;
    current.placeholder?.remove();
    body.classList.remove('tt-reordering');
    rows.forEach((row) => {
      row.classList.remove('tt-reorder-row--dragging', 'tt-reorder-row--shifting');
      row.style.removeProperty('transform');
    });
    if (current.handle.hasPointerCapture(current.id)) current.handle.releasePointerCapture(current.id);
    const rect = body.getBoundingClientRect();
    if (commit && current.moved && current.x >= rect.left && current.x <= rect.right && current.to !== current.from) move(current.from, current.to);
  };
  const cleanups: Array<() => void> = [];
  rows.forEach((row, from) => {
    const handle = row.querySelector<HTMLElement>('.tt-reorder-grip')!;
    const down = (event: PointerEvent) => {
      if (drag || !event.isPrimary || event.button !== 0) return;
      event.preventDefault(); event.stopPropagation();
      handle.focus({ preventScroll: true });
      const boxes = rows.map((item) => {
        const { top, height, left, width } = item.getBoundingClientRect();
        return { top, height, left, width };
      });
      const source = boxes[from]!;
      const gap = boxes[from + 1] ? boxes[from + 1]!.top - source.top - source.height :
        boxes[from - 1] ? source.top - boxes[from - 1]!.top - boxes[from - 1]!.height : 0;
      drag = { from, id: event.pointerId, handle, startY: event.clientY, startX: event.clientX,
        y: event.clientY, x: event.clientX, to: from, moved: false, scroll: body.scrollTop, maxScroll: Math.max(0, body.scrollHeight - body.clientHeight),
        boxes, gap, placeholder: null };
      handle.setPointerCapture(event.pointerId);
      frame = view.requestAnimationFrame(tick);
    };
    const moving = (event: PointerEvent) => {
      if (drag?.id !== event.pointerId || drag.handle !== handle) return;
      event.preventDefault(); event.stopPropagation();
      drag.y = event.clientY; drag.x = event.clientX;
      if (!drag.moved && Math.abs(drag.y - drag.startY) < 5) return;
      if (!drag.moved) {
        drag.moved = true;
        const placeholder = uiElement(body.ownerDocument, 'div');
        placeholder.className = 'tt-reorder-slot';
        placeholder.setAttribute('aria-hidden', 'true');
        drag.placeholder = placeholder;
        body.append(placeholder);
        body.classList.add('tt-reordering');
        rows.forEach((item, index) => item.classList.add(index === from ? 'tt-reorder-row--dragging' : 'tt-reorder-row--shifting'));
      }
      target();
    };
    const up = (event: PointerEvent) => {
      if (drag?.id !== event.pointerId || drag.handle !== handle) return;
      moving(event); event.stopPropagation(); finish(true);
    };
    const cancel = (event: PointerEvent) => { if (drag?.id === event.pointerId && drag.handle === handle) finish(false); };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && drag) { event.preventDefault(); event.stopPropagation(); finish(false); return; }
      if (drag || !['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const to = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : from + (event.key === 'ArrowUp' ? -1 : 1);
      if (to >= 0 && to < rows.length && to !== from) move(from, to);
    };
    handle.addEventListener('pointerdown', down);
    // Obsidian can intercept pointer moves before they reach a captured handle.
    // Observe them in document capture, and claim only this grip's active drag.
    body.ownerDocument.addEventListener('pointermove', moving, true);
    body.ownerDocument.addEventListener('pointerup', up, true);
    handle.addEventListener('pointercancel', cancel);
    handle.addEventListener('lostpointercapture', cancel);
    handle.addEventListener('keydown', key);
    cleanups.push(() => {
      handle.removeEventListener('pointerdown', down); body.ownerDocument.removeEventListener('pointermove', moving, true);
      body.ownerDocument.removeEventListener('pointerup', up, true); handle.removeEventListener('pointercancel', cancel);
      handle.removeEventListener('lostpointercapture', cancel); handle.removeEventListener('keydown', key);
    });
  });
  return () => { finish(false); cleanups.forEach((cleanup) => cleanup()); };
}
