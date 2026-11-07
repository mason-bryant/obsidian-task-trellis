import type { PropertyFilter } from './boardConfig.ts';
import { flatFilter, flatRules, noFilter, simplifyFilter, type FilterGroup, type FilterMatch, type FilterNode } from './filters.ts';
import { arePropertyFilters, isStringList, normalizeFolder, normalizeTag, propertyFilters, stringList } from './frontmatterValues.ts';

/** The keys a board and each quick filter keep their rules in. */
export const FILTER_FM = {
  filter: 'filter',
  includeTags: 'include-tags',
  excludeTags: 'exclude-tags',
  includeFolders: 'include-folders',
  excludeFolders: 'exclude-folders',
  filterProperties: 'filter-properties',
  excludeProperties: 'exclude-properties',
} as const;

/**
 * A rule that a release without groups reads as a folder no note is in. Written with `filter`, so
 * that an older Task Trellis on another device shows no tasks, rather than every task.
 */
export const NEEDS_GROUPS = 'Update Task Trellis to use this filter';

const GROUP_KEYS = new Map<string, FilterMatch>([['and', 'all'], ['or', 'any'], ['not', 'none']]);
const MATCH_KEYS: Record<FilterMatch, string> = { all: 'and', any: 'or', none: 'not' };

/**
 * A group that no task matches, for rules that can't be read. It keeps them as the note has them,
 * so saving something else doesn't turn them into no rules at all, which would match every task.
 */
export function unreadableFilter(raw: Record<string, unknown>, keys: readonly string[] = Object.values(FILTER_FM)): FilterGroup {
  return { kind: 'group', match: 'any', items: [], unreadable: Object.fromEntries(keys.filter((key) => raw[key] !== undefined).map((key) => [key, raw[key]])) };
}

/** What a board says about rules that can't be read; `where` names them. */
export function unreadableWarning(where: string, why: string): string {
  return `${where} couldn’t be read (${why}), so it matches no tasks. Choose its rules again in the board’s settings.`;
}

/**
 * The rules in a board's or quick filter's properties: the `filter` group when there is one,
 * otherwise the lists every release writes. `where` names them in a warning.
 */
export function readFilter(fm: Record<string, unknown>, warnings: string[], where: string): FilterGroup {
  const tree = fm[FILTER_FM.filter];
  if (tree !== undefined && tree !== null) {
    const problems: string[] = [];
    const group = parseFilterTree(tree, problems);
    if (group) return simplifyFilter(group);
    warnings.push(unreadableWarning(where, problems[0] ?? 'it isn’t a group'));
    return unreadableFilter(fm);
  }
  const unreadable = [FILTER_FM.includeTags, FILTER_FM.excludeTags, FILTER_FM.includeFolders, FILTER_FM.excludeFolders].find((key) => !isStringList(fm[key]))
    ?? [FILTER_FM.filterProperties, FILTER_FM.excludeProperties].find((key) => !arePropertyFilters(fm[key]));
  if (unreadable) {
    warnings.push(unreadableWarning(where, `${unreadable} needs a value or a list of values`));
    return unreadableFilter(fm);
  }
  return flatFilter({
    includeTags: stringList(fm[FILTER_FM.includeTags]).map(normalizeTag).filter(Boolean),
    excludeTags: stringList(fm[FILTER_FM.excludeTags]).map(normalizeTag).filter(Boolean),
    includeFolders: stringList(fm[FILTER_FM.includeFolders]).map(normalizeFolder).filter(Boolean),
    excludeFolders: stringList(fm[FILTER_FM.excludeFolders]).map(normalizeFolder).filter(Boolean),
    propertyFilters: propertyFilters(fm[FILTER_FM.filterProperties]),
    excludedPropertyFilters: propertyFilters(fm[FILTER_FM.excludeProperties]),
  });
}

/**
 * `and`, `or` or `not` holding a list of rules and groups; a rule is `tags`, `folders` or `property`.
 * A list on its own is an `and` group. Null, with what's wrong in `problems`, when any part isn't one.
 */
