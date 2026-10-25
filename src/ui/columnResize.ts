import { MAX_COLUMN_WIDTH, MIN_COLUMN_WIDTH, type ColumnWidths } from '../core/columnWidths.ts';

/** The host defers board redraws while a resize or its save is in progress. */
export function isColumnResizing(root: HTMLElement): boolean {
  return root.querySelector('.tt-grid--resizing') !== null;
}

export function installColumnResize(grid: HTMLElement, initial: ColumnWidths, host: {
  enabled(): boolean;
  save(widths: ColumnWidths): Promise<void> | void;
  end(): void;
}): void {
  const headers = [...grid.querySelectorAll<HTMLElement>('.tt-col-header')];
  const view = grid.ownerDocument.defaultView!;
  let widths = { ...initial };
  let saving = false;
  let drag: { handle: HTMLElement; id: number; x: number; width: number; before: ColumnWidths } | null = null;
  const bounded = (width: number) => Math.round(Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, width)));
  const apply = () => {
    grid.style.setProperty('--tt-column-tracks', headers.map((header) => {
      const width = widths[header.dataset.column!];
      return width ? `${width}px` : `minmax(${MIN_COLUMN_WIDTH}px, 1fr)`;
    }).join(' '));
    for (const header of headers) {
      const handle = header.querySelector('.tt-column-resize');
      const width = widths[header.dataset.column!] ?? Math.round(header.getBoundingClientRect().width);
      handle?.setAttribute('aria-valuenow', String(width));
      handle?.setAttribute('aria-valuetext', `${width} pixels`);
    }
  };
  // Freeze the other columns at their current sizes, like spreadsheet columns.
  const snapshot = () => Object.fromEntries(headers.map((h) =>
    [h.dataset.column!, bounded(h.getBoundingClientRect().width)]));
  const save = async (before: ColumnWidths) => {
    saving = true;
    grid.classList.add('tt-grid--resizing');
    try { await host.save({ ...widths }); }
    catch { widths = before; apply(); }
    finally {
      saving = false;
      grid.classList.remove('tt-grid--resizing');
      host.end();
    }
  };
  const finish = (commit: boolean) => {
    const current = drag;
    drag = null;
    if (!current) return;
    current.handle.classList.remove('is-resizing');
    if (current.handle.hasPointerCapture(current.id)) current.handle.releasePointerCapture(current.id);
    if (commit && JSON.stringify(widths) !== JSON.stringify(current.before)) void save(current.before);
    else {
      widths = current.before; apply();
      grid.classList.remove('tt-grid--resizing');
      host.end();
    }
  };
  for (const header of headers) {
    const column = header.dataset.column!;
    const handle = grid.ownerDocument.createElement('div');
    handle.className = 'tt-column-resize';
    handle.tabIndex = 0;
    handle.dataset.boardFocus = `resize:${column}`;
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', 'vertical');
    handle.setAttribute('aria-label', `Resize ${header.querySelector('.tt-col-title')?.textContent ?? column} column`);
    handle.setAttribute('aria-valuemin', String(MIN_COLUMN_WIDTH));
    handle.setAttribute('aria-valuemax', String(MAX_COLUMN_WIDTH));
    handle.title = 'Drag to resize. Double-click or press Home to reset all column widths. Arrow keys adjust width.';
    header.append(handle);
    handle.addEventListener('pointerdown', (event) => {
      if (drag) { finish(false); return; }
      if (!host.enabled() || saving || !event.isPrimary || event.button !== 0) return;
      event.preventDefault(); event.stopPropagation();
      handle.focus({ preventScroll: true });
      drag = { handle, id: event.pointerId, x: event.clientX,
        width: header.getBoundingClientRect().width, before: { ...widths } };
      handle.setPointerCapture(event.pointerId);
      grid.classList.add('tt-grid--resizing');
      handle.classList.add('is-resizing');
    });
    handle.addEventListener('pointermove', (event) => {
      if (event.pointerId !== drag?.id || drag.handle !== handle) return;
      if (!host.enabled()) { finish(false); return; }
      event.preventDefault(); event.stopPropagation();
      // A stationary click must not turn the responsive layout into fixed widths.
      if (Math.abs(event.clientX - drag.x) < 2) return;
      widths = { ...snapshot(), [column]: bounded(drag.width + event.clientX - drag.x) };
      apply();
    });
    handle.addEventListener('pointerup', (event) => {
      if (event.pointerId === drag?.id && drag.handle === handle) { event.stopPropagation(); finish(host.enabled()); }
    });
    for (const type of ['pointercancel', 'lostpointercapture'] as const) {
      handle.addEventListener(type, (event) => { if (event.pointerId === drag?.id && event.target === handle) finish(false); });
    }
    const reset = () => {
      if (!host.enabled() || saving) return;
      const before = { ...widths };
      widths = {}; apply();
      void save(before);
    };
    handle.addEventListener('dblclick', (event) => { event.preventDefault(); event.stopPropagation(); reset(); });
    handle.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && drag) { event.preventDefault(); event.stopPropagation(); finish(false); return; }
      if (!host.enabled() || saving || drag) return;
      if (event.key === 'Home') { event.preventDefault(); event.stopPropagation(); reset(); return; }
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault(); event.stopPropagation();
      const before = { ...widths };
      widths = snapshot();
      widths[column] = bounded(widths[column]! + (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 50 : 10));
      apply(); void save(before);
    });
    handle.addEventListener('click', (event) => event.stopPropagation());
  }
  apply();
  // Refresh accessible pixel values once layout has measured the new headers.
  view.requestAnimationFrame(() => { if (grid.isConnected && !drag && !saving) apply(); });
}
