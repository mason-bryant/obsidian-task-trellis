import { parseYaml, stringifyYaml, TFile, TFolder, type App } from 'obsidian';
import { boardNameError } from '../core/boardName.ts';
import { parseBoardConfig } from '../core/boardConfig.ts';
import { inFolder } from '../core/filters.ts';
import { mentionsNamespace, migrationSlug, renameTagFilter, rewriteBoardTaskTags } from '../core/boardTagRename.ts';

export const RENAME_RECOVERY_FOLDER = 'Task Trellis recovery';
type Change = { path: string; before: string; staged: string; after: string; kind: 'tasks' | 'board' };
export type RenamePreview = { oldSlug: string; newSlug: string; tagCount: number; paths: string[]; referencePaths: string[] };
export type RenamePlan = RenamePreview & { originalPath: string; targetPath: string; changes: Change[]; boardNames: string[] };
type Collapsed = Record<string, Record<string, boolean>>;
type RenameContext = { boardsFolder(): string; collapsed(): Collapsed; saveSettings(): Promise<void> };
export type RenameRecord = RenamePlan & {
  version: 1; created: string; status: 'prepared' | 'complete' | 'needs-recovery' | 'restored';
  priorState: Record<string, boolean> | null; copiedState: Record<string, boolean>; problem?: string;
};

