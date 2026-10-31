// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('obsidian', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('./mocks/obsidian.ts');
  const helpers = <T extends HTMLElement>(el: T): T => Object.assign(el, {
    empty: () => el.replaceChildren(),
    addClass: (cls: string) => el.classList.add(cls),
  });
  /** Opens and closes like Obsidian's Modal: Escape and clicks outside call close(). */
  class Modal {
    modalEl = helpers(document.createElement('div')); contentEl = helpers(document.createElement('div'));
    title = '';
    open = vi.fn(() => { document.body.append(this.modalEl); this.onOpen(); });
    constructor(public app: unknown) { this.modalEl.append(this.contentEl); }
    close() { this.onClose(); this.modalEl.remove(); }
    setTitle(title: string) { this.title = title; return this; }
    onOpen() {}
    onClose() {}
  }
  class TextComponent { inputEl = document.createElement('input'); }
  class DropdownComponent { selectEl = document.createElement('select'); }
  class AbstractInputSuggest { close() {} }
  return { ...actual, Modal, TextComponent, DropdownComponent, AbstractInputSuggest, setIcon: () => undefined };
});
vi.mock('../src/obsidian/BoardView.ts', () => ({ BoardView: class {}, VIEW_TYPE_BOARD: 'board' }));
vi.mock('../src/obsidian/BoardListView.ts', () => ({ BoardListView: class {}, VIEW_TYPE_BOARD_LIST: 'board-list' }));
import TaskTrellisPlugin from '../main.ts';
import { duplicateBoardFrontmatter, newBoardFrontmatter, parseBoardConfig, untaggedColumn } from '../src/core/boardConfig.ts';
import { copyName, siblingPath } from '../src/core/boardName.ts';
import { draftFromConfig } from '../src/core/boardDraft.ts';
import { renderBoardSettings } from '../src/ui/renderBoardSettings.ts';
import { renderDuplicateBoardEditor } from '../src/ui/renderBoardNameEditor.ts';
import { BoardSettingsModal } from '../src/obsidian/BoardSettingsModal.ts';
import { DuplicateBoardModal } from '../src/obsidian/DuplicateBoardModal.ts';
import { notices, TFile, Workspace } from './mocks/obsidian.ts';
import type { App } from 'obsidian';

beforeEach(() => { notices.length = 0; document.body.replaceChildren(); });

const enter = (input: HTMLInputElement) => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
const typeInto = (input: HTMLInputElement, value: string) => { input.value = value; input.dispatchEvent(new Event('input')); };

describe('copying a board’s settings', () => {
  it('copies every board setting under the new slug, and none of the note’s other properties', () => {
    const fm = { ...newBoardFrontmatter('house'), columns: ['Ideas', 'Doing', 'Done'], 'include-tags': ['home'],
      'column-widths': { ideas: 300 }, aliases: ['Chores'], tags: ['planning'], cssclasses: ['wide'] };
    const copy = duplicateBoardFrontmatter(fm, 'house-copy');
    const { aliases: _aliases, tags: _tags, cssclasses: _css, ...settings } = fm;
    expect(copy).toEqual({ ...settings, slug: 'house-copy' });
    expect(parseBoardConfig('House copy', copy).config).toEqual({ ...parseBoardConfig('House', settings).config, name: 'House copy', slug: 'house-copy' });
  });

  it('doesn’t share lists with the original, so editing one can’t change the other', () => {
    const fm = newBoardFrontmatter('house');
    const copy = duplicateBoardFrontmatter(fm, 'garden');
    (copy.columns as string[]).push('Later');
    (copy.labels as { name: string }[])[0]!.name = 'Changed';
    expect(fm.columns).toEqual(['Backlog', 'Doing', 'Waiting', 'Done']);
    expect((fm.labels as { name: string }[])[0]!.name).toBe('');
  });

  it('names the copy House copy, then House copy 2 and so on, in the original’s folder', () => {
    expect(copyName('House', () => false)).toBe('House copy');
    const taken = new Set(['House copy', 'House copy 2']);
    expect(copyName('House', (name) => taken.has(name))).toBe('House copy 3');
    expect(siblingPath('Task Trellis/Home/House.md', 'House copy')).toBe('Task Trellis/Home/House copy.md');
    expect(siblingPath('House.md', 'House copy')).toBe('House copy.md');
  });

  it('says where open cards start: the first column that isn’t Done or No due date', () => {
    const config = (fm: Record<string, unknown>) => parseBoardConfig('House', { slug: 'house', ...fm }).config;
    expect(untaggedColumn(config({})).label).toBe('Backlog');
    expect(untaggedColumn(config({ columns: ['Someday', 'Ideas', 'Done'], 'undated-column': 'Someday' })).label).toBe('Ideas');
  });
});

