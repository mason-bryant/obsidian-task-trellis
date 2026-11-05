import { contrastRatio, hexToHsl, hexToRgb, hslToHex, hueName, type Hsl, type Rgb } from '../core/colorMath.ts';
import { CARD_PATTERNS, rgbChannels, type CardPattern } from '../core/colorRules.ts';
import { LABEL_COLORS, normalizeLabelColor } from '../core/labels.ts';
import { uiElement } from './dom.ts';

export type ColorPickerOptions = {
  /** The color as last chosen or typed, which may not be a whole code yet. */
  color: string;
  /** The HTML color code's text box, made by the form so it looks like the form's other text boxes. */
  code: HTMLInputElement;
  /** Starts each control's name where several pickers can be open, such as "Color rule 1". */
  prefix?: string;
  /** Starts each control's `data-focus`, so a redrawn form can put focus back. */
  focusKey?: string;
  /** Gets each change: `#rrggbb` from a swatch or slider, or the code as typed. */
  changed(color: string): void;
  /** For a color rule: how strongly its cards are tinted, in percent, or undefined for automatic. */
  opacity?: { value: number | undefined; changed: (opacity: number | undefined) => void };
  /** For a color rule: how its tint is drawn, or undefined for solid. */
  pattern?: { value: CardPattern | undefined; changed: (pattern: CardPattern | undefined) => void };
};

export type ColorPicker = {
  /** The palette and the sliders. */
  element: HTMLElement;
  /** With `pattern`: a choice of patterns, each drawn in the color. */
  patterns: HTMLElement | null;
  /** With `opacity`: a sample card in the rule's tint, and a warning when its text would be hard to read. */
  preview: HTMLElement | null;
};

type Slider = { input: HTMLInputElement; value: HTMLElement; track: HTMLElement };

/** Range inputs run from right to left in right-to-left languages, so their tracks do too. */
const TRACK = 'linear-gradient(to var(--inset-end, right)';
const HUE_TRACK = `${TRACK}, ${[0, 60, 120, 180, 240, 300, 360].map((h) => hslToHex({ h, s: 100, l: 50 })).join(', ')})`;
/** WCAG's minimum for normal text, kept by a card's faintest text, its details. */
const MIN_CONTRAST = 4.5;

/**
 * The palette, hue, saturation and lightness sliders, and the HTML color code, kept in step.
 * Shared by the label editor and color rules, which add an opacity slider and a sample card.
 */
