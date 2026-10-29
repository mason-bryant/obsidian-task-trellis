import { uiElement } from './dom.ts';
/** `label`, while busy, shows the spinner on Save and a status line under the header, such as "Applying changes…". */
export type EditorHeader = { setBusy(busy: boolean, label?: string): void };

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
  const progress = uiElement(doc, 'p'); progress.className = 'tt-editor-progress'; progress.hidden = true;
  progress.setAttribute('role', 'status'); progress.setAttribute('aria-atomic', 'true');
  header.append(confirm, heading, close); root.replaceChildren(header, progress);
  let named: string | null = null;
  return { setBusy(busy, label) {
    header.setAttribute('aria-busy', String(busy));
    header.querySelectorAll('button').forEach((button) => { button.disabled = busy; });
    const working = busy && !!label;
    confirm.classList.toggle('tt-editor-saving', working);
    progress.hidden = !working; progress.textContent = working ? label : '';
    // Without a label the save button keeps whatever name its editor gave it.
    if (!save) return;
    if (working) { named ??= confirm.getAttribute('aria-label'); confirm.setAttribute('aria-label', label); }
    else if (named !== null) { confirm.setAttribute('aria-label', named); named = null; }
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