export function parseFilterTree(raw: unknown, problems: string[]): FilterGroup | null {
  const node = (value: unknown): FilterNode | null => {
    const entries: [string, unknown][] = value && typeof value === 'object' && !Array.isArray(value) ? Object.entries(value as Record<string, unknown>) : [];
    if (entries.length !== 1) { problems.push('each rule or group needs exactly one key, such as tags or and'); return null; }
    const [key, inner] = entries[0]!;
    const name = key.trim().toLowerCase();
    const match = GROUP_KEYS.get(name);
    if (match) {
      if (!Array.isArray(inner)) { problems.push(`${key} needs a list`); return null; }
      const items = inner.map(node);
      return items.every((item): item is FilterNode => item !== null) ? { kind: 'group', match, items } : null;
    }
    if (['tags', 'tag', 'folders', 'folder'].includes(name) && !isStringList(inner)) {
      problems.push(`${key} needs a value or a list of values`); return null;
    }
    if (name === 'tags' || name === 'tag') return { kind: 'tags', values: stringList(inner).map(normalizeTag).filter(Boolean) };
    if (name === 'folders' || name === 'folder') return { kind: 'folders', values: stringList(inner).map(normalizeFolder).filter(Boolean) };
    if (name === 'property') {
      if (!arePropertyFilters(inner)) { problems.push(`${key} needs a property name, with values if it matches some`); return null; }
      const rules = propertyFilters(inner);
      if (rules.length === 1) return { kind: 'property', ...rules[0]! };
      problems.push('each property rule names one property'); return null;
    }
    problems.push(`“${key}” isn’t a rule or group`);
    return null;
  };
  const root = node(Array.isArray(raw) ? { and: raw } : raw);
  if (!root) return null;
  return root.kind === 'group' ? root : { kind: 'group', match: 'all', items: [root] };
}

/**
 * A property rule as the board settings write it: `key`, `key: a, b`, or a mapping when the key or
 * a value has a colon, comma or quote that the short form would change.
 */
export function propertyRuleYaml(rule: PropertyFilter): string | Record<string, string[]> {
  if (rule.key.includes(':') || /["']/.test(rule.key) || rule.values.some((v) => /[,"']/.test(v))) return { [rule.key]: rule.values };
  return rule.values.length ? `${rule.key}: ${rule.values.join(', ')}` : rule.key;
}

function nodeYaml(node: FilterNode): Record<string, unknown> {
  switch (node.kind) {
    case 'tags': return { tags: node.values };
    case 'folders': return { folders: node.values };
    case 'property': return { property: propertyRuleYaml(node) };
    case 'group': return { [MATCH_KEYS[node.match]]: node.items.map(nodeYaml) };
  }
}

/**
 * The properties that store `group`. Rules the lists can hold are saved in them, as before groups,
 * with no `filter`; others are saved as a `filter` group, with the lists set so an older release
 * matches nothing.
 */
export function filterFrontmatter(group: FilterGroup): Record<string, unknown> {
  // Over what no rules write, so that choosing new ones changes only the properties it has to.
  if (group.unreadable) return { ...filterFrontmatter(noFilter()), ...group.unreadable };
  const flat = flatRules(group);
  if (flat) {
    return {
      [FILTER_FM.filter]: undefined,
      [FILTER_FM.includeTags]: flat.includeTags,
      [FILTER_FM.excludeTags]: flat.excludeTags,
      [FILTER_FM.includeFolders]: flat.includeFolders,
      [FILTER_FM.excludeFolders]: flat.excludeFolders,
      [FILTER_FM.filterProperties]: flat.propertyFilters.map(propertyRuleYaml),
      [FILTER_FM.excludeProperties]: flat.excludedPropertyFilters.map(propertyRuleYaml),
    };
  }
  return {
    [FILTER_FM.filter]: nodeYaml(simplifyFilter(group)),
    [FILTER_FM.includeTags]: [],
    [FILTER_FM.excludeTags]: [],
    [FILTER_FM.includeFolders]: [NEEDS_GROUPS],
    [FILTER_FM.excludeFolders]: [],
    [FILTER_FM.filterProperties]: [],
    [FILTER_FM.excludeProperties]: [],
  };
}
