import { taskLabels } from '../src/core/labels.ts';
import type { UndoAction } from '../src/obsidian/TaskWriter.ts';
import { beforeEach, describe, expect, it } from 'vitest';
import type { App } from 'obsidian';
import { notices, TFile } from './mocks/obsidian.ts';
import { taskId, type BoardTask, type TaskEdit } from '../src/core/board.ts';
import { parseTaskLine } from '../src/core/taskLine.ts';
import { TaskWriter } from '../src/obsidian/TaskWriter.ts';

type TasksApi = {
  editTaskLineModal(line: string): Promise<string>;
  executeToggleTaskDoneCommand(line: string, path: string): string;
};

function fakeApp(files: Record<string, string>, tasksApi?: TasksApi) {
  const entries = new Map(Object.keys(files).map((path) => [path, new TFile(path)]));
  const app = {
    vault: {
      getAbstractFileByPath: (path: string) => (path in files ? entries.get(path) ?? null : null),
      process: async (file: TFile, fn: (content: string) => string) => {
        files[file.path] = fn(files[file.path]!);
        return files[file.path];
      },
    },
    plugins: tasksApi
      ? { enabledPlugins: new Set(['obsidian-tasks-plugin']), plugins: { 'obsidian-tasks-plugin': { apiV1: tasksApi } } }
      : { enabledPlugins: new Set<string>(), plugins: {} },
  };
  return app as unknown as App;
}

function task(path: string, line: number, raw: string): BoardTask {
  return { ...parseTaskLine(raw)!, id: taskId(path, line), path, line, raw };
}

beforeEach(() => {
  notices.length = 0;
});

