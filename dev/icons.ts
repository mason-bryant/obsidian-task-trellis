/** Small line-icon stand-ins for Obsidian's setIcon, so previews use the same size and stroke. */
const paths: Record<string, string> = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="m6 6 12 12M6 18 18 6"/>',
  'arrow-up': '<path d="M12 19V5m-6 6 6-6 6 6"/>',
  'arrow-down': '<path d="M12 5v14m-6-6 6 6 6-6"/>',
  'arrow-left': '<path d="M19 12H5m6-6-6 6 6 6"/>',
  'arrow-right': '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  'list-plus': '<path d="M8 6h12M8 12h7M8 18h5M3 6h.01M3 12h.01M3 18h.01M19 15v6M16 18h6"/>',
  'file-text': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Zm0 0v6h6M8 13h8M8 17h6"/>',
  'file-plus-2': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Zm0 0v6h6M12 12v6M9 15h6"/>',
  'calendar-days': '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18M8 15h.01M12 15h.01M16 15h.01M8 18h.01M12 18h.01"/>',
  'calendar-clock': '<path d="M21 10V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5M16 3v4M8 3v4M3 11h9"/><circle cx="17" cy="17" r="5"/><path d="M17 14v3l2 1"/>',
  flag: '<path d="M4 22V3c5-4 11 4 16 0v11c-5 4-11-4-16 0"/>',
  circle: '<circle cx="12" cy="12" r="8"/>',
  'circle-check': '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  'circle-plus': '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  'circle-minus': '<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>',
  'columns-3': '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18"/>',
  'rows-3': '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18"/>',
  'list-filter': '<path d="M4 6h16M7 12h10M10 18h4"/>',
  'sliders-horizontal': '<path d="M3 6h4m4 0h10M3 12h10m4 0h4M3 18h4m4 0h10M7 3v6M17 9v6M7 15v6"/>',
  'trash-2': '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  'more-horizontal': '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  inbox: '<path d="m3 14 3-10h12l3 10v6H3Zm0 0h5l2 3h4l2-3h5"/>',
};
export function previewIcon(el: HTMLElement, name: string): void {
  el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.circle}</svg>`;
}
