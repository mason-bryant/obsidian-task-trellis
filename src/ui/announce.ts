import { uiElement } from './dom.ts';

/**
 * Screen readers speak a live region only when it already exists and its text changes later.
 * VoiceOver says nothing for a status drawn with its text, or created and filled in the same task.
 * So each board and dialog keeps one status region and one alert region for as long as it is open,
 * kept across redraws, and says results through `announce`.
 */
type Regions = { box: HTMLElement; status: HTMLElement; alert: HTMLElement };
const regions = new WeakMap<HTMLElement, Regions>();
const queues = new WeakMap<HTMLElement, { texts: string[]; show?: number; clear?: number }>();

/** Lets the redraw that asked to speak finish before the text changes. */
export const ANNOUNCE_DELAY_MS = 100;
/** Then the text goes, so reading through the page later doesn't find it. */
const CLEAR_AFTER_MS = 7000;

function liveRegions(owner: HTMLElement): Regions {
  let found = regions.get(owner);
  if (!found) {
    const doc = owner.ownerDocument;
    const box = uiElement(doc, 'div'); box.className = 'tt-live';
    const status = uiElement(doc, 'div'); status.setAttribute('role', 'status');
    const alert = uiElement(doc, 'div'); alert.setAttribute('role', 'alert');
    box.append(status, alert);
    found = { box, status, alert };
    regions.set(owner, found);
  }
  if (found.box.parentElement !== owner) owner.prepend(found.box);
  return found;
}

/** Empties `owner` for a redraw, keeping its live regions where screen readers already know them. */
export function clearForRedraw(owner: HTMLElement): void {
  const { box } = liveRegions(owner);
  for (const child of [...owner.childNodes]) if (child !== box) child.remove();
}

/**
 * Says `text` from `owner`'s live region: a status, or an alert for an error that needs attention.
 * Texts announced together are said together, and the same text can be said again.
 */
export function announce(owner: HTMLElement, text: string, kind: 'status' | 'alert' = 'status'): void {
  if (!text) return;
  const region = liveRegions(owner)[kind];
  const win = owner.ownerDocument.defaultView ?? window;
  const queue = queues.get(region) ?? { texts: [] };
  queues.set(region, queue);
  win.clearTimeout(queue.show); win.clearTimeout(queue.clear);
  if (!queue.texts.includes(text)) queue.texts.push(text);
  region.textContent = '';
  queue.show = win.setTimeout(() => {
    region.textContent = queue.texts.join(' ');
    queue.texts = [];
    queue.clear = win.setTimeout(() => { region.textContent = ''; }, CLEAR_AFTER_MS);
  }, ANNOUNCE_DELAY_MS);
}
