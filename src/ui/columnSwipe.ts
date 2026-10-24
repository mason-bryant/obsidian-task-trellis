/**
 * Keep vertical scrolling native (touch-action: pan-y pinch-zoom in CSS), while
 * deliberate horizontal gestures drag between adjacent columns. All listeners
 * belong to the scroller, so replacing a board also disposes of its gesture state.
 */
export function installColumnSwipe(scroller: HTMLElement, enabled: () => boolean, positions: () => number[]): void {
  type Gesture = {
    id: number; x: number; y: number; left: number; index: number; stops: number[];
    axis: 'pending' | 'horizontal' | 'vertical'; samples: { x: number; time: number }[];
  };
  let gesture: Gesture | null = null;
  let suppressClick = false;
  const view = scroller.ownerDocument.defaultView!;

  const finish = (cancelled: boolean) => {
    const current = gesture;
    gesture = null;
    if (!current) return;
    if (current.axis === 'horizontal') {
      const distance = scroller.scrollLeft - current.left;
      const first = current.samples[0]!;
      const last = current.samples[current.samples.length - 1]!;
      const velocity = last.time > first.time ? (first.x - last.x) / (last.time - first.time) : 0;
      // A short flick advances; a slow drag must cover a quarter of a page.
      const advance = !cancelled && (Math.abs(distance) >= scroller.clientWidth * 0.25 ||
        (Math.abs(distance) >= 24 && Math.abs(velocity) >= 0.5));
      const direction = Math.sign(advance && Math.abs(velocity) >= 0.5 ? velocity : distance);
      const index = Math.max(0, Math.min(current.stops.length - 1, current.index + (advance ? direction : 0)));
      scroller.classList.remove('tt-scroll--swiping');
      scroller.scrollTo({ left: current.stops[index]!,
        behavior: cancelled || view.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    }
    if (scroller.hasPointerCapture(current.id)) scroller.releasePointerCapture(current.id);
  };

  scroller.addEventListener('pointerdown', (event) => {
    if (gesture) { finish(true); return; } // Let a second finger start a pinch.
    suppressClick = false;
    if (event.pointerType !== 'touch' || !event.isPrimary || !enabled() ||
      (event.target as Element).closest('.tt-card-drag-handle, input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
    const stops = positions();
    if (stops.length < 2) return;
    const index = stops.reduce((best, stop, i) =>
      Math.abs(stop - scroller.scrollLeft) < Math.abs(stops[best]! - scroller.scrollLeft) ? i : best, 0);
    // Stop an unfinished page animation before interpreting the next gesture.
    scroller.scrollTo({ left: stops[index]!, behavior: 'instant' });
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, left: stops[index]!, index, stops,
      axis: 'pending', samples: [{ x: event.clientX, time: event.timeStamp }] };
  });

  scroller.addEventListener('pointermove', (event) => {
    const current = gesture;
    if (!current || event.pointerId !== current.id) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (current.axis === 'pending') {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 10) return;
      current.axis = Math.abs(dx) > Math.abs(dy) * 1.3 ? 'horizontal' : 'vertical';
      if (current.axis === 'horizontal') {
        scroller.setPointerCapture(event.pointerId);
        scroller.classList.add('tt-scroll--swiping');
        suppressClick = true;
      }
    }
    if (current.axis !== 'horizontal') return;
    event.preventDefault();
    current.samples = current.samples.filter((sample) => event.timeStamp - sample.time <= 100);
    current.samples.push({ x: event.clientX, time: event.timeStamp });
    const min = current.stops[Math.max(0, current.index - 1)]!;
    const max = current.stops[Math.min(current.stops.length - 1, current.index + 1)]!;
    scroller.scrollLeft = Math.max(min, Math.min(max, current.left - dx));
  }, { passive: false });

  scroller.addEventListener('pointerup', (event) => {
    if (event.pointerId !== gesture?.id) return;
    // Include a pause before release so a held partial drag isn't treated as a flick.
    gesture.samples.push({ x: event.clientX, time: event.timeStamp });
    finish(false);
  });
  for (const type of ['pointercancel', 'lostpointercapture'] as const) {
    scroller.addEventListener(type, (event) => {
      // Touch begins with implicit capture on the hit element. Its capture loss
      // bubbles when we take over, and must not cancel our new capture.
      if (event.pointerId === gesture?.id && (type === 'pointercancel' || event.target === scroller)) finish(true);
    });
  }
  // Native desktop / long-press card dragging takes precedence over paging.
  scroller.addEventListener('dragstart', () => finish(true));
  scroller.addEventListener('click', (event) => {
    // A swipe that began over a task or button must not also activate it on release.
    if (!suppressClick || event.detail === 0) return;
    suppressClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
}
