import type { BoardConfig, PropertyFilter } from './boardConfig.ts';

export type Frontmatter = Record<string, unknown> | undefined;

/**
 * One rule: any of these tags, on the task or its note; the note in any of these folders; or one
 * note property, which exists when it has no values and otherwise matches any of them.
 */
export type FilterRule =
  | { kind: 'tags'; values: string[] }
  | { kind: 'folders'; values: string[] }
  | ({ kind: 'property' } & PropertyFilter);
/** `all` needs every item to match, `any` at least one, and `none` none of them. */
export type FilterMatch = 'all' | 'any' | 'none';
export type FilterGroup = { kind: 'group'; match: FilterMatch; items: FilterNode[] };
export type FilterNode = FilterRule | FilterGroup;

/** The rules a board and each of its quick filters have: one group, which can hold groups of its own. */
export type FilterSet = { filter: FilterGroup };

/** No rules: every task matches. */
export function noFilter(): FilterGroup {
  return { kind: 'group', match: 'all', items: [] };
}

/** Compare complete path segments so a folder/tag does not match a sibling prefix. */
function within(value: string, scope: string): boolean {
  const segments = scope.split('/');
  const candidate = value.split('/');
  return segments.length <= candidate.length && segments.every((segment, i) => segment === candidate[i]);
}

export function inFolder(path: string, folder: string): boolean {
  return folder.length === 0 || within(path, folder);
}

/** Only scalar properties are searchable; nested mappings and lists are not coerced. */
export function propertyValueStrings(raw: unknown): string[] {
  const result: string[] = [];
  for (const value of Array.isArray(raw) ? raw : [raw]) {
    if (value == null || typeof value === 'object') continue;
    const text = String(value).trim();
    if (text.length > 0) result.push(text);
  }
  return result;
}

function owns(fm: Frontmatter, key: string): boolean {
  return fm != null && Object.prototype.hasOwnProperty.call(fm, key);
}

export function matchesProperty(fm: Frontmatter, filter: PropertyFilter): boolean {
  if (!owns(fm, filter.key)) return false;
  if (!filter.values.length) return true;
  const actual = propertyValueStrings(fm![filter.key]).map((value) => value.toLowerCase());
  return filter.values.some((value) => actual.includes(value.toLowerCase()));
}

export function noteMatchesFilters(fm: Frontmatter, filters: PropertyFilter[], excluded: PropertyFilter[] = []): boolean {
  for (const rule of excluded) if (matchesProperty(fm, rule)) return false;
  for (const rule of filters) if (!matchesProperty(fm, rule)) return false;
  return true;
}

export function hasTag(tags: string[], tag: string): boolean {
  return tags.some((candidate) => within(candidate, tag));
}

export function taskMatchesBoard(
  task: { path: string; tags: string[] },
  set: FilterSet,
  fm: Frontmatter,
  noteTags: string[] = [],
): boolean {
  const matches = (node: FilterNode): boolean => {
    switch (node.kind) {
      case 'tags': return node.values.some((tag) => hasTag(task.tags, tag) || hasTag(noteTags, tag));
      case 'folders': return node.values.some((folder) => inFolder(task.path, folder));
      case 'property': return matchesProperty(fm, node);
      case 'group':
        if (node.match === 'all') return node.items.every(matches);
        if (node.match === 'any') return node.items.some(matches);
        return !node.items.some(matches);
    }
  };
  return matches(set.filter);
}

/** Every rule in the group, at any depth. */
export function filterRules(group: FilterGroup): FilterRule[] {
  return group.items.flatMap((item) => item.kind === 'group' ? filterRules(item) : [item]);
}

/**
 * The property keys every matching note must have: properties required by the group's own rules,
 * or by `all` groups inside it, and not undone by a `none` around them.
 */
