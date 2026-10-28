import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { Events, TFile, TFolder, notices } from './mocks/obsidian.ts';
import { CliCommands } from '../src/obsidian/CliCommands.ts';
import { BoardRegistry } from '../src/obsidian/BoardRegistry.ts';
import { QuickAdd } from '../src/obsidian/QuickAdd.ts';
import { TaskIndex } from '../src/obsidian/TaskIndex.ts';
import { TaskWriter } from '../src/obsidian/TaskWriter.ts';
import { indentWidth } from '../src/core/subtasks.ts';
import type TaskTrellisPlugin from '../main.ts';

const HOME = {
  slug: 'home', columns: ['Backlog', 'Doing', 'Done'], 'done-column': 'Done',
  labels: [{ id: '1', name: 'Urgent', color: '#e5484d' }, { id: '2', name: 'Paint kitchen', color: '#3e9b4f' }],
  'new-tasks': 'note', 'new-tasks-note': 'Inbox.md', 'new-tasks-heading': 'Tasks',
};

const INBOX = [
  '# Inbox', '', '## Tasks',
  '- [ ] Call roofer 📅 2026-10-28 #tt/home/doing/100',
  '- [ ] Buy filters #tt/home/backlog #tt/home/label/1',
  '\t- [ ] Check size',
  '- [ ] Fix gate #tt/home/backlog',
  '', '## Other', 'Keep this', '',
].join('\n');

/** Obsidian's list items: a line's parent is the nearest earlier item indented less. */
function listItems(content: string) {
  const seen: { line: number; indent: number }[] = [];
  return content.split('\n').flatMap((text, line) => {
    const m = /^\s*(?:[-*+]|\d+[.)])\s+(?:\[(.)\])?/.exec(text);
    if (!m) return [];
    const indent = indentWidth(text);
    const parent = [...seen].reverse().find((item) => item.indent < indent)?.line ?? -1;
    seen.push({ line, indent });
    const position = { start: { line, col: 0, offset: 0 }, end: { line, col: 0, offset: 0 } };
    return [{ position, parent, ...(m[1] !== undefined ? { task: m[1] } : {}) }];
  });
}

function fixture(files: Record<string, string> = {}, frontmatter: Record<string, Record<string, unknown>> = {}) {
  const notes: Record<string, string> = { 'Boards/Home.md': '', 'Inbox.md': INBOX, 'Projects/Kitchen.md': '# Kitchen\n\n## Notes\nMeasure the walls\n', ...files };
  const fm: Record<string, Record<string, unknown>> = { 'Boards/Home.md': HOME, ...frontmatter };
  const tfiles = new Map<string, TFile>();
  const fileFor = (path: string) => {
    if (!tfiles.has(path)) tfiles.set(path, new TFile(path));
    return tfiles.get(path)!;
  };
  const folders = () => new Set(Object.keys(notes).flatMap((p) => p.split('/').slice(0, -1).map((_, i, parts) => parts.slice(0, i + 1).join('/'))));
  const cacheFor = (path: string) => path in notes ? { listItems: listItems(notes[path]!), ...(fm[path] ? { frontmatter: fm[path] } : {}) } : null;
  const metadataCache = Object.assign(new Events(), {
    getFileCache: (file: TFile) => cacheFor(file.path),
    getCache: (path: string) => cacheFor(path),
  });
  const vault = Object.assign(new Events(), {
    configDir: '.obsidian',
    adapter: { read: async () => { throw new Error('no Tasks settings'); } },
    getMarkdownFiles: () => Object.keys(notes).filter((p) => p.endsWith('.md')).map(fileFor),
    getFileByPath: (path: string) => path in notes ? fileFor(path) : null,
    getAbstractFileByPath: (path: string) => path in notes ? fileFor(path) : folders().has(path) ? new TFolder(path) : null,
    cachedRead: async (file: TFile) => notes[file.path]!,
    read: async (file: TFile) => notes[file.path]!,
    // Like Obsidian, re-read a note after it changes, a moment later.
    process: async (file: TFile, transform: (content: string) => string) => {
      const before = notes[file.path];
      notes[file.path] = transform(notes[file.path]!);
      if (notes[file.path] !== before) setTimeout(() => metadataCache.trigger('changed', file), 5);
      return notes[file.path];
    },
    create: async (path: string, data: string) => { notes[path] = data; return fileFor(path); },
    createFolder: async () => undefined,
  });
  const app = { vault, metadataCache, workspace: new Events(), plugins: { enabledPlugins: new Set<string>(), plugins: {} } } as unknown as App;
  const cleanups: (() => void)[] = [];
  const isExcludedFromIndex = (path: string) => path.startsWith('Boards/');
  const plugin = {
    app,
    settings: { boardsFolder: 'Boards', excludedFolders: [], newTaskKind: 'note', newTaskNote: 'Inbox.md', newTaskHeading: '' },
    register: (cleanup: () => void) => cleanups.push(cleanup),
    registerEvent: () => undefined,
    isExcludedFromIndex,
    indexed: Promise.resolve(),
  } as unknown as TaskTrellisPlugin;
  plugin.index = new TaskIndex(app, isExcludedFromIndex);
  plugin.writer = new TaskWriter(app);
  plugin.boards = new BoardRegistry(plugin);
  plugin.quickAdd = new QuickAdd(plugin);
  const cli = new CliCommands(plugin);
  const run = async (command: string, params: Record<string, string> = {}) => {
    await plugin.index.rebuild();
    return JSON.parse(await cli.run(`task-trellis:${command}`, params)) as Record<string, any>;
  };
  return { notes, cli, run, plugin, unload: () => cleanups.forEach((cleanup) => cleanup()) };
}

