import { planBulk, type BulkResult } from '../src/core/bulkTriage.ts';
import { renderBulkEditor } from '../src/ui/renderBulkEditor.ts';
import './browserDOM.ts';
import { uiElement } from '../src/ui/dom.ts';
import { promptText } from './promptText.ts';
import { renderBoardNameEditor } from '../src/ui/renderBoardNameEditor.ts';
import { applyLabelScheme } from '../src/core/labelSchemes.ts';
import { destinationAdvice } from '../src/core/setup.ts';
import { prepareEditorModal } from '../src/ui/editorHeader.ts';
import { saveLabelDefinition, setTaskLabels, taskLabels } from '../src/core/labels.ts';
import { renderLabelPicker } from '../src/ui/renderLabelPicker.ts';
import { activeQuickFilterIds, setActiveQuickFilterIds, setSubtaskCollapse } from '../src/core/collapse.ts';
import { previewIcon } from './icons.ts';
// Runs the real board model and renderer against an in-memory vault, for checking the UI in a browser.
import { applyEdit, buildBoard, planDrop, taskId, type BoardTask, type TaskEdit } from '../src/core/board.ts';
import { parseBoardConfig } from '../src/core/boardConfig.ts';
import { draftChanged, draftFromConfig, draftToFrontmatter } from '../src/core/boardDraft.ts';
import { propertyValueStrings } from '../src/core/filters.ts';
import { planNewTaskAtTop, buildNewTaskLine, finishNewTaskLine, insertUnderHeading } from '../src/core/newTask.ts';
import { renderBoardSettings, type Section } from '../src/ui/renderBoardSettings.ts';
import { addDays, todayISO } from '../src/core/dates.ts';
import { indentWidth, insertSubtask } from '../src/core/subtasks.ts';
import { reorderSubtaskBlocks } from '../src/core/reorderSubtasks.ts';
import { parseTaskLine, setClosedFallback, setPlacement } from '../src/core/taskLine.ts';
import { clearBulkSelection, isDragging, renderBoard, type RenderHost } from '../src/ui/renderBoard.ts';

const today = todayISO();
const d = (n: number) => addDays(today, n);