export function renderColorPicker(doc: Document, options: ColorPickerOptions): ColorPicker {
  const node = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => {
    const el = uiElement(doc, tag); el.className = cls; el.textContent = text; return el;
  };
  const named = (what: string) => options.prefix ? `${options.prefix} ${what.toLowerCase()}` : what;
  const focus = (el: HTMLElement, key: string) => { if (options.focusKey) el.dataset.focus = `${options.focusKey}-${key}`; };
  const { code } = options;
  let hex = normalizeLabelColor(options.color);
  let hsl: Hsl = hex ? hexToHsl(hex) : { h: 0, s: 0, l: 50 };
  /** The last whole color, which the sample and opacity track keep while a code is being typed. */
  let shown = hex ?? hslToHex(hsl);
  let opacity = options.opacity?.value;
  let pattern = options.pattern?.value;

  const element = node('div', 'tt-color-picker');
  const swatches = node('div', 'tt-label-colors');
  swatches.setAttribute('role', 'group'); swatches.setAttribute('aria-label', named('Color swatches'));
  for (const swatch of LABEL_COLORS) {
    const b = node('button', 'tt-label-color'); b.type = 'button'; b.style.backgroundColor = swatch.color;
    b.setAttribute('aria-label', swatch.name); b.dataset.color = swatch.color; focus(b, swatch.name.toLowerCase());
    b.onclick = () => { adopt(swatch.color); code.value = swatch.color.toUpperCase(); sync(); options.changed(swatch.color); };
    swatches.append(b);
  }
  const sliders = node('div', 'tt-color-sliders');
  const slider = (name: string, max: number): Slider => {
    // The label makes the visible name focus its slider; the slider's own name says which picker it's in.
    const row = node('label', 'tt-color-slider');
    const title = node('span', 'tt-color-slider-name', name); title.setAttribute('aria-hidden', 'true');
    const track = node('span', 'tt-color-slider-track');
    const input = node('input'); input.type = 'range'; input.min = '0'; input.max = String(max); input.step = '1';
    input.setAttribute('aria-label', named(name)); focus(input, name.toLowerCase());
    const value = node('span', 'tt-color-slider-value'); value.setAttribute('aria-hidden', 'true');
    track.append(input); row.append(title, track, value); sliders.append(row);
    return { input, value, track };
  };
  const paint = (s: Slider, track: string) => s.track.style.setProperty('--tt-color-track', track);
  const channels = ([['h', 'Hue', 360], ['s', 'Saturation', 100], ['l', 'Lightness', 100]] as const).map(([key, name, max]) => {
    const s = slider(name, max);
    s.input.addEventListener('input', () => {
      hsl = { ...hsl, [key]: s.input.valueAsNumber }; hex = shown = hslToHex(hsl);
      code.value = hex.toUpperCase(); sync(); options.changed(hex);
    });
    return { key, ...s };
  });
  paint(channels[0]!, HUE_TRACK);
  element.append(swatches, sliders);

  code.addEventListener('input', () => {
    const next = normalizeLabelColor(code.value);
    if (next) adopt(next); else hex = null;
    sync(); options.changed(code.value);
  });

  let patterns: HTMLElement | null = null;
  if (options.pattern) {
    const changed = options.pattern.changed;
    patterns = node('div', 'tt-color-patterns');
    patterns.setAttribute('role', 'group'); patterns.setAttribute('aria-label', named('Pattern'));
    for (const choice of CARD_PATTERNS) {
      const b = node('button', 'tt-color-pattern'); b.type = 'button'; b.dataset.pattern = choice.id; focus(b, `pattern-${choice.id}`);
      // Each choice shows its pattern stronger than a card would, so it can be told apart at this size.
      const tile = node('span', `tt-color-pattern-tile tt-tint--${choice.id}`); tile.setAttribute('aria-hidden', 'true');
      b.append(node('span', '', choice.name), tile);
      b.onclick = () => { pattern = choice.id === 'solid' ? undefined : choice.id; sync(); changed(pattern); };
      patterns.append(b);
    }
  }

  let preview: HTMLElement | null = null;
  let tint: (() => void) | null = null;
  if (options.opacity) {
    const changed = options.opacity.changed;
    const alpha = slider('Opacity', 100);
    alpha.track.classList.add('tt-color-slider-track--opacity');
    const note = node('p', 'tt-help tt-color-automatic', 'Opacity is automatic: 14%, or 24% in dark themes.');
    const reset = node('button', 'tt-button tt-button--subtle tt-color-reset', 'Use automatic opacity'); reset.type = 'button';
    focus(reset, 'automatic');
    alpha.input.addEventListener('input', () => { opacity = alpha.input.valueAsNumber; sync(); changed(opacity); });
    reset.onclick = () => { opacity = undefined; sync(); changed(undefined); alpha.input.focus(); };
    element.append(note, reset);

    preview = node('div', 'tt-color-preview');
    // A picture of the tint; the opacity slider says when its text would be hard to read.
    const sample = node('div', 'tt-color-sample'); sample.setAttribute('aria-hidden', 'true');
    const details = node('span', 'tt-color-sample-details', 'Due today · Project note');
    sample.append(node('span', 'tt-color-sample-text', 'Card text'), details);
    const warning = node('p', 'tt-help tt-color-warning', 'Card text may be hard to read at this opacity.');
    preview.append(sample, warning);

    tint = () => {
      const rgb = rgbChannels(shown);
      paint(alpha, `${TRACK}, rgba(${rgb}, 0), rgb(${rgb}))`);
      sample.style.setProperty('--tt-card-rgb', rgb);
      sample.className = pattern ? `tt-color-sample tt-tint--${pattern}` : 'tt-color-sample';
      if (opacity === undefined) sample.style.removeProperty('--tt-card-tint');
      else sample.style.setProperty('--tt-card-tint', String(opacity / 100));
      const percent = opacity ?? automaticOpacity(sample);
      const readable = readableOver(sample, details, hexToRgb(shown), percent);
      alpha.input.value = String(percent);
      alpha.value.textContent = `${percent}%`;
      alpha.input.setAttribute('aria-valuetext', `${opacity === undefined ? 'Automatic, ' : ''}${percent}%${readable ? '' : ', card text may be hard to read'}`);
      warning.hidden = readable; note.hidden = opacity !== undefined; reset.hidden = opacity === undefined;
    };
    // The automatic opacity and the card's colors come from the theme, once the sample is on screen.
    queueMicrotask(() => tint?.());
  }

  function adopt(next: string): void {
    const c = hexToHsl(next);
    // Grays have no hue, and black and white no saturation either: those sliders stay where they were.
    const shaded = c.l > 0 && c.l < 100;
    hsl = { h: shaded && c.s > 0 ? c.h : hsl.h, s: shaded ? c.s : hsl.s, l: c.l };
    hex = shown = next;
  }
  function sync(): void {
    for (const b of swatches.querySelectorAll<HTMLButtonElement>('button')) b.setAttribute('aria-pressed', String(b.dataset.color === hex));
    for (const c of channels) {
      const v = Math.round(hsl[c.key]);
      c.input.value = String(v);
      c.value.textContent = c.key === 'h' ? `${v}°` : `${v}%`;
      c.input.setAttribute('aria-valuetext', c.key === 'h' ? `${v}°, ${hueName(v)}` : `${v}%`);
    }
    const { h, s, l } = hsl;
    paint(channels[1]!, `${TRACK}, ${hslToHex({ h, s: 0, l })}, ${hslToHex({ h, s: 100, l })})`);
    paint(channels[2]!, `${TRACK}, ${[0, 50, 100].map((light) => hslToHex({ h, s, l: light })).join(', ')})`);
    if (patterns) {
      patterns.style.setProperty('--tt-card-rgb', rgbChannels(shown));
      for (const b of patterns.querySelectorAll<HTMLButtonElement>('button')) b.setAttribute('aria-pressed', String(b.dataset.pattern === (pattern ?? 'solid')));
    }
    tint?.();
  }
  sync();
  return { element, patterns, preview };
}