beforeEach(() => {
  notices.length = 0;
  vi.stubGlobal('window', globalThis);
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-27T12:00:00') });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('task-trellis:boards and show', () => {
  it('lists each board with the ids the other commands take', async () => {
    const { run } = fixture();
    const result = await run('boards');
    expect(result.ok).toBe(true);
    expect(result.boards).toHaveLength(1);
    expect(result.boards[0]).toMatchObject({
      slug: 'home', name: 'Home', path: 'Boards/Home.md', doneColumn: 'done', undatedColumn: null,
      columns: [{ id: 'backlog', label: 'Backlog' }, { id: 'doing', label: 'Doing' }, { id: 'done', label: 'Done' }],
      labels: [{ id: '1', name: 'Urgent', color: '#e5484d' }, { id: '2', name: 'Paint kitchen', color: '#3e9b4f' }],
      newTasks: { kind: 'note', note: 'Inbox.md', heading: 'Tasks' },
    });
    expect(result.boards[0].quickFilters.map((f: { id: string }) => f.id)).toContain('overdue');
  });

  it('shows cards in board order with their row, column, labels and subtasks', async () => {
    const { run } = fixture();
    const result = await run('show', { board: 'home' });
    expect(result.board).toEqual({ slug: 'home', name: 'Home', path: 'Boards/Home.md' });
    expect(result.cards.map((c: { text: string; row: string; column: string }) => [c.text, c.row, c.column])).toEqual([
      ['Buy filters', 'none', 'backlog'], ['Fix gate', 'none', 'backlog'], ['Call roofer', 'now', 'doing'],
    ]);
    const filters = result.cards[0];
    expect(filters).toMatchObject({ id: 'Inbox.md:4', line: 4, raw: '- [ ] Buy filters #tt/home/backlog #tt/home/label/1', labels: [{ id: '1', name: 'Urgent' }], tags: [] });
    expect(filters.subtasks).toMatchObject([{ id: 'Inbox.md:5', text: 'Check size', subtasks: [] }]);
    expect((await run('show', { board: 'Home', column: 'Doing' })).cards).toHaveLength(1);
    expect((await run('show', { board: 'Boards/Home.md', row: 'now' })).cards).toHaveLength(1);
  });

  it('answers errors as JSON, or as text when asked', async () => {
    const { cli, run } = fixture();
    expect(await run('show', { board: 'work' })).toEqual({ ok: false, error: 'Unknown or ambiguous board: work. Use its slug or full path from task-trellis:boards.' });
    expect(await cli.run('task-trellis:show', { board: 'work', format: 'text' })).toBe('Error: Unknown or ambiguous board: work. Use its slug or full path from task-trellis:boards.');
    expect(await cli.run('task-trellis:boards', { format: 'yaml' })).toContain('format must be json or text.');
    const text = await cli.run('task-trellis:boards', { format: 'text' });
    expect(text).toContain('boards:\n  - slug: home\n    name: Home');
  });

  it('lists its commands', async () => {
    const { cli } = fixture();
    const result = JSON.parse(await cli.run('task-trellis', {}));
    expect(result.commands.map((c: { command: string }) => c.command)).toEqual([
      'task-trellis:boards', 'task-trellis:show', 'task-trellis:task', 'task-trellis:add', 'task-trellis:move',
      'task-trellis:set', 'task-trellis:complete', 'task-trellis:bulk', 'task-trellis:undo',
    ]);
  });
});

