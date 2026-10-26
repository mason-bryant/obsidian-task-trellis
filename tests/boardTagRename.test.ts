import { expect, it, vi } from 'vitest';
import type { App, TFile as ObsidianFile } from 'obsidian';
import { TFile, TFolder } from './mocks/obsidian.ts';
import { BoardTagRename } from '../src/obsidian/BoardTagRename.ts';
import { mentionsNamespace, renameTagFilter, rewriteBoardTaskTags } from '../src/core/boardTagRename.ts';

const board = (slug: string, rest = {}) => `---\n${JSON.stringify({slug, columns: ['Backlog', 'Doing', 'Done'], ...rest})}\n---\n`;
function fixture() {
  const content = new Map([
    ['Boards/House.md', board('house', {labels: [{id: 'red', name: 'Urgent', color: '#ff0000'}]})],
    ['Tasks.md', '- [ ] One #tt/house/doing/10 #tt/house/label/red 📅 2026-10-30\r\n  - [ ] Child #tt/house/backlog/3\n- [x] Done #tt/house/done/20\n'],
    ['Excluded/Old.md', '- [ ] Still belongs #tt/house/backlog/4\n'],
    ['Boards/Overview.md', board('overview', {'include-tags': ['tt/house/label/red'], 'exclude-tags': '#tt/house/label/blue'})],
    ['Queries.md', 'Search #tt/house/label/red\n```tasks\ntags include #tt/house/label/red\n```\n'],
  ]);
  const files = new Map<string, TFile | TFolder>([...content].map(([path]) => [path, new TFile(path)]));
  const writes: string[] = [];
  let fail: ((path: string, next: string) => void) | undefined;
  const vault = {
    configDir: '.obsidian',
    getAbstractFileByPath: (path: string) => files.get(path) ?? null,
    getMarkdownFiles: () => [...files.values()].filter((f): f is TFile => f instanceof TFile && f.extension === 'md'),
    getFiles: () => [...files.values()].filter((f): f is TFile => f instanceof TFile),
    read: async (f: TFile) => { if (!content.has(f.path)) throw new Error('Missing'); return content.get(f.path)!; },
    process: vi.fn(async (f: TFile, fn: (text: string) => string) => {
      const next = fn(content.get(f.path)!); fail?.(f.path, next); content.set(f.path, next); writes.push(f.path); return next;
    }),
    createFolder: async (path: string) => { files.set(path, new TFolder(path)); },
    create: vi.fn(async (path: string, value: string) => {
      fail?.(path, value); const f = new TFile(path); files.set(path, f); content.set(path, value); writes.push(path); return f;
    }),
    modify: async (f: TFile, value: string) => { fail?.(f.path, value); content.set(f.path, value); writes.push(f.path); },
  };
  const renameFile = vi.fn(async (f: TFile, path: string) => {
    if (files.has(path)) throw new Error('Already exists');
    files.delete(f.path); files.set(path, f); content.set(path, content.get(f.path)!); content.delete(f.path); f.path = path;
  });
  const app = {vault, fileManager: {renameFile}} as unknown as App;
  const collapsed: Record<string, Record<string, boolean>> = {house: {later: false, 'sub:sample': true}};
  const settings = { boardsFolder: () => 'Boards', collapsed: () => collapsed, saveSettings: vi.fn(async () => {}) };
  const service = new BoardTagRename(app, settings);
  const file = files.get('Boards/House.md') as unknown as ObsidianFile;
  return {content, files, writes, vault, renameFile, collapsed, settings, service, file, app,
    preview: () => service.preview(file, 'Boards/House.md', 'Home'),
    failWith(fn: typeof fail) { fail = fn; },
    add(path: string, value: string) { files.set(path, new TFile(path)); content.set(path, value); },
  };
}
it('previews every affected note, including filtered/completed/nested tasks and dependent board filters, without writing', async () => {
  const f = fixture(); const p = await f.preview();
  expect(p.tagCount).toBe(5); expect(p.paths).toEqual(['Boards/House.md', 'Boards/Overview.md', 'Excluded/Old.md', 'Tasks.md']);
  expect(p.referencePaths).toEqual(['Queries.md']); expect(f.writes).toEqual([]);
});
it('stages both namespaces, commits the board, cleans old tags and restores from a persistent journal after restart', async () => {
  const f = fixture(); const before = new Map(f.content); const p = await f.preview();
  f.failWith((path, next) => {
    if (path === 'Boards/House.md' && next.includes('"slug":"home"')) {
      expect(f.content.get('Tasks.md')).toContain('#tt/house/doing/10 #tt/home/doing/10');
    }
  });
  const backup = await f.service.apply(p); f.failWith(undefined);
  expect(f.writes[0]).toBe(backup); expect(f.content.get('Tasks.md')).toContain('#tt/home/label/red');
  expect(f.content.get('Tasks.md')).not.toContain('#tt/house/');
  expect(f.content.get('Boards/Home.md')).toContain('"slug":"home"');
  expect(f.content.get('Boards/Overview.md')).toContain('tt/home/label/red');
  expect(f.content.get('Queries.md')).toBe(before.get('Queries.md')); expect(f.collapsed.home).toEqual(f.collapsed.house);
  const restarted = new BoardTagRename(f.app, f.settings); await restarted.restore(backup);
  for (const [path, value] of before) expect(f.content.get(path)).toBe(value);
  expect(f.content.has('Boards/Home.md')).toBe(false); expect(f.collapsed.home).toBeUndefined();
  expect((await restarted.history())[0]!.record.status).toBe('restored');
});
it.each(['task', 'board', 'settings'])('rolls back a %s failure without changing user notes', async (failure) => {
  const f = fixture(); const p = await f.preview(); const before = new Map(f.content);
  if (failure === 'settings') f.settings.saveSettings.mockRejectedValueOnce(new Error('Cannot save'));
  else f.failWith((path) => { if (path === (failure === 'task' ? 'Tasks.md' : 'Boards/House.md')) { f.failWith(undefined); throw new Error('Disk full'); } });
  await expect(f.service.apply(p)).rejects.toThrow('was restored');
  for (const [path, value] of before) expect(f.content.get(path)).toBe(value);
  expect((await f.service.history())[0]!.record.status).toBe('restored');
});
it('does not change notes if the durable backup cannot be created', async () => {
  const f = fixture(); const p = await f.preview(); f.vault.create.mockRejectedValueOnce(new Error('Disk full'));
  await expect(f.service.apply(p)).rejects.toThrow('No notes changed');
  expect(f.vault.process).not.toHaveBeenCalled(); expect(f.renameFile).not.toHaveBeenCalled();
});
it('rejects changed or newly added tasks after preview, even in a previously unaffected note', async () => {
  const f = fixture(); const p = await f.preview(); f.add('Added.md', '- [ ] New #tt/house/doing/9');
  await expect(f.service.apply(p)).rejects.toThrow('vault changed'); expect(f.writes).toEqual([]);
});
it.each(['board', 'tag', 'reference', 'duplicate-old', 'filename'])('rejects %s namespace/path collisions', async (mode) => {
  const f = fixture();
  if (mode === 'board') f.add('Boards/Other.md', board('home'));
  if (mode === 'tag') f.add('Other.md', '- [ ] Other #tt/home/label/red');
  if (mode === 'reference') f.add('Other.md', 'Search for #tt/home/doing');
  if (mode === 'duplicate-old') f.add('Boards/Other.md', board('house'));
  if (mode === 'filename') f.add('Boards/Home.md', board('other'));
  await expect(f.preview()).rejects.toThrow(); expect(f.writes).toEqual([]);
});
it('leaves both tag sets if cleanup fails, and permits recovery after restarting', async () => {
  const f = fixture(); const p = await f.preview(); const before = new Map(f.content);
  f.failWith((path, next) => { if (path === 'Tasks.md' && !next.includes('#tt/house/')) { f.failWith(undefined); throw new Error('Cleanup failed'); } });
  await expect(f.service.apply(p)).rejects.toThrow('cleanup or the filename rename was interrupted');
  expect(f.content.get('Tasks.md')).toContain('#tt/home/doing/10'); expect(f.content.get('Tasks.md')).toContain('#tt/house/doing/10');
  const record = (await f.service.history())[0]!;
  await new BoardTagRename(f.app, f.settings).restore(record.path);
  for (const [path, value] of before) expect(f.content.get(path)).toBe(value);
});
it('refuses recovery before any writes if a note was edited after migration', async () => {
  const f = fixture(); const backup = await f.service.apply(await f.preview());
  f.content.set('Tasks.md', f.content.get('Tasks.md')! + 'A later edit\n'); const writes = f.vault.process.mock.calls.length;
  await expect(f.service.restore(backup)).rejects.toThrow('notes changed'); expect(f.vault.process).toHaveBeenCalledTimes(writes);
  expect(f.content.get('Tasks.md')).toContain('A later edit');
});
it('protects concurrent edits during failure rollback and blocks another migration until recovery', async () => {
  const f = fixture(); const p = await f.preview();
  f.failWith((path) => {
    if (path === 'Tasks.md') { f.content.set('Excluded/Old.md', f.content.get('Excluded/Old.md')! + 'Synced text\n'); f.failWith(undefined); throw new Error('Write failed'); }
  });
  await expect(f.service.apply(p)).rejects.toThrow('interrupted');
  expect(f.content.get('Excluded/Old.md')).toContain('Synced text');
  expect(f.content.get('Excluded/Old.md')).toContain('#tt/house/');
  expect((await f.service.history())[0]!.record.status).toBe('needs-recovery');
  await expect(f.preview()).rejects.toThrow('earlier rename');
});
it('rewrites only exact task namespaces and preserves mixed line endings, metadata and unrelated tags', () => {
  const source = '- [ ] Same #tt/house/doing/100 #tt/house/label/red #tt/household/doing/3 📅 2026-10-30 ^block\r\n  - [x] Child #tt/HOUSE/done/20\nProse #tt/house/doing/10\n```md\n- [ ] Example #tt/house/doing/2\n```\n';
  const result = rewriteBoardTaskTags(source, 'house', 'home');
  expect(result.count).toBe(3);
  expect(result.after).toBe(source.replace('#tt/house/doing/100', '#tt/home/doing/100').replace('#tt/house/label/red', '#tt/home/label/red').replace('#tt/HOUSE/done/20', '#tt/home/done/20'));
  expect(mentionsNamespace('#tt/household/doing', 'house')).toBe(false);
  expect(renameTagFilter([' tt/house', '#tt/house/label/red, #tt/household'], 'house', 'home')).toEqual([' tt/home', '#tt/home/label/red, #tt/household']);
});
it('leaves inline code examples, ordinary frontmatter and similar namespaces unchanged', () => {
  const source = '\uFEFF---\ntags: [tt/house/doing]\n---\n- [ ] Example ` #tt/house/doing/2 ` plus #tt/house/label/red\n';
  expect(rewriteBoardTaskTags(source, 'house', 'home').after).toBe(source.replace('#tt/house/label/red', '#tt/home/label/red'));
});

