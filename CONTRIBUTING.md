# Contributing to Task Trellis

Start with a [bug report or feature request](https://github.com/mason-bryant/obsidian-task-trellis/issues/new/choose) for substantial changes. Describe the user problem and include a minimal example using fictional tasks.

See [development](docs/development.md) for the browser preview. Use Node 22.13+ and run:

```sh
npm ci
npm run lint
npm test
python3 -m unittest discover -s tests -p ios_shortcut_test.py
npm run harness
npm run package
```

Use a disposable vault for native tests. Keep notes as the source of truth, preserve unrelated Markdown and other boards' tags, and use Obsidian's atomic `Vault.process` API for task writes. Cover stale snapshots, duplicate task text and Undo when changing write paths. Avoid desktop-only APIs in the mobile bundle.

For UI changes, test light/dark themes, keyboard use, narrow screens and the mobile keyboard. Keep primary save/cancel actions visible. Describe what you actually tested in your PR; browser emulation does not establish native iOS or Android compatibility.

Do not commit personal vault files, local paths, tokens, or generated bundles. Contributions are under the repository's MIT license. Preserve notices for any third-party code and explain its provenance. The maintainer handles release tags and community submission; see [the release checklist](docs/releasing.md).
