import { getAllTags, type CachedMetadata } from 'obsidian';

/** Page-level tags apply to all tasks; tags on checkbox lines belong only to those tasks. */
export function noteTags(cache: CachedMetadata | null | undefined): string[] {
  if (!cache) return [];
  const taskLines = new Set(cache.listItems?.filter((item) => item.task !== undefined).map((item) => item.position.start.line));
  const pageCache = { ...cache, tags: cache.tags?.filter((tag) => !taskLines.has(tag.position.start.line)) };
  // Use Obsidian's parsed tags so code blocks and escaped hashes never become page tags.
  return [...new Set((getAllTags(pageCache) ?? []).map((tag) => tag.replace(/^#/, '').toLowerCase())
    .filter((tag) => tag && !tag.startsWith('tt/')))].sort();
}
