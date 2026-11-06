// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
vi.mock('../src/obsidian/BoardSettingsModal.ts', () => ({ BoardSettingsModal: class {} }));
vi.mock('../src/obsidian/BoardView.ts', () => ({ BoardView: class {}, VIEW_TYPE_BOARD: 'board' }));
vi.mock('../src/obsidian/BoardListView.ts', () => ({ BoardListView: class {}, VIEW_TYPE_BOARD_LIST: 'board-list' }));
import TaskTrellisPlugin from '../main.ts';
import { parseBoardConfig } from '../src/core/boardConfig.ts';
import { buildBoard } from '../src/core/board.ts';
import { draftFromConfig, draftToFrontmatter } from '../src/core/boardDraft.ts';
import { compareVersions, FEATURES, suggestedColorRules, unseenFeatures, type Feature } from '../src/core/whatsNew.ts';
import { normalizeSettings, TaskTrellisSettingTab } from '../src/settings.ts';
import { renderBoard, type RenderHost } from '../src/ui/renderBoard.ts';
import { renderWhatsNew, type WhatsNewOptions } from '../src/ui/renderWhatsNew.ts';

describe('what’s new', () => {
  it('compares versions part by part', () => {
    expect(compareVersions('1.10.0', '1.9.2')).toBeGreaterThan(0);
    expect(compareVersions('1.4', '1.4.0')).toBe(0);
    expect(compareVersions('1.3.0', '1.4.0')).toBeLessThan(0);
  });

  it('shows the features added since the version last seen, up to the running one', () => {
    expect(unseenFeatures('1.3.0', '1.4.0').map((f) => f.name)).toEqual(['Board templates', 'Patterns and opacity for color rules', 'Scroll a No due date column on its own']);
    expect(unseenFeatures('1.2.0', '1.4.0')).toHaveLength(4);
    expect(unseenFeatures('1.4.0', '1.4.0')).toEqual([]);
    // A build older than a listed feature doesn't show it yet.
    expect(unseenFeatures('1.3.0', '1.3.0')).toEqual([]);
    expect(FEATURES.every((f, i) => i === 0 || compareVersions(FEATURES[i - 1]!.version, f.version) >= 0)).toBe(true);
  });

  it('remembers what was seen, starting existing installs at 1.3.0', () => {
    expect(normalizeSettings({ boardsFolder: 'Boards' })).toMatchObject({ whatsNewSeen: '1.3.0', whatsNewHidden: false });
    expect(normalizeSettings({ whatsNewSeen: '1.4.0', whatsNewHidden: true })).toMatchObject({ whatsNewSeen: '1.4.0', whatsNewHidden: true });
  });

  it('suggests color rules a board doesn’t have yet, which save like any others', () => {
    expect(suggestedColorRules([]).map((r) => [r.name, r.pattern])).toEqual([['Overdue', 'stripes'], ['Due today', undefined], ['High priority', 'dots']]);
    const original = parseBoardConfig('House', { slug: 'house', 'color-rules': [{ name: 'overdue', color: '#000000' }] }).config;
    const draft = draftFromConfig(original);
    draft.colorRules.push(...suggestedColorRules(draft.colorRules));
    expect(draftToFrontmatter(draft, original).frontmatter['color-rules']).toEqual([
      { name: 'overdue', color: '#000000' },
      { name: 'Due today', color: '#974f0c', due: ['today'] },
      { name: 'High priority', color: '#803fa5', pattern: 'dots', priority: ['highest', 'high'] },
    ]);
  });
});

