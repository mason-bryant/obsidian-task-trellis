/** Keep inline capture inside the visible part of a board, including overlay keyboards. */
export function watchComposerViewport(box: HTMLElement, input: HTMLTextAreaElement, scroller: HTMLElement,
  verticalScroller: () => HTMLElement): () => void {
  const win = box.ownerDocument.defaultView;
  const viewport = win?.visualViewport;
  if (!win || !viewport) return () => undefined;
  const previousMaxHeight = scroller.style.maxHeight;
  let frame = 0;
  let destroyed = false;
  const keepVisible = () => {
    if (destroyed || !box.isConnected || !box.contains(box.ownerDocument.activeElement)) return;
    const bottom = viewport.offsetTop + viewport.height;
    // Scrolling alone cannot reveal a bottom-of-list composer when the keyboard overlays
    // the layout viewport. Shrink the actual scrolling area so its full range is usable.
    scroller.style.maxHeight = `${Math.max(0, bottom - scroller.getBoundingClientRect().top)}px`;
    const list = verticalScroller();
    const listRect = list.getBoundingClientRect();
    const header = list.querySelector('.tt-col-header')?.getBoundingClientRect().height ?? 0;
    const top = Math.max(listRect.top + header, viewport.offsetTop) + 8;
    const end = Math.min(listRect.bottom, bottom) - 8;
    const rect = box.getBoundingClientRect();
    // Prefer all actions and text together. In a cramped pane, keep the text entry visible.
    const target = rect.height <= end - top ? rect : input.getBoundingClientRect();
    const by = target.bottom > end ? Math.min(target.bottom - end, target.top - top)
      : target.top < top ? target.top - top : 0;
    if (by) list.scrollTop += by;
  };
  const update = () => {
    keepVisible();
    // WebKit can pan the page after dispatching the viewport event; recheck after layout.
    win.cancelAnimationFrame(frame);
    frame = win.requestAnimationFrame(keepVisible);
  };
  viewport.addEventListener('resize', update);
  viewport.addEventListener('scroll', update);
  win.addEventListener('resize', update);
  box.addEventListener('focusin', update);
  input.addEventListener('input', update);
  update();
  return () => {
    destroyed = true;
    win.cancelAnimationFrame(frame);
    viewport.removeEventListener('resize', update);
    viewport.removeEventListener('scroll', update);
    win.removeEventListener('resize', update);
    box.removeEventListener('focusin', update);
    input.removeEventListener('input', update);
    scroller.style.maxHeight = previousMaxHeight;
  };
}
