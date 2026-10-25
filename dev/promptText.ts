import { uiElement, isComposing } from '../src/ui/dom.ts';

/** In-page stand-in for the Tasks editor, with the same explicit save/cancel affordances. */
export function promptText(label: string, value = ''): Promise<string | null> {
  return new Promise((resolve) => {
    const dialog = uiElement(document, 'dialog');
    const heading = uiElement(document, 'h2'); heading.textContent = label;
    const input = uiElement(document, 'textarea'); input.value = value; input.setAttribute('aria-label', label);
    const save = uiElement(document, 'button'); save.textContent = 'Save';
    const cancel = uiElement(document, 'button'); cancel.textContent = 'Cancel';
    const finish = (text: string | null) => { dialog.close(); dialog.remove(); resolve(text); };
    save.onclick = () => finish(input.value);
    cancel.onclick = () => finish(null);
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); finish(null); });
    input.onkeydown = (event) => {
      if (!isComposing(event) && event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); finish(input.value); }
    };
    dialog.append(heading, input, save, cancel); document.body.append(dialog); dialog.showModal(); input.focus();
  });
}