describe('TaskWriter.applyEdits', () => {
  it('rewrites several lines in one file, bottom-up, keeping CRLF', async () => {
    const files = { 'a.md': '# A\r\n- [ ] one #tt/house/doing/100\r\n- [ ] two\r\n' };
    const a = task('a.md', 1, '- [ ] one #tt/house/doing/100');
    const b = task('a.md', 2, '- [ ] two');
    const edits = new Map<string, TaskEdit>([
      [a.id, { column: 'doing', sort: 200 }],
      [b.id, { column: 'doing', sort: 100, due: '2026-11-02' }],
    ]);
    await new TaskWriter(fakeApp(files)).applyEdits([a, b], edits, 'house');
    expect(files['a.md']).toBe('# A\r\n- [ ] one #tt/house/doing/200\r\n- [ ] two 📅 2026-11-02 #tt/house/doing/100\r\n');
  });

  it('finds a line that moved, and skips one that changed', async () => {
    const files = { 'a.md': '# new heading\n# A\n- [ ] one\n- [ ] two edited\n' };
    const moved = task('a.md', 1, '- [ ] one');
    const changed = task('a.md', 2, '- [ ] two');
    const edits = new Map<string, TaskEdit>([
      [moved.id, { column: 'waiting' }],
      [changed.id, { column: 'waiting' }],
    ]);
    await new TaskWriter(fakeApp(files)).applyEdits([moved, changed], edits, 'house');
    expect(files['a.md']).toBe('# new heading\n# A\n- [ ] one #tt/house/waiting\n- [ ] two edited\n');
    expect(notices).toHaveLength(1);
  });

  it('never moves an edit onto another task with the same text', async () => {
    // Both projects had the same line when it was read, and Project A's has since been edited.
    const twinned = '# Project A\n- [ ] call the vendor, edited\n# Project B\n- [ ] call the vendor\n';
    const files: Record<string, string> = { 'a.md': twinned };
    const a = { ...task('a.md', 1, '- [ ] call the vendor'), twins: 1 };
    await new TaskWriter(fakeApp(files)).applyEdits([a], new Map([[a.id, { column: 'doing' }]]), 'house');
    expect(files['a.md']).toBe(twinned);

    // A line that was unique but now appears twice could be either copy.
    const copied = '# new heading\n- [ ] call the vendor\n- [ ] call the vendor\n';
    files['a.md'] = copied;
    const b = task('a.md', 0, '- [ ] call the vendor');
    await new TaskWriter(fakeApp(files)).applyEdits([b], new Map([[b.id, { column: 'doing' }]]), 'house');
    expect(files['a.md']).toBe(copied);
    expect(notices).toHaveLength(2);
  });

  it('completes through Tasks and keeps the next occurrence in its old column', async () => {
    const files = { 'a.md': '- [ ] water 🔁 every week 📅 2026-10-22 #tt/house/doing/100\n- [ ] after\n' };
    const t = task('a.md', 0, '- [ ] water 🔁 every week 📅 2026-10-22 #tt/house/doing/100');
    const api: TasksApi = {
      editTaskLineModal: async () => '',
      executeToggleTaskDoneCommand: (line) =>
        [line.replace('2026-10-22', '2026-10-29'), line.replace('[ ]', '[x]').replace(' #tt', ' ✅ 2026-10-21 #tt')].join('\n'),
    };
    const edits = new Map<string, TaskEdit>([[t.id, { column: 'done', sort: 100, closed: true }]]);
    await new TaskWriter(fakeApp(files, api)).applyEdits([t], edits, 'house');
    expect(files['a.md']).toBe(
      '- [ ] water 🔁 every week 📅 2026-10-29 #tt/house/doing/100\n' +
        '- [x] water 🔁 every week 📅 2026-10-22 ✅ 2026-10-21 #tt/house/done/100\n' +
        '- [ ] after\n',
    );
  });

  it('rejects a duplicate that shifts into the original line number after deletion', async () => {
    const raw = '- [ ] call the vendor';
    const before = `# Project A\n${raw}\n# Project B\n${raw}\n`;
    const after = `# Project B\n${raw}\n`;
    const files = { 'a.md': after };
    const a = { ...task('a.md', 1, raw), twins: 1, duplicateSource: before };
    await new TaskWriter(fakeApp(files)).toggle(a);
    expect(files['a.md']).toBe(after);
    expect(notices).toHaveLength(1);
  });

  it('allows editing duplicate tasks when their note snapshot is unchanged', async () => {
    const raw = '- [ ] call the vendor';
    const before = `# Project A\r\n${raw}\r\n# Project B\r\n${raw}\r\n`;
    const files = { 'a.md': before };
    const a = { ...task('a.md', 1, raw), twins: 1, duplicateSource: before.replace(/\r\n/g, '\n') };
    await new TaskWriter(fakeApp(files)).applyEdits([a], new Map([[a.id, { column: 'doing' }]]), 'house');
    expect(files['a.md']).toBe(before.replace(`# Project A\r\n${raw}`, `# Project A\r\n${raw} #tt/house/doing`));
    expect(notices).toHaveLength(0);
  });

  it('falls back to flipping the checkbox when Tasks leaves the line alone', async () => {
    const files = { 'a.md': '- [ ] one\n' };
    const t = task('a.md', 0, '- [ ] one');
    const api: TasksApi = { editTaskLineModal: async () => '', executeToggleTaskDoneCommand: (line) => line };
    const written = await new TaskWriter(fakeApp(files, api)).toggle(t);
    expect(files['a.md']).toMatch(/^- \[x\] one ✅ \d{4}-\d{2}-\d{2}\n$/);
    expect(written).toEqual([files['a.md']!.trimEnd()]);
  });
});

describe('TaskWriter.insertSubtask', () => {
  it('adds under a parent whose line moved, and refuses when the parent changed', async () => {
    const files = { 'a.md': '# inserted\n- [ ] parent\n\t- [ ] one\n- [ ] next\n' };
    const writer = new TaskWriter(fakeApp(files));
    await writer.insertSubtask(task('a.md', 0, '- [ ] parent'), '- [ ] two');
    expect(files['a.md']).toBe('# inserted\n- [ ] parent\n\t- [ ] one\n\t- [ ] two\n- [ ] next\n');
    await writer.insertSubtask(task('a.md', 1, '- [ ] parent renamed'), '- [ ] three');
    expect(files['a.md']).not.toContain('three');
    expect(notices).toHaveLength(1);
  });
});

