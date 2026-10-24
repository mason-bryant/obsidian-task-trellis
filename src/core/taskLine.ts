import type { ISODate } from './dates.ts';

/** Every Task Trellis tag starts with `#tt/`. */
export const TAG_PREFIX = 'tt';

export type Priority = 'highest' | 'high' | 'medium' | 'low' | 'lowest';

export const PRIORITY_EMOJI: Record<Priority, string> = {
  highest: '🔺',
  high: '⏫',
  medium: '🔼',
  low: '🔽',
  lowest: '⏬',
};

const EMOJI_PRIORITY: Record<string, Priority> = {
  '🔺': 'highest',
  '⏫': 'high',
  '🔼': 'medium',
  '🔽': 'low',
  '⏬': 'lowest',
};

/** Tasks ranks "no priority" between medium and low. */
export function priorityRank(priority: Priority | undefined): number {
  switch (priority) {
    case 'highest':
      return 0;
    case 'high':
      return 1;
    case 'medium':
      return 2;
    case undefined:
      return 3;
    case 'low':
      return 4;
    case 'lowest':
      return 5;
  }
}

/** Where a task sits on one board: `#tt/<board>/<column>/<sort>`. */
export type Placement = { column: string; sort?: number };

export type ParsedTask = {
  status: string;
  /** Done (`x`/`X`) or cancelled (`-`). */
  closed: boolean;
  /** Description without Tasks fields or placement tags, for display. */
  text: string;
  dueDate?: ISODate;
  /** `➕` date. */
  createdDate?: ISODate;
  /** `✅` date, or `❌` for cancelled tasks. */
  closedDate?: ISODate;
  priority?: Priority;
  /** Lower-cased tags without the `#`, placement tags excluded. */
  tags: string[];
  /** Keyed by lower-cased board slug. */
  placements: Record<string, Placement>;
};

const TASK_LINE_RE = /^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[)([^\]])(\]\s+)(.*)$/;
const SEGMENT = '[\\p{L}\\p{N}_-]+';
const placementRe = () =>
  new RegExp(`(^|\\s)#${TAG_PREFIX}\\/(${SEGMENT})\\/(${SEGMENT})(?:\\/(\\d+))?(?=\\s|$)`, 'gu');
const TAG_RE = /(?:^|\s)#([\p{L}\p{N}_/-]+)/gu;
// Trailing run of placement tags and a block id; new fields go in front of it.
const TAIL_RE = new RegExp(`(?:\\s+(?:#${TAG_PREFIX}\\/[\\p{L}\\p{N}_/-]+|\\^[A-Za-z0-9-]+))+\\s*$`, 'u');
const BLOCK_ID_RE = /\s\^[A-Za-z0-9-]+$/;

// A field can appear more than once: 4D Eisenhower writes 📅 at the start of the line, and Tasks,
// which only reads fields at the end, then appends its own. The last one is the one Tasks uses.
const DUE_RE = /📅️?\s*(\d{4}-\d{2}-\d{2})/gu;
const DONE_RE = /✅️?\s*(\d{4}-\d{2}-\d{2})/gu;
const CANCELLED_RE = /❌️?\s*(\d{4}-\d{2}-\d{2})/gu;
const CREATED_RE = /➕️?\s*(\d{4}-\d{2}-\d{2})/gu;
const PRIORITY_RE = /(🔺|⏫|🔼|🔽|⏬)/gu;
const DATE_RE = /\d{4}-\d{2}-\d{2}/;
// One token per single-valued field, with the space before it, for keeping only the last.
const DUE_TOKEN_RE = /\s?📅️?\s*\d{4}-\d{2}-\d{2}/gu;
const DONE_TOKEN_RE = /\s?✅️?\s*\d{4}-\d{2}-\d{2}/gu;
const SINGLE_FIELD_TOKEN_RES = [
  DUE_TOKEN_RE,
  DONE_TOKEN_RE,
  /\s?⏳️?\s*\d{4}-\d{2}-\d{2}/gu,
  /\s?🛫️?\s*\d{4}-\d{2}-\d{2}/gu,
  /\s?➕️?\s*\d{4}-\d{2}-\d{2}/gu,
  /\s?❌️?\s*\d{4}-\d{2}-\d{2}/gu,
  /\s?(?:🔺|⏫|🔼|🔽|⏬)️?/gu,
];

