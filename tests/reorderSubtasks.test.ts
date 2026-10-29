import { describe, expect, it } from 'vitest';
import type { App } from 'obsidian';
import { TFile } from './mocks/obsidian.ts';
import { reorderSubtaskBlocks, type SubtaskReorder } from '../src/core/reorderSubtasks.ts';
import { TaskWriter } from '../src/obsidian/TaskWriter.ts';
import { parseTaskLine } from '../src/core/taskLine.ts';
import { taskId, type BoardTask } from '../src/core/board.ts';

const lines = ['# Before', '- [ ] Parent', '\t- [ ] A 📅 2026-11-02 #tt/other/doing/50 ^a', '\t\tNotes for A', '\t\t- [ ] Child', '\t- [x] B', '\t- [ ] C', '- [ ] Outside', '# After'];
const original = lines.join('\n') + '\n';
const task = (line: number, parent?: number): BoardTask => ({ ...parseTaskLine(lines[line]!)!, path: 'Tasks.md', line,
  id: taskId('Tasks.md', line), raw: lines[line]!, ...(parent === undefined ? {} : { parentId: taskId('Tasks.md', parent) }) });
function fixture(content = original) {
  const file = new TFile('Tasks.md');
  const app = { vault: { getAbstractFileByPath: () => file,
    process: async (_file: TFile, fn: (s: string) => string) => { content = fn(content); return content; } } } as unknown as App;
  const move: SubtaskReorder = { parent: task(1), siblings: [task(2, 1), task(5, 1), task(6, 1)], taskId: task(2).id, beforeId: null };
  return { writer: new TaskWriter(app), move, get content() { return content; }, set(value: string) { content = value; } };
}

describe('Markdown sibling reordering', () => {
  it('moves descriptions, nested tasks and fields intact, without touching surrounding prose', () => {
    const result = reorderSubtaskBlocks(original, 1, [2, 5, 6], 2, null);
    expect(result.content).toBe([lines[0], lines[1], lines[5], lines[6], ...lines.slice(2, 5), ...lines.slice(7)].join('\n') + '\n');
    expect(result.line).toBe(4);
  });
  it('moves upward and returns the moved task’s new line', () => {
    const result = reorderSubtaskBlocks(original, 1, [2, 5, 6], 6, 2);
    expect(result.line).toBe(2);
    expect(result.content).toBe([...lines.slice(0, 2), lines[6], ...lines.slice(2, 6), ...lines.slice(7)].join('\n') + '\n');
  });
  it.each(['\n', '\r\n'])('preserves endings and an EOF without a newline (%j)', newline => {
    const note = ['- [ ] P', '  - [ ] A', '  - [ ] B'].join(newline);
    expect(reorderSubtaskBlocks(note, 0, [1, 2], 2, 1).content).toBe(['- [ ] P', '  - [ ] B', '  - [ ] A'].join(newline));
    expect(reorderSubtaskBlocks(note + newline, 0, [1, 2], 2, 1).content).toBe(['- [ ] P', '  - [ ] B', '  - [ ] A', ''].join(newline));
  });
  it('carries original mixed separators with the moved lines', () => {
    expect(reorderSubtaskBlocks('- [ ] P\r\n  - [ ] A\n  - [ ] B\r\nEnd', 0, [1, 2], 2, 1).content)
      .toBe('- [ ] P\r\n  - [ ] B\r\n  - [ ] A\nEnd');
  });
  it('reorders a nested sibling list without moving its enclosing parent', () => {
    const note = '- [ ] P\n  - [ ] A\n    - [ ] x\n    - [ ] y\n  - [ ] B\n';
    expect(reorderSubtaskBlocks(note, 1, [2, 3], 3, 2).content).toBe(note.replace('    - [ ] x\n    - [ ] y', '    - [ ] y\n    - [ ] x'));
  });
  it('no-op drops preserve the file exactly', () => {
    expect(reorderSubtaskBlocks(original, 1, [2, 5, 6], 2, 5).content).toBe(original);
    expect(reorderSubtaskBlocks(original, 1, [2, 5, 6], 6, null).content).toBe(original);
  });
  it('refuses a hidden sibling or a different-parent target', () => {
    expect(() => reorderSubtaskBlocks(original, 1, [2, 6], 2, 6)).toThrow();
    expect(() => reorderSubtaskBlocks(original, 1, [2, 5, 7], 2, 7)).toThrow();
  });
  it('refuses ambiguous mixed list items rather than attaching prose to a different task', () => {
    expect(() => reorderSubtaskBlocks('- [ ] P\n  - [ ] A\n  - plain bullet\n  - [ ] B', 0, [1, 3], 1, 3)).toThrow();
  });
});

describe('atomic writing and recovery', () => {
  it('writes once and Undo restores the whole note exactly', async () => {
    const f = fixture(); const result = await f.writer.reorderSubtask(f.move);
    expect(result.id).toBe('Tasks.md:4'); expect(f.content).not.toBe(original);
    expect(await result.action!.undo()).toBe(true); expect(f.content).toBe(original);
  });
  it('does not overwrite subsequent edits during Undo', async () => {
    const f = fixture(); const result = await f.writer.reorderSubtask(f.move);
    const newer = f.content + 'New prose\n'; f.set(newer);
    expect(await result.action!.undo()).toBe(false); expect(f.content).toBe(newer);
  });
  it.each(['Parent', 'A 📅', '[x] B'])('rejects changed snapshot %s without writing', async text => {
    const changed = original.replace(text, text + ' edited'); const f = fixture(changed);
    await expect(f.writer.reorderSubtask(f.move)).rejects.toThrow(); expect(f.content).toBe(changed);
  });
  it('follows unambiguous tasks after unrelated preceding prose was inserted', async () => {
    const f = fixture('Inserted\n' + original); const result = await f.writer.reorderSubtask(f.move);
    expect(result.id).toBe('Tasks.md:5'); expect(f.content.startsWith('Inserted\n# Before')).toBe(true);
  });
  it('refuses an added sibling and leaves the note unchanged', async () => {
    const changed = original.replace('\t- [x] B', '\t- [ ] New\n\t- [x] B'); const f = fixture(changed);
    await expect(f.writer.reorderSubtask(f.move)).rejects.toThrow(); expect(f.content).toBe(changed);
  });
  it('refuses ambiguous duplicate snapshots after a note changes', async () => {
    const f = fixture(original + 'Edited\n'); f.move.siblings[0] = { ...f.move.siblings[0]!, twins: 1, duplicateSource: original };
    await expect(f.writer.reorderSubtask(f.move)).rejects.toThrow();
  });
  it('does not create an Undo entry for a no-op', async () => {
    const f = fixture(); f.move.beforeId = f.move.siblings[1]!.id;
    expect((await f.writer.reorderSubtask(f.move)).action).toBeNull(); expect(f.content).toBe(original);
  });
});
