import type { ISODate } from './dates.ts';
import { SORT_STEP } from './sort.ts';
import { addField, dedupeFields, movePlacementsToEnd, parseTaskLine, setDueDate, setPlacement } from './taskLine.ts';

export type NewTaskFields = {
  /** Due date from the row it was added in; a date typed into the text wins. */
  due?: ISODate | null;
  created?: ISODate;
  placement?: { slug: string; column: string; sort?: number };
};

/** `- [ ] text ➕ created 📅 due #tt/<board>/<column>/<n>`, with fields where Tasks reads them. */
export function buildNewTaskLine(text: string, fields: NewTaskFields): string {
  return finishNewTaskLine(`- [ ] ${text.trim()}`, fields);
}

/** Fills in what a typed or Tasks-modal line is missing, without overriding what is there. */
export function finishNewTaskLine(line: string, fields: NewTaskFields): string {
  const parsed = parseTaskLine(line);
  let out = line;
  if (fields.created && !parsed?.createdDate) out = addField(out, `➕ ${fields.created}`);
  if (fields.due && !parsed?.dueDate) out = setDueDate(out, fields.due);
  if (fields.placement) out = setPlacement(out, fields.placement.slug, fields.placement.column, fields.placement.sort);
  return movePlacementsToEnd(dedupeFields(out));
}

/**
 * Sort number for a card added at the bottom of a cell: after the last card when it is numbered,
 * none when the cell ends with unnumbered cards (it then sorts among them by due date).
 */
export function appendSort(lastSort: number | undefined, cellIsEmpty: boolean): number | undefined {
  if (cellIsEmpty) return SORT_STEP;
  return lastSort === undefined ? undefined : lastSort + SORT_STEP;
}

type HeadingSpec = { level?: number; text: string };

/**
 * Inserts `newLines` at the end of the section under `heading` (after its last non-blank line,
 * before the next heading of the same or a higher level). `heading` may include its `#`s; without
 * them any level matches. Matching ignores case and extra spaces. A missing heading is added at the
 * end of the note; an empty `heading` appends to the end.
 */
export function insertUnderHeading(content: string, heading: string, newLines: string[]): string {
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const lines = content.split(/\r?\n/);
  const spec = parseHeadingSpec(heading);
  const all = headings(lines);
  const at = spec ? all.findIndex((h) => (spec.level === undefined || h.level === spec.level) && h.text === spec.text) : -1;
  const found = at >= 0 ? all[at]! : null;

  if (found) {
    const next = all.slice(at + 1).find((h) => h.level <= found.level);
    let last = (next ? next.index : lines.length) - 1;
    while (last > found.index && lines[last]!.trim() === '') last--;
    lines.splice(last + 1, 0, ...newLines);
    return lines.join(eol);
  }

  const endsWithNewline = lines.length > 1 && lines[lines.length - 1] === '';
  while (lines.length > 0 && lines[lines.length - 1]!.trim() === '') lines.pop();
  const tail = spec ? [`${'#'.repeat(spec.level ?? 2)} ${heading.replace(/^#+\s*/, '').trim()}`, ...newLines] : newLines;
  const out = lines.length > 0 ? [...lines, '', ...tail] : tail;
  return out.join(eol) + (endsWithNewline || lines.length === 0 ? eol : '');
}

function parseHeadingSpec(heading: string): HeadingSpec | null {
  const trimmed = heading.trim();
  if (!trimmed) return null;
  const m = /^(#{1,6})\s+(.*)$/.exec(trimmed);
  return m ? { level: m[1]!.length, text: normalize(m[2]!) } : { text: normalize(trimmed) };
}

/** Headings outside front matter and code fences. */
function headings(lines: string[]): { index: number; level: number; text: string }[] {
  const out: { index: number; level: number; text: string }[] = [];
  let inFence = false;
  for (let i = frontmatterEnd(lines); i < lines.length; i++) {
    const line = lines[i]!;
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (inFence) continue;
    const m = /^(#{1,6})\s+(.*?)\s*$/.exec(line);
    if (m) out.push({ index: i, level: m[1]!.length, text: normalize(m[2]!) });
  }
  return out;
}

function frontmatterEnd(lines: string[]): number {
  if (lines[0] !== '---') return 0;
  const close = lines.indexOf('---', 1);
  return close < 0 ? 0 : close + 1;
}

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}
