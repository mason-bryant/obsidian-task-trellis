import { hexToRgb } from './colorMath.ts';
import { normalizeLabelColor } from './labels.ts';
import { criteriaFrontmatter, parseCriteria, type TaskCriteria } from './quickFilters.ts';

/**
 * Tints the cards it matches, with a quick filter's criteria. A card takes the color of the first
 * rule it matches.
 */
export type ColorRule = TaskCriteria & {
  name: string;
  /** A hex color, as `normalizeLabelColor` writes it. */
  color: string;
  /** How strongly cards are tinted, in percent. Without it, the theme's automatic tint. */
  opacity?: number;
  /** How the tint is drawn. Without it, solid. */
  pattern?: CardPattern;
};

export const COLOR_RULE_FM = { name: 'name', color: 'color', opacity: 'opacity', pattern: 'pattern' } as const;

/**
 * How a color rule draws its tint. A pattern's lines, dots or squares take the rule's opacity and the
 * space between them a lighter tint, so no part of a card is darker than the solid tint would be.
 */
export const CARD_PATTERNS = [
  { id: 'solid', name: 'Solid' },
  { id: 'stripes', name: 'Stripes' },
  { id: 'dots', name: 'Dots' },
  { id: 'grid', name: 'Grid' },
  { id: 'checks', name: 'Checks' },
] as const;
export type CardPattern = Exclude<typeof CARD_PATTERNS[number]['id'], 'solid'>;

/** A pattern's id, in any case, or null. Solid is undefined, as rules without a pattern store it. */
export function parsePattern(raw: unknown): CardPattern | undefined | null {
  const id = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  const known = CARD_PATTERNS.find((p) => p.id === id)?.id;
  return known === undefined ? null : known === 'solid' ? undefined : known;
}

/** A whole percent from 0 to 100, from a number or text such as `35%`, or null. */
export function parseOpacity(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && /^\s*\d+(\.\d+)?\s*%?\s*$/.test(raw) ? parseFloat(raw) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n) : null;
}

export function parseColorRules(raw: unknown, warnings: string[]): ColorRule[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    warnings.push('color-rules must be a list; no cards are colored.');
    return [];
  }
  const rules: ColorRule[] = [];
  for (const item of raw as unknown[]) {
    const r = item && typeof item === 'object' && !Array.isArray(item) ? item as Record<string, unknown> : null;
    const name = typeof r?.[COLOR_RULE_FM.name] === 'string' ? (r[COLOR_RULE_FM.name] as string).trim() : '';
    if (!r || !name) { warnings.push('A color rule without a name was ignored.'); continue; }
    const color = typeof r[COLOR_RULE_FM.color] === 'string' ? normalizeLabelColor(r[COLOR_RULE_FM.color] as string) : null;
    if (!color) { warnings.push(`The ${name} color rule was ignored: its color must be a hex color such as #1558bc.`); continue; }
    const rule: ColorRule = { name, color, ...parseCriteria(r, warnings, `The ${name} color rule’s filters`) };
    const opacity = r[COLOR_RULE_FM.opacity];
    if (opacity !== undefined && opacity !== null) {
      const percent = parseOpacity(opacity);
      if (percent === null) warnings.push(`The ${name} color rule’s opacity must be from 0 to 100, so it uses the automatic opacity.`);
      else rule.opacity = percent;
    }
    const pattern = r[COLOR_RULE_FM.pattern];
    if (pattern !== undefined && pattern !== null) {
      const known = parsePattern(pattern);
      if (known === null) warnings.push(`The ${name} color rule’s pattern must be solid, stripes, dots, grid or checks, so its tint is solid.`);
      else if (known) rule.pattern = known;
    }
    rules.push(rule);
  }
  return rules;
}

/** Front matter for one color rule, with its rules as `filterFrontmatter` writes them; empty criteria are left out. */
export function colorRuleFrontmatter(rule: Omit<ColorRule, 'filter'>, rules: Record<string, unknown>): Record<string, unknown> {
  const fm: Record<string, unknown> = { [COLOR_RULE_FM.name]: rule.name, [COLOR_RULE_FM.color]: rule.color };
  if (rule.opacity !== undefined) fm[COLOR_RULE_FM.opacity] = rule.opacity;
  if (rule.pattern) fm[COLOR_RULE_FM.pattern] = rule.pattern;
  return criteriaFrontmatter(rule, rules, fm);
}

/** `#1558bc` as `21, 88, 188`, for CSS's `rgba(var(--…), alpha)`. */
export function rgbChannels(color: string): string {
  return hexToRgb(color).join(', ');
}
