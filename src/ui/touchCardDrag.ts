/** Pointer-based card movement from a handle; list scrolling stays native elsewhere. */
export function installTouchCardDrag(scroller: HTMLElement, host: {
  start(id: string): void;
  move(x: number, y: number): void;
  end(commit: boolean): void;
}, scrollTarget: () => HTMLElement = () => scroller,
columnPositions: () => number[] = () => []): void {
  const doc = scroller.ownerDocument;
  const view = doc.defaultView!;
  let drag: {
    id: number; card: HTMLElement; x: number; y: number; startX: number; startY: number;
    offsetX: number; offsetY: number; ghost: HTMLElement | null;
  } | null = null;
  let frame = 0;
  let suppressClick = false;
  let edge: { direction: number; since: number } | null = null;
  const update = () => {
    if (!drag?.ghost) return;
    drag.ghost.style.left = `${drag.x - drag.offsetX}px`;
    drag.ghost.style.top = `${drag.y - drag.offsetY}px`;
    host.move(drag.x, drag.y);
  };
  const pageAtEdge = (time: number) => {
    if (!drag) return;
    const stops = columnPositions();
    const box = scroller.getBoundingClientRect();
    const direction = drag.x < box.left + 36 ? -1 : drag.x > box.right - 36 ? 1 : 0;
    // Handles already sit at the right edge. Require an outward movement so a
    // vertical reorder (or a little finger drift) cannot change columns.
    if (stops.length < 2 || !direction || direction * (drag.x - drag.startX) < 16 ||
      drag.y < box.top || drag.y > box.bottom || drag.x < box.left || drag.x > box.right) {
      edge = null;
      return;
    }
    if (edge?.direction !== direction) edge = { direction, since: time };
    if (time - edge.since < 500) return;
    const index = stops.reduce((best, stop, i) =>
      Math.abs(stop - scroller.scrollLeft) < Math.abs(stops[best]! - scroller.scrollLeft) ? i : best, 0);
    const next = index + direction;
    if (next < 0 || next >= stops.length) return;
    // One complete page keeps hit-testing and the drop indicator in agreement.
    // Holding at the edge can continue through further columns, with a pause.
    scroller.scrollTo({ left: stops[next]!, behavior: 'instant' });
    edge.since = time + 250;
    update();
  };
  // A board wider than the screen scrolls sideways near its side edges; a one-column board pages instead.
  const scrollSideways = () => {
    if (!drag || columnPositions().length >= 2 || scroller.scrollWidth <= scroller.clientWidth) return;
    const box = scroller.getBoundingClientRect();
    const speed = drag.x < box.left + 36 ? -Math.min(12, (box.left + 36 - drag.x) / 4) :
      drag.x > box.right - 36 ? Math.min(12, (drag.x - box.right + 36) / 4) : 0;
    // As with paging, only after an outward movement: the handle already sits at the right edge.
    if (!speed || Math.sign(speed) * (drag.x - drag.startX) < 16) return;
    scroller.scrollLeft += speed;
    update();
  };
  const autoScroll = (time: number) => {
    if (!drag?.ghost) return;
    if (!scroller.isConnected) { finish(false); return; }
    const vertical = scrollTarget();
    const box = vertical.getBoundingClientRect();
    // Clear the sticky column heading at the top and the system toolbar at the bottom.
    const top = box.top + 80;
    const bottom = Math.min(box.bottom, view.visualViewport?.height ?? view.innerHeight) - 64;
    const speed = drag.y < top ? -Math.min(12, (top - drag.y) / 4) :
      drag.y > bottom ? Math.min(12, (drag.y - bottom) / 4) : 0;
    if (speed) { vertical.scrollTop += speed; update(); }
    scrollSideways();
    pageAtEdge(time);
    frame = view.requestAnimationFrame(autoScroll);
  };
  const finish = (commit: boolean) => {
    const current = drag;
    drag = null;
    edge = null;
    if (!current) return;
    view.cancelAnimationFrame(frame);
    current.ghost?.remove();
    current.card.classList.remove('is-dragging');
    scroller.classList.remove('tt-touch-dragging');
    if (scroller.hasPointerCapture(current.id)) scroller.releasePointerCapture(current.id);
    if (current.ghost) host.end(commit);
  };
  scroller.addEventListener('pointerdown', (event) => {
    if (drag) { finish(false); return; }
    suppressClick = false;
    const handle = (event.target as Element).closest('.tt-card-drag-handle');
    const card = handle?.closest<HTMLElement>('.tt-card');
    if (!card || !event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const box = card.getBoundingClientRect();
    drag = { id: event.pointerId, card, x: event.clientX, y: event.clientY,
      startX: event.clientX, startY: event.clientY, offsetX: event.clientX - box.left,
      offsetY: event.clientY - box.top, ghost: null };
    scroller.setPointerCapture(event.pointerId);
    suppressClick = true;
  });
  scroller.addEventListener('pointermove', (event) => {
    if (event.pointerId !== drag?.id) return;
    event.preventDefault();
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (!drag.ghost) {
      if (Math.hypot(drag.x - drag.startX, drag.y - drag.startY) < 6) return;
      host.start(drag.card.dataset.id!);
      drag.ghost = drag.card.cloneNode(true) as HTMLElement;
      drag.ghost.classList.add('tt-touch-drag-ghost');
      drag.ghost.setAttribute('aria-hidden', 'true');
      drag.ghost.inert = true;
      drag.ghost.removeAttribute('data-id');
      drag.ghost.style.width = `${drag.card.getBoundingClientRect().width}px`;
      doc.body.append(drag.ghost);
      drag.card.classList.add('is-dragging');
      scroller.classList.add('tt-touch-dragging');
      frame = view.requestAnimationFrame(autoScroll);
    }
    update();
  }, { passive: false });
  scroller.addEventListener('pointerup', (event) => {
    if (event.pointerId !== drag?.id) return;
    drag.x = event.clientX; drag.y = event.clientY;
    update();
    finish(true);
  });
  scroller.addEventListener('pointercancel', (event) => { if (event.pointerId === drag?.id) finish(false); });
  scroller.addEventListener('lostpointercapture', (event) => {
    if (event.target === scroller && event.pointerId === drag?.id) finish(false);
  });
  scroller.addEventListener('click', (event) => {
    if (!suppressClick || event.detail === 0) return;
    suppressClick = false;
    event.preventDefault(); event.stopImmediatePropagation();
  }, true);
}
