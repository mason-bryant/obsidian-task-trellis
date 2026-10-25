/** Obsidian exposes its global DOM helpers on each window, including pop-outs. */
export {};
declare global {
  interface Window {
    createEl: typeof createEl;
    createSvg: typeof createSvg;
  }
}