describe('task-trellis:task', () => {
  it('shows the task, its subtasks and where it is on each board', async () => {
    const { run } = fixture();
    expect(await run('task', { id: 'Inbox.md:4' })).toMatchObject({
      task: { text: 'Buy filters', parentId: null, subtasks: [{ text: 'Check size' }] },
      boards: [{ slug: 'home', column: 'backlog', row: 'none', labels: [{ id: '1', name: 'Urgent' }] }],
    });
    expect(await run('task', { id: 'Inbox.md:5' })).toMatchObject({
      task: { text: 'Check size', parentId: 'Inbox.md:4' }, boards: [{ slug: 'home', subtaskOf: 'Inbox.md:4' }],
    });
  });
});

describe('task-trellis:add', () => {
  it('adds a task with subtasks under a heading of a chosen note, in one write', async () => {
    const { run, notes } = fixture();
    const result = await run('add', {
      board: 'home', note: 'Projects/Kitchen.md', heading: '## To do', text: 'Paint kitchen', due: '2026-11-08', labels: 'Paint kitchen',
      subtasks: '["Buy paint","Tape the edges","Paint the walls"]',
    });
    expect(result.ok).toBe(true);
    expect(notes['Projects/Kitchen.md']).toBe([
      '# Kitchen', '', '## Notes', 'Measure the walls', '', '## To do',
      '- [ ] Paint kitchen 📅 2026-11-08 #tt/home/label/2 #tt/home/backlog',
      '\t- [ ] Buy paint', '\t- [ ] Tape the edges', '\t- [ ] Paint the walls', '',
    ].join('\n'));
    expect(result.added.map((a: { id: string }) => a.id)).toEqual(['Projects/Kitchen.md:6', 'Projects/Kitchen.md:7', 'Projects/Kitchen.md:8', 'Projects/Kitchen.md:9']);
    const shown = await run('show', { board: 'home', column: 'backlog' });
    expect(shown.cards.find((c: { id: string }) => c.id === 'Projects/Kitchen.md:6')).toMatchObject({
      row: expect.stringMatching(/^week-/), labels: [{ id: '2', name: 'Paint kitchen' }],
      subtasks: [{ text: 'Buy paint' }, { text: 'Tape the edges' }, { text: 'Paint the walls' }],
    });
  });

  it('uses the board’s new-task note and heading by default', async () => {
    const { run, notes } = fixture();
    const result = await run('add', { board: 'home', text: 'Order mulch', column: 'Doing', priority: 'high' });
    expect(result.added).toEqual([{ id: 'Inbox.md:7', raw: '- [ ] Order mulch ⏫ #tt/home/doing' }]);
    expect(notes['Inbox.md']).toContain('- [ ] Fix gate #tt/home/backlog\n- [ ] Order mulch ⏫ #tt/home/doing\n\n## Other');
  });

  it('refuses a note whose tasks the board’s filters hide, and writes nothing', async () => {
    const { run, notes } = fixture({}, { 'Boards/Home.md': { ...HOME, 'include-folders': ['Projects'] } });
    const before = notes['Inbox.md'];
    const result = await run('add', { board: 'home', note: 'Inbox.md', text: 'Hidden task' });
    expect(result).toEqual({ ok: false, error: 'The board’s filters would hide this task. Adjust its text/tags or new-task destination; no task was added.' });
    expect(notes['Inbox.md']).toBe(before);
  });

  it('adds under an existing task, with subtasks of its own', async () => {
    const { run, notes } = fixture();
    const result = await run('add', { parent: 'Inbox.md:3', text: 'Get quotes', due: '2026-10-30', subtasks: '["Acme","Bolt"]' });
    expect(result.added.map((a: { raw: string }) => a.raw)).toEqual(['\t- [ ] Get quotes 📅 2026-10-30', '\t\t- [ ] Acme', '\t\t- [ ] Bolt']);
    expect(notes['Inbox.md']).toContain('- [ ] Call roofer 📅 2026-10-28 #tt/home/doing/100\n\t- [ ] Get quotes 📅 2026-10-30\n\t\t- [ ] Acme\n\t\t- [ ] Bolt\n- [ ] Buy filters');
    expect(await run('add', { parent: 'Inbox.md:3', board: 'home', text: 'x' })).toMatchObject({ ok: false, error: expect.stringContaining("board can't be used with parent") });
  });

  it('writes nothing for a dry run, and adds a request only once', async () => {
    const { run, notes } = fixture();
    const before = notes['Inbox.md'];
    expect(await run('add', { board: 'home', text: 'Order mulch', 'dry-run': 'true' })).toEqual({
      ok: true, dryRun: true, destination: { kind: 'note', note: 'Inbox.md', heading: 'Tasks' }, lines: ['- [ ] Order mulch #tt/home/backlog'],
    });
    expect(notes['Inbox.md']).toBe(before);
    const first = await run('add', { board: 'home', text: 'Order mulch', 'request-id': 'agent-1' });
    const second = await run('add', { board: 'home', text: 'Order mulch', 'request-id': 'agent-1' });
    expect(second).toMatchObject({ duplicate: true, added: first.added });
    expect(notes['Inbox.md']!.match(/Order mulch/g)).toHaveLength(1);
  });

  it('refuses Done and unknown columns', async () => {
    const { run } = fixture();
    expect((await run('add', { board: 'home', text: 'x', column: 'done' })).error).toBe('New tasks must use an open workflow column, not Done.');
    expect((await run('add', { board: 'home', text: 'x', column: 'later' })).error).toContain('Unknown column: later');
  });
});