describe('what’s new window', () => {
  function window(update?: { hidden: boolean }, setting: { checked?: boolean; available?: boolean; worked?: boolean; hiddenSaves?: boolean } = {}) {
    const body = document.createElement('div'), header = document.createElement('div');
    document.body.replaceChildren(header, body);
    const setHidden = vi.fn(async (_hidden: boolean) => setting.hiddenSaves ?? true), tryFeature = vi.fn(), close = vi.fn();
    const save = vi.fn(async (_checked: boolean) => setting.worked ?? true);
    renderWhatsNew(body, header, {
      features: update ? unseenFeatures('1.3.0', '1.4.0') : FEATURES, tryFeature,
      setting: () => ({ checked: setting.checked ?? false, available: setting.available ?? true, save }),
      ...(update && { update: { version: '1.4.0', hidden: update.hidden, setHidden } }),
    }, () => undefined, close);
    const button = (text: string) => [...body.querySelectorAll('button')].find((b) => b.textContent === text)!;
    return {
      body, header, setHidden, tryFeature, close, button, save,
      box: body.querySelector<HTMLInputElement>('.tt-whats-new-hide input'),
      scrollBox: body.querySelector<HTMLInputElement>('.tt-whats-new-setting input')!,
    };
  }

  it('lists every feature from the toolbar, each button closing the window and then trying its feature', () => {
    const ui = window();
    expect(ui.header.querySelector('.tt-editor-cancel')!.getAttribute('aria-label')).toBe('Close');
    expect([...ui.body.querySelectorAll('li strong')].map((s) => s.textContent)).toEqual(FEATURES.map((f) => f.name));
    expect([...ui.body.querySelectorAll('li')].map((li) => li.querySelector('button')?.textContent)).toEqual(['Create board…', 'Add suggested color rules…', undefined, undefined]);
    expect(ui.body.querySelector('.tt-whats-new-description')!.textContent).toMatch(/New in 1\.4\.0\.$/);
    expect(ui.box).toBeNull();
    const notes = ui.body.querySelector<HTMLAnchorElement>('a.tt-whats-new-notes')!;
    expect([notes.textContent, notes.href, notes.target]).toEqual(['See all release notes on GitHub', 'https://github.com/mason-bryant/obsidian-task-trellis/releases', '_blank']);
    ui.button('Add suggested color rules…').click();
    expect(ui.close).toHaveBeenCalledOnce();
    expect(ui.tryFeature).toHaveBeenCalledWith('color-rules');
    expect(ui.close.mock.invocationCallOrder[0]!).toBeLessThan(ui.tryFeature.mock.invocationCallOrder[0]!);
    ui.button('Create board…').click();
    expect(ui.tryFeature).toHaveBeenLastCalledWith('create-board');
  });

  it('after an update, lists what it added and saves Don’t show this again as soon as it changes', () => {
    const ui = window({ hidden: false });
    expect(ui.body.querySelector('p')!.textContent).toBe('Task Trellis 1.4.0 adds:');
    expect([...ui.body.querySelectorAll('li strong')].map((s) => s.textContent)).toEqual(['Board templates', 'Patterns and opacity for color rules', 'Scroll a No due date column on its own']);
    expect(ui.body.textContent).toContain('The What’s new button on a board’s toolbar shows this at any time.');
    expect(ui.body.querySelector('a.tt-whats-new-notes')!.textContent).toBe('See all release notes on GitHub');
    const box = ui.box!;
    expect(box.closest('label')!.textContent).toBe('Don’t show this again');
    expect(box.checked).toBe(false);
    box.checked = true; box.dispatchEvent(new Event('change'));
    expect(ui.setHidden).toHaveBeenLastCalledWith(true);
    box.checked = false; box.dispatchEvent(new Event('change'));
    expect(ui.setHidden).toHaveBeenLastCalledWith(false);
    expect(window({ hidden: true }).box!.checked).toBe(true);
  });

  it.each([[undefined], [{ hidden: false }]])('offers a No due date column’s scrolling as a checkbox that saves as soon as it changes (%j)', async (update) => {
    const ui = window(update);
    const item = ui.scrollBox.closest('li')!;
    expect(item.querySelector('strong')!.textContent).toBe('Scroll a No due date column on its own');
    expect(ui.scrollBox.closest('label')!.textContent).toBe('Scroll this board’s No due date column on its own');
    expect(ui.scrollBox.checked).toBe(false);
    ui.scrollBox.click();
    expect(ui.save).toHaveBeenLastCalledWith(true);
    // It stays open, with focus where it was, so the board behind it can be looked at.
    expect(ui.close).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(ui.save).toHaveResolved());
    expect(ui.scrollBox.checked).toBe(true);
    expect(window(update, { checked: true }).scrollBox.checked).toBe(true);
  });

  it('puts Don’t show this again back when saving it fails', async () => {
    const ui = window({ hidden: false }, { hiddenSaves: false });
    ui.box!.click();
    expect(ui.setHidden).toHaveBeenCalledWith(true);
    await vi.waitFor(() => expect(ui.box!.checked).toBe(false));
  });

  it('puts the checkbox back when saving fails', async () => {
    const off = window(undefined, { worked: false });
    off.scrollBox.click();
    await vi.waitFor(() => expect(off.scrollBox.checked).toBe(false));
    const on = window(undefined, { checked: true, worked: false });
    on.scrollBox.click();
    await vi.waitFor(() => expect(on.scrollBox.checked).toBe(true));
  });

  it('says why the checkbox is disabled on a board with no No due date column', () => {
    const ui = window(undefined, { available: false });
    expect(ui.scrollBox.disabled).toBe(true);
    expect(ui.scrollBox.closest('li')!.textContent).toContain('This board has no No due date column. Choose one under Settings, in Setup.');
    expect(window().scrollBox.closest('li')!.textContent).not.toContain('This board has no');
  });
});

