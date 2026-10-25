// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installColumnResize, isColumnResizing } from '../src/ui/columnResize.ts';
import { parseColumnWidths, remapColumnWidths } from '../src/core/columnWidths.ts';
import { parseBoardConfig } from '../src/core/boardConfig.ts';

let grid: HTMLElement, handles: HTMLElement[], enabled: boolean;
let host: { enabled(): boolean; save: ReturnType<typeof vi.fn<(widths: Record<string, number>) => void | Promise<void>>>; end: ReturnType<typeof vi.fn<() => void>> };
function setup(initial = {}) {
  grid = document.createElement('div'); grid.className = 'tt-grid';
  document.body.replaceChildren(grid);
  for (const [id, width] of [['backlog', 300], ['doing', 400], ['done', 280]] as const) {
    const header = document.createElement('div'); header.className = 'tt-col-header'; header.dataset.column = id;
    header.innerHTML = `<span class="tt-col-title">${id}</span>`;
    header.getBoundingClientRect = () => {
      const index = [...grid.children].indexOf(header);
      const tracks = grid.style.getPropertyValue('--tt-column-tracks').split(' ');
      return { width: /^\d+px$/.test(tracks[index] ?? '') ? Number(tracks[index]!.slice(0, -2)) : width } as DOMRect;
    };
    grid.append(header);
  }
  enabled = true;
  host = { enabled: () => enabled, save: vi.fn(), end: vi.fn() };
  installColumnResize(grid, initial, host);
  handles = [...grid.querySelectorAll<HTMLElement>('.tt-column-resize')];
  for (const handle of handles) {
    let capture = false;
    handle.setPointerCapture = vi.fn(() => { capture = true; });
    handle.hasPointerCapture = () => capture;
    handle.releasePointerCapture = vi.fn(() => { capture = false; });
  }
}
function pointer(type: string, x: number, handle = handles[0]!) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, Object.fromEntries(Object.entries({ pointerId: 1, isPrimary: true, button: 0, clientX: x }).map(([k,v]) => [k,{value:v}])));
  handle.dispatchEvent(event);
  return event;
}
const key = (name: string, shiftKey = false) => handles[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: name, shiftKey, bubbles: true, cancelable: true }));
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

beforeEach(() => setup());
describe('column resize', () => {
  it('previews one column live, keeps neighboring widths, then saves once', async () => {
    pointer('pointerdown', 300); pointer('pointermove', 380);
    expect(grid.style.getPropertyValue('--tt-column-tracks')).toBe('380px 400px 280px');
    expect(isColumnResizing(document.body)).toBe(true);
    expect(host.save).not.toHaveBeenCalled();
    pointer('pointermove', 420); pointer('pointerup', 420); await settle();
    expect(host.save).toHaveBeenCalledExactlyOnceWith({ backlog: 420, doing: 400, done: 280 });
    expect(isColumnResizing(document.body)).toBe(false);
    expect(handles[0]!.getAttribute('aria-valuenow')).toBe('420');
  });
  it.each(['pointercancel', 'lostpointercapture', 'Escape'])('rolls back on %s without saving', (type) => {
    setup({ backlog: 330 });
    pointer('pointerdown', 300); pointer('pointermove', 450);
    if (type === 'Escape') key('Escape'); else pointer(type, 450);
    expect(host.save).not.toHaveBeenCalled();
    expect(grid.style.getPropertyValue('--tt-column-tracks')).toBe('330px minmax(240px, 1fr) minmax(240px, 1fr)');
    expect(isColumnResizing(document.body)).toBe(false);
  });
  it('leaves narrow boards alone and cancels if the layout becomes narrow mid-drag', () => {
    enabled = false;
    expect(pointer('pointerdown', 300).defaultPrevented).toBe(false);
    pointer('pointermove', 420); pointer('pointerup', 420);
    expect(host.save).not.toHaveBeenCalled();
    enabled = true; pointer('pointerdown', 300); pointer('pointermove', 420);
    enabled = false; pointer('pointermove', 450);
    expect(host.save).not.toHaveBeenCalled();
    expect(isColumnResizing(document.body)).toBe(false);
  });
  it('does not persist widths from a plain click', () => {
    pointer('pointerdown', 300); pointer('pointerup', 300);
    expect(host.save).not.toHaveBeenCalled();
  });
  it('clamps oversized and undersized drags', async () => {
    pointer('pointerdown', 300); pointer('pointermove', -1000); pointer('pointerup', -1000); await settle();
    expect(host.save).toHaveBeenLastCalledWith({ backlog: 240, doing: 400, done: 280 });
    pointer('pointerdown', 240); pointer('pointermove', 4000); pointer('pointerup', 4000); await settle();
    expect(host.save).toHaveBeenLastCalledWith({ backlog: 1000, doing: 400, done: 280 });
  });
  it('supports keyboard adjustment, larger shift steps and resetting all widths', async () => {
    key('ArrowRight'); await settle();
    expect(host.save).toHaveBeenLastCalledWith({ backlog: 310, doing: 400, done: 280 });
    key('ArrowLeft', true); await settle();
    expect(host.save).toHaveBeenLastCalledWith({ backlog: 260, doing: 400, done: 280 });
    key('Home'); await settle();
    expect(host.save).toHaveBeenLastCalledWith({});
    handles[0]!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); await settle();
    expect(host.save).toHaveBeenLastCalledWith({});
  });
  it('rolls back if saving fails and suppresses overlapping writes', async () => {
    let reject!: (error: Error) => void;
    host.save.mockImplementation(() => new Promise<void>((_resolve, fail) => { reject = fail; }));
    key('ArrowRight'); key('ArrowRight');
    expect(host.save).toHaveBeenCalledTimes(1);
    expect(isColumnResizing(document.body)).toBe(true);
    reject(new Error('write failed')); await settle();
    expect(grid.style.getPropertyValue('--tt-column-tracks')).toBe('minmax(240px, 1fr) minmax(240px, 1fr) minmax(240px, 1fr)');
    expect(isColumnResizing(document.body)).toBe(false);
  });
});

describe('persisted column widths', () => {
  it('accepts only finite numeric own properties for current columns', () => {
    const raw = Object.assign(Object.create({ backlog: 350 }), { doing: 480.8, done: NaN, unknown: 600 });
    expect(parseColumnWidths(raw, ['backlog', 'doing', 'done'])).toEqual({ doing: 481 });
    expect(parseColumnWidths({ backlog: 'wide', doing: Infinity, done: -1 }, ['backlog','doing','done'])).toEqual({});
    expect(parseColumnWidths({ backlog: 50, doing: 5000 }, ['backlog','doing'])).toEqual({ backlog: 240, doing: 1000 });
  });
  it('restores saved widths when parsing a board and follows renamed columns', () => {
    const config = parseBoardConfig('Test', { 'column-widths': { backlog: 350, doing: 520, obsolete: 800 } }).config;
    expect(config.columnWidths).toEqual({ backlog: 350, doing: 520 });
    expect(remapColumnWidths(config.columnWidths, new Map([['doing', 'in-progress']]), ['backlog'])).toEqual({ 'in-progress': 520 });
  });
});
