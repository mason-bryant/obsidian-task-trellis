import { expect, it } from 'vitest';
import type { App } from 'obsidian';
import { TFile } from './mocks/obsidian.ts';
import { TaskWriter } from '../src/obsidian/TaskWriter.ts';
import { parseTaskLine } from '../src/core/taskLine.ts';
import { type BoardTask, type TaskEdit } from '../src/core/board.ts';
import { planReorder } from '../src/core/sort.ts';
import { matchesProperty, propertyValueStrings } from '../src/core/filters.ts';
import { labelTextColor } from '../src/core/labels.ts';
import { parseBoardConfig } from '../src/core/boardConfig.ts';
import { destinationAdvice } from '../src/core/setup.ts';

it('preserves the requested order through 10,000 deterministic insertions and moves', () => {
  let seed = 731;
  const random = (max: number) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max; };
  const ranks = new Map<number, number>();
  const ordered = Array.from({ length: 100 }, (_, i) => i);
  for (let step = 0; step < 10_000; step++) {
    const [moved] = ordered.splice(random(ordered.length), 1);
    const at = step % 2 === 0 ? 0 : random(ordered.length + 1);
    const changes = planReorder(ordered, moved!, at, (item) => ranks.get(item));
    changes.forEach((rank, item) => { expect(Number.isSafeInteger(rank) && rank > 0).toBe(true); ranks.set(item, rank); });
    ordered.splice(at, 0, moved!);
    expect([...ordered].sort((a, b) => (ranks.get(a) ?? Infinity) - (ranks.get(b) ?? Infinity))).toEqual(ordered);
  }
});

it('compacts unsafe ranks and rejects invalid insertion positions', () => {
  const high: { rank: number | undefined } = { rank: Number.MAX_SAFE_INTEGER };
  const added = { rank: undefined };
  expect([...planReorder([high], added, 1, (item) => item.rank).values()]).toEqual([100, 200]);
  for (const index of [-1, 2, .5, NaN]) expect(() => planReorder([high], added, index, (item) => item.rank)).toThrow(RangeError);
});

it('does not turn inherited properties or nested objects into filter matches', () => {
  expect(matchesProperty({}, { key: 'constructor', values: [] })).toBe(false);
  expect(matchesProperty(Object.create({ status: 'active' }), { key: 'status', values: ['active'] })).toBe(false);
  expect(propertyValueStrings([null, undefined, {}, ['active'], 0, false, '  text  '])).toEqual(['0', 'false', 'text']);
});

it('keeps label text at least 4.5:1 across a 32,768-color sample', () => {
  for (let r = 0; r < 256; r += 8) for (let g = 0; g < 256; g += 8) for (let b = 0; b < 256; b += 8) {
    const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    const [red, green, blue] = [r, g, b].map((v) => v / 255).map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
    const light = red! * .2126 + green! * .7152 + blue! * .0722;
    const ratio = labelTextColor(hex) === '#000000' ? (light + .05) / .05 : 1.05 / (light + .05);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  }
});

