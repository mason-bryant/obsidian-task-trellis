import type { BoardConfig, PropertyFilter } from './boardConfig.ts';

export type Frontmatter = Record<string, unknown> | undefined;

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
  config: BoardConfig,
  fm: Frontmatter,
  noteTags: string[] = [],
): boolean {
  const dimensions = [
    { allow: config.includeFolders, deny: config.excludeFolders, matches: (folder: string) => inFolder(task.path, folder) },
    { allow: config.includeTags, deny: config.excludeTags, matches: (tag: string) => hasTag(task.tags, tag) || hasTag(noteTags, tag) },
  ];
  return dimensions.every(({ allow, deny, matches }) =>
    !deny.some(matches) && (allow.length === 0 || allow.some(matches)),
  ) && noteMatchesFilters(fm, config.propertyFilters, config.excludedPropertyFilters);
}

export function missingRequiredPropertyKeys(config: BoardConfig, notes: Frontmatter[]): string[] {
  const missing = new Set<string>();
  for (const { key } of config.propertyFilters) {
    if (!notes.some((note) => owns(note, key))) missing.add(key);
  }
  return Array.from(missing);
}
