// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
vi.mock('../src/obsidian/BoardSettingsModal.ts', () => ({ BoardSettingsModal: class {} }));
vi.mock('../src/obsidian/BoardView.ts', () => ({ BoardView: class {}, VIEW_TYPE_BOARD: 'board' }));
vi.mock('../src/obsidian/BoardListView.ts', () => ({ BoardListView: class {}, VIEW_TYPE_BOARD_LIST: 'board-list' }));
const opened: unknown[] = [];
vi.mock('../src/obsidian/WhatsNewModal.ts', () => ({ WhatsNewModal: class { constructor(_app: unknown, public options: unknown) {} open() { opened.push(this); } } }));
import TaskTrellisPlugin from '../main.ts';
import { parseBoardConfig } from '../src/core/boardConfig.ts';
import { draftFromConfig, draftToFrontmatter } from '../src/core/boardDraft.ts';
import { compareVersions, FEATURES, suggestedColorRules, unseenFeatures } from '../src/core/whatsNew.ts';
import { normalizeSettings, TaskTrellisSettingTab } from '../src/settings.ts';
import { renderWhatsNew } from '../src/ui/renderWhatsNew.ts';
import type { WhatsNewOptions } from '../src/ui/renderWhatsNew.ts';

describe('what’s new', () => {
  it('compares versions part by part', () => {
    expect(compareVersions('1.10.0', '1.9.2')).toBeGreaterThan(0);
    expect(compareVersions('1.4', '1.4.0')).toBe(0);
    expect(compareVersions('1.3.0', '1.4.0')).toBeLessThan(0);
  });

  it('shows the features added since the version last seen, up to the running one', () => {
    expect(unseenFeatures('1.3.0', '1.4.0').map((f) => f.name)).toEqual(['Board templates', 'Patterns and opacity for color rules']);
    expect(unseenFeatures('1.2.0', '1.4.0')).toHaveLength(3);
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
  function window(hidden = false) {
    const body = document.createElement('div'), header = document.createElement('div');
    document.body.replaceChildren(header, body);
    const options = { version: '1.4.0', features: unseenFeatures('1.3.0', '1.4.0'), hidden, setHidden: vi.fn(), openSettings: vi.fn() };
    const close = vi.fn();
    renderWhatsNew(body, header, options, () => undefined, close);
    const button = (text: string) => [...body.querySelectorAll('button')].find((b) => b.textContent === text)!;
    return { body, header, options, close, button, box: body.querySelector<HTMLInputElement>('input[type="checkbox"]')! };
  }

  it('lists the features, and saves Don’t show this again as soon as it changes', () => {
    const ui = window();
    expect(ui.header.querySelector('.tt-editor-cancel')!.getAttribute('aria-label')).toBe('Close');
    expect([...ui.body.querySelectorAll('li strong')].map((s) => s.textContent)).toEqual(['Board templates', 'Patterns and opacity for color rules']);
    expect(ui.box.closest('label')!.textContent).toBe('Don’t show this again');
    expect(ui.box.checked).toBe(false);
    ui.box.checked = true; ui.box.dispatchEvent(new Event('change'));
    expect(ui.options.setHidden).toHaveBeenLastCalledWith(true);
    ui.box.checked = false; ui.box.dispatchEvent(new Event('change'));
    expect(ui.options.setHidden).toHaveBeenLastCalledWith(false);
    expect(window(true).box.checked).toBe(true);
  });

  it('closes, or closes and opens the settings to try the features', () => {
    const ui = window();
    ui.button('Close').click();
    expect([ui.close.mock.calls.length, ui.options.openSettings.mock.calls.length]).toEqual([1, 0]);
    ui.button('Try them in settings').click();
    expect([ui.close.mock.calls.length, ui.options.openSettings.mock.calls.length]).toEqual([2, 1]);
  });
});

describe('what’s new in the plugin', () => {
  function plugin(settings: Record<string, unknown>) {
    const p = Object.create(TaskTrellisPlugin.prototype) as TaskTrellisPlugin;
    Object.assign(p, { app: {}, manifest: { id: 'task-trellis', version: '1.4.0' }, settings: normalizeSettings(settings), stopped: false, saveSettings: vi.fn(async () => undefined) });
    return { p, show: () => (p as unknown as { showWhatsNew(): void }).showWhatsNew() };
  }

  it('shows once per update, and never once Don’t show this again is checked', () => {
    opened.length = 0;
    const { p, show } = plugin({ whatsNewSeen: '1.3.0' });
    show(); show();
    expect(opened).toHaveLength(1);
    expect(p.settings.whatsNewSeen).toBe('1.4.0');
    const options = (opened[0] as { options: WhatsNewOptions }).options;
    expect(options.features.map((f) => f.version)).toEqual(['1.4.0', '1.4.0']);
    options.setHidden(true);
    expect(p.settings.whatsNewHidden).toBe(true);
    expect(p.saveSettings).toHaveBeenCalledTimes(2);

    opened.length = 0;
    plugin({ whatsNewSeen: '1.3.0', whatsNewHidden: true }).show();
    expect(opened).toHaveLength(0);
  });

  it('lists every feature in the settings, with a button for those you can try, and a switch for the window', () => {
    const { p } = plugin({});
    Object.assign(p, { quickAdd: { dailyNotesAvailable: () => true }, writer: { tasksApi: () => null } });
    const tab = Object.create(TaskTrellisSettingTab.prototype) as TaskTrellisSettingTab;
    Object.assign(tab, { trellis: p });
    const group = tab.getSettingDefinitions().find((d) => 'heading' in d && d.heading === 'What’s new') as { cls: string; items: { name: string; desc: string; render?: unknown }[] };
    expect(group.cls).toBe('tt-whats-new');
    expect(group.items.map((i) => [i.name, !!i.render])).toEqual([
      ['Board templates', true], ['Patterns and opacity for color rules', true], ['Search cards', false], ['Show what’s new after updates', true],
    ]);
    expect(group.items[0]!.desc).toMatch(/New in 1\.4\.0\.$/);
  });
});
