import { describe, expect, it } from 'vitest';
import { contrastRatio, hexToHsl, hexToRgb, hslToHex, hueName } from '../src/core/colorMath.ts';
import { LABEL_COLORS, labelTextColor } from '../src/core/labels.ts';

describe('color math', () => {
  it('turns hex codes into HSL and back without changing them', () => {
    for (const { color } of LABEL_COLORS) expect(hslToHex(hexToHsl(color))).toBe(color);
    for (const color of ['#000000', '#ffffff', '#808080', '#ff0000', '#00ff00', '#0000ff', '#ffcc00']) expect(hslToHex(hexToHsl(color))).toBe(color);
    expect(hexToHsl('#808080')).toEqual({ h: 0, s: 0, l: 100 * 128 / 255 });
    const blue = hexToHsl('#1558bc');
    expect([Math.round(blue.h), Math.round(blue.s), Math.round(blue.l)]).toEqual([216, 80, 41]);
    expect(hslToHex({ h: 360, s: 100, l: 50 })).toBe('#ff0000');
  });

  it('names hues for screen readers', () => {
    expect([0, 30, 60, 120, 180, 216, 270, 300, 340, 360].map(hueName)).toEqual(
      ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'magenta', 'pink', 'red']);
  });

  it('measures contrast as WCAG does', () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21);
    expect(contrastRatio([255, 255, 255], [255, 255, 255])).toBe(1);
    expect(contrastRatio(hexToRgb('#767676'), [255, 255, 255])).toBeCloseTo(4.54, 2);
    expect(LABEL_COLORS.map((c) => labelTextColor(c.color))).toEqual(Array(6).fill('#ffffff'));
    expect(labelTextColor('#ffcc00')).toBe('#000000');
  });
});