describe('task-trellis:move', () => {
  it('moves a card to a row, column and position, renumbering the cell as a drag would', async () => {
    const { run, notes } = fixture();
    const result = await run('move', { board: 'home', id: 'Inbox.md:3', column: 'backlog', row: 'none', position: 'before:Inbox.md:6' });
    // Unnumbered cards already sort after numbered ones, so Fix gate needs no number.
    expect(result.changed.map((c: { id: string }) => c.id)).toEqual(['Inbox.md:3', 'Inbox.md:4']);
    const lines = notes['Inbox.md']!.split('\n');
    // The No due date row has no date, so the card's date went.
    expect(lines[3]).toBe('- [ ] Call roofer #tt/home/backlog/200');
    expect(lines[4]).toBe('- [ ] Buy filters #tt/home/label/1 #tt/home/backlog/100');
    expect(lines[6]).toBe('- [ ] Fix gate #tt/home/backlog');
    const order = (await run('show', { board: 'home', row: 'none', column: 'backlog' })).cards.map((c: { text: string }) => c.text);
    expect(order).toEqual(['Buy filters', 'Call roofer', 'Fix gate']);
  });

  it('keeps the row, and so the date, when only the column changes', async () => {
    const { run, notes } = fixture();
    await run('move', { board: 'home', id: 'Inbox.md:3', column: 'backlog' });
    expect(notes['Inbox.md']!.split('\n')[3]).toBe('- [ ] Call roofer 📅 2026-10-28 #tt/home/backlog/100');
    expect((await run('move', { board: 'home', id: 'Inbox.md:3', position: 'before:Inbox.md:6' })).error)
      .toBe('Inbox.md:6 is not in the target cell; position must name a card there.');
  });

  it('completes a card moved to Done', async () => {
    const { run, notes } = fixture();
    await run('move', { board: 'home', id: 'Inbox.md:6', column: 'done' });
    expect(notes['Inbox.md']!.split('\n')[6]).toBe('- [x] Fix gate ✅ 2026-10-27 #tt/home/done');
  });

  it('refuses subtasks and stale lines', async () => {
    const { run } = fixture();
    expect((await run('move', { board: 'home', id: 'Inbox.md:5', column: 'doing' })).error).toBe('That is a subtask; it moves with its card.');
    expect((await run('move', { board: 'home', id: 'Inbox.md:3', expect: '- [ ] Something else', column: 'backlog' })).error).toContain('no longer reads as expected');
  });
});