describe('the General tab', () => {
  const settings = (host: { onRenameBoard?: () => void; onDuplicateBoard?: () => void; onDeleteBoard?: () => void } = {}) => {
    const root = document.createElement('div'); document.body.append(root);
    const original = parseBoardConfig('House', { slug: 'house' }).config;
    renderBoardSettings(root, draftFromConfig(original), original, {
      icon: vi.fn(), attachKeySuggest: vi.fn(), attachValueSuggest: vi.fn(), attachTagSuggest: vi.fn(), attachFolderSuggest: vi.fn(),
      taggedTasks: () => [], onSave: vi.fn(), onDiscard: vi.fn(), ...host,
    });
    return root;
  };

  it('offers Rename board… and Duplicate board… after the date settings and before Delete board', () => {
    const host = { onRenameBoard: vi.fn(), onDuplicateBoard: vi.fn(), onDeleteBoard: vi.fn() };
    const root = settings(host);
    const section = root.querySelector('.tt-settings-board-actions')!;
    expect(section.querySelector('h3')!.textContent).toBe('Rename or duplicate');
    expect(section.textContent).toContain('No tasks are copied or changed.');
    const buttons = [...section.querySelectorAll<HTMLButtonElement>('button')];
    expect(buttons.map((b) => b.textContent)).toEqual(['Rename board…', 'Duplicate board…']);
    expect(buttons.every((b) => b.className === 'tt-button')).toBe(true);
    expect(section.compareDocumentPosition(root.querySelector('[aria-label="Show completed tasks for"]')!) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    expect(section.compareDocumentPosition(root.querySelector('.tt-settings-danger')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    buttons[0]!.click(); buttons[1]!.click();
    expect(host.onRenameBoard).toHaveBeenCalledTimes(1);
    expect(host.onDuplicateBoard).toHaveBeenCalledTimes(1);
  });

  it('has no such section where nothing can rename or duplicate the board', () => {
    expect(settings().querySelector('.tt-settings-board-actions')).toBeNull();
  });
});

describe('the Duplicate board editor', () => {
  const open = (save: (name: string) => Promise<void>, unsaved = false) => {
    const body = document.createElement('div'); const header = document.createElement('div');
    document.body.append(header, body);
    const close = vi.fn();
    renderDuplicateBoardEditor(body, header, 'House copy', { name: 'House', start: 'Ideas', unsaved }, () => {}, save, close);
    return { body, header, close, input: body.querySelector<HTMLInputElement>('input')!, error: body.querySelector<HTMLElement>('[role=alert]')! };
  };

  it('offers the copy’s name, selected, and says what is and isn’t copied', () => {
    const { body, header, input } = open(vi.fn());
    expect(input.value).toBe('House copy');
    expect(input.getAttribute('aria-label')).toBe('New board name');
    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 'House copy'.length]);
    expect(header.querySelector('.tt-editor-title')!.textContent).toBe('Duplicate board');
    expect(header.querySelector('.tt-editor-save')!.getAttribute('aria-label')).toBe('Duplicate board');
    expect(body.textContent).toContain('The new board gets the House board’s saved settings');
    expect(body.textContent).toContain('No tasks are copied or changed.');
    expect(body.textContent).toContain('open cards start in Ideas.');
    expect(body.textContent).not.toContain('haven’t saved');
  });

  it('takes focus back from the dialog’s first button, which Obsidian focuses once it opens', async () => {
    const { header, input } = open(vi.fn());
    header.querySelector<HTMLButtonElement>('.tt-editor-save')!.focus();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.activeElement).toBe(input);
  });

  it('says that unsaved settings aren’t included, when there are some', () => {
    expect(open(vi.fn(), true).body.textContent).toContain('Changes you haven’t saved in board settings aren’t included.');
  });

  it('rejects a name that can’t be a note, without trying', () => {
    const save = vi.fn(async () => {});
    const { input, error, close } = open(save);
    typeInto(input, 'House/copy'); enter(input);
    expect(error.hidden).toBe(false);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(save).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled();
  });

  it('shows it’s working, blocks a second copy, then closes', async () => {
    let finish!: () => void;
    const save = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const { header, input, close } = open(save);
    typeInto(input, ' Garden'); enter(input); enter(input);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('Garden');
    expect(header.querySelector('.tt-editor-progress')!.textContent).toBe('Duplicating board…');
    expect(header.querySelector('.tt-editor-header')!.getAttribute('aria-busy')).toBe('true');
    finish();
    await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(header.querySelector('.tt-editor-header')!.getAttribute('aria-busy')).toBe('false');
  });

  it('keeps the name and says why when the copy fails, so it can be tried again', async () => {
    const save = vi.fn(async () => { throw new Error('A note or folder with that name already exists. Choose another board name.'); });
    const { header, input, error, close } = open(save);
    header.querySelector<HTMLButtonElement>('.tt-editor-save')!.click();
    await vi.waitFor(() => expect(error.hidden).toBe(false));
    expect(error.textContent).toBe('A note or folder with that name already exists. Choose another board name.');
    expect(input.value).toBe('House copy');
    expect(input.readOnly).toBe(false);
    expect(close).not.toHaveBeenCalled();
  });
});

