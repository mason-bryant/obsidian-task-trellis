import { describe, expect, it } from 'vitest';
import { boardFoldersElsewhere, looksLikeBoard } from '../src/core/boardFolders.ts';

const board = { slug: 'house', columns: ['Backlog', 'Doing', 'Done'] };

describe('board notes outside the boards folder', () => {
  it('know a board by the slug and columns Task Trellis writes', () => {
    expect(looksLikeBoard(board)).toBe(true);
    expect(looksLikeBoard({ slug: 'house' })).toBe(false);
    expect(looksLikeBoard({ columns: ['Backlog'] })).toBe(false);
    expect(looksLikeBoard({ slug: ' ', columns: ['Backlog'] })).toBe(false);
    expect(looksLikeBoard({ slug: 'house', columns: [] })).toBe(false);
    expect(looksLikeBoard({ 'task-trellis-example': 'house' })).toBe(false);
    expect(looksLikeBoard(undefined)).toBe(false);
    expect(looksLikeBoard([board])).toBe(false);
  });

  it('are counted by folder, the most first, leaving out the boards folder and the top of the vault', () => {
    const notes = [
      { path: 'Work/Boards/Clients.md', frontmatter: board },
      { path: 'Work/Boards/Hiring.md', frontmatter: board },
      { path: 'Home/House.md', frontmatter: board },
      { path: 'Task Trellis/Old.md', frontmatter: board },
      { path: 'Task Trellis/Archive/Older.md', frontmatter: board },
      { path: 'Loose board.md', frontmatter: board },
      { path: 'Work/Notes.md', frontmatter: { tags: ['work'] } },
      { path: 'Work/Boards/Picture.png', frontmatter: board },
    ];
    expect(boardFoldersElsewhere(notes, 'Task Trellis')).toEqual([{ folder: 'Work/Boards', count: 2 }, { folder: 'Home', count: 1 }]);
    // Equal counts go by name.
    expect(boardFoldersElsewhere(notes, 'Work/Boards')).toEqual([{ folder: 'Home', count: 1 }, { folder: 'Task Trellis', count: 1 }, { folder: 'Task Trellis/Archive', count: 1 }]);
    expect(boardFoldersElsewhere([], 'Task Trellis')).toEqual([]);
  });
});