it('keeps the new tag namespace usable if the final filename rename fails, and can restore it', async () => {
  const f = fixture(); const before = new Map(f.content); const p = await f.preview();
  f.renameFile.mockRejectedValueOnce(new Error('Cannot rename'));
  await expect(f.service.apply(p)).rejects.toThrow('filename rename was interrupted');
  expect(f.content.get('Boards/House.md')).toContain('"slug":"home"');
  expect(f.content.get('Tasks.md')).toContain('#tt/home/doing/10');
  await f.service.restore((await f.service.history())[0]!.path);
  for (const [path, value] of before) expect(f.content.get(path)).toBe(value);
});

it('allows Obsidian to update links in affected notes and reverses those links before restoring snapshots', async () => {
  const f = fixture(); f.content.set('Tasks.md', f.content.get('Tasks.md')! + '- [ ] Link [[House]] #tt/house/doing/7\n');
  const before = new Map(f.content); const originalRename = f.renameFile.getMockImplementation()!;
  f.renameFile.mockImplementation(async (file, path) => {
    const oldName = file.basename; await originalRename(file, path);
    for (const [note, content] of f.content) if (note.endsWith('.md')) f.content.set(note, content.split(`[[${oldName}]]`).join(`[[${file.basename}]]`));
  });
  const backup = await f.service.apply(await f.preview()); expect(f.content.get('Tasks.md')).toContain('[[Home]]');
  await f.service.restore(backup);
  for (const [path, value] of before) expect(f.content.get(path)).toBe(value);
});

