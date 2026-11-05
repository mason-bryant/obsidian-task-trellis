import { FM, newBoardFrontmatter } from './boardConfig.ts';
import { addDays, type ISODate } from './dates.ts';
import { LABEL_COLORS, setTaskLabels, type BoardLabel } from './labels.ts';
import { defaultQuickFilters, quickFilterFrontmatter } from './quickFilters.ts';
import { setDueDate, setPlacement, setPriority, type Priority } from './taskLine.ts';

export type BoardTemplateId = 'kanban' | 'weekly' | 'project' | 'eisenhower' | 'example';

/** A starting point for a new board: settings over a new board's defaults, and for the example board, tasks too. */
export type BoardTemplate = {
  id: BoardTemplateId;
  name: string;
  description: string;
  /** What the name box suggests when it's empty. Kanban is the plain board, so it suggests nothing. */
  suggestedName: string;
  /** Writes a note of sample tasks that only this board shows. */
  examples?: boolean;
};

export const BOARD_TEMPLATES: BoardTemplate[] = [
  { id: 'kanban', name: 'Kanban', suggestedName: '', description: 'Backlog, Doing, Waiting and Done, with due dates as rows.' },
  { id: 'weekly', name: 'Weekly planner', suggestedName: 'Weekly planner', description: 'This week and next as rows, undated tasks in Someday, and today’s tasks highlighted.' },
  { id: 'project', name: 'Project', suggestedName: 'Project', description: 'Backlog through Review to Done, labels for kinds of work, and blocked cards striped red.' },
  { id: 'eisenhower', name: 'Eisenhower matrix', suggestedName: 'Eisenhower matrix', description: 'High priority is important and Due now is urgent. Each quadrant gets its own color and pattern.' },
  { id: 'example', name: 'Example board', suggestedName: 'Example board', examples: true, description: 'Sample tasks in a note of their own, to try things out. Delete the board and the note when you’re done.' },
];

/** Where example boards' sample tasks go, outside the boards folder, which boards never read. */
export const EXAMPLES_FOLDER = 'Task Trellis examples';
/** The note property that ties the example board to its tasks, so the board shows only them. */
export const EXAMPLE_PROPERTY = 'task-trellis-example';

/** The palette's colors, named, in their usual order: green, yellow, orange, red, purple, blue. */
function namedLabels(names: string[]): BoardLabel[] {
  return LABEL_COLORS.map(({ color }, i) => ({ id: String(i + 1), name: names[i] ?? '', color }));
}

const quick = (id: string, name: string, criteria: Record<string, unknown>) => ({ id, name, show: true, ...criteria });
const color = (name: string, hex: string, pattern: string | undefined, criteria: Record<string, unknown>) =>
  ({ name, color: hex, ...(pattern ? { pattern } : {}), ...criteria });
const URGENT = ['overdue', 'today', 'due-now'];
const IMPORTANT = ['highest', 'high'];

/** A new board's front matter from a template. `examplesNote` is the example board's note of tasks. */
export function templateFrontmatter(id: BoardTemplateId, slug: string, examplesNote = ''): Record<string, unknown> {
  const fm = newBoardFrontmatter(slug);
  const labels = (names: string[]) => {
    const list = namedLabels(names);
    return { [FM.labels]: list, [FM.labelNext]: list.length + 1 };
  };
  switch (id) {
    case 'kanban':
      return fm;
    case 'weekly':
      return {
        ...fm,
        [FM.columns]: ['Someday', 'To do', 'Doing', 'Done'],
        [FM.undatedColumn]: 'Someday',
        [FM.dueNow]: 1,
        [FM.dueNowUnit]: 'weeks',
        [FM.weekHorizon]: 1,
        [FM.compact]: true,
        [FM.quickFilters]: [
          quick('today', 'Due today', { due: ['today'] }),
          quick('overdue', 'Overdue', { due: ['overdue'] }),
          quick('high-priority', 'High priority', { priority: IMPORTANT }),
        ],
        [FM.colorRules]: [
          color('Due today', LABEL_COLORS[2].color, undefined, { due: ['today'] }),
          color('High priority', LABEL_COLORS[3].color, 'stripes', { priority: IMPORTANT }),
        ],
      };
    case 'project':
      return {
        ...fm,
        ...labels(['Feature', 'Chore', 'Bug', 'Blocked', 'Design', 'Research']),
        [FM.columns]: ['Backlog', 'Ready', 'In progress', 'Review', 'Done'],
        [FM.dueNow]: 14,
        [FM.weekHorizon]: 4,
        [FM.quickFilters]: [
          quick('high-priority', 'High priority', { priority: IMPORTANT }),
          quick('overdue', 'Overdue', { due: ['overdue'] }),
          quick('label-4', '🏷️ Blocked', { labels: ['4'] }),
          quick('label-3', '🏷️ Bug', { labels: ['3'] }),
        ],
        [FM.colorRules]: [color('Blocked', LABEL_COLORS[3].color, 'stripes', { labels: ['4'] })],
      };
    case 'eisenhower':
      // The first matching rule colors a card, so each rule only has to tell its quadrant from the ones after it.
      return {
        ...fm,
        [FM.columns]: ['To do', 'Doing', 'Done'],
        [FM.dueNow]: 2,
        [FM.quickFilters]: [
          quick('important', 'Important', { priority: IMPORTANT }),
          quick('urgent', 'Urgent', { due: URGENT }),
        ],
        [FM.colorRules]: [
          color('Do', LABEL_COLORS[3].color, undefined, { priority: IMPORTANT, due: URGENT }),
          color('Schedule', LABEL_COLORS[5].color, 'stripes', { priority: IMPORTANT }),
          color('Delegate', LABEL_COLORS[1].color, 'dots', { due: URGENT }),
          color('Eliminate', '#6b6f76', 'grid', {}),
        ],
      };
    case 'example': {
      const named = namedLabels(EXAMPLE_LABELS);
      return {
        ...fm,
        [FM.labels]: named,
        [FM.labelNext]: named.length + 1,
        [FM.quickFilters]: defaultQuickFilters(named).map((f) => quickFilterFrontmatter(f, {})),
        [FM.colorRules]: [
          color('High priority', LABEL_COLORS[3].color, 'stripes', { priority: IMPORTANT }),
          color('Due today', LABEL_COLORS[5].color, undefined, { due: ['today'] }),
        ],
        [FM.filterProperties]: [`${EXAMPLE_PROPERTY}: ${slug}`],
        [FM.newTasks]: 'note',
        [FM.newTasksNote]: examplesNote,
      };
    }
  }
}

