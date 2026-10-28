import { joinEditedLines } from './lineEndings.ts';
const LIST_ITEM_RE = /^[\s>]*(?:[-*+]|\d+[.)])\s/;
const LEAD_RE = /^[\s>]*/;

/** Columns of leading whitespace and blockquote markers, with tabs to the next multiple of 4. */
export function indentWidth(line: string): number {
  let width = 0;
  for (const ch of LEAD_RE.exec(line)![0]) width = ch === '\t' ? width + 4 - (width % 4) : width + 1;
  return width;
}

/**
 * Adds `line` as the last subtask of the task on line `parentIndex`: after the last line nested
 * under it, indented like its existing subtasks, or one `indentUnit` deeper than the parent.
 */
export function insertSubtask(content: string, parentIndex: number, line: string, indentUnit: string): string {
  return insertSubtaskAt(content, parentIndex, line, indentUnit).content;
}

/** `insertSubtask`, with the index of the added line. */
export function insertSubtaskAt(content: string, parentIndex: number, line: string, indentUnit: string): { content: string; at: number } {
  const lines = content.split(/\r?\n/);
  const parent = lines[parentIndex]!;
  const depth = indentWidth(parent);
  let last = parentIndex;
  let childLead: string | null = null;
  for (let i = parentIndex + 1; i < lines.length; i++) {
    const l = lines[i]!;
    // Blank lines can sit inside a loose list; only a nested line extends it.
    if (!l.trim()) continue;
    if (indentWidth(l) <= depth) break;
    last = i;
    if (childLead === null && LIST_ITEM_RE.test(l)) childLead = LEAD_RE.exec(l)![0];
  }
  const lead = childLead ?? LEAD_RE.exec(parent)![0] + indentUnit;
  lines.splice(last + 1, 0, lead + line.trimStart());
  return { content: joinEditedLines(content, lines), at: last + 1 };
}

/** Index of the last line nested under line `index`; blank lines count only inside the block. */
function blockEnd(lines: string[], index: number): number {
  const depth = indentWidth(lines[index]!);
  let last = index;
  for (let i = index + 1; i < lines.length; i++) {
    const l = lines[i]!;
    if (!l.trim()) continue;
    if (indentWidth(l) <= depth) break;
    last = i;
  }
  return last;
}

export type PromotedLines = { lines: string[]; at: (oldIndex: number) => number };

/**
 * Moves the subtask on line `index`, with everything nested under it, out of the list of the card on
 * line `cardIndex`: to just after the card's block, indented like the card. Null when the subtask
 * isn't nested under that card or its lines aren't indented consistently enough to outdent safely.
 */
export function promoteSubtask(lines: string[], index: number, cardIndex: number): PromotedLines | null {
  const card = lines[cardIndex], sub = lines[index];
  if (card === undefined || sub === undefined || index <= cardIndex) return null;
  const cardEnd = blockEnd(lines, cardIndex);
  if (index > cardEnd || indentWidth(sub) <= indentWidth(card)) return null;
  const subEnd = blockEnd(lines, index);
  const subLead = LEAD_RE.exec(sub)![0], cardLead = LEAD_RE.exec(card)![0];
  const moved: string[] = [];
  for (const l of lines.slice(index, subEnd + 1)) {
    if (!l.trim()) moved.push(l);
    else if (l.startsWith(subLead)) moved.push(cardLead + l.slice(subLead.length));
    else return null;
  }
  const size = subEnd - index + 1;
  const next = [...lines.slice(0, index), ...lines.slice(subEnd + 1, cardEnd + 1), ...moved, ...lines.slice(cardEnd + 1)];
  return {
    lines: next,
    at: (i) => i < index || i > cardEnd ? i : i <= subEnd ? i + (cardEnd - subEnd) : i - size,
  };
}
