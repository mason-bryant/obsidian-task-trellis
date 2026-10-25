/** Create detached elements in the owning window using Obsidian's DOM helpers. */
export function uiElement<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K): HTMLElementTagNameMap[K] {
  return doc.win.createEl(tag);
}

/** Enter confirms an IME conversion before it can submit a form. */
export function isComposing(event: KeyboardEvent): boolean {
  // Older WebKit exposes IME confirmation only through the legacy keyCode property.
  return event.isComposing || Reflect.get(event, 'keyCode') === 229;
}
