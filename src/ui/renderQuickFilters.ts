import type { BoardConfig } from '../core/boardConfig.ts';
import { uiElement } from './dom.ts';
import { quickFilterColors } from './quickFilterColors.ts';

export type QuickFilterMenuItem = { id: string; title: DocumentFragment; active: boolean };
export type QuickFilterMenu = (anchor: HTMLElement, items: QuickFilterMenuItem[], select: (id: string) => void, close: () => void) => void;

/** Separate responsive toolbar groups let container CSS switch layouts without redrawing cards. */
export function renderQuickFilters(root: HTMLElement, config: BoardConfig, active: string[], singleColumn: boolean,
  icon: (name: string) => HTMLElement, toggle: (ids: string[]) => void, openMenu?: QuickFilterMenu): HTMLElement {
  const doc = root.ownerDocument;
  const wrap = uiElement(doc, 'div'); wrap.className = 'tt-quick-filter-tools';
  const filters = config.quickFilters.filter((filter) => filter.show);
  const select = (id: string) => toggle(active.includes(id) ? active.filter((v) => v !== id) : [...active, id]);
  const group = (mode: string, limit: number) => {
    const node = uiElement(doc, 'div'); node.className = `tt-quick-filter-group tt-quick-filter-group--${mode}`;
    const title = (filter: typeof filters[number]) => {
      // Keep menu content in the board's window, including Obsidian pop-out windows.
      const fragment = (doc.win as Window & { createFragment: typeof createFragment }).createFragment();
      fragment.append(quickFilterColors(doc, config.labels, filter.labels));
      const name = uiElement(doc, 'span'); name.textContent = filter.name; fragment.append(name);
      return fragment;
    };
    for (const filter of filters.slice(0, limit)) {
      const button = uiElement(doc, 'button'); button.type = 'button'; button.className = 'tt-toolbar-button tt-quick-filter';
      button.dataset.boardFocus = `quick:${mode}:${filter.id}`;
      button.append(icon('filter'), title(filter));
      button.setAttribute('aria-pressed', String(active.includes(filter.id)));
      button.onclick = () => select(filter.id); node.append(button);
    }
    const overflow = filters.slice(limit);
    if (overflow.length && openMenu) {
      const button = uiElement(doc, 'button'); button.type = 'button'; button.className = 'tt-toolbar-button tt-quick-filter-menu';
      button.dataset.boardFocus = `quick-menu:${mode}`;
      const count = overflow.filter((f) => active.includes(f.id)).length;
      button.append(icon('list-filter'));
      const label = uiElement(doc, 'span'); label.textContent = `${limit ? 'More filters' : 'Filters'}${count ? ` (${count})` : ''}`; button.append(label);
      button.setAttribute('aria-label', `Quick filters${count ? ` (${count} active in menu)` : ''}`);
      button.setAttribute('aria-pressed', String(count > 0));
      button.setAttribute('aria-haspopup', 'menu'); button.setAttribute('aria-expanded', 'false');
      const close = () => {
        const current = root.querySelector<HTMLButtonElement>(`[data-board-focus="quick-menu:${mode}"]`);
        current?.setAttribute('aria-expanded', 'false'); current?.focus({ preventScroll: true });
      };
      const open = () => {
        if (button.getAttribute('aria-expanded') === 'true') return;
        button.setAttribute('aria-expanded', 'true');
        openMenu(button, overflow.map((f) => ({ id: f.id, title: title(f), active: active.includes(f.id) })),
          (id) => { select(id); close(); }, close);
      };
      button.onclick = open;
      button.onkeydown = (event) => { if (event.key === 'ArrowDown') { event.preventDefault(); open(); } };
      node.append(button);
    }
    wrap.append(node);
  };
  if (!config.quickFiltersMenu || !openMenu) group('all', filters.length);
  else {
    const main = config.quickFiltersVisible ?? 0;
    const mobile = config.quickFiltersVisibleMobile ?? main;
    if (singleColumn) group('all', mobile);
    else { group('desktop', main); group('mobile', mobile); }
  }
  return wrap;
}
