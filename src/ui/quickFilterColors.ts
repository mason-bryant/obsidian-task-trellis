import { labelDescription, type BoardLabel } from '../core/labels.ts';
import { uiElement } from './dom.ts';

/** Shared preview for toolbar filters and their settings headers, in board palette order. */
export function quickFilterColors(doc: Document, labels: BoardLabel[], selected: string[]): HTMLElement {
  const colors = uiElement(doc, 'span');
  colors.className = 'tt-quick-filter-colors';
  for (const label of labels.filter((label) => selected.includes(label.id))) {
    const square = uiElement(doc, 'span');
    square.className = 'tt-quick-filter-color';
    square.style.backgroundColor = label.color;
    square.setAttribute('role', 'img');
    square.setAttribute('aria-label', labelDescription(label));
    colors.append(square);
  }
  colors.hidden = colors.childElementCount === 0;
  return colors;
}
