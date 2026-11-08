import { inFolder } from './filters.ts';

/** A folder outside the boards folder that holds board notes, and how many. */
export type FoundBoards = { folder: string; count: number };

/** A board note has the slug and columns Task Trellis writes when it makes one. */
export function looksLikeBoard(frontmatter: unknown): boolean {
  if (!frontmatter || typeof frontmatter !== 'object' || Array.isArray(frontmatter)) return false;
  const fm = frontmatter as Record<string, unknown>;
  return typeof fm.slug === 'string' && fm.slug.trim() !== '' && Array.isArray(fm.columns) && fm.columns.length > 0;
}

/**
 * Folders, other than `boardsFolder`, whose notes look like boards: where the boards are when the
 * boards folder setting was lost, as uninstalling the plugin loses it. The most boards come first.
 * A note at the top of the vault doesn't count, since the vault itself can't be the boards folder.
 */
export function boardFoldersElsewhere(notes: Array<{ path: string; frontmatter: unknown }>, boardsFolder: string): FoundBoards[] {
  const counts = new Map<string, number>();
  for (const { path, frontmatter } of notes) {
    const slash = path.lastIndexOf('/');
    if (slash <= 0 || !path.endsWith('.md') || inFolder(path, boardsFolder) || !looksLikeBoard(frontmatter)) continue;
    const folder = path.slice(0, slash);
    counts.set(folder, (counts.get(folder) ?? 0) + 1);
  }
  return [...counts].map(([folder, count]) => ({ folder, count }))
    .sort((a, b) => b.count - a.count || a.folder.localeCompare(b.folder));
}
