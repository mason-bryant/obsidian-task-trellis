import { RELEASE_NOTES_URL, type Feature, type FeatureAction, type FeatureSetting } from '../core/whatsNew.ts';
import { uiElement } from './dom.ts';
import { renderEditorHeader } from './editorHeader.ts';

export type WhatsNewOptions = {
  features: Feature[];
  /** Starts what a feature's button tries, once the window has closed. */
  tryFeature(kind: FeatureAction['kind']): void;
  /** A feature's board setting: its value here, whether this board can use it, and saving it, which resolves to whether that worked. */
  setting(kind: FeatureSetting['kind']): { checked: boolean; available: boolean; save(checked: boolean): Promise<boolean> };
  /** Set when an update opens the window by itself, rather than the toolbar. */
  update?: {
    version: string;
    /** Whether Don’t show this again starts checked. */
    hidden: boolean;
    /** Saves Don’t show this again as soon as it changes. */
    setHidden(hidden: boolean): void;
  };
};

/**
 * Describes what Task Trellis has added, with a button to try each feature that has one. The toolbar
 * opens it with every feature. After an update it opens by itself with what the update added.
 */
export function renderWhatsNew(body: HTMLElement, headerRoot: HTMLElement, options: WhatsNewOptions,
  icon: (el: HTMLElement, name: string) => void, close: () => void): void {
  const doc = body.ownerDocument;
  const node = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => {
    const el = uiElement(doc, tag); el.className = cls; el.textContent = text; return el;
  };
  /** Saves as soon as it changes, and goes back to the last value saved if that fails. */
  const settingBox = (setting: FeatureSetting): HTMLElement[] => {
    const state = options.setting(setting.kind);
    let saved = state.checked;
    const label = node('label', 'tt-whats-new-setting');
    const box = node('input'); box.type = 'checkbox'; box.checked = saved; box.disabled = !state.available;
    box.addEventListener('change', () => {
      const checked = box.checked;
      void state.save(checked).then((worked) => { if (worked) saved = checked; else box.checked = saved; });
    });
    label.append(box, node('span', '', setting.label));
    return state.available ? [label] : [label, node('span', 'tt-whats-new-description', setting.unavailable)];
  };
  renderEditorHeader(headerRoot, 'What’s new', icon, null, close);
  const { update } = options;
  const list = node('ul', 'tt-whats-new-list');
  for (const feature of options.features) {
    const item = node('li');
    item.append(node('strong', '', feature.name),
      node('span', 'tt-whats-new-description', update ? feature.description : `${feature.description} New in ${feature.version}.`));
    const { action } = feature;
    if (action) {
      const button = node('button', 'tt-button', action.label); button.type = 'button';
      button.onclick = () => { close(); options.tryFeature(action.kind); };
      item.append(button);
    }
    if (feature.setting) item.append(...settingBox(feature.setting));
    list.append(item);
  }
  // A link rather than a button, since it leaves Obsidian. Obsidian opens it in the browser.
  const notes = node('a', 'tt-whats-new-notes', 'See all release notes on GitHub');
  notes.href = RELEASE_NOTES_URL; notes.target = '_blank'; notes.rel = 'noopener';
  body.replaceChildren(node('p', '', update ? `Task Trellis ${update.version} adds:` : 'What Task Trellis has added lately:'), list, notes);
  if (update) {
    const hide = node('label', 'tt-whats-new-hide');
    const box = node('input'); box.type = 'checkbox'; box.checked = update.hidden;
    box.addEventListener('change', () => update.setHidden(box.checked));
    hide.append(box, node('span', '', 'Don’t show this again'));
    body.append(node('p', 'tt-help', 'The What’s new button on a board’s toolbar shows this at any time.'), hide);
  }
  // Obsidian focuses a dialog's first button once it opens; closing is the safe place to start.
  doc.defaultView?.setTimeout(() => headerRoot.querySelector<HTMLButtonElement>('.tt-editor-cancel')?.focus(), 0);
}
