import type { Feature } from '../core/whatsNew.ts';
import { uiElement } from './dom.ts';
import { renderEditorHeader } from './editorHeader.ts';

export type WhatsNewOptions = {
  version: string;
  features: Feature[];
  /** Whether Don’t show this again starts checked. */
  hidden: boolean;
  /** Saves Don’t show this again as soon as it changes. */
  setHidden(hidden: boolean): void;
  /** Opens Settings → Task Trellis → What’s new, which describes each feature and has a button to try it. */
  openSettings(): void;
};

/** What an update added, once, with a way to try it in the settings and a box to stop showing this after updates. */
export function renderWhatsNew(body: HTMLElement, headerRoot: HTMLElement, options: WhatsNewOptions,
  icon: (el: HTMLElement, name: string) => void, close: () => void): void {
  const doc = body.ownerDocument;
  const node = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => {
    const el = uiElement(doc, tag); el.className = cls; el.textContent = text; return el;
  };
  renderEditorHeader(headerRoot, 'What’s new', icon, null, close);
  const list = node('ul', 'tt-whats-new-list');
  for (const feature of options.features) {
    const item = node('li');
    item.append(node('strong', '', feature.name), node('span', 'tt-whats-new-description', feature.description));
    list.append(item);
  }
  const hide = node('label', 'tt-whats-new-hide');
  const box = node('input'); box.type = 'checkbox'; box.checked = options.hidden;
  box.addEventListener('change', () => options.setHidden(box.checked));
  hide.append(box, node('span', '', 'Don’t show this again'));
  const actions = node('div', 'tt-confirm-actions');
  const dismiss = node('button', 'tt-button', 'Close'); dismiss.type = 'button'; dismiss.onclick = close;
  const open = node('button', 'tt-button', 'Try them in settings'); open.type = 'button';
  open.onclick = () => { close(); options.openSettings(); };
  actions.append(dismiss, open);
  body.replaceChildren(node('p', '', `Task Trellis ${options.version} adds:`), list,
    node('p', 'tt-help', 'Settings → Task Trellis → What’s new describes each one, with a button to try it.'), hide, actions);
  // Obsidian focuses a dialog's first button once it opens; the way forward takes focus after that.
  doc.defaultView?.setTimeout(() => { if (open.isConnected) open.focus(); }, 0);
}
