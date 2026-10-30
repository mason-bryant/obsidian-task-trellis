import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuickAdd } from '../src/obsidian/QuickAdd.ts';
import { buildBoard, type BoardTask } from '../src/core/board.ts';
import { parseTaskLine } from '../src/core/taskLine.ts';
import { TaskWriter } from '../src/obsidian/TaskWriter.ts';
import { parseBoardConfig } from '../src/core/boardConfig.ts';
import { Events, notices, TFile, TFolder, Workspace } from './mocks/obsidian.ts';
import type TaskTrellisPlugin from '../main.ts';

beforeEach(() => { notices.length = 0; });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it('cancels Templater recovery when disabled without writing the task again', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('window', globalThis);
  const file = new TFile('Inbox.md');
  const workspace = new Workspace();
  const offref = vi.spyOn(workspace, 'offref');
  const read = vi.fn(async () => '');
  const process = vi.fn(async () => undefined);
  let unload = () => {};
  const plugin = {
    register: (cleanup: () => void) => { unload = cleanup; },
    app: {
      workspace,
      plugins: { enabledPlugins: new Set(['templater-obsidian']) },
      vault: { configDir: '.obsidian', adapter: { read: async () => '{}' },
        getFileByPath: () => null, create: async () => file, process, read },
    },
    settings: { newTaskKind: 'note', newTaskNote: 'Inbox.md', newTaskHeading: '' },
  } as unknown as TaskTrellisPlugin;
  const config = parseBoardConfig('House', {}).config;
  await new QuickAdd(plugin).addFromBoard(buildBoard([], config, '2026-10-23', () => undefined),
    { rowId: 'now', columnId: 'backlog' }, 'New task', false);
  expect(process).toHaveBeenCalledTimes(1);
  unload();
  workspace.trigger('templater:overwrite-file', { file });
  await vi.runAllTimersAsync();
  expect(offref).toHaveBeenCalledTimes(2);
  expect(read).not.toHaveBeenCalled();
  expect(process).toHaveBeenCalledTimes(1);
});

describe('new-task filter feedback', () => {
  it.each([
    { rules: { 'include-tags': ['home'] }, pageTags: ['Home/Kitchen'], siblingTags: [], text: 'Call supplier', hidden: false },
    { rules: { 'include-tags': ['home'] }, pageTags: [], siblingTags: ['#home'], text: 'Call supplier', hidden: true },
    { rules: { 'exclude-tags': ['private'] }, pageTags: [], siblingTags: ['#private'], text: 'Call supplier', hidden: false },
    { rules: { 'exclude-tags': ['archive'] }, pageTags: ['Archive/2026'], siblingTags: [], text: 'Call supplier', hidden: true },
    { rules: { 'include-tags': ['home'] }, pageTags: [], siblingTags: [], text: 'Call supplier #home', hidden: false },
  ])('uses page and own-task tags for feedback: $text / $rules', async ({ rules, pageTags, siblingTags, text, hidden }) => {
    const file = new TFile('Inbox.md');
    let content = '';
    const position = { start: { line: 0 }, end: { line: 0 } };
    const plugin = {
      register: () => undefined,
      app: {
        workspace: new Workspace(),
        vault: { configDir: '.obsidian', getFileByPath: () => file,
          adapter: { read: async () => '{}' }, process: async (_file: TFile, transform: (text: string) => string) => { content = transform(content); } },
        metadataCache: { getFileCache: () => ({ frontmatter: { tags: pageTags },
          tags: siblingTags.map((tag) => ({ tag, position })), listItems: [{ task: ' ', position }] }) },
      },
      settings: { newTaskKind: 'note', newTaskNote: 'Inbox.md', newTaskHeading: '' },
    } as unknown as TaskTrellisPlugin;
    const c = parseBoardConfig('House', rules).config;
    await new QuickAdd(plugin).addFromBoard(buildBoard([], c, '2026-10-23', () => undefined), { rowId: 'now', columnId: 'backlog' }, text, false);
    expect(content).toContain(text);
    expect(notices.some((notice) => notice.includes('filters hide'))).toBe(hidden);
  });

  it.each([['archived', true], ['active', false], [undefined, false]])('checks property exclusions for status %s', async (status, hidden) => {
    const file = new TFile('Inbox.md');
    let content = '';
    const plugin = {
      register: () => undefined,
      app: {
        workspace: new Workspace(),
        vault: { configDir: '.obsidian', getFileByPath: () => file,
          adapter: { read: async () => '{}' }, process: async (_file: TFile, transform: (text: string) => string) => { content = transform(content); } },
        metadataCache: { getFileCache: () => ({ frontmatter: status === undefined ? {} : { status } }) },
      },
      settings: { newTaskKind: 'note', newTaskNote: 'Inbox.md', newTaskHeading: '' },
    } as unknown as TaskTrellisPlugin;
    const c = parseBoardConfig('House', { 'exclude-properties': ['status: archived'] }).config;
    await new QuickAdd(plugin).addFromBoard(buildBoard([], c, '2026-10-23', () => undefined), { rowId: 'now', columnId: 'backlog' }, 'Call supplier', false);
    expect(content).toContain('Call supplier');
    expect(notices.some((notice) => notice.includes('filters hide'))).toBe(hidden);
  });
});