export function requiredPropertyKeys(group: FilterGroup): string[] {
  if (group.match !== 'all') return [];
  return [...new Set(group.items.flatMap((item) =>
    item.kind === 'property' ? [item.key] : item.kind === 'group' ? requiredPropertyKeys(item) : []))];
}

export function missingRequiredPropertyKeys(config: BoardConfig, notes: Frontmatter[]): string[] {
  return requiredPropertyKeys(config.filter).filter((key) => !notes.some((note) => owns(note, key)));
}

/** The rules the board settings wrote before groups, as one list each. */
export type FlatFilter = {
  includeTags: string[];
  excludeTags: string[];
  includeFolders: string[];
  excludeFolders: string[];
  propertyFilters: PropertyFilter[];
  excludedPropertyFilters: PropertyFilter[];
};

/** Every inclusion must match, and none of the exclusions may: all of them, then none of the others. */
export function flatFilter(flat: FlatFilter): FilterGroup {
  const rules = (tags: string[], folders: string[], properties: PropertyFilter[]): FilterNode[] => [
    ...(tags.length ? [{ kind: 'tags', values: tags } as const] : []),
    ...(folders.length ? [{ kind: 'folders', values: folders } as const] : []),
    ...properties.map((p) => ({ kind: 'property', ...p } as const)),
  ];
  const excluded = rules(flat.excludeTags, flat.excludeFolders, flat.excludedPropertyFilters);
  return { kind: 'group', match: 'all', items: [
    ...rules(flat.includeTags, flat.includeFolders, flat.propertyFilters),
    ...(excluded.length ? [{ kind: 'group', match: 'none', items: excluded } as const] : []),
  ] };
}

/**
 * The same rules without what adds nothing: empty rules and groups, a group of one rule (other than
 * `none`), and a group inside another that matches the same way.
 */
export function simplifyFilter(group: FilterGroup): FilterGroup {
  const simplify = (node: FilterNode): FilterNode | null => {
    if (node.kind === 'property') return node.key ? node : null;
    if (node.kind !== 'group') return node.values.length ? node : null;
    let items = node.items.map(simplify).filter((item): item is FilterNode => item !== null);
    if (node.match !== 'none') items = items.flatMap((item) => item.kind === 'group' && item.match === node.match ? item.items : [item]);
    if (!items.length) return null;
    if (items.length === 1 && node.match !== 'none') return items[0]!;
    return { kind: 'group', match: node.match, items };
  };
  const root = simplify(group);
  if (!root) return noFilter();
  return root.kind === 'group' ? root : { kind: 'group', match: 'all', items: [root] };
}

/**
 * The flat lists that say the same as `group`, or null when they can't: when it needs an `any`
 * group, a `none` inside another group, or two tag or folder rules that must both match.
 */
export function flatRules(group: FilterGroup): FlatFilter | null {
  const root = simplifyFilter(group);
  const flat: FlatFilter = { includeTags: [], excludeTags: [], includeFolders: [], excludeFolders: [], propertyFilters: [], excludedPropertyFilters: [] };
  const top = root.match === 'all' ? root.items : root.match === 'none' ? [root] : null;
  if (!top) return null;
  for (const item of top) {
    if (item.kind === 'group') {
      if (item.match !== 'none') return null;
      // Exclusions add up: none of a, and none of b, is none of a or b.
      for (const rule of item.items) {
        if (rule.kind === 'group') return null;
        if (rule.kind === 'tags') flat.excludeTags.push(...rule.values);
        else if (rule.kind === 'folders') flat.excludeFolders.push(...rule.values);
        else flat.excludedPropertyFilters.push({ key: rule.key, values: rule.values });
      }
    } else if (item.kind === 'tags') {
      if (flat.includeTags.length) return null;
      flat.includeTags.push(...item.values);
    } else if (item.kind === 'folders') {
      if (flat.includeFolders.length) return null;
      flat.includeFolders.push(...item.values);
    } else flat.propertyFilters.push({ key: item.key, values: item.values });
  }
  return flat;
}
