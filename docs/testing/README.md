[← Development](../development.md)

# Testing rules

These rules say how to check a change and how to report what was tested. What the product should do is in the [UX rules](../design/README.md). Results from past test passes are in the [test report](../testing.md).

## Run the checks

Before a pull request, run what CI runs:

```bash
npm ci
npm run lint
npm test
python3 -m unittest discover -s tests -p ios_shortcut_test.py
npm run harness
npm run package
```

For a change to documentation only, check its links and read the diff. Don't claim UI coverage from a change to prose.

## Check the screens around a change

- Check every screen a change can affect, not only the one you edited. The [UI checklists](ui-checklists.md) list what to look at for each kind of change.
- Use tests that check behavior, not tests that restate the implementation.
- For a layout change, look at the result, and measure it where that helps: no overlapping controls, no text outside its button, and the last content reachable above Obsidian's toolbars. A DOM test can find every button while their labels overlap on screen. In PR 33, the toolbar's quick-filter buttons shared a class with the settings rows and picked up their styles.
- After visiting settings, look at the whole board again, not just the editor.
- jsdom doesn't evaluate container queries. The tests set the one-column layout by hand, so the 600px breakpoint, Add task placement, the bottom scroll space and which quick-filter group shows all need a browser check.

## Where to test

- Use synthetic tasks, in automated tests or a disposable vault, for failures, bulk writes and recovery. Never leave test tasks or changed settings in a personal vault.
- The browser harness (`npm run harness`) runs the real renderers against an in-memory vault. Its bulk writes never skip a stale task, so stale snapshots and partly failed bulk edits can only be checked in automated tests or a real vault.
- Native Obsidian can intercept events that work in the harness. A phone-width browser can't reproduce the iOS sidebar, keyboard or toolbars.
- When asked to install a build locally: keep the plugin's settings, back up the files you replace, check that the installed files match the build, reload the plugin and look at the result.

## Report what was tested

- Say exactly what ran: automated tests, the browser harness (with the browser engine and width), native desktop Obsidian, the iOS simulator or a real device. Each is different coverage.
- A passing DOM test or an ARIA attribute isn't evidence that VoiceOver works. Test the screen reader before claiming it.
- When a platform wasn't available, say so, rather than turning the gap into a pass.
- In the pull request, list what was tested, any failures found and fixed, and what's left untested. Keep lasting results in the [test report](../testing.md). A checklist says what to check; it doesn't certify a release.
