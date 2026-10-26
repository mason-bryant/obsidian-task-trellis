import type { PropertyFilter } from './boardConfig.ts';

/** List values arrive as YAML lists, or as one comma-separated string from the Properties editor. */
export function stringList(raw: unknown): string[] {
  if (raw === undefined || raw === null) return [];
  if (typeof raw === 'object' && !Array.isArray(raw)) return [];
  const items = Array.isArray(raw) ? raw : scalarText(raw).split(',');
  return items
    .filter((v) => v !== null && v !== undefined && typeof v !== 'object')
    .map((v) => String(v).trim())
    .filter((v) => v !== '');
}

/** YAML objects are not valid scalar settings; avoid interpreting them as "[object Object]". */
export function scalarText(raw: unknown): string {
  return typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean' ? String(raw) : '<non-scalar value>';
}

/** Accepts `["context: house, garden"]` or a YAML mapping `{ context: [house, garden] }`. */
export function propertyFilters(raw: unknown): PropertyFilter[] {
  const filters: PropertyFilter[] = [];
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [key, values] of Object.entries(raw as Record<string, unknown>)) {
      if (key.trim()) filters.push({ key: key.trim(), values: stringList(values) });
    }
    return filters;
  }
  const items = Array.isArray(raw) ? raw : raw === undefined || raw === null ? [] : [raw];
  for (const item of items) {
    // Unquoted `- context: house` in YAML arrives as a one-key mapping.
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      filters.push(...propertyFilters(item));
      continue;
    }
    if (typeof item !== 'string') continue;
    const text = unquote(item);
    const colon = text.indexOf(':');
    const key = unquote(colon >= 0 ? text.slice(0, colon) : text);
    const values = colon >= 0 ? stringList(text.slice(colon + 1)).map(unquote).filter(Boolean) : [];
    if (key) filters.push({ key, values });
  }
  return filters;
}

/** The Properties editor stores typed quotes literally, so `"context: house"` keeps its quotes. */
export function unquote(text: string): string {
  return text.trim().replace(/^(["'])(.*)\1$/, '$2').trim();
}

export function normalizeTag(tag: string): string {
  return tag.replace(/^#/, '').replace(/\/+$/, '').toLowerCase();
}

export function normalizeFolder(folder: string): string {
  return folder.replace(/^\/+|\/+$/g, '');
}