describe('making the copy', () => {
  const plugin = (create: (path: string, text: string) => Promise<TFile>, existing: string[] = []) => {
    const p = Object.create(TaskTrellisPlugin.prototype) as TaskTrellisPlugin;
    const original = { ...newBoardFrontmatter('house'), columns: ['Ideas', 'Done'], aliases: ['Chores'] };
    Object.assign(p, {
      boards: { boards: () => [{ config: { slug: 'house' } }, { config: { slug: 'garden' } }] },
      app: { vault: { getAbstractFileByPath: (path: string) => existing.includes(path) ? {} : null, create: vi.fn(create) },
        metadataCache: { getFileCache: () => ({ frontmatter: original }) } },
    });
    return p;
  };
  const house = new TFile('Task Trellis/House.md');

  it('writes one note next to the original, with its settings and a slug of its own', async () => {
    let written = '';
    const p = plugin(async (path, text) => { written = text; return new TFile(path); });
    const copy = await p.duplicateBoard(house as never, 'Garden');
    expect(copy.path).toBe('Task Trellis/Garden.md');
    expect(p.app.vault.create).toHaveBeenCalledOnce();
    const fm = JSON.parse(/^---\n(.*)\n---\n/s.exec(written)![1]!) as Record<string, unknown>;
    expect(fm.slug).toBe('garden-2');
    expect(fm.columns).toEqual(['Ideas', 'Done']);
    expect(fm.aliases).toBeUndefined();
    expect(written).toContain('This note is a Task Trellis board.');
  });

  it('refuses a name that’s taken, or can’t be a note, without writing anything', async () => {
    const p = plugin(async (path) => new TFile(path), ['Task Trellis/Garden.md']);
    await expect(p.duplicateBoard(house as never, 'Garden')).rejects.toThrow('A note or folder with that name already exists.');
    await expect(p.duplicateBoard(house as never, 'Gar:den')).rejects.toThrow('Board names cannot contain');
    expect(p.app.vault.create).not.toHaveBeenCalled();
  });

  it('says nothing was changed when the note can’t be written', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const p = plugin(async () => { throw new Error('Disk full'); });
    await expect(p.duplicateBoard(house as never, 'Garden')).rejects.toThrow('Could not create the new board, so nothing was changed.');
  });
});

