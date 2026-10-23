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

/** Every filter must pass (AND); within a filter any value matches (OR, case-insensitive). */
export function noteMatchesFilters(fm: Frontmatter, filters: PropertyFilter[]): boolean {
  return filters.every((f) => {
    if (!fm || !(f.key in fm)) return false;
    if (f.values.length === 0) return true;
    const wanted = new Set(f.values.map((v) => v.toLowerCase()));
    return propertyValueStrings(fm[f.key]).some((v) => wanted.has(v.toLowerCase()));
  });
}

/** `house` matches `#house` and nested tags such as `#house/kitchen`. */
export function hasTag(tags: string[], tag: string): boolean {
  return tags.some((t) => t === tag || t.startsWith(tag + '/'));
}

export function taskMatchesBoard(
  task: { path: string; tags: string[] },
  config: BoardConfig,
  fm: Frontmatter,
): boolean {
  if (config.includeFolders.length > 0 && !config.includeFolders.some((f) => inFolder(task.path, f))) return false;
  if (config.excludeFolders.some((f) => inFolder(task.path, f))) return false;
  if (config.includeTags.length > 0 && !config.includeTags.some((t) => hasTag(task.tags, t))) return false;
  if (config.excludeTags.some((t) => hasTag(task.tags, t))) return false;
  return noteMatchesFilters(fm, config.propertyFilters);
}