const EXAMPLE_LABELS = ['Outdoors', 'Errands', 'Calls', 'Repairs', 'Fun', 'Admin'];
type Example = { text: string; due?: number; priority?: Priority; labels?: string[]; column?: string; done?: number; subtasks?: Example[] };

/** Days are from today, so the board has something in every row whenever it's made. */
const EXAMPLES: Example[] = [
  { text: 'Fix the leaky kitchen tap', due: -2, priority: 'high', labels: ['Repairs'] },
  { text: 'Call the plumber about the water heater', due: 0, labels: ['Calls'], column: 'doing' },
  { text: 'Buy seeds for the vegetable bed', due: 1, labels: ['Errands', 'Outdoors'] },
  { text: 'Plan the garden party', due: 5, priority: 'medium', labels: ['Fun'], column: 'doing', subtasks: [
    { text: 'Choose a date', done: -1 },
    { text: 'Send the invitations', due: 2 },
    { text: 'Borrow folding chairs' },
  ] },
  { text: 'Wait for the fence quote', due: 3, labels: ['Calls'], column: 'waiting' },
  { text: 'Renew the car insurance', due: 9, priority: 'highest', labels: ['Admin'] },
  { text: 'Repaint the shed', due: 20, priority: 'low', labels: ['Outdoors', 'Repairs'] },
  { text: 'Book a chimney sweep', due: 40, labels: ['Calls'] },
  { text: 'Sort the garage shelves', labels: ['Repairs'] },
  { text: 'Try a new bread recipe', labels: ['Fun'] },
  { text: 'Mow the lawn', due: -1, labels: ['Outdoors'], done: -1 },
  { text: 'Pay the water bill', labels: ['Admin'], done: 0 },
];

/** The example board's note: its property, a line about what it's for, and sample tasks placed on the board. */
export function exampleNote(slug: string, boardName: string, today: ISODate): string {
  const ids = (names: string[] = []) => names.map((n) => String(EXAMPLE_LABELS.indexOf(n) + 1));
  const line = (task: Example, indent = ''): string[] => {
    let text = `${indent}- [${task.done !== undefined ? 'x' : ' '}] ${task.text}`;
    if (task.priority) text = setPriority(text, task.priority);
    if (task.due !== undefined) text = setDueDate(text, addDays(today, task.due));
    if (task.done !== undefined) text = `${text} ✅ ${addDays(today, task.done)}`;
    if (task.labels) text = setTaskLabels(text, slug, ids(task.labels));
    if (task.column) text = setPlacement(text, slug, task.column);
    return [text, ...(task.subtasks ?? []).flatMap((s) => line(s, `${indent}    `))];
  };
  return [
    '---', `${EXAMPLE_PROPERTY}: ${slug}`, '---',
    `Sample tasks for the ${boardName} board, made by Task Trellis. Change them, add your own, or delete this note and the board when you’re done.`,
    '', '## Tasks', '',
    ...EXAMPLES.flatMap((task) => line(task)), '',
  ].join('\n');
}
