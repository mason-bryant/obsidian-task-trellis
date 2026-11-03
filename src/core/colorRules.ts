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
};

export const COLOR_RULE_FM = { name: 'name', color: 'color' } as const;

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
    rules.push({ name, color, ...parseCriteria(r, warnings, `The ${name} color rule’s filters`) });
  }
  return rules;
}

/** Front matter for one color rule, with its rules as `filterFrontmatter` writes them; empty criteria are left out. */
export function colorRuleFrontmatter(rule: Omit<ColorRule, 'filter'>, rules: Record<string, unknown>): Record<string, unknown> {
  return criteriaFrontmatter(rule, rules, { [COLOR_RULE_FM.name]: rule.name, [COLOR_RULE_FM.color]: rule.color });
}

/** `#1558bc` as `21, 88, 188`, for CSS's `rgba(var(--…), alpha)`. */
export function rgbChannels(color: string): string {
  return [1, 3, 5].map((at) => parseInt(color.slice(at, at + 2), 16)).join(', ');
}
