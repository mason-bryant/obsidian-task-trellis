import { buildBoard, taskId, type BoardModel, type BoardTask } from './board.ts';
import { parseBoardConfig } from './boardConfig.ts';
import { BOARD_TEMPLATES, EXAMPLE_PROPERTY, previewNote, templateFrontmatter, type BoardTemplateId } from './boardTemplates.ts';
import type { ISODate } from './dates.ts';
import { indentWidth } from './subtasks.ts';
import { parseTaskLine } from './taskLine.ts';

const SLUG = 'preview';

/**
 * A board as the template makes it, showing sample tasks that suit it: what the New board dialog's
 * preview draws. Nothing here touches the vault.
 */
export function templatePreview(id: BoardTemplateId, today: ISODate): BoardModel {
  const template = BOARD_TEMPLATES.find((t) => t.id === id) ?? BOARD_TEMPLATES[0]!;
  const path = template.examples ? 'Task Trellis examples/Example board.md' : 'Tasks.md';
  const { config } = parseBoardConfig(template.name, templateFrontmatter(template.id, SLUG, path));
  // The example board shows only the note with its property, which the preview's note has.
  return buildBoard(noteTasks(path, previewNote(template.id, SLUG, today)), config, today, () => ({ [EXAMPLE_PROPERTY]: SLUG }));
}

/** A note's tasks, each under the nearest less-indented task above it, as the task index reads them. */
function noteTasks(path: string, content: string): BoardTask[] {
  const out: BoardTask[] = [];
  const open: { width: number; line: number }[] = [];
  content.split('\n').forEach((raw, line) => {
    const parsed = parseTaskLine(raw);
    if (!parsed) return;
    const width = indentWidth(raw);
    while (open.length && open[open.length - 1]!.width >= width) open.pop();
    const parent = open[open.length - 1];
    open.push({ width, line });
    out.push({ ...parsed, raw, id: taskId(path, line), path, line, ...(parent && { parentId: taskId(path, parent.line) }) });
  });
  return out;
}
