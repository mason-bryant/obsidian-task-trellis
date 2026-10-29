// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../src/obsidian/BoardSettingsModal.ts', () => ({ BoardSettingsModal: class {} }));
vi.mock('../src/obsidian/LabelPickerModal.ts', () => ({ LabelPickerModal: class {} }));
const drag = vi.hoisted(() => ({ active: false }));
vi.mock('../src/ui/renderBoard.ts', async (importOriginal) => ({ ...await importOriginal<typeof import('../src/ui/renderBoard.ts')>(), isDragging: () => drag.active }));
import { BoardView } from '../src/obsidian/BoardView.ts';
import { TaskWriter, type UndoAction } from '../src/obsidian/TaskWriter.ts';
import { TaskIndex } from '../src/obsidian/TaskIndex.ts';
import { Events, notices, TFile } from './mocks/obsidian.ts';
import { buildBoard, type BoardModel, type DropTarget } from '../src/core/board.ts';
import { parseBoardConfig } from '../src/core/boardConfig.ts';
import type { RenderHost } from '../src/ui/renderBoard.ts';
import type TaskTrellisPlugin from '../main.ts';
import type { App, CachedMetadata, WorkspaceLeaf } from 'obsidian';

type ViewUnderTest = {
  model: BoardModel; board: { config: ReturnType<typeof parseBoardConfig>['config']; warnings: string[] };
  pending: Map<string, {raw: string; from: string}>;
  undoAction: {label: string; action: UndoAction} | null;
  render(): void; host(): RenderHost; drop(id: string, target: DropTarget): Promise<void>; undo(): Promise<void>;
};
function fixture(content = '- [ ] same\n- [ ] same\n') {
  const file = new TFile('Tasks.md');
  const cache = (): CachedMetadata => ({ listItems: content.split('\n').flatMap((line, i) => /^- \[.\]/.test(line) ? [{ task: line[3], parent: -1,
    position: { start: { line: i, col: 0, offset: 0 }, end: { line: i, col: line.length, offset: 0 } } }] : []) }) as CachedMetadata;
  const metadataCache = Object.assign(new Events(), { getFileCache: cache });
  const vault = Object.assign(new Events(), {
    getAbstractFileByPath: (path: string) => path === file.path ? file : null,
    getMarkdownFiles: () => [file], cachedRead: async () => content,
    process: async (_file: unknown, transform: (value: string) => string) => { content = transform(content); return content; },
  });
  const app = { vault, metadataCache } as unknown as App;
  const index = new TaskIndex(app, () => false);
  const writer = new TaskWriter(app);
  const plugin = { app, writer, index, quickAdd: { addFromBoard: vi.fn(), addSubtask: vi.fn() } } as unknown as TaskTrellisPlugin;
  const view = new BoardView({ app } as unknown as WorkspaceLeaf, plugin) as unknown as ViewUnderTest;
  const config = parseBoardConfig('House', { slug: 'house', columns: ['Backlog', 'Doing', 'Done'] }).config;
  view.board = { config, warnings: [] };
  view.render = vi.fn(() => { view.model = buildBoard(index.all(), config, '2026-10-25', () => undefined); });
  const ready = async () => { await index.refresh([file.path]); view.render(); };
  return { view, plugin, index, writer, vault, file, ready, get content() { return content; }, setContent(value: string) { content = value; } };
}
beforeEach(() => { notices.length = 0; drag.active = false; });
it('two rapid drops on duplicate lines use refreshed snapshots and leave no phantom preview', async () => {
  const f = fixture(); await f.ready();
  const task = f.index.all()[0]!; const rowId = f.view.model.rows[0]!.id;
  await Promise.all([f.view.drop(task.id, { rowId, index: 0, columnId: 'doing' }), f.view.drop(task.id, { rowId, index: 0, columnId: 'backlog' })]);
  expect(f.content.split('\n')[0]).toContain('#tt/house/backlog');
  expect(f.content.split('\n')[1]).toBe('- [ ] same');
  expect(f.view.pending.size).toBe(0);
  expect(notices.filter((n) => n.includes('could not'))).toEqual([]);
});
it('a drop that finishes while another card is being dragged waits for that drag to end before redrawing', async () => {
  const f = fixture('- [ ] original\n'); await f.ready();
  const task = f.index.all()[0]!; vi.mocked(f.view.render).mockClear();
  const queued = vi.fn(); (f.view as unknown as { queueRender(): void }).queueRender = queued;
  drag.active = true;
  await f.view.drop(task.id, { rowId: f.view.model.rows[0]!.id, index: 0, columnId: 'doing' });
  expect(f.content).toContain('#tt/house/doing'); expect(f.view.render).not.toHaveBeenCalled(); expect(queued).toHaveBeenCalled();
});
it('a skipped write removes its preview even if other writes succeeded', async () => {
  const f = fixture('- [ ] original\n'); await f.ready();
  const task = f.index.all()[0]!;
  vi.spyOn(f.writer, 'applyEdits').mockResolvedValue({ action: { paths: ['Other.md'], undo: async () => true }, appliedIds: [], skippedIds: [task.id], failedPaths: [] });
  await f.view.drop(task.id, { rowId: f.view.model.rows[0]!.id, index: 0, columnId: 'doing' });
  expect(f.content).toBe('- [ ] original\n'); expect(f.view.pending.has(task.id)).toBe(false);
});
it('Undo refreshes the affected note without rebuilding the vault or removing unrelated previews', async () => {
  const f = fixture('- [ ] original\n'); await f.ready();
  const task = f.index.all()[0]!;
  await f.view.drop(task.id, { rowId: f.view.model.rows[0]!.id, index: 0, columnId: 'doing' });
  const rebuild = vi.spyOn(f.index, 'rebuild'); const refresh = vi.spyOn(f.index, 'refresh');
  f.view.pending.set('unrelated', {raw: '- [ ] elsewhere', from: '- [ ] old'});
  await f.view.undo();
  expect(f.content).toBe('- [ ] original\n'); expect(rebuild).not.toHaveBeenCalled();
  expect(refresh).toHaveBeenCalledWith(['Tasks.md']); expect(f.view.pending.has('unrelated')).toBe(true);
});
it('the board reports task and subtask failures to the composer with a notice', async () => {
  const f = fixture(); await f.ready(); const host = f.view.host();
  vi.mocked(f.plugin.quickAdd.addFromBoard).mockRejectedValue(new Error('Disk full'));
  vi.mocked(f.plugin.quickAdd.addSubtask).mockRejectedValue(new Error('Disk full'));
  expect(await host.onAddTask({rowId: 'now', columnId: 'backlog'}, 'draft', false)).toBe(false);
  expect(await host.onAddSubtask(f.index.all()[0]!, 'child', false)).toBe(false);
  expect(notices.filter((n) => n.includes('Your text has been kept'))).toHaveLength(2);
});
it('does not redirect a stale card move onto a different task that reused its line number', async () => {
  const f = fixture('- [ ] original\n'); await f.ready();
  const task = f.index.all()[0]!;
  f.setContent('- [ ] replacement from sync\n'); await f.index.refresh(['Tasks.md']);
  // The index has caught up, but the view's debounced redraw has not happened yet.
  await f.view.drop(task.id, { rowId: f.view.model.rows[0]!.id, index: 0, columnId: 'doing' });
  expect(f.content).toBe('- [ ] replacement from sync\n'); expect(f.view.pending.size).toBe(0);
});