describe('TaskWriter.editInModal', () => {
  it('writes the edited line with placement tags moved back to the end', async () => {
    const files = { 'a.md': '- [ ] one #tt/house/doing/100\n' };
    const t = task('a.md', 0, '- [ ] one #tt/house/doing/100');
    const api: TasksApi = {
      editTaskLineModal: async () => '- [ ] one renamed #tt/house/doing/100 ⏫ 📅 2026-11-01',
      executeToggleTaskDoneCommand: (line) => line,
    };
    const written = await new TaskWriter(fakeApp(files, api)).editInModal(t);
    expect(files['a.md']).toBe('- [ ] one renamed ⏫ 📅 2026-11-01 #tt/house/doing/100\n');
    expect(written).toEqual(['- [ ] one renamed ⏫ 📅 2026-11-01 #tt/house/doing/100']);
  });

  it('drops field copies Tasks left in the description', async () => {
    const raw = '- [ ] one 📅 2026-10-19 -- link #tt/house/doing/100';
    const files = { 'a.md': raw + '\n' };
    const api: TasksApi = {
      editTaskLineModal: async () => '- [ ] one 📅 2026-10-19 -- link #tt/house/doing/100 📅 2026-10-22',
      executeToggleTaskDoneCommand: (line) => line,
    };
    await new TaskWriter(fakeApp(files, api)).editInModal(task('a.md', 0, raw));
    expect(files['a.md']).toBe('- [ ] one -- link 📅 2026-10-22 #tt/house/doing/100\n');
  });

  it('leaves the file alone when the modal is cancelled', async () => {
    const files = { 'a.md': '- [ ] one\n' };
    const api: TasksApi = { editTaskLineModal: async () => '', executeToggleTaskDoneCommand: (l) => l };
    expect(await new TaskWriter(fakeApp(files, api)).editInModal(task('a.md', 0, '- [ ] one'))).toBeNull();
    expect(files['a.md']).toBe('- [ ] one\n');
  });
});

describe('TaskWriter.openSource', () => {
  function workspaceWith(leaves: { path: string; win: unknown }[]) {
    const calls: string[] = [];
    const made = leaves.map(({ path, win }, i) => ({
      id: i,
      getViewState: () => ({ type: 'markdown', state: { file: path } }),
      view: { containerEl: { win: { name: win, focus: () => calls.push(`focus ${i}`) } } },
      setEphemeralState: (s: { line: number }) => calls.push(`line ${i}:${s.line}`),
    }));
    const app = {
      vault: { getFileByPath: (p: string) => new TFile(p) },
      workspace: {
        iterateAllLeaves: (cb: (leaf: unknown) => void) => made.forEach(cb),
        revealLeaf: async (leaf: { id: number }) => void calls.push(`reveal ${leaf.id}`),
        setActiveLeaf: (leaf: { id: number }) => void calls.push(`active ${leaf.id}`),
        getLeaf: () => ({ openFile: async (f: TFile, o: { eState: { line: number } }) => void calls.push(`new ${f.path}:${o.eState.line}`) }),
      },
      plugins: { enabledPlugins: new Set<string>(), plugins: {} },
    };
    return { app: app as unknown as App, calls, made };
  }

  it('goes to a tab already showing the note, preferring the current window', async () => {
    const { app, calls, made } = workspaceWith([
      { path: 'a.md', win: 'popout' },
      { path: 'b.md', win: 'main' },
      { path: 'a.md', win: 'main' },
    ]);
    (globalThis as { activeWindow?: unknown }).activeWindow = made[2]!.view.containerEl.win;
    await new TaskWriter(app).openSource(task('a.md', 4, '- [ ] x'));
    expect(calls).toEqual(['reveal 2', 'focus 2', 'active 2', 'line 2:4']);
  });

  it('opens a new tab when the note is not open, or when asked to', async () => {
    const { app, calls } = workspaceWith([{ path: 'a.md', win: 'main' }]);
    await new TaskWriter(app).openSource(task('b.md', 1, '- [ ] x'));
    await new TaskWriter(app).openSource(task('a.md', 2, '- [ ] x'), true);
    expect(calls).toEqual(['new b.md:1', 'new a.md:2']);
  });
});

