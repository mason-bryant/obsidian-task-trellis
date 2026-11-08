import type { App } from 'obsidian';
import { RENAME_RECOVERY_FOLDER, SETTINGS_BACKUP_PATH } from './BoardTagRename.ts';

/**
 * A copy of the plugin settings outside the plugin's own folder. Uninstalling a plugin deletes its
 * folder, settings included, and Sync deletes them on every other device too; this copy stays, so a
 * reinstall can pick up where the last install left off.
 */
export type SettingsBackup = { savedAt: string; settings: Record<string, unknown>; restoredAt?: string };

export async function writeSettingsBackup(app: App, settings: unknown, now = new Date()): Promise<void> {
  const { adapter } = app.vault;
  if (!await adapter.exists(RENAME_RECOVERY_FOLDER)) await adapter.mkdir(RENAME_RECOVERY_FOLDER);
  await adapter.write(SETTINGS_BACKUP_PATH, JSON.stringify({ version: 1, savedAt: now.toISOString(), settings }, null, 2) + '\n');
}

/**
 * Notes on the copy that it has been restored and said so. Until something is saved, each start
 * restores it again, and this keeps the notice from coming back every time.
 */
export async function markSettingsBackupRestored(app: App, backup: SettingsBackup, now = new Date()): Promise<void> {
  const { adapter } = app.vault;
  await adapter.write(SETTINGS_BACKUP_PATH, JSON.stringify({ version: 1, savedAt: backup.savedAt, settings: backup.settings, restoredAt: now.toISOString() }, null, 2) + '\n');
}

/** The saved copy, or null when there's none or it can't be used. */
export async function readSettingsBackup(app: App): Promise<SettingsBackup | null> {
  try {
    const { adapter } = app.vault;
    if (!await adapter.exists(SETTINGS_BACKUP_PATH)) return null;
    const raw: unknown = JSON.parse(await adapter.read(SETTINGS_BACKUP_PATH));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const { savedAt, settings, restoredAt } = raw as Record<string, unknown>;
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return null;
    return { savedAt: typeof savedAt === 'string' ? savedAt : '', settings: settings as Record<string, unknown>,
      ...(typeof restoredAt === 'string' && { restoredAt }) };
  } catch (error) {
    console.error('[Task Trellis] the saved copy of the plugin settings could not be read', error);
    return null;
  }
}
