import { expect, it, vi } from 'vitest';
vi.mock('obsidian', () => ({ PluginSettingTab: class {}, Setting: class {} }));
import { DEFAULT_SETTINGS, normalizeSettings } from '../src/settings.ts';

it('defaults label search to hidden for new and existing installations', () => {
  expect(DEFAULT_SETTINGS.showLabelSearch).toBe(false);
  expect(normalizeSettings(undefined).showLabelSearch).toBe(false);
  expect(normalizeSettings({ boardsFolder: '_task-trellis' }).showLabelSearch).toBe(false);
});

it('keeps an explicit label-search preference after loading saved settings', () => {
  expect(normalizeSettings({ showLabelSearch: true }).showLabelSearch).toBe(true);
  expect(normalizeSettings({ showLabelSearch: false }).showLabelSearch).toBe(false);
  expect(normalizeSettings({ showLabelSearch: 'false' }).showLabelSearch).toBe(false);
});

it('uses a neutral heading for new installations and preserves existing saved headings', () => {
  expect(normalizeSettings(undefined).newTaskHeading).toBe('');
  expect(normalizeSettings({ newTaskHeading: '### My existing section' }).newTaskHeading).toBe('### My existing section');
});