function frontmatter(content: string): { values: Record<string, unknown>; body: string; replace(values: Record<string, unknown>): string } {
  const match = /^(\uFEFF?---\r?\n)([\s\S]*?)(\r?\n(?:---|\.\.\.)(?:\r?\n|$))/.exec(content);
  const raw: unknown = match ? parseYaml(match[2]!) : {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Board properties must be a YAML mapping.');
  return { values: raw as Record<string, unknown>, body: match ? content.slice(match[0].length) : content, replace(values) {
    const eol = content.includes('\r\n') ? '\r\n' : '\n';
    const yaml = stringifyYaml(values).trimEnd().replace(/\r?\n/g, eol);
    return match ? `${match[1]}${yaml}${match[3]}${content.slice(match[0].length)}` : `---${eol}${yaml}${eol}---${eol}${content}`;
  } };
}
const safePath = (path: string) => path.endsWith('.md') && !path.startsWith('/') && !path.includes('\\') &&
  !path.split('/').some((p) => p === '.' || p === '..' || p === '' || p.startsWith('.'));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Multi-note rename with durable snapshots, compare-and-swap writes, and restartable restoration. */
export class BoardTagRename {
  busy = false;
  constructor(private app: App, private context: RenameContext) {}

  private file(path: string): TFile {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) throw new Error(`Note is missing: ${path}`);
    return file;
  }

  async preview(file: TFile, originalPath: string, name: string): Promise<RenamePlan> {
    if (this.busy) throw new Error('Another board rename is running. Wait for it to finish.');
    const invalid = boardNameError(name);
    if (invalid) throw new Error(invalid);
    if (file.path !== originalPath || this.file(originalPath) !== file) throw new Error('The board changed. Reopen the rename editor.');
    const targetPath = originalPath.slice(0, originalPath.lastIndexOf('/') + 1) + name.trim() + '.md';
    if (!safePath(originalPath) || !safePath(targetPath)) throw new Error('Board paths must be ordinary Markdown notes in the vault.');
    const occupied = this.app.vault.getAbstractFileByPath(targetPath);
    if (occupied && occupied !== file) throw new Error('A note or folder with that name already exists.');
    const pending = (await this.history()).find(({ record }) => record.status === 'prepared' || record.status === 'needs-recovery');
    if (pending) throw new Error(`Finish or restore the earlier rename first using “Restore board rename”: ${pending.path}`);
    const original = await this.app.vault.read(file);
    const oldSlug = parseBoardConfig(file.basename, frontmatter(original).values).config.slug;
    const newSlug = migrationSlug(name);
    if (oldSlug === newSlug) throw new Error('The tag prefix is already the same. Turn off “Also rename board tags” to rename only the title.');
    const changes: Change[] = [], referencePaths: string[] = [], boardNames: string[] = [];
    let tagCount = 0;
    for (const note of this.app.vault.getMarkdownFiles()) {
      if (!safePath(note.path) || note.path.startsWith(this.app.vault.configDir + '/')) continue;
      const before = note === file ? original : await this.app.vault.read(note);
      if (mentionsNamespace(before, newSlug)) throw new Error(`The new tag prefix is already used or referenced in ${note.path}. Choose a different name.`);
      if (inFolder(note.path, this.context.boardsFolder())) {
        boardNames.push(note.path);
        const fm = frontmatter(before);
        const slug = parseBoardConfig(note.basename, fm.values).config.slug;
        if (note !== file && (slug === oldSlug || slug === newSlug)) throw new Error(`Another board uses this tag prefix: ${note.path}. Rename only the title instead.`);
        const next = { ...fm.values };
        for (const key of ['include-tags', 'exclude-tags']) if (key in next) next[key] = renameTagFilter(next[key], oldSlug, newSlug);
        if (note === file) next.slug = newSlug;
        if (!same(next, fm.values)) changes.push({ path: note.path, before, staged: before, after: fm.replace(next), kind: 'board' });
        // Other properties, prose and queries are references, not task assignments.
        const remainder = { ...fm.values }; delete remainder['include-tags']; delete remainder['exclude-tags']; delete remainder.slug;
        if (mentionsNamespace(JSON.stringify(remainder) + fm.body, oldSlug)) referencePaths.push(note.path);
      } else {
        const rewritten = rewriteBoardTaskTags(before, oldSlug, newSlug);
        tagCount += rewritten.count;
        if (rewritten.after !== before) changes.push({ path: note.path, before, staged: rewritten.staged, after: rewritten.after, kind: 'tasks' });
        if (mentionsNamespace(rewritten.after, oldSlug)) referencePaths.push(note.path);
      }
    }
    changes.sort((a, b) => a.path.localeCompare(b.path)); referencePaths.sort();
    return { originalPath, targetPath, oldSlug, newSlug, tagCount, changes, paths: changes.map((c) => c.path), referencePaths, boardNames: boardNames.sort() };
  }

  private async swap(path: string, expected: string, next: string): Promise<void> {
    if (expected === next) return;
    await this.app.vault.process(this.file(path), (current) => {
      if (current !== expected) throw new Error(`Note changed since preview: ${path}`);
      return next;
    });
  }

  private async saveRecord(path: string, record: RenameRecord): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    const text = JSON.stringify(record, null, 2);
    if (file instanceof TFile) await this.app.vault.modify(file, text);
    else if (!file) await this.app.vault.create(path, text);
    else throw new Error('The recovery path is a folder.');
  }

  async apply(plan: RenamePlan): Promise<string> {
    if (this.busy) throw new Error('Another board rename is running.');
    // Re-scan for new tasks, collisions and changed filters, not just the notes in the old preview.
    const fresh = await this.preview(this.file(plan.originalPath), plan.originalPath, plan.targetPath.split('/').pop()!.slice(0, -3));
    if (!same(fresh, plan)) throw new Error('The vault changed since preview. Preview the changes again before saving.');
    if (this.busy) throw new Error('Another board rename is running.');
    this.busy = true;
    const path = `${RENAME_RECOVERY_FOLDER}/${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID()}.json`;
    const copiedState = { ...(this.context.collapsed()[plan.oldSlug] ?? {}) };
    const record: RenameRecord = { ...plan, version: 1, created: new Date().toISOString(), status: 'prepared',
      priorState: this.context.collapsed()[plan.newSlug] ?? null, copiedState };
    let backupSaved = false, committed = false;
    try {
      const folder = this.app.vault.getAbstractFileByPath(RENAME_RECOVERY_FOLDER);
      if (!folder) await this.app.vault.createFolder(RENAME_RECOVERY_FOLDER);
      else if (!(folder instanceof TFolder)) throw new Error(`${RENAME_RECOVERY_FOLDER} must be a folder.`);
      await this.saveRecord(path, record); backupSaved = true;
      // Stage both namespaces, leaving the old board readable throughout the first phase.
      for (const change of plan.changes.filter((c) => c.kind === 'tasks')) await this.swap(change.path, change.before, change.staged);
      for (const change of plan.changes) {
        const expected = change.kind === 'tasks' ? change.staged : change.before;
        if (await this.app.vault.read(this.file(change.path)) !== expected) throw new Error(`Note changed while renaming: ${change.path}`);
      }
      // Switch dependent filters first, then the board itself; both tag sets still exist.
      for (const change of [...plan.changes.filter((c) => c.kind === 'board' && c.path !== plan.originalPath),
        ...plan.changes.filter((c) => c.path === plan.originalPath)]) await this.swap(change.path, change.before, change.after);
      this.context.collapsed()[plan.newSlug] = copiedState;
      await this.context.saveSettings();
      committed = true;
      for (const change of plan.changes.filter((c) => c.kind === 'tasks')) await this.swap(change.path, change.staged, change.after);
      // Rename last: Obsidian can then update links without invalidating pending task writes.
      if (plan.originalPath !== plan.targetPath) await this.app.fileManager.renameFile(this.file(plan.originalPath), plan.targetPath);
      record.status = 'complete'; await this.saveRecord(path, record);
      return path;
    } catch (error) {
      record.status = 'needs-recovery'; record.problem = error instanceof Error ? error.message : String(error);
      if (backupSaved) {
        // On pre-commit failures, restore only exact known snapshots. Never overwrite a concurrent edit.
        if (!committed) {
          try { await this.restoreRecord(record); record.status = 'restored'; }
          catch { /* The saved snapshots remain available through the recovery command. */ }
        }
        try { await this.saveRecord(path, record); } catch { /* The original prepared journal is already durable. */ }
      }
      throw new Error(backupSaved
        ? `${record.status === 'restored' ? 'Rename failed and was restored.' : committed ? 'Board tags changed, but cleanup or the filename rename was interrupted.' : 'Rename was interrupted.'} ${record.problem} Recovery copy: ${path}. Use “Restore board rename” to review recovery.`
        : `No notes changed: could not save the recovery copy. ${record.problem}`);
    } finally { this.busy = false; }
  }

  /** Restoring is restartable. A conflicting note blocks the operation before restoring any note snapshots. */
  private async restoreRecord(record: RenameRecord, markStarted: () => void = () => {}): Promise<void> {
    const knownPaths = new Set([...record.changes.map((c) => c.path), record.targetPath]);
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (knownPaths.has(file.path) || !safePath(file.path)) continue;
      const content = await this.app.vault.read(file);
      if (mentionsNamespace(content, record.newSlug)) throw new Error(`Restore stopped: ${file.path} now uses the new tag prefix and was not part of this rename.`);
      if (inFolder(file.path, this.context.boardsFolder())) {
        const slug = parseBoardConfig(file.basename, frontmatter(content).values).config.slug;
        if (slug === record.oldSlug || slug === record.newSlug) throw new Error(`Restore stopped: another board now uses this tag prefix: ${file.path}.`);
      }
    }
    const write = async (path: string, expected: string, next: string) => {
      if (expected !== next) markStarted();
      await this.swap(path, expected, next);
    };
    const original = this.app.vault.getAbstractFileByPath(record.originalPath);
    const renamed = this.app.vault.getAbstractFileByPath(record.targetPath);
    if (original && renamed && original !== renamed) throw new Error('Both the original and renamed board paths exist. Resolve the filename conflict first.');
    const boardPath = renamed ? record.targetPath : record.originalPath;
    // Undo Obsidian's automatic link updates first. This uses its normal rename API,
    // preserving any unrelated edits. If content conflicts remain, return to the new name.
    if (boardPath !== record.originalPath) await this.app.fileManager.renameFile(this.file(boardPath), record.originalPath);
    // Obsidian may shorten [[folder/Board]] to [[Board]] when updating links.
    // Accept only equivalent wiki-link targets resolving to this restored board;
    // aliases, headings and every other byte must still match a saved snapshot.
    const canonical = (text: string, source: string) => text.replace(/\[\[([^\]\r\n]+)\]\]/g, (whole, link: string) => {
      const boundary = link.search(/[|#]/);
      const target = boundary < 0 ? link : link.slice(0, boundary);
      const suffix = boundary < 0 ? '' : link.slice(boundary);
      const destination = this.app.metadataCache?.getFirstLinkpathDest(target, source);
      return target === record.originalPath.slice(0, -3) || destination?.path === record.originalPath
        ? `[[${record.originalPath.slice(0, -3)}${suffix}]]` : whole;
    });
    const matches = (current: string, snapshot: string, source: string) => current === snapshot || canonical(current, source) === canonical(snapshot, source);
    const actualPath = (c: Change) => c.path;
    const snapshots = new Map<string, string>();
    const conflicts: string[] = [];
    for (const change of record.changes) {
      try {
        const current = await this.app.vault.read(this.file(actualPath(change)));
        snapshots.set(change.path, current);
        if (![change.before, change.staged, change.after].some((value) => matches(current, value, change.path))) conflicts.push(actualPath(change));
      } catch { conflicts.push(actualPath(change)); }
    }
    if (conflicts.length) {
      if (boardPath !== record.originalPath) await this.app.fileManager.renameFile(this.file(record.originalPath), boardPath);
      throw new Error(`Restore stopped because these notes changed or are missing: ${conflicts.join(', ')}. Keep those edits and reconcile them with the recovery copy.`);
    }
    for (const change of record.changes.filter((c) => c.kind === 'tasks')) {
      const current = snapshots.get(change.path)!;
      if (matches(current, change.after, change.path)) await write(change.path, current, change.staged);
      else if (matches(current, change.staged, change.path)) await write(change.path, current, change.staged);
      else if (matches(current, change.before, change.path)) await write(change.path, current, change.before);
    }
    // Each old/new board configuration has its corresponding tags while recovery runs.
    for (const change of record.changes.filter((c) => c.kind === 'board')) {
      await write(actualPath(change), snapshots.get(change.path)!, change.before);
    }
    for (const change of record.changes.filter((c) => c.kind === 'tasks')) {
      const current = await this.app.vault.read(this.file(change.path));
      if (current === change.staged) await write(change.path, current, change.before);
      else if (current !== change.before) throw new Error(`Note changed during recovery: ${change.path}`);
    }
    if (same(this.context.collapsed()[record.newSlug], record.copiedState)) {
      if (record.priorState) this.context.collapsed()[record.newSlug] = record.priorState;
      else delete this.context.collapsed()[record.newSlug];
      await this.context.saveSettings();
    }
  }

  async restore(path: string): Promise<void> {
    if (this.busy) throw new Error('Another board rename is running.');
    const entry = (await this.history()).find((entry) => entry.path === path);
    if (!entry) throw new Error('Recovery record not found.');
    if (entry.record.status === 'restored') throw new Error('This rename was already restored.');
    if (this.busy) throw new Error('Another board rename is running.');
    this.busy = true;
    const previousStatus = entry.record.status;
    let started = false;
    try {
      entry.record.status = 'needs-recovery';
      await this.saveRecord(path, entry.record);
      await this.restoreRecord(entry.record, () => { started = true; });
      entry.record.status = 'restored'; delete entry.record.problem;
      await this.saveRecord(path, entry.record);
    } catch (error) {
      entry.record.status = started ? 'needs-recovery' : previousStatus;
      entry.record.problem = error instanceof Error ? error.message : String(error);
      try { await this.saveRecord(path, entry.record); } catch { /* The pre-restore journal remains durable. */ }
      throw error;
    } finally { this.busy = false; }
  }

  async history(): Promise<Array<{ path: string; record: RenameRecord }>> {
    const results: Array<{ path: string; record: RenameRecord }> = [];
    for (const file of this.app.vault.getFiles().filter((f) => f.path.startsWith(RENAME_RECOVERY_FOLDER + '/') && f.extension === 'json')) {
      const raw: unknown = JSON.parse(await this.app.vault.read(file));
      // Recovery files are vault data, not trusted instructions or unrestricted filesystem paths.
      if (!raw || typeof raw !== 'object') continue;
      const record = raw as RenameRecord;
      if (record.version !== 1 || typeof record.originalPath !== 'string' || typeof record.targetPath !== 'string' ||
        !safePath(record.originalPath) || !safePath(record.targetPath) || !Array.isArray(record.changes) ||
        typeof record.oldSlug !== 'string' || typeof record.newSlug !== 'string' || !record.copiedState ||
        typeof record.created !== 'string' || !['prepared', 'complete', 'needs-recovery', 'restored'].includes(record.status) ||
        !/^[\p{L}\p{N}_-]+$/u.test(record.oldSlug) || !/^[\p{L}\p{N}_-]+$/u.test(record.newSlug) ||
        !record.changes.every((c) => c && typeof c.path === 'string' && safePath(c.path) && typeof c.before === 'string' &&
          typeof c.staged === 'string' && typeof c.after === 'string' && ['board', 'tasks'].includes(c.kind)) ||
        !record.changes.some((c) => c.path === record.originalPath && c.kind === 'board')) continue;
      results.push({ path: file.path, record });
    }
    return results.sort((a, b) => b.path.localeCompare(a.path));
  }
}
