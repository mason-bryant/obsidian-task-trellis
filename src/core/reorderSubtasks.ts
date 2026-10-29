import { indentWidth } from './subtasks.ts';
import { parseTaskLine } from './taskLine.ts';
import type { BoardTask } from './board.ts';

/** Snapshots from the displayed list; beforeId is null to move to its end. */
export type SubtaskReorder = { parent: BoardTask; siblings: BoardTask[]; taskId: string; beforeId: string | null };

/** Move an intact Markdown block between direct sibling tasks. Refuse uncertain list structure. */
export function reorderSubtaskBlocks(content: string, parent: number, siblings: number[], source: number, before: number | null): { content: string; line: number } {
  const lines = content.split(/\r?\n/), endings = content.match(/\r?\n/g) ?? [];
  const invalid = () => { throw new Error('The subtask list changed or has an ambiguous structure. Refresh the board and try again.'); };
  if (!Number.isInteger(parent) || !lines[parent] || !parseTaskLine(lines[parent]) || siblings.length < 2 ||
    !siblings.includes(source) || (before !== null && !siblings.includes(before))) return invalid();
  const first = siblings[0]!;
  if (!lines[first] || first <= parent) return invalid();
  const depth = indentWidth(lines[first]), parentDepth = indentWidth(lines[parent]);
  if (depth <= parentDepth) return invalid();
  const direct: number[] = [];
  const eof = lines.length - (lines.at(-1) === '' ? 1 : 0);
  let end = parent + 1;
  for (; end < eof; end++) {
    const raw = lines[end]!;
    if (!raw.trim()) continue;
    const indent = indentWidth(raw);
    if (indent <= parentDepth) break;
    // Mixed list items/lazy continuations must not be accidentally attached to another task.
    if (indent < depth) return invalid();
    if (indent === depth) {
      if (!parseTaskLine(raw)) return invalid();
      direct.push(end);
    }
  }
  if (direct.length !== siblings.length || direct.some((line, i) => line !== siblings[i])) return invalid();
  if (source === before) return { content, line: source };
  let stop = source + 1;
  for (; stop < end; stop++) if (lines[stop]!.trim() && indentWidth(lines[stop]!) <= depth) break;
  // Blank separators belong to the block and travel with it; indentation and fields stay exact.
  const order = lines.map((_, i) => i);
  const moved = order.splice(source, stop - source);
  const insertion = before === null ? order.findIndex(i => i >= end) : order.indexOf(before);
  const at = insertion < 0 ? order.length : insertion;
  order.splice(at, 0, ...moved);
  const newline = endings[0] ?? '\n';
  const next = order.map((old, i) => lines[old]! + (i < order.length - 1 ? endings[old] ?? newline : '')).join('');
  return { content: next, line: at };
}
