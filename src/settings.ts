import { App, PluginSettingTab, Setting } from 'obsidian';
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
  newTaskHeading: '### 🚀 things I plan to accomplish',
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

// Use the imperative settings API; update dependent controls in place to retain focus.
export class TaskTrellisSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private plugin: TaskTrellisPlugin,
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Boards folder')
      .setDesc('Every note in this folder opens as a board. Its tasks are not shown on boards.')
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.boardsFolder)
          .setValue(this.plugin.settings.boardsFolder)
          .onChange(async (value) => {
            this.plugin.settings.boardsFolder = value.replace(/^\/+|\/+$/g, '') || DEFAULT_SETTINGS.boardsFolder;
            await this.plugin.saveSettings();
            this.plugin.onConfigChanged();
          }),
      );

    new Setting(containerEl)
      .setName('Excluded folders')
      .setDesc('One folder per line. Tasks in these folders never appear on a board.')
      .addTextArea((text) =>
        text
          // Literal, case-sensitive example paths rather than prose.
          .setPlaceholder('templates\nzzz_archived')
          .setValue(this.plugin.settings.excludedFolders.join('\n'))
          .onChange(async (value) => {
            this.plugin.settings.excludedFolders = value
              .split('\n')
              .map((f) => f.trim().replace(/^\/+|\/+$/g, ''))
              .filter(Boolean);
            await this.plugin.saveSettings();
            this.plugin.onConfigChanged();
          }),
      );

    new Setting(containerEl)
      .setName('Show label search')
      .setDesc('Show a search box in the label picker. Hidden by default.')
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.showLabelSearch).onChange(async (value) => {
        this.plugin.settings.showLabelSearch = value;
        await this.plugin.saveSettings();
      }));

    new Setting(containerEl).setName('New tasks').setHeading();
    new Setting(containerEl)
      .setName('Add new tasks to')
      .setDesc(
        this.plugin.quickAdd.dailyNotesAvailable()
          ? "Today's daily note is found or created by Obsidian's Daily notes plugin, with your template. Boards can override this."
          : "The core Daily notes plugin is off, so new tasks need a specific note. Boards can override this.",
      )
      .addDropdown((d) =>
        d
          .addOption('daily', "Today's daily note")
          .addOption('note', 'A specific note')
          .setValue(this.plugin.settings.newTaskKind)
          .onChange(async (value) => {
            this.plugin.settings.newTaskKind = value === 'note' ? 'note' : 'daily';
            await this.plugin.saveSettings();
            noteSetting.settingEl.toggle(this.plugin.settings.newTaskKind === 'note');
          }),
      );
    const noteSetting = new Setting(containerEl)
      .setName('Note')
      .setDesc('Path of the note, created if it does not exist.')
      .addText((text) =>
        text
          .setPlaceholder('Inbox.md')
          .setValue(this.plugin.settings.newTaskNote)
          .onChange(async (value) => {
            this.plugin.settings.newTaskNote = value.trim();
            await this.plugin.saveSettings();
          }),
      );
    noteSetting.settingEl.toggle(this.plugin.settings.newTaskKind === 'note');
    new Setting(containerEl)
      .setName('Under heading')
      .setDesc('New tasks go at the end of this section, added if the note lacks it. Leave empty to add to the end of the note.')
      .addText((text) =>
        text
          .setPlaceholder('## Tasks')
          .setValue(this.plugin.settings.newTaskHeading)
          .onChange(async (value) => {
            this.plugin.settings.newTaskHeading = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl).setName('Other').setHeading();
    new Setting(containerEl)
      .setName('Tasks plugin')
      .setDesc(
        this.plugin.writer.tasksApi()
          ? 'Found. Cards open the Tasks edit modal, and completing a card uses Tasks (done dates, recurrence).'
          : 'Not found or disabled. Clicking a card opens its source line, and completing a card only flips the checkbox and adds a ✅ date.',
      );
  }
}