it('writes 5,000 tasks across 100 notes without touching surrounding content or other boards, then safely undoes', async () => {
  const originals = new Map<string, string>();
  const files = new Map<string, string>();
  const refs = new Map<string, TFile>();
  const tasks: BoardTask[] = [];
  const edits = new Map<string, TaskEdit>();
  for (let n = 0; n < 100; n++) {
    const path = `Notes/${n}.md`;
    const eol = n % 2 ? '\r\n' : '\n';
    const lines = ['---', 'project: house', '---', '# Preserve this prose 🔒'];
    for (let i = 0; i < 50; i++) {
      const raw = `- [ ] Task ${n}/${i} ⏫ 📅 2026-10-25 #tt/other/doing/7 #tt/house/label/l123abc ^block-${n}-${i}`;
      const line = lines.length; const id = `${path}:${line}`;
      tasks.push({ ...parseTaskLine(raw)!, raw, line, path, id });
      edits.set(id, { column: 'waiting', sort: (i + 1) * 100 });
      lines.push(raw);
    }
    lines.push('```md', '- [ ] Do not touch this code sample', '```', 'Trailing prose', '');
    const text = lines.join(eol); originals.set(path, text); files.set(path, text); refs.set(path, new TFile(path));
  }
  const app = { vault: {
    getAbstractFileByPath: (path: string) => refs.get(path),
    process: async (file: TFile, transform: (text: string) => string) => { files.set(file.path, transform(files.get(file.path)!)); },
  } } as unknown as App;
  const undo = await new TaskWriter(app).applyEdits(tasks, edits, 'house');
  for (const [path, after] of files) {
    const restored = after.replace(/ #tt\/house\/waiting\/\d+/g, '');
    expect(restored).toBe(originals.get(path));
  }
  // A sync/editor update after the write must survive Undo, even in a large batch.
  const changed = `${files.get('Notes/0.md')}External edit\n`;
  files.set('Notes/0.md', changed);
  expect(await undo.action?.undo()).toBe(false);
  expect(files.get('Notes/0.md')).toBe(changed);
  for (const [path, text] of files) if (path !== 'Notes/0.md') expect(text).toBe(originals.get(path));
  expect(await undo.action?.undo()).toBe(false);
});

it('explains missing, excluded and filtered task destinations without writing anything', () => {
  const fallback = { kind: 'note' as const, note: '', heading: '' };
  const context = { dailyAvailable: false, excluded: (path: string) => path.startsWith('Task Trellis/'), metadata: () => ({ tags: [] }) };
  const config = parseBoardConfig('Home', {}).config;
  expect(destinationAdvice(config, fallback, context)[0]).toContain('Choose a note path');
  expect(destinationAdvice(config, { ...fallback, note: 'Task Trellis/Home.md' }, context)[0]).toContain('excluded');
  expect(destinationAdvice(config, { ...fallback, kind: 'daily' }, context)[0]).toContain('Daily notes is disabled');
  expect(destinationAdvice(parseBoardConfig('Home', { 'include-folders': ['Projects'] }).config, { ...fallback, note: 'Tasks/Inbox' }, context)[0]).toContain('hidden');
  expect(destinationAdvice(config, { ...fallback, note: 'Tasks/Inbox' }, context)[0]).toBe('New tasks will be saved in Tasks/Inbox.md.');
  expect(destinationAdvice(parseBoardConfig('Home', { 'include-tags': ['tt/home'] }).config, { ...fallback, note: 'Tasks/Inbox' }, context)[0]).toContain('hidden');
});

it('preserves 250 concurrent label writes while refusing stale checkbox writes on the same note', async () => {
  const lines = Array.from({ length: 250 }, (_, n) => `- [ ] Concurrent ${n} #tt/other/doing/100`);
  const file = new TFile('Concurrent.md');
  let content = lines.join('\n');
  let queue = Promise.resolve();
  const app = { vault: {
    getAbstractFileByPath: () => file,
    process: (_file: TFile, transform: (text: string) => string) => {
      const write = queue.then(() => { content = transform(content); });
      queue = write.catch(() => {}); return write;
    },
  } } as unknown as App;
  const writer = new TaskWriter(app);
  const tasks = lines.map((raw, line): BoardTask => ({ ...parseTaskLine(raw)!, raw, path: file.path, line, id: `${file.path}:${line}` }));
  const results = await Promise.all(tasks.flatMap((task) => [
    writer.setLabels(task, 'house', ['l123abc'], () => {}),
    writer.toggle(task),
  ]));
  expect(results.filter((result) => result === null)).toHaveLength(250);
  content.split('\n').forEach((line, index) => {
    expect(line.replace(' #tt/house/label/l123abc', '')).toBe(lines[index]);
    expect(parseTaskLine(line)?.closed).toBe(false);
  });
});
