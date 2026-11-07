// @vitest-environment jsdom
import { BoardNameTaken } from '../src/core/boardName.ts';
import { describe, expect, it, vi } from 'vitest';
import { buildBoard, taskId, type BoardTask } from '../src/core/board.ts';
import { parseBoardConfig } from '../src/core/boardConfig.ts';
import { BOARD_TEMPLATES, EXAMPLE_PROPERTY, exampleNote, templateFrontmatter, type BoardTemplateId } from '../src/core/boardTemplates.ts';
import { indentWidth } from '../src/core/subtasks.ts';
import { parseTaskLine } from '../src/core/taskLine.ts';
import { renderNewBoardEditor } from '../src/ui/renderBoardNameEditor.ts';

const TODAY = '2026-11-03';

/** A note's tasks, with subtasks under their parents, as the task index reads them. */
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

describe('board templates', () => {
  it('make boards whose settings read back without warnings', () => {
    for (const template of BOARD_TEMPLATES) {
      const { config, warnings } = parseBoardConfig(template.name, templateFrontmatter(template.id, 'board', 'Task Trellis examples/Board.md'));
      expect(warnings, template.id).toEqual([]);
      expect(config.slug).toBe('board');
    }
  });

  it('give each template its own columns, rows and rules', () => {
    const read = (id: Parameters<typeof templateFrontmatter>[0]) => parseBoardConfig('Board', templateFrontmatter(id, 'board')).config;
    expect(read('kanban').columns.map((c) => c.label)).toEqual(['Backlog', 'Doing', 'Waiting', 'Done']);
    expect(read('kanban').colorRules).toEqual([]);

    const weekly = read('weekly');
    expect(weekly.columns.map((c) => c.label)).toEqual(['Someday', 'To do', 'Doing', 'Done']);
    expect([weekly.undatedColumn, weekly.dueNow, weekly.dueNowUnit, weekly.weekHorizon, weekly.compact]).toEqual(['someday', 1, 'weeks', 1, true]);

    const project = read('project');
    expect(project.columns.map((c) => c.label)).toEqual(['Backlog', 'Ready', 'In progress', 'Review', 'Done']);
    expect(project.labels.map((l) => l.name)).toEqual(['Feature', 'Chore', 'Bug', 'Blocked', 'Design', 'Research']);
    expect(project.colorRules.map((r) => [r.name, r.labels, r.pattern])).toEqual([['Blocked', ['4'], 'stripes']]);

    const matrix = read('eisenhower');
    expect(matrix.colorRules.map((r) => [r.name, r.pattern])).toEqual([['Do', undefined], ['Schedule', 'stripes'], ['Delegate', 'dots'], ['Eliminate', 'grid']]);
    expect(matrix.quickFilters.map((f) => f.name)).toEqual(['Important', 'Urgent']);
  });

  it('colors the Eisenhower quadrants by priority and urgency', () => {
    const config = parseBoardConfig('Matrix', templateFrontmatter('eisenhower', 'matrix')).config;
    const path = 'Tasks.md';
    const tasks = noteTasks(path, [
      '- [ ] Urgent and important ⏫ 📅 2026-11-04',
      '- [ ] Important ⏫ 📅 2026-11-20',
      '- [ ] Urgent 📅 2026-11-03',
      '- [ ] Neither 📅 2026-12-01',
      '- [ ] Undated and important 🔺',
    ].join('\n'));
    const model = buildBoard(tasks, config, TODAY, () => undefined);
    expect(tasks.map((t) => model.colors[t.id]?.name)).toEqual(['Do', 'Schedule', 'Delegate', 'Eliminate', 'Schedule']);
  });

  it('makes an example board that shows only its own sample tasks, in every row', () => {
    const note = 'Task Trellis examples/Example board.md';
    const fm = templateFrontmatter('example', 'example-board', note);
    const { config, warnings } = parseBoardConfig('Example board', fm);
    expect(warnings).toEqual([]);
    expect([config.newTasks, config.newTasksNote]).toEqual(['note', note]);

    const content = exampleNote('example-board', 'Example board', TODAY);
    expect(content.startsWith(`---\n${EXAMPLE_PROPERTY}: example-board\n---\n`)).toBe(true);
    const other = 'Projects/Real.md';
    const tasks = [...noteTasks(note, content), ...noteTasks(other, '- [ ] A real task 📅 2026-11-04')];
    const frontmatter = (path: string) => path === note ? { [EXAMPLE_PROPERTY]: 'example-board' } : undefined;
    const model = buildBoard(tasks, config, TODAY, frontmatter);

    // The real task stays off the board; every sample is a card or a card's subtask.
    const cards = Object.values(model.cells).flatMap((row) => Object.values(row).flat());
    expect(cards.some((t) => t.path === other)).toBe(false);
    expect(cards.length + Object.values(model.subtasks).flat().length).toBe(tasks.length - 1);
    const where = (text: string) => {
      const card = cards.find((t) => t.text.startsWith(text))!;
      return [model.rowOf[card.id], Object.entries(model.cells[model.rowOf[card.id]!]!).find(([, list]) => list.includes(card))![0]];
    };
    expect(where('Fix the leaky kitchen tap')).toEqual(['now', 'backlog']);
    expect(where('Call the plumber')).toEqual(['now', 'doing']);
    expect(where('Wait for the fence quote')).toEqual(['now', 'waiting']);
    expect(where('Book a chimney sweep')).toEqual(['later', 'backlog']);
    expect(where('Try a new bread recipe')).toEqual(['none', 'backlog']);
    expect(where('Mow the lawn')[1]).toBe('done');
    const party = cards.find((t) => t.text.startsWith('Plan the garden party'))!;
    expect(model.subtasks[party.id]!.map((t) => [t.text, t.closed])).toEqual([['Choose a date', true], ['Send the invitations', false], ['Borrow folding chairs', false]]);

    // Labels are named, and the sample tasks use them; both color rules match something.
    expect(config.labels.map((l) => l.name)).toEqual(['Outdoors', 'Errands', 'Calls', 'Repairs', 'Fun', 'Admin']);
    expect(content).toMatch(/Buy seeds for the vegetable bed 📅 2026-11-04 #tt\/example-board\/label\/2 #tt\/example-board\/label\/1$/m);
    expect(new Set(Object.values(model.colors).map((r) => r.name))).toEqual(new Set(['High priority', 'Due today']));
  });
});

describe('new board editor', () => {
  function editor(create = vi.fn(async (): Promise<void> => undefined), template?: BoardTemplateId) {
    const body = document.createElement('div'), header = document.createElement('div');
    document.body.replaceChildren(header, body);
    const close = vi.fn();
    renderNewBoardEditor(body, header, { examplesPath: (name) => `Task Trellis examples/${name}.md`, template }, () => undefined, create, close);
    const name = body.querySelector<HTMLInputElement>('input[aria-label="Board name"]')!;
    const choice = (text: string) => [...body.querySelectorAll<HTMLButtonElement>('.tt-board-template')].find((b) => b.querySelector('.tt-board-template-name')!.textContent === text)!;
    const pressed = () => [...body.querySelectorAll('.tt-board-template[aria-pressed="true"]')].map((b) => b.querySelector('.tt-board-template-name')!.textContent);
    const save = header.querySelector<HTMLButtonElement>('.tt-editor-save')!;
    return { body, name, choice, pressed, save, create, close };
  }

  it('starts from Kanban and suggests each template’s name until one is typed', () => {
    const ui = editor();
    expect(ui.body.querySelector('[role="group"]')!.getAttribute('aria-label')).toBe('Start from');
    expect(ui.pressed()).toEqual(['Kanban']);
    expect(ui.save.getAttribute('aria-label')).toBe('Create board');
    ui.choice('Weekly planner').click();
    expect([ui.pressed(), ui.name.value]).toEqual([['Weekly planner'], 'Weekly planner']);
    ui.choice('Kanban').click();
    expect(ui.name.value).toBe('');
    ui.name.value = 'Chores'; ui.name.dispatchEvent(new Event('input'));
    ui.choice('Project').click();
    expect([ui.pressed(), ui.name.value]).toEqual([['Project'], 'Chores']);
  });

  it('starts from the template the sidebar offered, with its name, and makes that board', async () => {
    const ui = editor(undefined, 'weekly');
    expect([ui.pressed(), ui.name.value]).toEqual([['Weekly planner'], 'Weekly planner']);
    // Still only a suggestion: another choice replaces the name until one is typed.
    ui.choice('Project').click();
    expect([ui.pressed(), ui.name.value]).toEqual([['Project'], 'Project']);
    ui.choice('Weekly planner').click();
    ui.save.click();
    await vi.waitFor(() => expect(ui.create).toHaveBeenCalledWith('Weekly planner', 'weekly'));

    const example = editor(undefined, 'example');
    expect(example.pressed()).toEqual(['Example board']);
    expect(example.body.querySelector<HTMLElement>('.tt-board-template-examples')!.hidden).toBe(false);
  });

  it('says where the example board’s sample tasks go', () => {
    const ui = editor();
    const note = ui.body.querySelector<HTMLElement>('.tt-board-template-examples')!;
    expect(note.hidden).toBe(true);
    ui.choice('Example board').click();
    expect(note.hidden).toBe(false);
    expect(note.textContent).toContain('Task Trellis examples/Example board.md');
    ui.name.value = 'Sandbox'; ui.name.dispatchEvent(new Event('input'));
    expect(note.textContent).toContain('Task Trellis examples/Sandbox.md');
  });

  it('creates the board from the chosen template, and keeps the dialog when that fails', async () => {
    const create = vi.fn(async (): Promise<void> => { throw new BoardNameTaken('Task Trellis/Chores.md already exists. Choose another board name.'); });
    const ui = editor(create);
    ui.save.click();
    expect(ui.body.querySelector('[role="alert"]')!.textContent).toMatch(/name/i);
    expect(create).not.toHaveBeenCalled();
    ui.name.value = 'Chores'; ui.choice('Eisenhower matrix').click();
    ui.save.click(); await Promise.resolve(); await Promise.resolve();
    expect(create).toHaveBeenCalledWith('Chores', 'eisenhower');
    expect(ui.close).not.toHaveBeenCalled();
    expect(ui.body.querySelector('[role="alert"]')!.textContent).toBe('Task Trellis/Chores.md already exists. Choose another board name.');
    expect(document.activeElement).toBe(ui.name);
    expect(ui.name.getAttribute('aria-invalid')).toBe('true');
    create.mockImplementation(async () => undefined);
    ui.save.click(); await Promise.resolve(); await Promise.resolve();
    expect(ui.close).toHaveBeenCalled();
  });
});