describe('task-trellis:set and complete', () => {
  it('changes due date, priority, text and labels in one write', async () => {
    const { run, notes } = fixture();
    const result = await run('set', {
      id: 'Inbox.md:4', due: '2026-11-01', priority: 'high', text: 'Buy furnace filters', board: 'home', 'labels-add': '2', 'labels-remove': 'Urgent',
    });
    expect(result.changed).toEqual([{ id: 'Inbox.md:4', raw: '- [ ] Buy furnace filters 📅 2026-11-01 ⏫ #tt/home/label/2 #tt/home/backlog' }]);
    expect(notes['Inbox.md']!.split('\n')[4]).toBe(result.changed[0].raw);
  });

  it('follows a task whose line moved when expect still matches it uniquely', async () => {
    const { run, notes } = fixture();
    const raw = '- [ ] Fix gate #tt/home/backlog';
    notes['Inbox.md'] = notes['Inbox.md']!.replace('## Tasks', '## Tasks\nA new first line');
    const result = await run('set', { id: 'Inbox.md:6', expect: raw, due: 'none', priority: 'low' });
    expect(result.changed).toEqual([{ id: 'Inbox.md:7', raw: '- [ ] Fix gate 🔽 #tt/home/backlog' }]);
  });

  it('needs a board for labels and something to change', async () => {
    const { run } = fixture();
    expect((await run('set', { id: 'Inbox.md:4', labels: '' })).error).toBe('Specify board: labels belong to a board.');
    expect((await run('set', { id: 'Inbox.md:5', board: 'home', labels: '1' })).error).toBe('Labels go on cards, not subtasks.');
    expect((await run('set', { id: 'Inbox.md:4' })).error).toBe('Nothing to change: specify due, priority, text or labels.');
  });

  it('completes and reopens a task', async () => {
    const { run, notes } = fixture();
    expect((await run('complete', { id: 'Inbox.md:5', 'dry-run': 'true' })).changes).toEqual([{ id: 'Inbox.md:5', raw: '\t- [x] Check size ✅ 2026-10-27' }]);
    expect(notes['Inbox.md']).toContain('\t- [ ] Check size');
    await run('complete', { id: 'Inbox.md:5' });
    expect(notes['Inbox.md']).toContain('\t- [x] Check size ✅ 2026-10-27');
    expect((await run('complete', { id: 'Inbox.md:5' })).message).toBe('The task is already complete.');
    await run('complete', { id: 'Inbox.md:5', done: 'false' });
    expect(notes['Inbox.md']).toContain('\t- [ ] Check size\n');
  });
});

