import { joinEditedLines } from './lineEndings.ts';
import type { ISODate } from './dates.ts';
import { columnOf, workflowColumnOf, type BoardModel, type BoardTask, type TaskEdit } from './board.ts';
import { rowForDue } from './rows.ts';
import { planReorder } from './sort.ts';
import { addField, dedupeFields, movePlacementsToEnd, parseTaskLine, setDueDate, setPlacement } from './taskLine.ts';

export type NewTaskFields = {
  /** Due date from the row it was added in; a date typed into the text wins. */
  due?: ISODate | null;
  created?: ISODate;
  placement?: { slug: string; column: string; sort?: number };
};

/**
 * `- [ ] text ➕ created 📅 due #tt/<board>/<column>/<n>`, with fields where Tasks reads them. Text
 * over several lines (Shift+Enter, or pasted) becomes one line, since a task is one line.
 */
export function buildNewTaskLine(text: string, fields: NewTaskFields): string {
  return finishNewTaskLine(`- [ ] ${text.replace(/\s*[\r\n]+\s*/g, ' ').trim()}`, fields);
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

/** Places a composed task first in its actual cell, including a date changed in the editor. */
export function planNewTaskAtTop(line: string, model: BoardModel): { line: string; edits: Map<string, TaskEdit> } {
  const parsed = parseTaskLine(line);
  const edits = new Map<string, TaskEdit>();
  if (!parsed) return { line, edits };
  const { config } = model;
  const column = columnOf(parsed, config);
  // Completed tasks retain the Done column's completion-date ordering.
  if (column === config.doneColumn) return { line, edits };
  const row = rowForDue(model.rows, parsed.dueDate);
  const cards = model.cells[row.id]?.[column] ?? [];
  const added: BoardTask = { ...parsed, raw: line, id: '', path: '', line: -1 };
  const plan = planReorder(cards, added, 0, (task) => task.placements[config.slug]?.sort);
  for (const [task, sort] of plan) {
    const workflow = workflowColumnOf(task, config);
    if (task === added) line = setPlacement(line, config.slug, workflow, sort);
    else edits.set(task.id, { column: workflow, sort });
  }
  return { line, edits };
}

type HeadingSpec = { level?: number; text: string };

/**
 * Inserts `newLines` at the end of the section under `heading` (after its last non-blank line,
 * before the next heading of the same or a higher level). `heading` may include its `#`s; without
 * them any level matches. Matching ignores case and extra spaces. A missing heading is added at the
 * end of the note; an empty `heading` appends to the end.
 */
export function insertUnderHeading(content: string, heading: string, newLines: string[]): string {
  return insertUnderHeadingAt(content, heading, newLines).content;
}

/** `insertUnderHeading`, with the index of the line where `newLines` start. */
export function insertUnderHeadingAt(content: string, heading: string, newLines: string[]): { content: string; at: number } {
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
    return { content: joinEditedLines(content, lines), at: last + 1 };
  }

  const endsWithNewline = lines.length > 1 && lines[lines.length - 1] === '';
  while (lines.length > 0 && lines[lines.length - 1]!.trim() === '') lines.pop();
  const tail = spec ? [`${'#'.repeat(spec.level ?? 2)} ${heading.replace(/^#+\s*/, '').trim()}`, ...newLines] : newLines;
  const out = lines.length > 0 ? [...lines, '', ...tail] : tail;
  return {
    content: joinEditedLines(content, endsWithNewline || lines.length === 0 ? [...out, ''] : out),
    at: out.length - newLines.length,
  };
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