const files: Record<string, string[]> = {
  'Projects/Kitchen.md': [
    '# Kitchen #renovation',
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
  'Projects/Kitchen.md': { context: ['house'], status: 'active', tags: ['home/kitchen'] },
  'Daily/Today.md': { context: 'house', status: 'planned', tags: ['daily'] },
};

// Fixture-only stand-in. The plugin uses Obsidian's getAllTags Markdown-aware cache API.
function noteTags(path: string): string[] {
  const prose = (files[path] ?? []).filter((line) => !parseTaskLine(line)).join('\n');
  const inline = [...prose.matchAll(/(?:^|\s)#([\p{L}\p{N}_/-]+)/gu)].map((match) => match[1]!);
  return [...new Set([...propertyValueStrings(frontmatter[path]?.tags), ...inline]
    .map((tag) => tag.replace(/^#/, '').toLowerCase()).filter((tag) => !tag.startsWith('tt/')))];
}

let { config, warnings } = parseBoardConfig('House', {
  slug: 'house',
  columns: ['Backlog', 'Doing', 'Waiting', 'Done'],
  'done-column': 'Done',
  'due-now': 7,
  'week-horizon': 4,
  'filter-properties': ['context: house'],
});
let collapsed: Record<string, boolean> = {};

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

let highlighted: string | null = null;

const host: RenderHost = {
  renderText: (el, task) => (el.textContent = task.text),
  icon: previewIcon,
  onSettings: (section) => openSettings(section),
  onRename: () => {
    const dialog = uiElement(document, 'dialog');
    const body = uiElement(document, 'div'); body.className = 'modal-content';
    dialog.append(body); document.body.append(dialog);
    const chrome = prepareEditorModal(dialog);
    const close = () => { chrome.destroy(); dialog.close(); dialog.remove(); };
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(); });
    dialog.showModal();
    renderBoardNameEditor(body, chrome.header, config.name, previewIcon, async (name) => { config.name = name; render(); }, close);
  },
  onBulkAction: (selected, kind) => new Promise((resolve) => {
    const dialog = uiElement(document, 'dialog');
    const body = uiElement(document, 'div'); body.className = 'modal-content';
    dialog.append(body); document.body.append(dialog);
    const chrome = prepareEditorModal(dialog);
    let busy = false;
    let result: BulkResult | null = null;
    dialog.oncancel = (event) => { if (busy) event.preventDefault(); };
    dialog.onclose = () => { chrome.destroy(); dialog.remove(); resolve(result); };
    renderBulkEditor(body, chrome.header, config, kind, selected.length, previewIcon, async (action) => {
      const before = JSON.stringify(files);
      const edits = planBulk(selected, config, today, action);
      write(edits);
      const current = tasks();
      result = { tasks: selected.flatMap((t) => current.find((next) => next.id === t.id) ?? []), message: `${selected.length} updated.` };
      host.undo = { label: `${selected.length} tasks updated`, run: () => { clearBulkSelection(document.getElementById('board')!); Object.assign(files, JSON.parse(before) as typeof files); host.undo = undefined; render(); } };
      render();
      await Promise.resolve();
    }, () => { if (!busy) dialog.close(); }, (value) => { busy = value; });
    dialog.showModal();
  }),
  onColumnWidthsChange: (widths) => { config.columnWidths = widths; },
  onLabels: (task) => {
    const dialog = uiElement(document, 'dialog'); dialog.className = 'tt-label-modal';
    const body = uiElement(document, 'div'); body.className = 'modal-content';
    dialog.append(body); document.body.append(dialog);
    const chrome = prepareEditorModal(dialog);
    dialog.onclose = () => { chrome.destroy(); dialog.remove(); document.querySelector<HTMLButtonElement>(`[data-board-focus="labels:${task.id}"]`)?.focus(); };
    dialog.onclick = (event) => { if (event.target === dialog) dialog.close(); };
    renderLabelPicker(body, config.labels, taskLabels(task.raw, config.slug), {
      header: chrome.header, onClose: () => dialog.close(),
      showSearch: new URLSearchParams(location.search).has('label-search'),
      icon: previewIcon,
      previousScheme: config.previousLabelScheme,
      saveScheme: async (id) => {
        const next = applyLabelScheme({ labels: config.labels, previous: config.previousLabelScheme }, id);
        config.labels = next.labels; config.previousLabelScheme = next.previous;
        render(); return next;
      },
      saveSelection: async (ids) => {
        const before = JSON.stringify(files);
        files[task.path]![task.line] = setTaskLabels(files[task.path]![task.line]!, config.slug, ids);
        offerUndo(before, 'Task labels updated'); render();
      },
      saveLabel: async (label, intent) => {
        const result = saveLabelDefinition(config.labels, label, intent, config.labelNext);
        config.labels = result.labels; config.labelNext = result.next;
        render(); return result;
      },
    });
    dialog.showModal();
  },
  sourceLabel: (task) => task.path.split('/').pop()!.replace(/\.md$/, ''),
  isCollapsed: (rowId) => collapsed[rowId] ?? (rowId === 'later' || rowId.startsWith('more:')),
  onToggleRow: (rowId) => {
    collapsed[rowId] = !host.isCollapsed(rowId);
    render();
  },
  onSetSubtasksCollapsed: (keys, value) => {
    collapsed = setSubtaskCollapse(collapsed, keys, value);
    render();
  },
  onSubtasksMenu: (_anchor, select, onClose) => {
    const dialog = uiElement(document, 'dialog');
    dialog.setAttribute('aria-label', 'Subtasks');
    for (const collapsed of [true, false]) {
      const item = uiElement(document, 'button');
      item.className = 'move-item';
      item.textContent = `${collapsed ? 'Collapse' : 'Expand'} all subtasks`;
      item.onclick = () => { dialog.close(); select(collapsed); };
      dialog.append(item);
    }
    dialog.onclose = () => { dialog.remove(); onClose(); };
    dialog.onclick = (event) => { if (event.target === dialog) dialog.close(); };
    document.body.append(dialog);
    dialog.showModal();
  },
  onQuickFiltersMenu: (_anchor, items, select, onClose) => {
    const dialog = uiElement(document, 'dialog'); dialog.className = 'move-sheet'; dialog.setAttribute('aria-label', 'Quick filters');
    for (const filter of items) {
      const item = uiElement(document, 'button'); item.className = 'move-item';
      item.setAttribute('role', 'menuitemcheckbox'); item.setAttribute('aria-checked', String(filter.active));
      item.append(filter.title); item.onclick = () => { dialog.close(); select(filter.id); }; dialog.append(item);
    }
    dialog.onclose = () => { dialog.remove(); onClose(); };
    dialog.onclick = (event) => { if (event.target === dialog) dialog.close(); };
    document.body.append(dialog); dialog.showModal();
  },
  onSetQuickFilters: (ids) => {
    collapsed = setActiveQuickFilterIds(collapsed, ids);
    render();
  },
  onDrop: (id, target) => {
    const before = JSON.stringify(files);
    const edits = planDrop(model(), id, target);
    (window as unknown as { lastDrop: unknown }).lastDrop = { id, target, edits: Object.fromEntries(edits) };
    write(edits);
    offerUndo(before, 'Task moved');
    render();
  },
  onReorderSubtask: (move) => {
    const before = JSON.stringify(files);
    const result = reorderSubtaskBlocks(files[move.parent.path]!.join('\n'), move.parent.line,
      move.siblings.map(task => task.line), move.siblings.find(task => task.id === move.taskId)!.line,
      move.siblings.find(task => task.id === move.beforeId)?.line ?? null);
    files[move.parent.path] = result.content.split('\n');
    highlighted = taskId(move.parent.path, result.line);
    const focused = document.activeElement as HTMLElement | null;
    if (focused?.dataset.boardFocus === `subtask:${move.taskId}`) focused.dataset.boardFocus = `subtask:${highlighted}`;
    offerUndo(before, 'Subtask reordered'); render();
  },
  onToggle: (task) => {
    const before = JSON.stringify(files);
    files[task.path]!.splice(task.line, 1, ...toggle(task.raw));
    offerUndo(before, task.closed ? 'Task reopened' : 'Task completed');
    render();
  },
  onEdit: (task) => {
    void promptText('Edit task line (stands in for the Tasks modal)', task.raw).then((next) => {
      if (next === null) return;
      files[task.path]![task.line] = next; render();
    });
  },
  onOpenSource: (task, _newTab) => {
    highlighted = task.id;
    render();
  },
  onDragEnd: () => undefined,
  // Mirrors QuickAdd: today's note (here Daily/Today.md) under its "## Tasks" heading.
  onAddTask: async (target, text, detailed) => {
    const m = model();
    const fields = {
      due: m.rows.find((r) => r.id === target.rowId)?.dropDate ?? null,
      created: today,
      placement: { slug: config.slug, column: target.columnId },
    };
    let line: string | null = buildNewTaskLine(text, fields);
    if (detailed) {
      const edited = await promptText('Task line (stands in for the Tasks modal)', buildNewTaskLine(text, { due: fields.due }));
      line = edited ? finishNewTaskLine(edited, fields) : null;
    }
    if (!line || !parseTaskLine(line)?.text) return false;
    const plan = planNewTaskAtTop(line, m);
    for (const task of Object.values(m.cells).flatMap((columns) => Object.values(columns).flat())) {
      const edit = plan.edits.get(task.id);
      if (edit) files[task.path]![task.line] = setPlacement(task.raw, config.slug, edit.column!, edit.sort);
    }
    line = plan.line;
    const path = 'Daily/Today.md';
    files[path] = insertUnderHeading(files[path]!.join('\n'), '## Tasks', [line]).split('\n');
    render();
    return true;
  },
  onAddSubtask: async (parent, text, detailed) => {
    let line: string | null = buildNewTaskLine(text, { created: today });
    if (detailed) {
      const edited = await promptText('Subtask line (stands in for the Tasks modal)', buildNewTaskLine(text, {}));
      line = edited ? finishNewTaskLine(edited, { created: today }) : null;
    }
    if (!line || !parseTaskLine(line)?.text) return false;
    files[parent.path] = insertSubtask(files[parent.path]!.join('\n'), parent.line, line, '\t').split('\n');
    render();
    return true;
  },
  // A plain list standing in for Obsidian's menu (a bottom sheet on phones).
  onMoveMenu: (task, choices, _evt, onClose) => {
    const dialog = document.getElementById('move') as HTMLDialogElement;
    let moved = false;
    dialog.onclose = () => onClose?.(moved);
    const list = dialog.querySelector<HTMLElement>('.move-list')!;
    list.replaceChildren();
    for (const [title, group] of [['Move to column', choices.columns], ['Move to row', choices.rows]] as const) {
      const label = uiElement(document, 'div');
      label.className = 'move-label';
      label.textContent = title;
      list.append(label);
      for (const choice of group) {
        const item = uiElement(document, 'button');
        item.className = 'move-item';
        item.disabled = choice.current;
        item.append(choice.current ? `${choice.label} ✓` : choice.label);
        if (choice.detail) item.append(Object.assign(uiElement(document, 'span'), { className: 'tt-menu-detail', textContent: choice.detail }));
        item.onclick = () => {
          moved = true;
          host.onDrop(task.id, choice.target);
          dialog.close();
        };
        list.append(item);
      }
    }
    dialog.onclick = (e) => { if (e.target === dialog) dialog.close(); };
    dialog.showModal();
  },
};

function offerUndo(before: string, label: string): void {
  const after = JSON.stringify(files);
  host.undo = { label, run: () => {
    if (JSON.stringify(files) === after) {
      for (const path of Object.keys(files)) delete files[path];
      Object.assign(files, JSON.parse(before));
    }
    host.undo = undefined; render();
  } };
}

function model() {
  return buildBoard(tasks(), config, today, (path) => frontmatter[path], noteTags, activeQuickFilterIds(collapsed));
}

function render(): void {
  renderBoard(document.getElementById('board')!, model(), host, { warnings, info: [`Harness · today is ${today}`] });
  const src = document.getElementById('source')!;
  src.replaceChildren();
  for (const [path, lines] of Object.entries(files)) {
    const h = uiElement(document, 'h4');
    h.textContent = path;
    src.append(h);
    lines.forEach((line, i) => {
      const row = uiElement(document, 'div');
      row.className = `src-line${highlighted === `${path}:${i}` ? ' is-highlighted' : ''}`;
      row.textContent = line;
      src.append(row);
    });
  }
}


function openSettings(initialSection: Section = 'columns'): void {
  const dialog = document.getElementById('settings') as HTMLDialogElement;
  const body = dialog.querySelector<HTMLElement>('.modal-content')!;
  const chrome = prepareEditorModal(dialog);
  const keys = document.getElementById('property-keys')!;
  keys.replaceChildren(
    ...[...new Set(Object.values(frontmatter).flatMap((fm) => Object.keys(fm)))].map((k) => {
      const o = uiElement(document, 'option');
      o.value = k;
      return o;
    }),
  );
  // Mirrors the native modal: explicit save, with cancel/escape discarding the draft.
  const original = config;
  const draft = draftFromConfig(original);
  let discard = false;
  const tryClose = (save = false) => {
    if (!discard && save) {
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
        ({ config, warnings } = parseBoardConfig('House', { slug: original.slug, labels: config.labels, 'previous-label-scheme': config.previousLabelScheme, 'column-widths': config.columnWidths, ...r.frontmatter }));
        (window as unknown as { lastSave: unknown }).lastSave = r.frontmatter;
      }
    }
    if (save) saves++;
    form.destroy(); chrome.destroy();
    dialog.close();
    render();
  };
  const suggest = (input: HTMLInputElement, values: () => string[]) => {
    const list = uiElement(document, 'datalist'); list.id = `suggest-${++suggestId}`;
    input.setAttribute('list', list.id);
    const update = () => list.replaceChildren(...values().map((value) => {
      const option = uiElement(document, 'option'); option.value = value; return option;
    }));
    input.onfocus = update; update(); dialog.append(list);
    return () => list.remove();
  };
  const form = renderBoardSettings(body, draft, original, {
    initialSection,
    destinationAdvice: (draft) => destinationAdvice(parseBoardConfig(original.name, { slug: original.slug, ...draftToFrontmatter(draft, original).frontmatter }).config,
      { kind: 'note', note: 'Daily/Today.md', heading: '' }, {
        dailyAvailable: true, excluded: (path) => path.startsWith('Task Trellis/'),
        metadata: (path) => ({ frontmatter: frontmatter[path], tags: noteTags(path) }),
      }),
    header: chrome.header,
    icon: previewIcon,
    attachKeySuggest: (input) => suggest(input, () => [...new Set(Object.values(frontmatter).flatMap(Object.keys))]),
    attachValueSuggest: (input, key) => suggest(input, () => [...new Set(Object.values(frontmatter).flatMap((fm) => {
      const value = fm[key()]; return value == null ? [] : (Array.isArray(value) ? value : [value]).map(String);
    }))]),
    attachTagSuggest: (input) => suggest(input, () => [...new Set([...tasks().flatMap((t) => t.tags), ...Object.keys(files).flatMap(noteTags)])].sort()),
    attachFolderSuggest: (input) => suggest(input, () => ['Projects', 'Daily']),
    countTagged: (id) => tasks().filter((t) => t.placements[original.slug]?.column === id).length,
    onDiscard: () => {
      discard = true;
      tryClose();
    },
    onSave: () => tryClose(true),
    onOpenBoard: () => tryClose(true),
  });
  dialog.oncancel = (e) => {
    e.preventDefault();
    tryClose();
  };
  dialog.onclick = (e) => {
    if (e.target === dialog) tryClose();
  };
  dialog.querySelector<HTMLButtonElement>('.modal-close-button')!.onclick = () => tryClose();
  dialog.showModal();
}

let saves = 0;
let suggestId = 0;

document.getElementById('open-settings')!.addEventListener('click', () => openSettings());
document.getElementById('theme')!.addEventListener('change', (event) => {
  document.documentElement.dataset.theme = (event.target as HTMLSelectElement).value;
});
document.getElementById('show-source')!.addEventListener('change', (event) => {
  document.getElementById('source')!.hidden = !(event.target as HTMLInputElement).checked;
});
Object.assign(window, { files, render, model, planDrop, today, openSettings, isDragging, closes: () => saves });
render();
