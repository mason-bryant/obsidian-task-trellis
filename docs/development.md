[← Task Trellis](../README.md)

# Develop Task Trellis

Use Node.js 22.13 or a newer supported even-numbered release (CI uses Node.js 22). This is a development requirement; it does not change the plugin's minimum Obsidian version. The Moment override keeps the Obsidian API packages' development dependency patched; Moment is not bundled in the plugin.

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
