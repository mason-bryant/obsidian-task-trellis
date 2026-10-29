# Working on Task Trellis

Task Trellis should look and behave the same way wherever the same kind of thing happens. Before changing anything users see, read the relevant [UX rules](docs/design/README.md) and follow them. If a change has to differ from a rule, record it under that document's Exceptions, with the reason, in the same change. Reusing the existing code for a pattern helps when it fits; matching its look and behavior is what matters.

- Notes are the source of truth. Preserve unrelated Markdown and other boards' tags, and use the existing write and Undo paths.
- Scope styles to their component, so that changing one surface can't restyle another. See [UI code](docs/development.md#ui-code).
- Check and report changes as the [testing rules](docs/testing/README.md) describe, including the screens around the one you changed. Report the environments you actually tested: automated tests and phone-width browser previews don't establish native iOS or Android behavior.
- Run native tests only in a disposable vault, with synthetic tasks. Never commit vault files, local paths, tokens or generated bundles.
- Avoid desktop-only APIs: the plugin also runs in Obsidian mobile.
- Don't push a version tag unless the maintainer asks: pushing one publishes a release. See the [release checklist](docs/releasing.md).
- Before a pull request, run the checks from [CONTRIBUTING.md](CONTRIBUTING.md):

  ```bash
  npm ci
  npm run lint
  npm test
  python3 -m unittest discover -s tests -p ios_shortcut_test.py
  npm run harness
  npm run package
  ```

`docs/cli.md` is the user guide to the command line for AI agents and scripts. This file is guidance for contributors and coding agents working on the code.