describe('what’s new on the board', () => {
  const draw = (onWhatsNew?: () => void) => {
    const root = document.createElement('div'); document.body.replaceChildren(root);
    const host: RenderHost = {
      renderText: (el, t) => { el.textContent = t.text; }, icon: () => undefined, sourceLabel: (t) => t.path,
      isCollapsed: () => false, onToggleRow: vi.fn(), onSetSubtasksCollapsed: vi.fn(), onDrop: vi.fn(), onToggle: vi.fn(),
      onEdit: vi.fn(), onOpenSource: vi.fn(), onDragEnd: vi.fn(), onAddTask: vi.fn(() => true), onAddSubtask: vi.fn(() => true),
      onSettings: vi.fn(), onWhatsNew,
    };
    const config = parseBoardConfig('House', { slug: 'house', columns: ['Backlog', 'Done'], 'done-column': 'done', 'quick-filters': null }).config;
    renderBoard(root, buildBoard([], config, '2026-11-03', () => undefined), host, { warnings: [], info: [] });
    return [...root.querySelector('.tt-board-tools')!.children] as HTMLElement[];
  };

  it('puts the button just before Settings, which stays last', () => {
    const open = vi.fn();
    const tools = draw(open);
    expect(tools.slice(-2).map((t) => t.textContent)).toEqual(['What’s new', 'Settings']);
    tools.at(-2)!.click();
    expect(open).toHaveBeenCalledOnce();
    expect(draw().map((t) => t.textContent)).not.toContain('What’s new');
  });
});

describe('what’s new in the plugin', () => {
  function plugin(settings: Record<string, unknown>) {
    const p = Object.create(TaskTrellisPlugin.prototype) as TaskTrellisPlugin;
    Object.assign(p, { app: {}, manifest: { id: 'task-trellis', version: '1.4.0' }, settings: normalizeSettings(settings), stopped: false, saveSettings: vi.fn(async () => true) });
    const openWhatsNew = vi.fn<(features: Feature[], update: NonNullable<WhatsNewOptions['update']>) => void>();
    return { p, openWhatsNew, show: () => (p as unknown as { showWhatsNew(view: unknown): void }).showWhatsNew({ openWhatsNew }) };
  }

  it('shows once per update on the board in view, and never once Don’t show this again is checked', async () => {
    const { p, show, openWhatsNew } = plugin({ whatsNewSeen: '1.3.0' });
    show(); show();
    expect(openWhatsNew).toHaveBeenCalledOnce();
    expect(p.settings.whatsNewSeen).toBe('1.4.0');
    const [features, update] = openWhatsNew.mock.calls[0]!;
    expect(features.map((f) => f.version)).toEqual(['1.4.0', '1.4.0', '1.4.0']);
    expect([update.version, update.hidden]).toEqual(['1.4.0', false]);
    await update.setHidden(true);
    expect(p.settings.whatsNewHidden).toBe(true);
    expect(p.saveSettings).toHaveBeenCalledTimes(2);
    // A save that fails puts it back, so it matches what's saved.
    vi.mocked(p.saveSettings).mockResolvedValueOnce(false);
    expect(await update.setHidden(false)).toBe(false);
    expect(p.settings.whatsNewHidden).toBe(true);

    const hidden = plugin({ whatsNewSeen: '1.3.0', whatsNewHidden: true });
    hidden.show();
    expect(hidden.openWhatsNew).not.toHaveBeenCalled();
  });

  it('keeps only the switch for the window in the plugin settings', () => {
    const { p } = plugin({});
    Object.assign(p, { quickAdd: { dailyNotesAvailable: () => true }, writer: { tasksApi: () => null } });
    const tab = Object.create(TaskTrellisSettingTab.prototype) as TaskTrellisSettingTab;
    Object.assign(tab, { trellis: p });
    const names = tab.getSettingDefinitions().map((d) => 'name' in d ? d.name : '');
    expect(names).toContain('Show what’s new after updates');
    expect(names.filter((n) => FEATURES.some((f) => f.name === n))).toEqual([]);
  });
});