/** The theme's automatic tint, which the stylesheet sets on the sample as it does on cards. */
function automaticOpacity(sample: HTMLElement): number {
  const win = sample.ownerDocument.defaultView;
  const tint = sample.isConnected && win ? parseFloat(win.getComputedStyle(sample).getPropertyValue('--tt-card-tint')) : NaN;
  return Number.isFinite(tint) ? Math.round(tint * 100) : 14;
}

/** Whether the card's details keep their contrast over the tint. True when the theme's colors can't be read. */
function readableOver(sample: HTMLElement, details: HTMLElement, tint: Rgb, percent: number): boolean {
  const win = sample.ownerDocument.defaultView;
  if (!win || !sample.isConnected) return true;
  const card = cssColor(win.getComputedStyle(sample).backgroundColor);
  const text = cssColor(win.getComputedStyle(details).color);
  if (!card || card[3] < 1 || !text) return true;
  const mix = (under: Rgb, over: Rgb, a: number) => under.map((v, i) => v * (1 - a) + over[i]! * a) as Rgb;
  const background = mix(card.slice(0, 3) as Rgb, tint, percent / 100);
  return contrastRatio(background, mix(background, text.slice(0, 3) as Rgb, text[3])) >= MIN_CONTRAST;
}

/** `rgb(…)` or `rgba(…)`, as computed styles give colors, as red, green, blue and alpha. */
function cssColor(value: string): [number, number, number, number] | null {
  const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/.exec(value);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])] : null;
}
