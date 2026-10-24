import { describe, expect, it, vi } from 'vitest';
import type { Workspace, WorkspaceLeaf } from 'obsidian';
import { BoardNavigation } from '../src/obsidian/BoardNavigation.ts';

function leaf(path: string, type = 'task-trellis-board') {
  return {
    // No loaded BoardView: also exercises deferred tabs.
    getViewState: () => ({ type, state: { file: path } }),
    setViewState: vi.fn().mockResolvedValue(undefined),
    getContainer: () => ({ win: { focus } }),
  };
  function focus() {}
}
function setup(leaves: ReturnType<typeof leaf>[]) {
  const created = leaf('');
  const workspace = {
    iterateAllLeaves: (visit: (leaf: WorkspaceLeaf) => void) => leaves.forEach(l => visit(l as unknown as WorkspaceLeaf)),
    getLeaf: vi.fn(() => created),
    revealLeaf: vi.fn().mockResolvedValue(undefined),
    setActiveLeaf: vi.fn(),
  };
  return { workspace, created, navigation: new BoardNavigation(workspace as unknown as Workspace, 'task-trellis-board') };
}

describe('board navigation', () => {
  it('reveals an existing deferred board without creating a duplicate', async () => {
    const existing = leaf('Boards/House.md');
    const { workspace, navigation } = setup([leaf('Boards/Other.md'), existing]);
    await navigation.open('Boards/House.md');
    expect(workspace.getLeaf).not.toHaveBeenCalled();
    expect(workspace.revealLeaf).toHaveBeenCalledWith(existing);
    expect(workspace.setActiveLeaf).toHaveBeenCalledWith(existing, { focus: true });
  });

  it('focuses the owning window after revealing a board in another window', async () => {
    const existing = leaf('Boards/House.md');
    const focus = vi.fn();
    existing.getContainer = () => ({ win: { focus } });
    const { workspace, navigation } = setup([existing]);
    await navigation.open('Boards/House.md');
    expect(focus).toHaveBeenCalledOnce();
    expect(workspace.revealLeaf.mock.invocationCallOrder[0]).toBeLessThan(focus.mock.invocationCallOrder[0]!);
    expect(workspace.getLeaf).not.toHaveBeenCalled();
  });

  it('opens a new board tab when only the source note is open', async () => {
    const { created, workspace, navigation } = setup([leaf('Boards/House.md', 'markdown')]);
    await navigation.open('Boards/House.md');
    expect(workspace.getLeaf).toHaveBeenCalledWith('tab');
    expect(created.setViewState).toHaveBeenCalledWith({ type: 'task-trellis-board', state: { file: 'Boards/House.md' }, active: true });
    expect(workspace.revealLeaf).toHaveBeenCalledWith(created);
  });

  it('coalesces rapid repeated clicks while the board is loading', async () => {
    const { workspace, created, navigation } = setup([]);
    let finish!: () => void;
    created.setViewState.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    const first = navigation.open('Boards/House.md');
    const second = navigation.open('Boards/House.md');
    expect(first).toBe(second);
    expect(workspace.getLeaf).toHaveBeenCalledOnce();
    finish();
    await Promise.all([first, second]);
  });

  it('allows another attempt after an open fails', async () => {
    const { created, navigation } = setup([]);
    created.setViewState.mockRejectedValueOnce(new Error('failed'));
    await expect(navigation.open('Boards/House.md')).rejects.toThrow('failed');
    await navigation.open('Boards/House.md');
    expect(created.setViewState).toHaveBeenCalledTimes(2);
  });
});
