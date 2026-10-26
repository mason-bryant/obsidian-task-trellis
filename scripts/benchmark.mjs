// Synthetic core benchmark; deliberately excludes rendering, disk I/O and sync.
import { build } from 'esbuild';
import os from 'node:os';
const bundle = await build({
  stdin: { contents: `export { parseTaskLine } from './src/core/taskLine.ts'; export { buildBoard } from './src/core/board.ts'; export { parseBoardConfig } from './src/core/boardConfig.ts';`, resolveDir: process.cwd() },
  bundle: true, write: false, format: 'esm', platform: 'node', target: 'es2020',
});
const { parseTaskLine, buildBoard, parseBoardConfig } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const config = parseBoardConfig('Benchmark', {
  slug: 'bench', 'include-folders': ['Projects'], 'include-tags': ['work'], 'filter-properties': ['status: active'],
  'quick-filters': [
    { id: 'p', name: 'No priority', priority: ['none'] },
    { id: 'd', name: 'Due now', due: ['due-now'] },
    { id: 't', name: 'Work', 'include-tags': ['work'], 'filter-properties': ['status: active'] },
  ],
}).config;
// Every task passes all three, so each one is checked against every quick filter.
const quickIds = config.quickFilters.map((f) => f.id);
const results = [];
for (const count of [10_000, 50_000]) {
  const raw = Array.from({ length: count }, (_, i) => `- [ ] Synthetic task ${i} 📅 2026-10-${25 + i % 6} #work/group-${i % 10} #tt/bench/doing/${(i + 1) * 100}`);
  const parse = [], model = [], quick = [];
  for (let trial = 0; trial < 8; trial++) {
    let start = performance.now();
    const tasks = raw.map((line, i) => ({ ...parseTaskLine(line), raw: line, path: `Projects/${Math.floor(i / 100)}.md`, line: i % 100, id: `task:${i}` }));
    const parseTime = performance.now() - start;
    start = performance.now();
    const board = buildBoard(tasks, config, '2026-10-25', () => ({ status: 'active' }));
    const modelTime = performance.now() - start;
    start = performance.now();
    const filtered = buildBoard(tasks, config, '2026-10-25', () => ({ status: 'active' }), () => [], quickIds);
    const quickTime = performance.now() - start;
    if (board.total !== count || filtered.total !== count) throw new Error(`Expected ${count} tasks, got ${board.total} and ${filtered.total}`);
    if (trial > 0) { parse.push(parseTime); model.push(modelTime); quick.push(quickTime); }
  }
  results.push({ tasks: count, notes: count / 100, measuredRuns: parse.length,
    parseMedianMs: +median(parse).toFixed(1), modelMedianMs: +median(model).toFixed(1), quickFiltersModelMedianMs: +median(quick).toFixed(1),
    parseMaxMs: +Math.max(...parse).toFixed(1), modelMaxMs: +Math.max(...model).toFixed(1) });
}
console.log(JSON.stringify({ date: new Date().toISOString(), node: process.version, platform: `${os.platform()} ${os.arch()}`, cpu: os.cpus()[0]?.model, results }, null, 2));
