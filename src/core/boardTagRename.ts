import { isTaskLine, slugify } from './taskLine.ts';

export type TagRewrite = { staged: string; after: string; count: number };
const segment = '[\\p{L}\\p{N}_-]+';
const tagPattern = () => new RegExp(`(^|\\s)#tt/(${segment})/(${segment}(?:/${segment})*)(?=[^\\p{L}\\p{N}_/-]|$)`, 'giu');

/** Only complete task tags owned by this namespace; preserve every other byte and line ending. */
export function rewriteBoardTaskTags(content: string, oldSlug: string, newSlug: string): TagRewrite {
  let fence = '';
  let count = 0;
  let inFrontmatter = false;
  const staged: string[] = [], after: string[] = [];
  for (const [index, part] of (content.match(/[^\n]*\n|[^\n]+$/g) ?? []).entries()) {
    const line = part.replace(/\r?\n$/, '');
    if (index === 0 && line.replace(/^\uFEFF/, '') === '---') inFrontmatter = true;
    else if (inFrontmatter && /^(---|\.\.\.)$/.test(line)) { inFrontmatter = false; staged.push(part); after.push(part); continue; }
    const marker = /^\s*(?:>\s*)*(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker && !inFrontmatter) {
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length && line.trim().endsWith(marker)) fence = '';
      staged.push(part); after.push(part); continue;
    }
    if (inFrontmatter || fence || !isTaskLine(line)) { staged.push(part); after.push(part); continue; }
    const transform = (duplicate: boolean) => outsideCode(part, (text) => text.replace(tagPattern(), (match, lead: string, slug: string, tail: string) => {
      if (slug.toLowerCase() !== oldSlug) return match;
      // Only placement and label tags, not unrelated descendants of the board prefix.
      if (!/^(?:label\/[a-z0-9_-]+|[\p{L}\p{N}_-]+(?:\/\d+)?)$/iu.test(tail)) return match;
      if (!duplicate) count++;
      const next = `#tt/${newSlug}/${tail}`;
      return duplicate ? `${match} ${next}` : `${lead}${next}`;
    }));
    staged.push(transform(true)); after.push(transform(false));
  }
  return { staged: staged.join(''), after: after.join(''), count };
}

/** The prefix includes a slash so similarly named boards cannot be changed. */
export function renameTagFilter(value: unknown, oldSlug: string, newSlug: string): unknown {
  if (Array.isArray(value)) return value.map((item: unknown) => renameTagFilter(item, oldSlug, newSlug));
  if (typeof value !== 'string') return value;
  return value.split(',').map((item) => item.replace(/^(\s*#?)tt\/([\p{L}\p{N}_-]+)(?=\/|\s*$)/iu,
    (match, lead: string, slug: string) => slug.toLowerCase() === oldSlug ? `${lead}tt/${newSlug}` : match)).join(',');
}

export function migrationSlug(name: string): string {
  const slug = slugify(name);
  if (!slug) throw new Error('Use a board name containing letters or numbers to rename its tags.');
  return slug;
}

/** Conservative collision detection includes references outside task lines. */
export function mentionsNamespace(content: string, slug: string): boolean {
  return [...content.matchAll(/(?:^|[^\p{L}\p{N}_/-])(?:#)?tt\/([\p{L}\p{N}_-]+)(?=\/|[^\p{L}\p{N}_-]|$)/giu)]
    .some((match) => match[1]!.toLowerCase() === slug);
}

/** Task descriptions can contain examples in code spans; those are not tags to migrate. */
function outsideCode(line: string, transform: (text: string) => string): string {
  let at = 0, result = '';
  for (const match of line.matchAll(/(`+)[^\r\n]*?\1(?!`)/g)) {
    result += transform(line.slice(at, match.index)) + match[0];
    at = match.index + match[0].length;
  }
  return result + transform(line.slice(at));
}
