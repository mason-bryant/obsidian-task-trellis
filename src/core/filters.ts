import type { BoardConfig, PropertyFilter } from './boardConfig.ts';

export type Frontmatter = Record<string, unknown> | undefined;

export function inFolder(path: string, folder: string): boolean {
  return folder === '' || path === folder || path.startsWith(folder + '/');
}

/** Flattens a front matter value into comparable strings (list items, scalars). */
export function propertyValueStrings(raw: unknown): string[] {
  if (raw === undefined || raw === null) return [];
  const items: unknown[] = Array.isArray(raw) ? raw : [raw];
  return items
    .filter((v) => v !== null && v !== undefined && typeof v !== 'object')
    .map((v) => String(v).trim())
    .filter((v) => v !== '');
}

/** A present key counts as existing even when its value is null, empty text, or an empty list. */
export function matchesProperty(fm: Frontmatter, filter: PropertyFilter): boolean {
  if (!fm || !(filter.key in fm)) return false;
  if (filter.values.length === 0) return true;
  const wanted = new Set(filter.values.map((v) => v.toLowerCase()));
  return propertyValueStrings(fm[filter.key]).some((v) => wanted.has(v.toLowerCase()));
}

/** Every inclusion must pass; any matching exclusion rejects the note. */
export function noteMatchesFilters(fm: Frontmatter, filters: PropertyFilter[], excluded: PropertyFilter[] = []): boolean {
  return filters.every((f) => matchesProperty(fm, f)) && !excluded.some((f) => matchesProperty(fm, f));
}

/** `house` matches `#house` and nested tags such as `#house/kitchen`. */
export function hasTag(tags: string[], tag: string): boolean {
  return tags.some((t) => t === tag || t.startsWith(tag + '/'));
}

export function taskMatchesBoard(
  task: { path: string; tags: string[] },
  config: BoardConfig,
  fm: Frontmatter,
  noteTags: string[] = [],
): boolean {
  if (config.includeFolders.length > 0 && !config.includeFolders.some((f) => inFolder(task.path, f))) return false;
  if (config.excludeFolders.some((f) => inFolder(task.path, f))) return false;
  const tags = [...task.tags, ...noteTags];
  if (config.includeTags.length > 0 && !config.includeTags.some((t) => hasTag(tags, t))) return false;
  if (config.excludeTags.some((t) => hasTag(tags, t))) return false;
  return noteMatchesFilters(fm, config.propertyFilters, config.excludedPropertyFilters);
}

/** Exclusion-only keys cannot explain an empty board: missing keys never match an exclusion. */
export function missingRequiredPropertyKeys(config: BoardConfig, notes: Frontmatter[]): string[] {
  return [...new Set(config.propertyFilters.map((filter) => filter.key))]
    .filter((key) => !notes.some((fm) => fm && key in fm));
}
