/** Fixed SVG geometry for standalone preview icons; no HTML parsing. */
const paths: Record<string, Array<{ tag: keyof SVGElementTagNameMap; attrs: Record<string, string> }>> = {
  "tag": [{"tag": "path", "attrs": {"d": "M20 13 13 20a2 2 0 0 1-3 0L2 12V2h10l8 8a2 2 0 0 1 0 3Z"}}, {"tag": "circle", "attrs": {"cx": "7", "cy": "7", "r": "1"}}],
  "pencil": [{"tag": "path", "attrs": {"d": "m16 3 5 5L8 21H3v-5ZM14 5l5 5"}}],
  "plus": [{"tag": "path", "attrs": {"d": "M12 5v14M5 12h14"}}],
  "check": [{"tag": "path", "attrs": {"d": "m5 12 4 4L19 6"}}],
  "x": [{"tag": "path", "attrs": {"d": "m6 6 12 12M6 18 18 6"}}],
  "arrow-up": [{"tag": "path", "attrs": {"d": "M12 19V5m-6 6 6-6 6 6"}}],
  "arrow-down": [{"tag": "path", "attrs": {"d": "M12 5v14m-6-6 6 6 6-6"}}],
  "arrow-left": [{"tag": "path", "attrs": {"d": "M19 12H5m6-6-6 6 6 6"}}],
  "arrow-right": [{"tag": "path", "attrs": {"d": "M5 12h14m-6-6 6 6-6 6"}}],
  "list-plus": [{"tag": "path", "attrs": {"d": "M8 6h12M8 12h7M8 18h5M3 6h.01M3 12h.01M3 18h.01M19 15v6M16 18h6"}}],
  "file-text": [{"tag": "path", "attrs": {"d": "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Zm0 0v6h6M8 13h8M8 17h6"}}],
  "file-plus-2": [{"tag": "path", "attrs": {"d": "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Zm0 0v6h6M12 12v6M9 15h6"}}],
  "calendar-days": [{"tag": "rect", "attrs": {"x": "3", "y": "5", "width": "18", "height": "16", "rx": "2"}}, {"tag": "path", "attrs": {"d": "M16 3v4M8 3v4M3 11h18M8 15h.01M12 15h.01M16 15h.01M8 18h.01M12 18h.01"}}],
  "calendar-clock": [{"tag": "path", "attrs": {"d": "M21 10V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5M16 3v4M8 3v4M3 11h9"}}, {"tag": "circle", "attrs": {"cx": "17", "cy": "17", "r": "5"}}, {"tag": "path", "attrs": {"d": "M17 14v3l2 1"}}],
  "flag": [{"tag": "path", "attrs": {"d": "M4 22V3c5-4 11 4 16 0v11c-5 4-11-4-16 0"}}],
  "circle": [{"tag": "circle", "attrs": {"cx": "12", "cy": "12", "r": "8"}}],
  "circle-check": [{"tag": "circle", "attrs": {"cx": "12", "cy": "12", "r": "9"}}, {"tag": "path", "attrs": {"d": "m8 12 3 3 5-6"}}],
  "circle-plus": [{"tag": "circle", "attrs": {"cx": "12", "cy": "12", "r": "9"}}, {"tag": "path", "attrs": {"d": "M12 8v8M8 12h8"}}],
  "circle-minus": [{"tag": "circle", "attrs": {"cx": "12", "cy": "12", "r": "9"}}, {"tag": "path", "attrs": {"d": "M8 12h8"}}],
  "columns-3": [{"tag": "rect", "attrs": {"x": "3", "y": "3", "width": "18", "height": "18", "rx": "2"}}, {"tag": "path", "attrs": {"d": "M9 3v18M15 3v18"}}],
  "rows-3": [{"tag": "rect", "attrs": {"x": "3", "y": "3", "width": "18", "height": "18", "rx": "2"}}, {"tag": "path", "attrs": {"d": "M3 9h18M3 15h18"}}],
  "list-filter": [{"tag": "path", "attrs": {"d": "M4 6h16M7 12h10M10 18h4"}}],
  "palette": [{"tag": "circle", "attrs": {"cx": "12", "cy": "12", "r": "9"}}, {"tag": "circle", "attrs": {"cx": "8.5", "cy": "10", "r": "1"}}, {"tag": "circle", "attrs": {"cx": "12", "cy": "7.5", "r": "1"}}, {"tag": "circle", "attrs": {"cx": "15.5", "cy": "10", "r": "1"}}],
  "filter": [{"tag": "path", "attrs": {"d": "M22 3H2l8 9.46V19l4 2v-8.54Z"}}],
  "copy": [{"tag": "rect", "attrs": {"x": "8", "y": "8", "width": "14", "height": "14", "rx": "2"}}, {"tag": "path", "attrs": {"d": "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"}}],
  "chevron-right": [{"tag": "path", "attrs": {"d": "m9 18 6-6-6-6"}}],
  "chevron-down": [{"tag": "path", "attrs": {"d": "m6 9 6 6 6-6"}}],
  "sliders-horizontal": [{"tag": "path", "attrs": {"d": "M3 6h4m4 0h10M3 12h10m4 0h4M3 18h4m4 0h10M7 3v6M17 9v6M7 15v6"}}],
  "trash-2": [{"tag": "path", "attrs": {"d": "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"}}],
  "more-horizontal": [{"tag": "circle", "attrs": {"cx": "5", "cy": "12", "r": "1"}}, {"tag": "circle", "attrs": {"cx": "12", "cy": "12", "r": "1"}}, {"tag": "circle", "attrs": {"cx": "19", "cy": "12", "r": "1"}}],
  "grip-vertical": [{"tag": "circle", "attrs": {"cx": "9", "cy": "5", "r": "1"}}, {"tag": "circle", "attrs": {"cx": "9", "cy": "12", "r": "1"}}, {"tag": "circle", "attrs": {"cx": "9", "cy": "19", "r": "1"}}, {"tag": "circle", "attrs": {"cx": "15", "cy": "5", "r": "1"}}, {"tag": "circle", "attrs": {"cx": "15", "cy": "12", "r": "1"}}, {"tag": "circle", "attrs": {"cx": "15", "cy": "19", "r": "1"}}],
  "inbox": [{"tag": "path", "attrs": {"d": "m3 14 3-10h12l3 10v6H3Zm0 0h5l2 3h4l2-3h5"}}]
};
export function previewIcon(el: HTMLElement, name: string): void {
  const doc = el.ownerDocument;
  const svg = doc.win.createSvg('svg');
  for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(key, value);
  for (const shape of paths[name] ?? paths.circle!) {
    const child = doc.win.createSvg(shape.tag);
    for (const [key, value] of Object.entries(shape.attrs)) child.setAttribute(key, value);
    svg.append(child);
  }
  el.replaceChildren(svg);
}