describe('Undo', () => {
  it('restores all files involved in a reorder and only runs once', async () => {
    const files = { 'a.md': '- [ ] one\n', 'b.md': '- [ ] two\n' };
    const before = { ...files };
    const a = task('a.md', 0, '- [ ] one'), b = task('b.md', 0, '- [ ] two');
    const action = await new TaskWriter(fakeApp(files)).applyEdits([a, b], new Map([[a.id, { column: 'doing', sort: 100 }], [b.id, { column: 'doing', sort: 200 }]]), 'house');
    expect(files).not.toEqual(before);
    expect(await action!.undo()).toBe(true);
    expect(files).toEqual(before);
    expect(await action!.undo()).toBe(false);
  });

  it('does not overwrite edits made after the action', async () => {
    const files = { 'a.md': '- [ ] one\n' };
    const t = task('a.md', 0, '- [ ] one');
    const action = await new TaskWriter(fakeApp(files)).applyEdits([t], new Map([[t.id, { column: 'doing' }]]), 'house');
    files['a.md'] += 'A later edit\n';
    const edited = files['a.md'];
    expect(await action!.undo()).toBe(false);
    expect(files['a.md']).toBe(edited);
    expect(notices.at(-1)).toContain('were not undone');
  });

  it('does not write through a stale file reference after a note is replaced', async () => {
    const files = { 'a.md': '- [ ] one\n' };
    const app = fakeApp(files);
    const t = task('a.md', 0, '- [ ] one');
    const action = await new TaskWriter(app).applyEdits([t], new Map([[t.id, { column: 'doing' }]]), 'house');
    const after = files['a.md'];
    Object.assign(app.vault, { getAbstractFileByPath: () => new TFile('a.md') });
    expect(await action!.undo()).toBe(false);
    expect(files['a.md']).toBe(after);
  });

  it('undoes completion including the generated recurring occurrence', async () => {
    const raw = '- [ ] water 🔁 every week 📅 2026-10-23';
    const files = { 'a.md': raw + '\n' };
    const api: TasksApi = { editTaskLineModal: async () => '', executeToggleTaskDoneCommand: (line) => [line.replace('2026-10-23', '2026-10-30'), line.replace('[ ]', '[x]')].join('\n') };
    let undo: import('../src/obsidian/TaskWriter.ts').UndoAction | undefined;
    await new TaskWriter(fakeApp(files, api)).toggle(task('a.md', 0, raw), (action) => { undo = action; });
    expect(files['a.md']).toContain('2026-10-30');
    await undo!.undo();
    expect(files['a.md']).toBe(raw + '\n');
  });
});


describe('TaskWriter labels', () => {
  it('saves consecutive selections, keeps line endings, and undoes the latest change', async () => {
    const raw = '- [ ] Paint 📅 2026-10-25 #tt/home/doing/10 ^id';
    const files = { 'a.md': `# A\r\n${raw}\r\n` };
    const writer = new TaskWriter(fakeApp(files));
    const actions: UndoAction[] = [];
    const first = await writer.setLabels(task('a.md', 1, raw), 'home', ['red'], (action) => actions.push(action));
    const second = await writer.setLabels(first, 'home', ['red', 'blue'], (action) => actions.push(action));
    expect(taskLabels(second.raw, 'home')).toEqual(['red', 'blue']);
    expect(files['a.md']).toBe(`# A\r\n${second.raw}\r\n`);
    await actions[1]!.undo();
    expect(files['a.md']).toBe(`# A\r\n${first.raw}\r\n`);
  });

  it('rejects stale assignments without overwriting a changed task', async () => {
    const files = { 'a.md': '- [ ] Edited elsewhere\n' };
    const writer = new TaskWriter(fakeApp(files));
    await expect(writer.setLabels(task('a.md', 0, '- [ ] Original'), 'home', ['red'], () => undefined)).rejects.toThrow('changed');
    expect(files['a.md']).toBe('- [ ] Edited elsewhere\n');
  });
});


it('can assign multiple labels to one of two identical tasks without editing its twin', async () => {
  const raw = '- [ ] Call vendor';
  const source = `# A\n${raw}\n# B\n${raw}\n`;
  const files = { 'a.md': source };
  const writer = new TaskWriter(fakeApp(files));
  const original = { ...task('a.md', 1, raw), twins: 1, duplicateSource: source };
  const first = await writer.setLabels(original, 'home', ['red'], () => undefined);
  const second = await writer.setLabels(first, 'home', ['red', 'green'], () => undefined);
  expect(files['a.md']).toBe(`# A\n${second.raw}\n# B\n${raw}\n`);
  // If another task already has the same assignment, refresh the duplicate snapshot as well.
  const other = await writer.setLabels(task('a.md', 3, raw), 'home', ['red', 'green'], () => undefined);
  expect(other.twins).toBe(1);
  const edited = await writer.setLabels(other, 'home', ['blue'], () => undefined);
  expect(files['a.md']).toBe(`# A\n${second.raw}\n# B\n${edited.raw}\n`);
});
