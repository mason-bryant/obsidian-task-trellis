import { App, PluginSettingTab, type SettingDefinitionItem } from 'obsidian';
import type { NewTaskKind } from './core/boardConfig.ts';
import type TaskTrellisPlugin from '../main.ts';

export type TaskTrellisSettings = {
  /** Every note in this folder is a board. */
  boardsFolder: string;
  /** Folders whose tasks never appear on any board. */
  excludedFolders: string[];
  /** Show the search field in task label pickers. */
  showLabelSearch: boolean;
  /** Board slug → row id → collapsed. View state, so it lives here rather than in the board note. */
  collapsed: Record<string, Record<string, boolean>>;
  /** Where new tasks go, unless a board says otherwise. */
  newTaskKind: NewTaskKind;
  newTaskNote: string;
  /** Empty adds to the end of the note. */
  newTaskHeading: string;
};

export const DEFAULT_SETTINGS: TaskTrellisSettings = {
  boardsFolder: 'Task Trellis',
  excludedFolders: [],
  showLabelSearch: false,
  collapsed: {},
  newTaskKind: 'daily',
  newTaskNote: '',
  newTaskHeading: '',
};

export function normalizeSettings(raw: unknown): TaskTrellisSettings {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Partial<TaskTrellisSettings>;
  const folder = typeof s.boardsFolder === 'string' ? s.boardsFolder.replace(/^\/+|\/+$/g, '') : '';
  return {
    boardsFolder: folder || DEFAULT_SETTINGS.boardsFolder,
    excludedFolders: Array.isArray(s.excludedFolders)
      ? s.excludedFolders.filter((f): f is string => typeof f === 'string' && f.trim() !== '')
      : [],
    showLabelSearch: s.showLabelSearch === true,
    collapsed: s.collapsed && typeof s.collapsed === 'object' ? s.collapsed : {},
    newTaskKind: s.newTaskKind === 'note' ? 'note' : 'daily',
    newTaskNote: typeof s.newTaskNote === 'string' ? s.newTaskNote : DEFAULT_SETTINGS.newTaskNote,
    newTaskHeading: typeof s.newTaskHeading === 'string' ? s.newTaskHeading : DEFAULT_SETTINGS.newTaskHeading,
  };
}

/** Searchable definitions; custom renderers retain validation and index-refresh side effects. */
export class TaskTrellisSettingTab extends PluginSettingTab {
  constructor(app: App, private trellis: TaskTrellisPlugin) { super(app, trellis); }

  getSettingDefinitions(): SettingDefinitionItem[] {
    const plugin = this.trellis;
    const settings = plugin.settings;
    return [
      {
        name: 'Boards folder', desc: 'Every note in this folder opens as a board. Its tasks are not shown on boards.',
        render: (setting) => { setting.addText((text) => text.setPlaceholder(DEFAULT_SETTINGS.boardsFolder).setValue(settings.boardsFolder).onChange(async (value) => {
          settings.boardsFolder = value.replace(/^\/+|\/+$/g, '') || DEFAULT_SETTINGS.boardsFolder;
          await plugin.saveSettings(); plugin.onConfigChanged();
        })); },
      },
      {
        name: 'Excluded folders', desc: 'One folder per line. Tasks in these folders never appear on a board.',
        render: (setting) => { setting.addTextArea((text) => text.setPlaceholder('templates\nzzz_archived').setValue(settings.excludedFolders.join('\n')).onChange(async (value) => {
          settings.excludedFolders = value.split('\n').map((f) => f.trim().replace(/^\/+|\/+$/g, '')).filter(Boolean);
          await plugin.saveSettings(); plugin.onConfigChanged();
        })); },
      },
      {
        name: 'Show label search', desc: 'Show a search box in the label picker. Hidden by default.',
        render: (setting) => { setting.addToggle((toggle) => toggle.setValue(settings.showLabelSearch).onChange(async (value) => {
          settings.showLabelSearch = value; await plugin.saveSettings();
        })); },
      },
      {
        name: 'Add new tasks to',
        desc: plugin.quickAdd.dailyNotesAvailable() ? "Today's daily note uses the Daily notes plugin and its template. Boards can override this." : 'The core Daily notes plugin is off. Select a specific note, or enable Daily notes.',
        render: (setting) => { setting.addDropdown((dropdown) => dropdown.addOption('daily', "Today's daily note").addOption('note', 'A specific note').setValue(settings.newTaskKind).onChange(async (value) => {
          settings.newTaskKind = value === 'note' ? 'note' : 'daily'; await plugin.saveSettings(); this.update();
        })); },
      },
      {
        name: 'New task note', desc: 'Path of the note, created if it does not exist. Used when adding to a specific note.',
        render: (setting) => { setting.addText((text) => text.setPlaceholder('Inbox.md').setValue(settings.newTaskNote).setDisabled(settings.newTaskKind !== 'note').onChange(async (value) => {
          settings.newTaskNote = value.trim(); await plugin.saveSettings();
        })); },
      },
      {
        name: 'Under heading', desc: 'New tasks go at the end of this section, added if missing. Leave empty to append to the note.',
        render: (setting) => { setting.addText((text) => text.setPlaceholder('## Tasks').setValue(settings.newTaskHeading).onChange(async (value) => {
          settings.newTaskHeading = value; await plugin.saveSettings();
        })); },
      },
      {
        name: 'Tasks plugin',
        desc: plugin.writer.tasksApi() ? 'Found. Cards open the Tasks editor; completing a card uses Tasks dates and recurrence.' : 'Not found or disabled. Cards open their source line; completing a card adds a done date.',
      },
    ];
  }
}
