/** Pointer-based card movement from a handle; list scrolling stays native elsewhere. */
export function installTouchCardDrag(scroller: HTMLElement, host: {
  start(id: string): void;
  move(x: number, y: number): void;
  end(commit: boolean): void;
}, scrollTarget: () => HTMLElement = () => scroller): void {
  const doc = scroller.ownerDocument;
  const view = doc.defaultView!;
  let drag: {
    id: number; card: HTMLElement; x: number; y: number; startX: number; startY: number;
    offsetX: number; offsetY: number; ghost: HTMLElement | null;
  } | null = null;
  let frame = 0;
  let suppressClick = false;
  const update = () => {
    if (!drag?.ghost) return;
    drag.ghost.style.left = `${drag.x - drag.offsetX}px`;
    drag.ghost.style.top = `${drag.y - drag.offsetY}px`;
    host.move(drag.x, drag.y);
  };
  const autoScroll = () => {
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
    frame = view.requestAnimationFrame(autoScroll);
  };
  const finish = (commit: boolean) => {
    const current = drag;
    drag = null;
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
