/** Hue in degrees, from 0 to 360; saturation and lightness in percent. */
export type Hsl = { h: number; s: number; l: number };
/** Red, green and blue, from 0 to 255. */
export type Rgb = [number, number, number];

/** `#rrggbb` as red, green and blue. */
export function hexToRgb(hex: string): Rgb {
  return [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)) as Rgb;
}

/** `#rrggbb` as HSL, unrounded, so a slider can move one channel without nudging the others. */
export function hexToHsl(hex: string): Hsl {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255) as Rgb;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2;
  if (!d) return { h: 0, s: 0, l: l * 100 };
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s: d / (1 - Math.abs(2 * l - 1)) * 100, l: l * 100 };
}

export function hslToHex({ h, s, l }: Hsl): string {
  const light = l / 100, a = s / 100 * Math.min(light, 1 - light);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round((light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255).toString(16).padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

const HUE_NAMES: [number, string][] = [
  [15, 'red'], [45, 'orange'], [70, 'yellow'], [160, 'green'], [200, 'cyan'],
  [250, 'blue'], [285, 'purple'], [330, 'magenta'], [350, 'pink'], [361, 'red'],
];

/** A rough name for a hue, so a screen reader can say where the hue slider is. */
export function hueName(h: number): string {
  return HUE_NAMES.find(([end]) => h < end)?.[1] ?? 'red';
}

/** WCAG relative luminance, from 0 for black to 1 for white. */
export function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((v) => v / 255).map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4) as Rgb;
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

/** WCAG contrast ratio, from 1 to 21. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
