import { expect, it, vi } from 'vitest';
import { BoardRegistry } from '../src/obsidian/BoardRegistry.ts';
import { TFile } from './mocks/obsidian.ts';
import type TaskTrellisPlugin from '../main.ts';

function setup(boards: Record<string, Record<string, unknown>>) {
  const notes = new Map(Object.entries(boards));
  const commands = new Map<string, { id: string; name: string; callback(): void }>();
  const plugin = {
    settings: { boardsFolder: 'Task Trellis' },
    app: {
      vault: { getMarkdownFiles: () => [...notes.keys()].map((path) => new TFile(path)) },
      metadataCache: { getFileCache: (file: TFile) => ({ frontmatter: notes.get(file.path) }) },
    },
    addCommand: vi.fn((command: { id: string; name: string; callback(): void }) => { commands.set(command.id, command); }),
    removeCommand: vi.fn((id: string) => { commands.delete(id); }),
    openBoard: vi.fn(),
    quickAdd: { addToColumn: vi.fn() },
  } as unknown as TaskTrellisPlugin;
  const registry = new BoardRegistry(plugin);
  registry.syncCommands();
  const names = () => [...commands.values()].map((c) => `${c.id} = ${c.name}`).sort();
  return { notes, commands, plugin, registry, names };
}

it('adds an Add task to ‹board›: ‹column› command for each column but Done, named for the board and column', () => {
  const ui = setup({ 'Task Trellis/House.md': { slug: 'house', columns: ['Backlog', 'Doing', 'Done'], 'done-column': 'Done' } });
  expect(ui.names()).toEqual([
    'add-task-house--backlog = Add task to House: Backlog',
    'add-task-house--doing = Add task to House: Doing',
    'open-board-house = Open board: House',
  ]);
  ui.commands.get('add-task-house--doing')!.callback();
  expect(ui.plugin.quickAdd.addToColumn).toHaveBeenCalledWith(expect.objectContaining({ slug: 'house' }), 'doing', 'House');
});

it('keeps each board’s ids apart, and follows renamed boards and columns', () => {
  const ui = setup({
    'Task Trellis/A B.md': { slug: 'a-b', columns: ['C', 'Done'] },
    'Task Trellis/A.md': { slug: 'a', columns: ['B C', 'Done'] },
  });
  expect(ui.names().filter((n) => n.startsWith('add-task'))).toEqual([
    'add-task-a--b-c = Add task to A: B C',
    'add-task-a-b--c = Add task to A B: C',
  ]);

  ui.notes.set('Task Trellis/A.md', { slug: 'a', columns: ['Later', 'Done'] });
  ui.registry.syncCommands();
  expect(ui.commands.has('add-task-a--b-c')).toBe(false);
  expect(ui.commands.get('add-task-a--later')!.name).toBe('Add task to A: Later');

  ui.notes.delete('Task Trellis/A B.md');
  ui.registry.syncCommands();
  expect(ui.names()).toEqual(['add-task-a--later = Add task to A: Later', 'open-board-a = Open board: A']);
});

it('does nothing when the column was removed since the command was registered', () => {
  const ui = setup({ 'Task Trellis/House.md': { slug: 'house', columns: ['Backlog', 'Doing', 'Done'] } });
  const doing = ui.commands.get('add-task-house--doing')!;
  ui.notes.set('Task Trellis/House.md', { slug: 'house', columns: ['Backlog', 'Done'] });
  doing.callback();
  expect(ui.plugin.quickAdd.addToColumn).not.toHaveBeenCalled();
});