// Tasks fields stripped from the display text.
const FIELD_RES = [
  /(?:📅|⏳|🛫|✅|➕|❌)️?\s*\d{4}-\d{2}-\d{2}/gu,
  /(?:🔺|⏫|🔼|🔽|⏬)️?/gu,
  /🔁️?[^📅⏳🛫✅➕❌🆔⛔🏁🔺⏫🔼🔽⏬#^]*/gu,
  /🆔️?\s*[A-Za-z0-9_-]*/gu,
  /⛔️?\s*[A-Za-z0-9_-]+(?:\s*,\s*[A-Za-z0-9_-]+)*/gu,
  /🏁️?\s*[A-Za-z]+/gu,
  // 4D Eisenhower's manual-sort tag.
  /(?:^|\s)#sort\/\d+(?=\s|$)/gu,
  /\s\^[A-Za-z0-9-]+\s*$/gu,
];

export function isTaskLine(line: string): boolean {
  return TASK_LINE_RE.test(line);
}

export function parseTaskLine(line: string): ParsedTask | null {
  const m = TASK_LINE_RE.exec(line);
  if (!m) return null;
  const status = m[2] ?? ' ';
  const body = m[4] ?? '';

  const placements: Record<string, Placement> = {};
  for (const p of body.matchAll(placementRe())) {
    const slug = (p[2] ?? '').toLowerCase();
    // First tag wins if a board somehow has two.
    if (slug in placements) continue;
    placements[slug] = {
      column: (p[3] ?? '').toLowerCase(),
      ...(p[4] !== undefined ? { sort: Number(p[4]) } : {}),
    };
  }
  const withoutPlacements = body.replace(placementRe(), '');

  const tags: string[] = [];
  for (const t of withoutPlacements.matchAll(TAG_RE)) {
    const tag = (t[1] ?? '').replace(/\/+$/, '').toLowerCase();
    // Obsidian ignores purely numeric tags.
    if (tag && !/^\d+$/.test(tag)) tags.push(tag);
  }

  let text = withoutPlacements.replace(/<!-- task-trellis-request:[A-Za-z0-9_-]{1,128} -->/g, '');
  for (const re of FIELD_RES) text = text.replace(re, ' ');
  text = text.replace(/\s+/g, ' ').trim();

  const closed = status === 'x' || status === 'X' || status === '-';
  const priorityEmoji = lastCapture(body, PRIORITY_RE);
  const dueDate = lastCapture(body, DUE_RE);
  const closedDate = lastCapture(body, DONE_RE) ?? lastCapture(body, CANCELLED_RE);
  const createdDate = lastCapture(body, CREATED_RE);

  return {
    status,
    closed,
    text,
    ...(dueDate ? { dueDate } : {}),
    ...(createdDate ? { createdDate } : {}),
    ...(closedDate ? { closedDate } : {}),
    ...(priorityEmoji ? { priority: EMOJI_PRIORITY[priorityEmoji] } : {}),
    tags,
    placements,
  };
}

/**
 * Sets the `📅` date where the last one is (dropping stale earlier ones), adds one in front of the
 * trailing tags, or removes every one (`null`).
 */
export function setDueDate(line: string, date: ISODate | null): string {
  const tokens = [...line.matchAll(DUE_TOKEN_RE)];
  const last = tokens[tokens.length - 1];
  if (!last) return date === null ? line : insertBeforeTail(line, `📅 ${date}`);
  if (date === null) return line.replace(DUE_TOKEN_RE, '');
  const at = last.index ?? 0;
  const replaced = line.slice(0, at) + last[0].replace(DATE_RE, date) + line.slice(at + last[0].length);
  return keepLast(replaced, DUE_TOKEN_RE);
}

/** Drops earlier copies of single-valued fields (dates, priority), keeping the last, which Tasks reads. */
export function dedupeFields(line: string): string {
  return SINGLE_FIELD_TOKEN_RES.reduce(keepLast, line);
}

/** Sets this board's placement tag, at the end of the line (before a block id). */
export function setPlacement(line: string, slug: string, column: string, sort?: number): string {
  const tag = `#${TAG_PREFIX}/${slug}/${column}${sort !== undefined ? `/${sort}` : ''}`;
  return appendAtEnd(removePlacement(line, slug), [tag]);
}

export function removePlacement(line: string, slug: string): string {
  const wanted = slug.toLowerCase();
  return line.replace(placementRe(), (match, _lead, s: string) => (s.toLowerCase() === wanted ? '' : match));
}

/** Moves every placement tag to the end of the line, keeping their order (Tasks' editor moves them into the description). */
export function movePlacementsToEnd(line: string): string {
  const tags = [...line.matchAll(placementRe())].map((m) => m[0].trim());
  if (tags.length === 0) return line;
  return appendAtEnd(line.replace(placementRe(), ''), tags);
}

/** Completes or reopens a task without the Tasks plugin: flips the checkbox and adds or removes `✅`. */
export function setClosedFallback(line: string, closed: boolean, today: ISODate): string {
  const m = TASK_LINE_RE.exec(line);
  if (!m) return line;
  const next = `${m[1]}${closed ? 'x' : ' '}${m[3]}${m[4]}`;
  if (closed) return lastCapture(next, DONE_RE) ? next : insertBeforeTail(next, `✅ ${today}`);
  return next.replace(DONE_TOKEN_RE, '');
}

/** Lower-case, tag-safe form of a board or column name ("In Progress" → "in-progress"). */
export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}_-]/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function lastCapture(text: string, re: RegExp): string | undefined {
  let value: string | undefined;
  for (const m of text.matchAll(re)) value = m[1];
  return value;
}

function keepLast(line: string, re: RegExp): string {
  const matches = [...line.matchAll(re)];
  if (matches.length < 2) return line;
  let out = '';
  let from = 0;
  for (const m of matches.slice(0, -1)) {
    out += line.slice(from, m.index);
    from = (m.index ?? 0) + m[0].length;
  }
  return out + line.slice(from);
}

/** Adds a field such as `➕ 2026-10-22` in front of the trailing placement tags and block id. */
export function addField(line: string, token: string): string {
  return insertBeforeTail(line, token);
}

function insertBeforeTail(line: string, token: string): string {
  const tail = TAIL_RE.exec(line);
  const head = tail ? line.slice(0, tail.index) : line.replace(/\s+$/, '');
  return `${head} ${token}${tail ? tail[0].replace(/\s+$/, '') : ''}`;
}

function appendAtEnd(line: string, tags: string[]): string {
  const base = line.replace(/\s+$/, '');
  const block = BLOCK_ID_RE.exec(base);
  const insert = tags.map((t) => ` ${t}`).join('');
  return block ? `${base.slice(0, block.index)}${insert}${base.slice(block.index)}` : `${base}${insert}`;
}
