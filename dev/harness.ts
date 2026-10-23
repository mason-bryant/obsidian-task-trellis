// Runs the real board model and renderer against an in-memory vault, for checking the UI in a browser.
import { applyEdit, buildBoard, planDrop, taskId, type BoardTask, type TaskEdit } from '../src/core/board.ts';
import { parseBoardConfig } from '../src/core/boardConfig.ts';
import { draftChanged, draftFromConfig, draftToFrontmatter } from '../src/core/boardDraft.ts';
import { appendSort, buildNewTaskLine, finishNewTaskLine, insertUnderHeading } from '../src/core/newTask.ts';
import { renderBoardSettings } from '../src/ui/renderBoardSettings.ts';
import { addDays, todayISO } from '../src/core/dates.ts';
import { indentWidth, insertSubtask } from '../src/core/subtasks.ts';
import { parseTaskLine, setClosedFallback, setPlacement } from '../src/core/taskLine.ts';
import { isDragging, renderBoard, type RenderHost } from '../src/ui/renderBoard.ts';

const today = todayISO();
const d = (n: number) => addDays(today, n);

const files: Record<string, string[]> = {
  'Projects/Kitchen.md': [
    '# Kitchen',
    `- [ ] Repaint the kitchen ⏫ ➕ ${d(-6)} 📅 ${d(2)} #tt/house/doing/100`,
    `\t- [x] Buy primer ✅ ${d(-1)}`,
    `\t- [ ] Patch the walls 📅 ${d(-1)}`,
    '\t\t- [ ] Fill the nail holes',
    '\t\t- [ ] Sand the patches',
    '\t- [ ] Paint the trim 🔼',
    `- [ ] Review the [[Kitchen plan]] with the contractor 📅 ${d(-2)} #tt/house/waiting/100`,
    `- [ ] Get countertop quotes 🔼 📅 ${d(5)}`,
    `- [ ] Book the chimney sweep 📅 ${d(12)} #tt/house/backlog/100`,
    '\t- Shortlist',
    '\t\t- [ ] Call the sweep on Elm St',
    `- [x] Replace the furnace filter ➕ ${d(-9)} 📅 ${d(-1)} ✅ ${d(-1)} #tt/house/done/100`,
    `- [ ] Plan the garden beds 🔺 📅 ${d(30)}`,
    `- [ ] Clean out the garage 🔽 📅 ${d(90)}`,
    ...[1, 2, 3, 4, 5, 6].map((n) => `- [x] Fixed squeaky door ${n} ➕ ${d(-10)} 📅 ${d(-1)} ✅ ${d(-n % 6)}`),
  ],
  'Daily/Today.md': [
    `- [ ] Reply to the roofer about the estimate #house 📅 ${d(0)}`,
    '- [ ] Sketch the backyard layout #tt/house/doing/200',
    '- [ ] Read the dishwasher manual',
    `- [ ] Water the plants 🔁 every week 📅 ${d(1)} #tt/garden/doing`,
  ],
};
const frontmatter: Record<string, Record<string, unknown>> = {
  'Projects/Kitchen.md': { context: ['house'] },
  'Daily/Today.md': { context: 'house' },
};

let { config, warnings } = parseBoardConfig('House', {
  slug: 'house',
  columns: ['Backlog', 'Doing', 'Waiting', 'Done'],
  'done-column': 'Done',
  'due-now-days': 7,
  'week-horizon': 4,
  'filter-properties': ['context: house'],
});
const collapsed: Record<string, boolean> = {};

// Stands in for Obsidian's list parsing: a list item's parent is the nearest less-indented item above it.
function tasks(): BoardTask[] {
  const out: BoardTask[] = [];
  for (const [path, lines] of Object.entries(files)) {
    const open: { width: number; line: number; task: boolean }[] = [];
    lines.forEach((raw, line) => {
      if (!/^[\s>]*(?:[-*+]|\d+[.)])\s/.test(raw)) {
        if (raw.trim()) open.length = 0;
        return;
      }
      const width = indentWidth(raw);
      while (open.length > 0 && open[open.length - 1]!.width >= width) open.pop();
      const parent = [...open].reverse().find((o) => o.task);
      const parsed = parseTaskLine(raw);
      open.push({ width, line, task: parsed !== null });
      if (parsed) out.push({ ...parsed, id: taskId(path, line), path, line, raw, ...(parent && { parentId: taskId(path, parent.line) }) });
    });
  }
  return out;
}

const toggle = (line: string) => [setClosedFallback(line, !parseTaskLine(line)?.closed, today)];

function write(edits: Map<string, TaskEdit>): void {
  const byId = new Map(tasks().map((t) => [t.id, t]));
  const ordered = [...edits].map(([id, e]) => [byId.get(id)!, e] as const).sort((a, b) => b[0].line - a[0].line);
  for (const [task, edit] of ordered) files[task.path]!.splice(task.line, 1, ...applyEdit(task.raw, edit, config.slug, toggle));
}

const GLYPHS: Record<string, string> = { plus: '+', 'arrow-up': '↑', 'arrow-down': '↓', x: '×', 'list-plus': '⊕', 'arrow-left': '←', 'arrow-right': '→' };

let highlighted: string | null = null;

