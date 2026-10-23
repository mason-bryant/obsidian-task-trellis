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
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
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
  return lines.join(eol);
}
