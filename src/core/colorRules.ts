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
};

export const COLOR_RULE_FM = { name: 'name', color: 'color', opacity: 'opacity' } as const;

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
    rules.push(rule);
  }
  return rules;
}

/** Front matter for one color rule, with its rules as `filterFrontmatter` writes them; empty criteria are left out. */
export function colorRuleFrontmatter(rule: Omit<ColorRule, 'filter'>, rules: Record<string, unknown>): Record<string, unknown> {
  const fm: Record<string, unknown> = { [COLOR_RULE_FM.name]: rule.name, [COLOR_RULE_FM.color]: rule.color };
  if (rule.opacity !== undefined) fm[COLOR_RULE_FM.opacity] = rule.opacity;
  return criteriaFrontmatter(rule, rules, fm);
}

/** `#1558bc` as `21, 88, 188`, for CSS's `rgba(var(--…), alpha)`. */
export function rgbChannels(color: string): string {
  return hexToRgb(color).join(', ');
}
