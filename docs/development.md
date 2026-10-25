[← Task Trellis](../README.md)

# Develop Task Trellis

Use Node.js 22.13 or a newer supported even-numbered release (CI tests Node.js 22 and 24). This is a development requirement; it does not change the plugin's minimum Obsidian version. The Moment override keeps the Obsidian API packages' development dependency patched; Moment is not bundled in the plugin.

```bash
npm ci
npm run lint      # official Obsidian review rules
npm test           # vitest
npm run build      # typecheck + main.js
npm run check:release # manifest, versions, release files and license notices
npm run package    # build and prepare dist/task-trellis/ locally
npm run dev        # rebuild on change
npm run harness    # dev/harness.js, then open dev/harness.html over http
```

`dev/harness.html` runs the real board model and renderer against an in-memory vault, for checking the UI without Obsidian. It includes light/dark themes, the shared settings editor, filter suggestions and task-action Undo. The Source checkbox reveals the resulting task lines.

Every pull request runs lint, the full test suite, TypeScript checking, the production build, release validation, and the browser harness build in GitHub Actions. The `Tests and build` check is required on `main` before merging, including for administrators, and the branch must be up to date.

To try it in a vault, copy `main.js`, `manifest.json` and `styles.css` into `<vault>/.obsidian/plugins/task-trellis/` and enable **Task Trellis** under Community plugins.

See [Release and submission checklist](releasing.md) for publishing requirements. Screenshot sources and capture notes are in [images/README.md](images/README.md).

## Repeatable readiness checks

`npm run lint` checks production source and the preview harness with the official Obsidian rules, without suppressing DOM-helper or declarative-settings rules. The preview supplies a small DOM-helper shim because it runs outside Obsidian.

`npm test` includes deterministic reorder stress, multi-note write/Undo safety, concurrent stale-write protection, destination guidance and color-contrast tests. These use synthetic data, not a personal vault.

`npm run benchmark` measures task parsing and filtered board-model construction for 10,000 and 50,000 synthetic tasks. It prints machine details and seven measured runs after a warm-up. It does not measure DOM rendering, native app startup, disk I/O or sync. See [the test report](testing.md).