it('bulk edits use selected snapshots across refreshes and support a second action after filtering out', async () => {
  const f=fixture('- [ ] First ⏫\n- [ ] Second ⏫\n');await f.ready();
  const view=f.view as unknown as {applyBulk(tasks: ReturnType<typeof f.index.all>, action: import('../src/core/bulkTriage.ts').BulkAction,slug:string):Promise<import('../src/core/bulkTriage.ts').BulkResult>};
  const first=await view.applyBulk(f.index.all(),{kind:'priority',priority:'low'},'house');
  expect(first.tasks).toHaveLength(2);expect(first.tasks.every(t=>t.priority==='low')).toBe(true);
  const next=await view.applyBulk(first.tasks,{kind:'due',date:'2026-11-10'},'house');
  expect(next.tasks.every(t=>t.dueDate==='2026-11-10')).toBe(true);
  expect(f.view.undoAction?.action.paths).toEqual(['Tasks.md']);
  await f.view.undo();expect(f.content).not.toContain('📅');expect(f.content).toContain('🔽');
});

it('bulk edits skip a changed selected line instead of modifying its replacement',async()=>{
  const f=fixture('- [ ] First\n- [ ] Second\n');await f.ready();const selected=f.index.all();
  f.setContent('- [ ] Replacement\n- [ ] Second\n');await f.index.refresh(['Tasks.md']);
  const view=f.view as unknown as {applyBulk(tasks: typeof selected,action:import('../src/core/bulkTriage.ts').BulkAction,slug:string):Promise<import('../src/core/bulkTriage.ts').BulkResult>};
  const result=await view.applyBulk(selected,{kind:'labels',mode:'add',ids:['red']},'house');
  expect(result.message).toContain('1 skipped');expect(f.content.split('\n')[0]).toBe('- [ ] Replacement');
  expect(f.content.split('\n')[1]).toContain('#tt/house/label/red');
});