describe('new cards appear first', () => {
  it.each([undefined, 0, 1, 100])('prepends repeatedly ahead of a first sort of %s, preserving other task fields', async (sort) => {
    const existing = `- [ ] Existing ⏫ 📅 2026-10-25 #tt/house/label/l123abc #tt/other/doing/9${sort === undefined ? '' : ` #tt/house/backlog/${sort}`} ^keep`;
    const files = new Map([['Existing.md', existing], ['Inbox.md', '## Tasks']]);
    const refs = new Map([...files.keys()].map((path) => [path, new TFile(path)]));
    const plugin = {
      register: () => undefined,
      app: {
        workspace: new Workspace(),
        vault: { configDir: '.obsidian', getFileByPath: (path: string) => refs.get(path),
          getAbstractFileByPath: (path: string) => refs.get(path),
          adapter: { read: async () => '{}' },
          process: async (file: TFile, transform: (text: string) => string) => { files.set(file.path, transform(files.get(file.path)!)); } },
        metadataCache: { getFileCache: () => ({}) },
      },
      settings: { newTaskKind: 'note', newTaskNote: 'Inbox.md', newTaskHeading: '## Tasks' },
    } as unknown as TaskTrellisPlugin;
    plugin.writer = new TaskWriter(plugin.app);
    const config = parseBoardConfig('House', {}).config;
    const model = () => {
      const tasks: BoardTask[] = [];
      for (const [path, content] of files) content.split('\n').forEach((raw, line) => {
        const parsed = parseTaskLine(raw);
        if (parsed) tasks.push({ ...parsed, raw, path, line, id: `${path}:${line}` });
      });
      return buildBoard(tasks, config, '2026-10-25', () => undefined);
    };
    const quick = new QuickAdd(plugin);
    for (let n = 0; n < 20; n++) {
      await quick.addFromBoard(model(), { rowId: 'now', columnId: 'backlog' }, `New ${n}`, false);
      expect(model().cells.now!.backlog!.map((task) => task.text)).toEqual([
        ...Array.from({ length: n + 1 }, (_, i) => `New ${n - i}`), 'Existing',
      ]);
    }
    const after = parseTaskLine(files.get('Existing.md')!)!;
    expect(after.dueDate).toBe('2026-10-25');
    expect(after.priority).toBe(parseTaskLine(existing)!.priority);
    expect(after.tags).toContain('tt/house/label/l123abc');
    expect(after.placements.other).toEqual({ column: 'doing', sort: 9 });
    expect(files.get('Existing.md')).toContain('^keep');
  });
});

it('reports a missing destination as failure without pretending the task was saved', async () => {
  const plugin = { register: () => {}, app: { workspace: new Workspace(), vault: { adapter: { read: async () => '{}' } } },
    settings: { newTaskKind: 'daily', newTaskHeading: '' } } as unknown as TaskTrellisPlugin;
  const config = parseBoardConfig('Review', {}).config;
  expect(await new QuickAdd(plugin).addFromBoard(buildBoard([], config, '2026-10-25', () => undefined), { rowId: 'now', columnId: 'backlog' }, 'Keep me', false)).toBe(false);
  expect(notices.at(-1)).toContain('Daily notes');
});

