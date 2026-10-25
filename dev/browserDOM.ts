/** Obsidian DOM helpers for the standalone preview and DOM tests only. */
if (typeof window !== 'undefined') {
  const doc = window.document;
  if (!('win' in Document.prototype)) Object.defineProperty(Document.prototype, 'win', { get(this: Document) { return this.defaultView; } });
  const html = <K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K] => doc.createElementNS('http://www.w3.org/1999/xhtml', tag) as HTMLElementTagNameMap[K];
  const svgNamespace = 'http://www.w3.org/2000/svg';
  const svg = <K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] => doc.createElementNS(svgNamespace, tag);
  if (!doc.win.createEl) Object.assign(window, { createEl: html, createSvg: svg });
}
