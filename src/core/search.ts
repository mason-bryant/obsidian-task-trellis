import type { BoardConfig } from './boardConfig.ts';
import { labelDescription, taskLabels } from './labels.ts';
import type { ParsedTask } from './taskLine.ts';

/** Lowercase and without accents, so "cafe" finds "Café". */
function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** The words of a search box's text. Each must be in the card, or in one of its subtasks. */
export function searchTerms(query: string): string[] {
  return [...new Set(fold(query).split(/\s+/).filter(Boolean))];
}

/**
 * What a search looks in, folded like `searchTerms`: the task's text and, for a card, what else the
 * card shows: its note's name and its labels on this board (a label without a name by its color, as
 * the card says it). A subtask inside a card shows only its text.
 */
export function searchText(task: ParsedTask & { path: string; raw: string }, config: BoardConfig, card: boolean): string {
  if (!card) return fold(task.text);
  const ids = taskLabels(task.raw, config.slug);
  const labels = config.labels.filter((label) => ids.includes(label.id)).map((label) => label.name || labelDescription(label));
  const note = task.path.split('/').pop()?.replace(/\.md$/i, '') ?? task.path;
  return fold([task.text, note, ...labels].join('\n'));
}