describe('Templater folder templates', () => {
  const TEMPLATE = '# Kitchen project\n\nProject note created from a template.\n\n## Tasks\n';

  /** A new note in `Tasks/`, which Templater fills from a folder template if it's still empty. */
  function fixture(options: { trigger?: boolean; legacy?: boolean; regex?: boolean; readable?: boolean } = {}) {
    vi.useFakeTimers();
    vi.stubGlobal('window', globalThis);
    const notes: Record<string, string> = {};
    const workspace = new Events();
    const templateFor = (folder: TFolder) => folder.path === 'Tasks' ? 'Templates/Project.md' : undefined;
    const trigger = options.trigger ?? true;
    const templater = options.legacy
      ? { settings: { trigger_on_file_creation: trigger, enable_folder_templates: true }, templater: { get_new_file_template_for_folder: templateFor } }
      : options.regex
        ? { settings: { trigger_on_file_creation_mode: 'regex' },
          templater: { get_new_file_template_for_file: (file: TFile) => /^Tasks\//.test(file.path) ? 'Templates/Project.md' : undefined } }
        : { settings: { trigger_on_file_creation_mode: 'folder' }, templater: { get_new_file_template_for_folder: templateFor } };
    let unload = () => {};
    const plugin = {
      register: (cleanup: () => void) => { unload = cleanup; },
      isExcludedFromIndex: () => false,
      app: {
        workspace,
        plugins: { enabledPlugins: new Set(['templater-obsidian']),
          plugins: options.readable === false ? {} : { 'templater-obsidian': templater } },
        loadLocalStorage: (key: string) => !options.legacy && key === 'templater-local-settings' ? { trigger_on_file_creation: trigger } : null,
        metadataCache: { getFileCache: () => null },
        vault: {
          configDir: '.obsidian', adapter: { read: async () => '{}' },
          getFileByPath: (path: string) => path in notes ? new TFile(path) : null,
          getAbstractFileByPath: (path: string) => new TFolder(path),
          create: async (path: string, data: string) => { notes[path] = data; return new TFile(path); },
          read: async (file: TFile) => notes[file.path]!,
          process: async (file: TFile, transform: (content: string) => string) => (notes[file.path] = transform(notes[file.path]!)),
        },
      },
      settings: { newTaskKind: 'note', newTaskNote: 'Tasks/Kitchen project.md', newTaskHeading: 'Tasks' },
    } as unknown as TaskTrellisPlugin;
    const quick = new QuickAdd(plugin);
    const config = parseBoardConfig('House', { slug: 'house' }).config;
    /** What Templater does ~300 ms after creation: fill the note, keeping what it already has. */
    const fill = (path: string) => {
      notes[path] = notes[path] + TEMPLATE;
      workspace.trigger('templater:new-note-from-template', { file: new TFile(path), content: notes[path] });
    };
    const add = (note: string) => quick.addLines(config, { kind: 'note', note, heading: 'Tasks' }, ['- [ ] Paint kitchen', '\t- [ ] Buy paint']);
    return { notes, fill, add, quick, config, unload: () => unload() };
  }

  it.each([
    { templates: 'folder templates', options: {} },
    { templates: 'file-name templates', options: { regex: true } },
    { templates: 'an older Templater’s folder templates', options: { legacy: true } },
  ])('adds under the template’s heading once Templater has filled the new note, with $templates', async ({ options }) => {
    const f = fixture(options);
    const pending = f.add('Tasks/Kitchen project');
    await vi.advanceTimersByTimeAsync(300);
    // Still empty when Templater looks, so it applies the template.
    expect(f.notes['Tasks/Kitchen project.md']).toBe('');
    f.fill('Tasks/Kitchen project.md');
    const added = await pending;
    expect(f.notes['Tasks/Kitchen project.md']).toBe(`${TEMPLATE}- [ ] Paint kitchen\n\t- [ ] Buy paint\n`);
    // Undo takes the note back to what the template wrote.
    expect(added).toMatchObject({ at: 5, duplicate: false, before: TEMPLATE, after: f.notes['Tasks/Kitchen project.md'] });
    expect(added.uncertain).toBeUndefined();
  });

  it('adds a board’s task under the template’s heading too', async () => {
    const f = fixture();
    const model = buildBoard([], parseBoardConfig('House', { slug: 'house', 'new-tasks': 'note', 'new-tasks-note': 'Tasks/Kitchen project.md', 'new-tasks-heading': 'Tasks' }).config, '2026-10-30', () => undefined);
    const pending = f.quick.addFromBoard(model, { rowId: 'now', columnId: 'backlog' }, 'Paint kitchen', false);
    await vi.advanceTimersByTimeAsync(300);
    expect(f.notes['Tasks/Kitchen project.md']).toBe('');
    f.fill('Tasks/Kitchen project.md');
    expect(await pending).toBe(true);
    const note = f.notes['Tasks/Kitchen project.md']!;
    expect(note.slice(0, TEMPLATE.length)).toBe(TEMPLATE);
    expect(note.slice(TEMPLATE.length)).toMatch(/^- \[ \] Paint kitchen .*#tt\/house\/backlog\/\d+\n$/);
  });

  it('adds the task after a timeout when Templater never fills the note', async () => {
    const f = fixture();
    const pending = f.add('Tasks/Kitchen project');
    await vi.advanceTimersByTimeAsync(2999);
    expect(f.notes['Tasks/Kitchen project.md']).toBe('');
    await vi.advanceTimersByTimeAsync(1);
    expect((await pending).after).toBe('## Tasks\n- [ ] Paint kitchen\n\t- [ ] Buy paint\n');
  });

  it.each([
    { name: 'Templater doesn’t run on new notes', options: { trigger: false }, note: 'Tasks/Kitchen project' },
    { name: 'the folder has no template', options: {}, note: 'Inbox' },
    { name: 'Templater’s settings can’t be read', options: { readable: false }, note: 'Tasks/Kitchen project' },
  ])('writes at once when $name', async ({ options, note }) => {
    const f = fixture(options);
    const pending = f.add(note);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.notes[`${note}.md`]).toBe('## Tasks\n- [ ] Paint kitchen\n\t- [ ] Buy paint\n');
    await vi.runAllTimersAsync();
    await pending;
  });

  it('writes nothing when the plugin is disabled while waiting for Templater', async () => {
    const f = fixture();
    const pending = f.add('Tasks/Kitchen project');
    const failed = expect(pending).rejects.toThrow('disabled');
    await vi.advanceTimersByTimeAsync(100);
    f.unload();
    await failed;
    expect(f.notes['Tasks/Kitchen project.md']).toBe('');
  });
});

describe('filter feedback for a new note', () => {
  const PATH = 'Daily/2026-10-30.md';

  /** A new note, which Obsidian indexes only when `index` is called. Until then it has no metadata. */
  function fixture(rules: Record<string, unknown>) {
    vi.useFakeTimers();
    vi.stubGlobal('window', globalThis);
    const notes: Record<string, string> = {};
    let cache: { frontmatter: Record<string, unknown> } | null = null;
    const metadataCache = Object.assign(new Events(), { getFileCache: () => cache });
    const vault = {
      configDir: '.obsidian', adapter: { read: async () => '{}' },
      getFileByPath: (path: string) => path in notes ? new TFile(path) : null,
      getAbstractFileByPath: (path: string) => new TFolder(path),
      create: async (path: string, data: string) => { notes[path] = data; return new TFile(path); },
      read: async (file: TFile) => notes[file.path]!,
      process: async (file: TFile, transform: (content: string) => string) => (notes[file.path] = transform(notes[file.path]!)),
    };
    let unload = () => {};
    const plugin = {
      register: (cleanup: () => void) => { unload = cleanup; },
      isExcludedFromIndex: () => false,
      app: { metadataCache, vault },
      settings: { newTaskKind: 'note', newTaskNote: PATH, newTaskHeading: '' },
    } as unknown as TaskTrellisPlugin;
    const quick = new QuickAdd(plugin);
    const config = parseBoardConfig('Daily', { slug: 'daily', ...rules }).config;
    /** Obsidian finishes indexing the note as `content` reads, with these properties. */
    const index = (content: string, frontmatter: Record<string, unknown>) => {
      cache = { frontmatter };
      metadataCache.trigger('changed', new TFile(PATH), content, cache);
    };
    let settled = false;
    const add = () => {
      const pending = quick.addLines(config, { kind: 'note', note: PATH, heading: '' }, ['- [ ] Water plants']);
      void pending.finally(() => { settled = true; });
      return pending;
    };
    return { notes, index, add, settled: () => settled, metadataCache, vault, unload: () => unload() };
  }

  it.each([
    { filters: 'folder filters that include it', rules: { 'include-folders': ['Daily'] }, warned: false },
    { filters: 'folder filters that leave it out', rules: { 'include-folders': ['Projects'] }, warned: true },
  ])('answers at once from the path with $filters', async ({ rules, warned }) => {
    const f = fixture(rules);
    const on = vi.spyOn(f.metadataCache, 'on');
    const added = await f.add();
    expect(f.notes[PATH]).toContain('Water plants');
    expect(on).not.toHaveBeenCalled();
    expect(added.warning !== undefined).toBe(warned);
  });

  it.each([
    { filters: 'property filters', rules: { 'filter-properties': ['status: active'] } },
    { filters: 'tag filters', rules: { 'include-tags': ['daily'] } },
  ])('waits for Obsidian to index the note before checking $filters', async ({ rules }) => {
    const f = fixture(rules);
    const pending = f.add();
    await vi.advanceTimersByTimeAsync(500);
    expect(f.settled()).toBe(false);
    f.index(f.notes[PATH]!, { status: 'active', tags: ['daily'] });
    expect((await pending).warning).toBeUndefined();
  });

  it('warns when the indexed properties leave the task out', async () => {
    const f = fixture({ 'filter-properties': ['status: active'] });
    const pending = f.add();
    await vi.advanceTimersByTimeAsync(0);
    f.index(f.notes[PATH]!, { status: 'done' });
    expect((await pending).warning).toContain('may be hidden');
  });

  it('doesn’t take an index of the note from before the add for the note as the add left it', async () => {
    const f = fixture({ 'filter-properties': ['status: active'] });
    const pending = f.add();
    await vi.advanceTimersByTimeAsync(0);
    // Obsidian finishes indexing the empty note it created only after the task is written.
    f.index('', {});
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.settled()).toBe(false);
    f.index(f.notes[PATH]!, { status: 'active' });
    expect((await pending).warning).toBeUndefined();
  });

  it('takes an index that finished before the check without waiting', async () => {
    const f = fixture({ 'filter-properties': ['status: active'] });
    const write = f.vault.process;
    f.vault.process = async (file, transform) => {
      const written = await write(file, transform);
      f.index(written, { status: 'active' });
      return written;
    };
    const pending = f.add();
    await vi.advanceTimersByTimeAsync(0);
    expect(f.settled()).toBe(true);
    expect((await pending).warning).toBeUndefined();
  });

  it('warns after a short wait when Obsidian hasn’t indexed the note', async () => {
    const f = fixture({ 'filter-properties': ['status: active'] });
    const off = vi.spyOn(f.metadataCache, 'offref');
    const pending = f.add();
    await vi.advanceTimersByTimeAsync(1999);
    expect(f.settled()).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect((await pending).warning).toBe('The task may be hidden by this board’s filters; check the destination note and its properties. Sync is not confirmed.');
    expect(off).toHaveBeenCalledTimes(1);
  });

  it('stops waiting when the plugin is disabled', async () => {
    const f = fixture({ 'filter-properties': ['status: active'] });
    const pending = f.add();
    await vi.advanceTimersByTimeAsync(100);
    f.unload();
    await vi.advanceTimersByTimeAsync(0);
    expect(f.settled()).toBe(true);
    expect(f.notes[PATH]).toContain('Water plants');
    expect((await pending).warning).toContain('may be hidden');
  });
});