it('refuses recovery when new tasks or a conflicting board appeared after migration', async () => {
  const f = fixture(); const backup = await f.service.apply(await f.preview());
  f.add('New tasks.md', '- [ ] Captured later #tt/home/doing/9');
  await expect(f.service.restore(backup)).rejects.toThrow('not part of this rename');
  f.content.set('New tasks.md', ''); f.add('Boards/Reused.md', board('house'));
  await expect(f.service.restore(backup)).rejects.toThrow('another board');
});
it('journals an interrupted restore and can resume it after restarting', async () => {
  const f = fixture(); const before = new Map(f.content); const backup = await f.service.apply(await f.preview());
  f.failWith((path) => { if (path === 'Boards/Overview.md') { f.failWith(undefined); throw new Error('Interrupted restore'); } });
  await expect(f.service.restore(backup)).rejects.toThrow('Interrupted restore');
  expect((await f.service.history())[0]!.record.status).toBe('needs-recovery');
  await new BoardTagRename(f.app, f.settings).restore(backup);
  for (const [path, value] of before) expect(f.content.get(path)).toBe(value);
});

it('restores links shortened by Obsidian without accepting unrelated link or text edits', async () => {
  const f = fixture(); f.content.set('Tasks.md', f.content.get('Tasks.md')! + '- [ ] Link [[Boards/House#Heading|Alias]] #tt/house/doing/7\n');
  const before = new Map(f.content); const originalRename = f.renameFile.getMockImplementation()!;
  Object.assign(f.app, {metadataCache: {getFirstLinkpathDest: (target: string) => f.files.get(`Boards/${target}.md`)}});
  f.renameFile.mockImplementation(async (file, path) => {
    const oldName = file.basename; await originalRename(file, path);
    for (const [note, text] of f.content) if (note.endsWith('.md')) f.content.set(note, text.split(`[[Boards/${oldName}#`).join(`[[${file.basename}#`).split(`[[${oldName}#`).join(`[[${file.basename}#`));
  });
  const backup = await f.service.apply(await f.preview());
  expect(f.content.get('Tasks.md')).toContain('[[Home#Heading|Alias]]');
  f.content.set('Tasks.md', f.content.get('Tasks.md')!.replace('|Alias', '|Changed'));
  await expect(f.service.restore(backup)).rejects.toThrow('notes changed');
  f.content.set('Tasks.md', f.content.get('Tasks.md')!.replace('|Changed', '|Alias'));
  await f.service.restore(backup);
  for (const [path, value] of before) expect(f.content.get(path)).toBe(value);
});