describe('Duplicate board… and Rename board… in the settings dialog', () => {
  const config = parseBoardConfig('House', { slug: 'house', columns: ['Ideas', 'Done'] }).config;
  const setup = (migration?: unknown) => {
    const file = new TFile('Task Trellis/House.md');
    const copy = new TFile('Task Trellis/House copy.md');
    const app = {
      workspace: new Workspace(),
      vault: { getMarkdownFiles: () => [], getName: () => 'Vault', getAbstractFileByPath: (path: string) => path === file.path ? file : null },
      metadataCache: { getFileCache: () => null, getCache: () => null },
      fileManager: {
        processFrontMatter: vi.fn(async (_file: unknown, fn: (fm: Record<string, unknown>) => void) => fn({ slug: 'house' })),
        renameFile: vi.fn(async (target: TFile, path: string) => { target.path = path; }),
      },
    } as unknown as App;
    const plugin = {
      index: { all: () => [] }, boards: { boards: () => [] }, boardRenames: migration, isExcludedFromIndex: () => false,
      quickAdd: { defaultDestination: () => ({ kind: 'note', note: 'Inbox.md', heading: '' }), dailyNotesAvailable: () => false },
      duplicateBoard: vi.fn(async () => copy), openBoard: vi.fn(async () => {}), saveBoardSettings: vi.fn(async (..._args: unknown[]) => []),
    };
    const settings = new BoardSettingsModal(app, plugin as never, file as never, config);
    settings.open();
    const button = (text: string) => [...settings.contentEl.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === text)!;
    const dialog = () => document.body.lastElementChild as HTMLElement;
    return { app, file, copy, plugin, settings, button, dialog };
  };

  it('copies the saved board, then closes the settings and opens the copy', async () => {
    const { file, copy, plugin, settings, button, dialog } = setup();
    button('Duplicate board…').click();
    const input = dialog().querySelector<HTMLInputElement>('input')!;
    expect(input.value).toBe('House copy');
    expect(dialog().textContent).toContain('open cards start in Ideas.');
    enter(input);
    await vi.waitFor(() => expect(plugin.openBoard).toHaveBeenCalledWith(copy));
    expect(plugin.duplicateBoard).toHaveBeenCalledWith(file, 'House copy');
    expect(settings.modalEl.isConnected).toBe(false);
    expect(document.body.children).toHaveLength(0);
    expect(notices).toEqual([]);
  });

  it('keeps unsaved settings open over the copy, and says so', async () => {
    const { plugin, settings, button, dialog } = setup();
    typeInto(settings.contentEl.querySelector<HTMLInputElement>('input[aria-label="Due now window"]')!, '10');
    button('Duplicate board…').click();
    expect(dialog().textContent).toContain('Changes you haven’t saved in board settings aren’t included.');
    enter(dialog().querySelector<HTMLInputElement>('input')!);
    await vi.waitFor(() => expect(plugin.openBoard).toHaveBeenCalled());
    expect(settings.modalEl.isConnected).toBe(true);
    expect(settings.contentEl.querySelector<HTMLInputElement>('input[aria-label="Due now window"]')!.value).toBe('10');
    expect(notices).toEqual(['Task Trellis: created the House copy board. It’s open behind these settings.']);
  });

  it('renames the note and returns to the settings with the draft, under the new name', async () => {
    const { app, file, plugin, settings, button, dialog } = setup();
    typeInto(settings.contentEl.querySelector<HTMLInputElement>('input[aria-label="Due now window"]')!, '10');
    button('Rename board…').click();
    const input = dialog().querySelector<HTMLInputElement>('input')!;
    expect(input.value).toBe('House');
    typeInto(input, 'Home'); enter(input);
    await vi.waitFor(() => expect(app.fileManager.renameFile).toHaveBeenCalledWith(file, 'Task Trellis/Home.md'));
    await vi.waitFor(() => expect(dialog()).toBe(settings.modalEl));
    expect((settings as unknown as { title: string }).title).toBe('Home board settings');
    settings.modalEl.querySelector<HTMLButtonElement>('.tt-editor-save')!.click();
    await vi.waitFor(() => expect(plugin.saveBoardSettings).toHaveBeenCalledTimes(1));
    expect(plugin.saveBoardSettings.mock.calls[0]).toEqual([file, expect.objectContaining({ name: 'Home', slug: 'house' }), expect.objectContaining({ dueNow: '10' })]);
  });

  it('saves with the new slug after the board’s tags were renamed too, so renamed columns retag the right tasks', async () => {
    const plan = { oldSlug: 'house', newSlug: 'home', tagCount: 2, paths: ['Tasks.md'], referencePaths: [] };
    const migration = { busy: false, preview: vi.fn(async () => plan),
      apply: vi.fn(async () => { file.path = 'Task Trellis/Home.md'; return 'Task Trellis recovery/1.json'; }) };
    const { file, plugin, settings, button, dialog } = setup(migration);
    typeInto(settings.contentEl.querySelector<HTMLInputElement>('input[aria-label="Due now window"]')!, '10');
    button('Rename board…').click();
    const rename = dialog();
    const input = rename.querySelector<HTMLInputElement>('input[type=text]')!;
    typeInto(input, 'Home');
    const option = rename.querySelector<HTMLInputElement>('input[type=checkbox]')!;
    option.checked = true; option.dispatchEvent(new Event('change'));
    enter(input);
    await vi.waitFor(() => expect(rename.textContent).toContain('#tt/house/ → #tt/home/'));
    enter(input);
    await vi.waitFor(() => expect(migration.apply).toHaveBeenCalledWith(plan));
    await vi.waitFor(() => expect(dialog()).toBe(settings.modalEl));
    settings.modalEl.querySelector<HTMLButtonElement>('.tt-editor-save')!.click();
    await vi.waitFor(() => expect(plugin.saveBoardSettings).toHaveBeenCalledTimes(1));
    expect(plugin.saveBoardSettings.mock.calls[0]![1]).toEqual(expect.objectContaining({ name: 'Home', slug: 'home' }));
  });
});

describe('the Duplicate board dialog', () => {
  it('suggests a name no note next to the board has', () => {
    const file = new TFile('Task Trellis/House.md');
    const taken = ['Task Trellis/House copy.md'];
    const app = { vault: { getAbstractFileByPath: (path: string) => taken.includes(path) ? {} : null }, workspace: new Workspace() } as unknown as App;
    const modal = new DuplicateBoardModal(app, {} as never, file as never, parseBoardConfig('House', { slug: 'house' }).config, false, vi.fn());
    modal.open();
    expect(modal.contentEl.querySelector('input')!.value).toBe('House copy 2');
    expect((modal as unknown as { title: string }).title).toBe('Duplicate the House board');
  });
});
