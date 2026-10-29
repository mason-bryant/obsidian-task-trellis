import { uiElement } from './dom.ts';
export type EditorHeader = { setBusy(busy: boolean): void };

/** Save on the left, dismiss on the right, outside the editor's scrolling fields. */
export function renderEditorHeader(root: HTMLElement, title: string, icon: (el: HTMLElement, name: string) => void,
  save: (() => void) | null, cancel: () => void, saveLabel = 'Save changes'): EditorHeader {
  const doc = root.ownerDocument;
  const header = uiElement(doc, 'div'); header.className = 'tt-editor-header';
  const button = (name: string, label: string, action: () => void) => {
    const b = uiElement(doc, 'button'); b.type = 'button'; b.className = `tt-editor-${name}`;
    b.setAttribute('aria-label', label); icon(b, name === 'save' ? 'check' : 'x');
    b.onclick = action; return b;
  };
  const confirm = save ? button('save', saveLabel, save) : uiElement(doc, 'span');
  const heading = uiElement(doc, 'div'); heading.className = 'tt-editor-title'; heading.textContent = title;
  heading.setAttribute('role', 'heading'); heading.setAttribute('aria-level', '2');
  const close = button('cancel', save ? 'Cancel' : 'Close', cancel);
  header.append(confirm, heading, close); root.replaceChildren(header);
  return { setBusy(busy) {
    header.setAttribute('aria-busy', String(busy));
    header.querySelectorAll('button').forEach((button) => { button.disabled = busy; });
  } };
}

/** Native modals and the preview share the same header and keyboard-sized viewport. */
export function prepareEditorModal(modal: HTMLElement): { header: HTMLElement; destroy(): void } {
  modal.classList.add('tt-editor-modal');
  const header = uiElement(modal.ownerDocument, 'div'); header.className = 'tt-editor-header-slot';
  modal.prepend(header);
  const viewport = modal.ownerDocument.defaultView?.visualViewport;
  const resize = () => {
    modal.style.setProperty('--tt-editor-height', `${Math.max(120, (viewport?.height ?? modal.ownerDocument.defaultView!.innerHeight) - 24)}px`);
    modal.style.setProperty('--tt-editor-top', `${(viewport?.offsetTop ?? 0) + 12}px`);
  };
  resize(); viewport?.addEventListener('resize', resize); viewport?.addEventListener('scroll', resize);
  return { header, destroy() { viewport?.removeEventListener('resize', resize); viewport?.removeEventListener('scroll', resize); header.remove(); } };
}

/** Whether an editor's header is busy saving, when Escape and clicks outside mustn't close it. */
export function editorBusy(modal: HTMLElement): boolean {
  return modal.querySelector('.tt-editor-header')?.getAttribute('aria-busy') === 'true';
}