describe('task-trellis:bulk and undo', () => {
  it('applies one change to the selected cards, then undoes it', async () => {
    const { run, notes } = fixture();
    const before = notes['Inbox.md'];
    const result = await run('bulk', { board: 'home', column: 'backlog', 'labels-add': '2' });
    expect(result.changed.map((c: { raw: string }) => c.raw)).toEqual([
      '- [ ] Buy filters #tt/home/label/1 #tt/home/label/2 #tt/home/backlog',
      '- [ ] Fix gate #tt/home/label/2 #tt/home/backlog',
    ]);
    expect(await run('undo')).toEqual({ ok: true, undone: true, paths: ['Inbox.md'] });
    expect(notes['Inbox.md']).toBe(before);
    expect((await run('undo')).error).toContain('Nothing to undo');
  });

  it('selects by id and needs exactly one change', async () => {
    const { run, notes } = fixture();
    await run('bulk', { board: 'home', ids: 'Inbox.md:6', due: '2026-11-02' });
    expect(notes['Inbox.md']!.split('\n')[6]).toBe('- [ ] Fix gate 📅 2026-11-02 #tt/home/backlog');
    expect((await run('bulk', { board: 'home', due: '2026-11-02' })).error).toBe('Choose the cards with ids, filter or column.');
    expect((await run('bulk', { board: 'home', column: 'backlog', due: 'none', priority: 'low' })).error).toContain('exactly one change');
    expect((await run('bulk', { board: 'home', ids: 'Inbox.md:5', priority: 'low' })).error).toContain('Not cards on this board');
  });

  it('undoes an add, and leaves a note alone that changed since', async () => {
    const { run, notes } = fixture();
    const before = notes['Projects/Kitchen.md'];
    await run('add', { board: 'home', note: 'Projects/Kitchen.md', text: 'Paint', subtasks: '["Buy paint"]' });
    expect((await run('undo')).undone).toBe(true);
    expect(notes['Projects/Kitchen.md']).toBe(before);

    await run('add', { board: 'home', note: 'Projects/Kitchen.md', text: 'Paint' });
    notes['Projects/Kitchen.md'] += 'Edited by hand\n';
    expect(await run('undo')).toMatchObject({ undone: false, warning: 'Some notes changed after that change and were not undone.' });
    expect(notes['Projects/Kitchen.md']).toContain('Edited by hand');
  });
});

describe('registration', () => {
  it('registers every command without format choices Obsidian would read as other options', () => {
    const { cli, plugin } = fixture();
    const registered = new Map<string, Record<string, { value?: string }>>();
    Object.assign(plugin, { registerCliHandler: (id: string, _description: string, flags: Record<string, { value?: string }>) => registered.set(id, flags) });
    cli.register();
    expect([...registered.keys()]).toHaveLength(10);
    for (const flags of registered.values()) {
      // Obsidian moves an option named like one of `format`'s `|` choices into `format`.
      const choices = flags.format?.value?.split('|') ?? [];
      expect(choices.filter((choice) => choice in flags || ['text', 'json'].includes(choice))).toEqual([]);
    }
    expect(registered.get('task-trellis:add')?.text).toBeDefined();
  });
});

describe('settling', () => {
  it('waits for Obsidian to re-read a written note before answering, so the next command sees it', async () => {
    const { cli, plugin, notes } = fixture();
    await plugin.index.rebuild();
    const changed = vi.fn();
    plugin.app.metadataCache.on('changed', changed);
    await cli.run('task-trellis:add', { board: 'home', note: 'Projects/Kitchen.md', text: 'Paint' });
    expect(changed).toHaveBeenCalledTimes(1);
    // No rebuild: the index already has the new card.
    const shown = JSON.parse(await cli.run('task-trellis:show', { board: 'home', column: 'backlog' }));
    expect(shown.cards.map((c: { text: string }) => c.text)).toContain('Paint');
    expect(notes['Projects/Kitchen.md']).toContain('- [ ] Paint #tt/home/backlog');
  });

  it('answers after a timeout when Obsidian doesn’t re-read the note', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], now: new Date('2026-10-27T12:00:00') });
    const { cli, plugin } = fixture();
    await plugin.index.rebuild();
    plugin.app.metadataCache.trigger = () => undefined;
    const answer = cli.run('task-trellis:add', { board: 'home', text: 'Paint' });
    await vi.advanceTimersByTimeAsync(2000);
    expect(JSON.parse(await answer).ok).toBe(true);
  });
});

describe('ordering', () => {
  it('runs commands one at a time', async () => {
    const { cli, plugin, notes } = fixture();
    await plugin.index.rebuild();
    const results = await Promise.all([
      cli.run('task-trellis:add', { board: 'home', text: 'First' }),
      cli.run('task-trellis:add', { board: 'home', text: 'Second' }),
    ]);
    expect(results.map((r) => JSON.parse(r).ok)).toEqual([true, true]);
    expect(notes['Inbox.md']).toContain('- [ ] First #tt/home/backlog\n- [ ] Second #tt/home/backlog');
  });
});
