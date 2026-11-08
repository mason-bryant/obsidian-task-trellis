[← Release notes](README.md)

# Next release

What has changed since the last release (1.4.0), so the maintainer knows what to validate before tagging. Every pull request that changes something users see adds a line here. A version bump starts its release notes from this list, then empties it.

## Fixed

- **Reinstalling no longer loses your boards.** Uninstalling deletes a plugin's settings on every synced device, so a reinstall looked for boards in the default folder and said there were none. Now every settings save keeps a copy in `Task Trellis recovery/plugin-settings.json`, which a reinstall restores. Without one, Task Trellis uses the only folder holding boards, or the boards sidebar offers the folders that do, instead of the templates.
- **Settings changed by Sync** are taken up at once, so a device with old settings in memory no longer saves them back over newer ones.

## Still needs checking

- **A real reinstall on a phone with Sync:** uninstall and reinstall Task Trellis on one device, and check that both it and the others keep the boards folder and the other settings.
- **Sync reloading settings:** Obsidian calls Task Trellis's reload when Sync changes its settings file, but not when the file changes any other way, so it was tested by calling it directly. Change a setting on one device and check that another device shows it without a restart.