const host: RenderHost = {
  renderText: (el, task) => (el.textContent = task.text),
  // Lucide's file-text, which Obsidian's setIcon draws in the plugin.
  icon: (el, name) =>
    name !== 'file-text'
      ? (el.textContent = GLYPHS[name] ?? name)
      : (el.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>'),
  sourceLabel: (task) => task.path.split('/').pop()!.replace(/\.md$/, ''),
  isCollapsed: (rowId) => collapsed[rowId] ?? (rowId === 'later' || rowId.startsWith('more:')),
  onToggleRow: (rowId) => {
    collapsed[rowId] = !host.isCollapsed(rowId);
    render();
  },
  onDrop: (id, target) => {
    const edits = planDrop(model(), id, target);
    (window as unknown as { lastDrop: unknown }).lastDrop = { id, target, edits: Object.fromEntries(edits) };
    write(edits);
    render();
  },
  onToggle: (task) => {
    files[task.path]!.splice(task.line, 1, ...toggle(task.raw));
    render();
  },
  onEdit: (task) => {
    const next = window.prompt('Edit task line (stands in for the Tasks modal)', task.raw);
    if (next === null) return;
    files[task.path]![task.line] = next;
    render();
  },
  onOpenSource: (task, _newTab) => {
    highlighted = task.id;
    render();
  },
  onDragEnd: () => undefined,
  // Mirrors QuickAdd: today's note (here Daily/Today.md) under its "## Tasks" heading.
  onAddTask: (target, text, detailed) => {
    const m = model();
    const cards = m.cells[target.rowId]?.[target.columnId] ?? [];
    const fields = {
      due: m.rows.find((r) => r.id === target.rowId)?.dropDate ?? null,
      created: today,
      placement: { slug: config.slug, column: target.columnId, sort: appendSort(cards[cards.length - 1]?.placements[config.slug]?.sort, cards.length === 0) },
    };
    let line: string | null = buildNewTaskLine(text, fields);
    if (detailed) {
      const edited = window.prompt('Task line (stands in for the Tasks modal)', buildNewTaskLine(text, { due: fields.due }));
      line = edited ? finishNewTaskLine(edited, fields) : null;
    }
    if (!line || !parseTaskLine(line)?.text) return;
    const path = 'Daily/Today.md';
    files[path] = insertUnderHeading(files[path]!.join('\n'), '## Tasks', [line]).split('\n');
    render();
  },
  onAddSubtask: (parent, text, detailed) => {
    let line: string | null = buildNewTaskLine(text, { created: today });
    if (detailed) {
      const edited = window.prompt('Subtask line (stands in for the Tasks modal)', buildNewTaskLine(text, {}));
      line = edited ? finishNewTaskLine(edited, { created: today }) : null;
    }
    if (!line || !parseTaskLine(line)?.text) return;
    files[parent.path] = insertSubtask(files[parent.path]!.join('\n'), parent.line, line, '\t').split('\n');
    render();
  },
};

function model() {
  return buildBoard(tasks(), config, today, (path) => frontmatter[path]);
}

function render(): void {
  renderBoard(document.getElementById('board')!, model(), host, { warnings, info: [`Harness · today is ${today}`] });
  const src = document.getElementById('source')!;
  src.replaceChildren();
  for (const [path, lines] of Object.entries(files)) {
    const h = document.createElement('h4');
    h.textContent = path;
    src.append(h);
    lines.forEach((line, i) => {
      const row = document.createElement('div');
      row.className = `src-line${highlighted === `${path}:${i}` ? ' is-highlighted' : ''}`;
      row.textContent = line;
      src.append(row);
    });
  }
}


function openSettings(): void {
  const dialog = document.getElementById('settings') as HTMLDialogElement;
  const body = dialog.querySelector<HTMLElement>('.modal-content')!;
  const keys = document.getElementById('property-keys')!;
  keys.replaceChildren(
    ...[...new Set(Object.values(frontmatter).flatMap((fm) => Object.keys(fm)))].map((k) => {
      const o = document.createElement('option');
      o.value = k;
      return o;
    }),
  );
  // Mirrors BoardSettingsModal: saves on close, stays open while the draft has errors.
  const original = config;
  const draft = draftFromConfig(original);
  let discard = false;
  const tryClose = () => {
    if (!discard) {
      const r = draftToFrontmatter(draft, original);
      if (r.errors.length > 0) {
        form.showErrors(r.errors);
        return;
      }
      if (draftChanged(draft, original)) {
        for (const t of tasks()) {
          const p = t.placements[original.slug];
          const to = p && r.renames.get(p.column);
          if (p && to) files[t.path]![t.line] = setPlacement(t.raw, original.slug, to, p.sort);
        }
        ({ config, warnings } = parseBoardConfig('House', { slug: original.slug, ...r.frontmatter }));
        (window as unknown as { lastSave: unknown }).lastSave = r.frontmatter;
      }
    }
    saves++;
    dialog.close();
    render();
  };
  const form = renderBoardSettings(body, draft, original, {
    icon: (el, name) => (el.textContent = GLYPHS[name] ?? name),
    attachKeySuggest: (input) => input.setAttribute('list', 'property-keys'),
    attachValueSuggest: () => undefined,
    countTagged: (id) => tasks().filter((t) => t.placements[original.slug]?.column === id).length,
    onDiscard: () => {
      discard = true;
      tryClose();
    },
    onOpenNote: () => tryClose(),
  });
  dialog.oncancel = (e) => {
    e.preventDefault();
    tryClose();
  };
  dialog.onclick = (e) => {
    if (e.target === dialog) tryClose();
  };
  dialog.querySelector<HTMLButtonElement>('.modal-close-button')!.onclick = tryClose;
  dialog.showModal();
}

let saves = 0;

document.getElementById('open-settings')!.addEventListener('click', openSettings);
Object.assign(window, { files, render, model, planDrop, today, openSettings, isDragging, closes: () => saves });
render();
