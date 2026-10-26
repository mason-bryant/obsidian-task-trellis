[← Task Trellis](../README.md)

# Community readiness test report

Updated October 25, 2026 for released version **0.1.12**. The original readiness review covered 0.1.10; version-specific follow-ups and maintainer confirmations are recorded below. Test data is synthetic. Stress tests ran in a disposable vault; a separate synthetic QA folder in the maintainer’s synced vault was used for sync checks. No existing personal tasks were used for stress testing.

## Changes made during this review

- Replaced the two identified adapted implementations while retaining historical notices. All previous sorting/filtering regressions pass. Added guards for invalid insertion positions, unsafe sort ranks and inherited object properties.
- Added a short README quick start. New boards open the New tasks settings; destination guidance identifies missing notes, disabled Daily notes, excluded destinations and filter mismatches. Empty boards have direct setup actions.
- Added Alt+Up/Down keyboard reordering with focus retained across redraws. Native testing also caught and fixed focus loss when closing the label picker; focus now returns to the task’s label button. Existing Enter-to-edit/source, checkbox, label and move controls remain available.
- Raised label edit targets to 44px, added visible focus outlines, and improved light/dark save-icon contrast. The Move menu is now exposed on desktop as well as mobile, so keyboard users can change columns without dragging; keyboard-opened menus anchor to their button.
- Found iPhone Safari zooming board-settings fields below 16px. Mobile editor inputs now have a 16px minimum. In the simulator, focusing the note path no longer enlarged the page, and the primary checkmark saved with the software keyboard open.
- Updated the global task-destination selector in place so switching destination retains keyboard focus; the note field appears and disappears correctly in native Obsidian.
- Native iPhone testing caught editor actions overlapping the status bar. Mobile editor position and height now account for top/bottom safe-area insets; the title and Save button are reachable, and a label-color save was verified on device.
- Prepared issue forms, troubleshooting, contribution guidance, a provenance record and a submission draft. Root LICENSE is standard MIT; historical and dependency notices remain bundled.

## Automated checks

Current application suite: **301 tests across 24 files** (290 at the initial 0.1.10 review). Shortcut generator: **8 Python tests**. Lint, TypeScript checking, production packaging, notice/asset validation and preview build pass.

New stress coverage:

| Exercise | Result |
|---|---|
| 10,000 deterministic reorder operations on 100 cards, repeatedly exhausting top-of-list gaps | Requested order retained; emitted ranks remain positive safe integers |
| 5,000 task edits across 100 notes, alternating LF/CRLF | Unrelated prose, fenced examples, dates, priorities, labels, block IDs and other-board tags preserved |
| Undo of that batch with a simulated external edit in one note | Changed note retained; other 99 notes restored exactly; repeated Undo refused |
| 250 concurrent label writes interleaved with 250 stale checkbox writes in one note | All labels preserved; stale checkbox actions refused rather than overwriting labels |
| 32,768 sampled label colors | Black/white label text met at least 4.5:1 contrast |
| Onboarding and keyboard UI regressions | Initial destination tab, live guidance, setup actions, card movement and focus restoration pass |

The existing suite additionally covers duplicate task identity, deleted/shifted lines, stale editing, label tag preservation, shortcut validation and deduplication, template cancellation on unload, index rebuild/event races, subtasks, and touch/column-gesture behavior.

These tests model Obsidian's per-file atomic write semantics. Multi-file changes are not a vault-wide transaction. They do not simulate every real sync conflict, power loss, third-party template rewrite or filesystem failure.

## Performance

`npm run benchmark`; Apple M4 Max, macOS arm64, Node 22.13.1. One warm-up plus seven measured runs. Folder, tag and property filters enabled. [Raw measurements](qa/benchmark-2026-10-25.json).

| Synthetic tasks / notes | Parse median / maximum | Board-model median / maximum |
|---|---|---|
| 10,000 / 100 | 37.3 / 40.8 ms | 11.3 / 13.3 ms |
| 50,000 / 500 | 194.8 / 206.5 ms | 64.0 / 98.8 ms |

This measures core work, **not** end-to-end vault indexing, Markdown rendering, DOM layout, phone performance, network/sync or startup. Rendering many open cards remains unvirtualized; use focused boards and compact/collapsed views. No claim is made that a phone renders 50,000 cards smoothly. A native 1,000-card check is recorded below. Broader memory profiling and phone rendering benchmarks remain follow-ups before making performance claims.

## Accessibility and presentation

Reviewed accessible names for editor actions, tabs, label selection and card controls. The browser accessibility snapshot exposes settings as a dialog with named tabs, fields, Save and Cancel. Keyboard regression tests cover card editing/reordering and focus retention. At 320px wide, light-theme settings fit without horizontal dialog overflow; the tab row wraps and save/cancel remain at the top. The save glyph was verified as `#15803d` on `#f6f6f6` in that preview; the dark theme uses `#4ade80`. User themes can override these surfaces.

The iOS 27 simulator runs the shared renderer in Safari, not a native Obsidian installation. New-task destination editing and saving were checked with its software keyboard visible. This caught and verified the input-zoom fix. [Simulator evidence](qa/iphone-settings-keyboard.png).

This is not a WCAG certification. Enlarged native UI and light/dark themes were also checked below. Full VoiceOver/TalkBack use, OS-level accessibility text, Windows/Linux screen readers and third-party themes still need manual coverage.

## Native compatibility evidence and remaining coverage

| Environment | Evidence | Remaining |
|---|---|---|
| Real iPhone, maintainer’s device | Agent-operated 0.1.10 checks on Obsidian 1.14.5 (387) covered label/color save, completion/Undo, swiping, column retention, safe areas and online sync. On October 25 the maintainer confirmed the 0.1.12 phone checklist, including cross-column dragging, task creation and label rename/save with the keyboard open. | Exact device/OS/app versions were not reconfirmed for the maintainer’s 0.1.12 pass. Broad integration matrix not completed. |
| iPhone simulator / Safari | Shared UI tested, including current destination guidance, software keyboard and save visibility | Does not establish native Obsidian integration behavior |
| macOS Obsidian 1.13.7 | Fresh-vault workflow, Tasks absent/present, Daily notes off/on, Templater off/on, recurrence and Undo, pop-out labels, light/dark themes, enlarged settings, and 1,000-card native rendering. Details below. [Initial evidence](qa/native-readiness.png) | Every combination of optional-plugin settings and third-party themes has not been tested |
| Declared minimum: Obsidian 1.13.7 | Since 0.1.10, the minimum is the version actually tested natively. Historical releases retain their original minimum in versions.json. The review-fix branch uses 1.13.1 API types for declarative settings, within the declared 1.13.7 minimum. | Earlier app versions are not claimed by the current release |
| Android; Windows; Linux | No native test recorded | Required before claiming complete platform coverage |

For the remaining native pass, use a disposable vault with fictional tasks. Test fresh install → create board → destination → filters → add/edit/complete/reorder/label → Undo → reload/disable/re-enable. Repeat with Tasks absent/present, Daily notes off/on and Templater off/on. Test two board windows, source-note navigation, light/dark themes and offline capture. With a synced test vault, verify both local persistence and remote arrival separately. Record app/plugin versions, device and results; do not infer sync success from an app-open event.

## Additional native checks on October 25

- **Optional integrations:** Tasks 8.5.0 and Templater 2.25.1, with core Daily notes enabled, in `/tmp/Task Trellis Readiness Test`. A recurring task completed into a done line plus the next daily occurrence. Both retained board-placement and label tags. Undo restored the original single task exactly. Editing priority in the Tasks modal preserved recurrence, due date and tags.
- **Daily note/template safety:** Task capture created the configured daily note and heading. Templater expanded a date expression, and the new task survived exactly once with its created-date and placement tag. This complements the earlier native test with all three optional integrations disabled. It is not an exhaustive test of arbitrary user templates.
- **Pop-out window:** Moved the Integration board to a separate window, opened the label picker there, assigned a label, closed the picker and verified the resulting Markdown tag. The synthetic pop-out was closed afterward.
- **Native rendering:** Opened a board with 1,000 synthetic tasks across 100 notes, distributed across three columns with the undated-card limit disabled. Markdown rendered, scrolling worked, completion wrote the expected line, and Undo restored it. The isolated vault renderer's resident memory was 284,432 KiB before opening the board and 545,760 KiB after rendering and completing a card (approximately 278 MiB and 533 MiB). This is a coarse process-level observation including Obsidian, Tasks and Templater, not a heap/leak profile or a cross-device benchmark. Automated UI timing was not reliable enough to report as render latency. [Evidence](qa/native-1000-cards.png).
- **Enlarged layout:** Default light and dark themes checked natively. Four applications of Obsidian's Zoom in command enlarged the interface; the settings header, green Save action, Cancel action and tabs remained reachable, and the content scrolled. Zoom and theme were restored afterward. This is UI zoom coverage, not an iOS Dynamic Type test. [Evidence](qa/native-enlarged-settings.png).
- **VoiceOver attempt:** The native first-run tutorial and automation timeouts prevented a reliable screen-reader pass. VoiceOver was explicitly restored to off in System Settings. No VoiceOver pass is claimed.
- **Native iPhone:** Confirmed Task Trellis 0.1.10 in installed plugins on Obsidian 1.14.5 (387), then disabled/re-enabled only this plugin. The synthetic QA board opened and showed the desktop sentinel. Assigned a label, changed its color and saved through the green checkmark. Swiped from Backlog to Doing, scrolled vertically and retained Doing. Completed the sample Doing task and used Undo successfully. [Corrected native editor](qa/iphone-native-safe-area.png).
- **Native layout defect found and fixed:** The editor header originally overlapped the native status bar because its fixed position used only the visual viewport offset. CSS now reserves the safe-area insets at both ends. After syncing the stylesheet and reloading the plugin on the phone, the title and actions were below the status bar and the color change saved successfully.
- **Sync evidence:** The synced vault reported Fully synced on desktop. Desktop-created synthetic notes arrived on the phone. The label assignment, label color change and completion made on the phone arrived in the desktop Markdown/board properties; Undo restored the sample line. This establishes a successful bidirectional online sync sample, not a latency guarantee, conflict-resolution test or background/offline-sync guarantee.
- **Native input limitation:** Mirroring intermittently required repeated activation of controls and did not reliably deliver typing or paste to native Obsidian fields. Search/settings interaction was slow during a third-party search-index rebuild; restarting Obsidian allowed further pointer-based testing. New-task typing and label renaming were attempted but not completed, so they are not marked passed. The separate simulator software-keyboard evidence above remains valid; it does not substitute for native phone keyboard coverage. No claim is made that this input limitation was caused by Task Trellis.


## Submission status

Release 0.1.12 is published. No directory submission or author outreach has been made. The maintainer has chosen to proceed without a separate provenance eligibility inquiry; history and notices remain documented without claiming a directory determination. Remaining coverage gaps are disclosed above. See [provenance](provenance.md) and the updated [submission draft](submission.md).


## Phone cross-column drag follow-up (2026-10-25, 0.1.12)

Added edge navigation only while dragging a card by its handle in the narrow, paged layout. Wide layouts keep the existing drag behavior. No changes to normal column swiping, native vertical scrolling, or Obsidian's swipe exclusion.

- All 301 tests across 24 files pass, including 11 new regression cases covering both edge directions, dwell timing, multiple pages, edge limits, vertical reordering near the right edge, leaving/reversing an edge hold, release/cancellation, wide and single-filtered-column layouts, and out-of-bounds gestures.
- A rendered-board integration test verifies that paging refreshes the drop indicator, dropping targets the newly visible column, and a subsequent vertical gesture retains that column.
- Lint, production packaging, and harness build pass.
- **Maintainer confirmation, October 25:** the requested 0.1.12 iPhone checklist passed: cross-column dragging in both directions, vertical reordering, subsequent scrolling, new-task creation and label rename/save with the keyboard open. This closes the phone smoke checklist based on the maintainer’s explicit confirmation, not an automated device run.


## Short VoiceOver follow-up (October 25, installed 0.1.12)

Opened the synthetic QA board in native macOS Obsidian 1.13.7 and confirmed the installed plugin manifest was 0.1.12. System Settings initially showed VoiceOver off. Its switch changed to on, but the app inventory reported VoiceOver not running; selecting VoiceOver timed out. The standard activation shortcut and VoiceOver navigation command did not produce a verifiable screen-reader session. Restored the switch to **off** and verified it. Result: **inconclusive; no VoiceOver pass claimed**.

The native accessibility tree did expose label checkboxes with names and checked states, named edit buttons, Close and Add Label. Closing the picker with Escape returned focus to its originating Labels button. These observations are accessibility-tree and focus evidence only; speech output and screen-reader navigation were not verified. No task contents or label assignments were changed. An empty note accidentally created by quick-switcher input during navigation was moved to the vault’s recoverable trash.

## Column resizing (0.1.13, October 25)

The 312-test suite (25 files), lint, production packaging and harness build passed. Eleven resize cases cover live updates, neighboring column stability, pointer cancellation/lost capture/Escape, narrow-layout isolation, click-only behavior, bounds, keyboard controls, failed-save rollback, configuration parsing and column rename/removal. In the rendered desktop harness, dragging Backlog changed its width from 303 to 403 pixels without changing its neighbors; Right increased it to 413, and Home restored equal 303-pixel columns. Native tablet touch resizing and device-to-device width sync have not yet been tested.

## Planned Android smoke test

Use the official [Android Studio and Emulator](https://developer.android.com/studio/install) on Apple silicon, with an ARM64 phone image created through [Device Manager](https://developer.android.com/studio/run/managing-avds). Install the actual Android Obsidian app from its [official download page](https://obsidian.md/download), then load 0.1.12 into a disposable local vault with synthetic tasks. Test board creation, task capture with the software keyboard, label editing, column swiping, within/across-column dragging, completion/Undo, reload persistence and TalkBack if available. This setup is proposed, not installed or tested. Emulator results would establish Android-app behavior in that environment, not real-device touch or performance coverage.

## Label color schemes (0.1.13, October 25)

All 319 tests across 26 files pass, along with lint and production packaging. The approved ten palettes plus Trellis are present. New tests cover exact custom-color restoration through serialized board properties, stable IDs/names, renamed/reordered/deleted/new labels, unchanged and empty palettes, cycling past six labels, invalid snapshot data, preview cancellation, assignment preservation, write failure/retry and overlapping-write prevention. The browser harness confirmed selecting Mediterranean, applying it, reopening the picker with Previous scheme available, and restoring the six original colors. Native iOS interaction and cross-device scheme sync have not been tested for this change.

The final palette set replaces Spring light with Modern primary. All 16 focused label tests and packaging passed after the replacement. Installed locally into Mason Remote with settings preserved; native Obsidian showed the new resize controls and Modern primary in the scheme picker. No palette changes were applied to the personal board during this installation check.


## Community review fixes (October 25, 2026, unreleased branch)

The `codex/community-review-fixes` branch addresses the 0.1.13 portal scan and reliability review. **361 application tests and 8 shortcut tests pass**, along with lint, type checking, production packaging and the preview build. Local lint now includes the preview TypeScript and no longer disables the DOM-helper or declarative-settings rules. CI tests both Node 22 and 24; remote CI and portal results are separate checks.

New regression coverage includes failed/pending task saves and retained drafts across redraws, replacement drafts and duplicate submissions, IME confirmation events, invalid board filenames, duplicate-source snapshot freshness without redraws, rename/read deletion races, partial/failed multi-note writes and their Undo, mixed line endings, legacy request-marker placement, two rapid duplicate-card moves, stale card identities, targeted Undo refresh, and column-rename rollback when a task or board write fails.

Native checks used **macOS Obsidian 1.13.7 and Tasks 8.5.0** in the existing disposable readiness vault, with synthetic `Review QA` notes:

- Settings search found **Show label search**. The full settings tab rendered; toggling the setting persisted to plugin data and was restored to off. [Screenshot](qa/native-searchable-settings.png).
- A destination deliberately conflicting with a folder caused a real create failure. A clear notice appeared and the task draft survived. Correcting the destination and retrying wrote exactly one task and cleared the composer.
- After replacing temporary input disabling with read-only state, a successful Enter submission retained focus in the empty composer. The existing personal-vault heading and other preferences were not changed.
- The Tasks editor recognized `2026-10-30` as the due date on a synthetic line using the new request-marker placement. This verifies parsing by Tasks; it is not a new iOS Shortcut end-to-end test.
- Editing a task in Tasks while externally changing its source caused the stale write to be rejected. The complete edited draft remained in the recovery dialog. [Screenshot](qa/native-draft-recovery.png).
- The shared browser preview rendered its SVG icons, opened the replacement in-page details editor, retained the draft on Cancel, and added a card on successful submission.

The native test build was installed only in the disposable readiness vault. Mason Remote was returned to the foreground without replacing its plugin build. The final small stale-card guard and message wording changes are covered by automated tests; those scenarios were not separately repeated natively. Native IME composition, iOS/Android behavior for this branch, and published artifact attestations remain unverified. Existing iOS gesture code was not changed. The desktop `display: contents` wrapper is intentionally retained; its scanner compatibility warning targets an older Obsidian version than this plugin supports.

## Board title rename (unreleased, October 25)

The 368-test suite, lint, type checking, production packaging and preview build pass. Seven new tests cover filename collisions/validation, stale files, preserving the board slug and labels, legacy slug pinning, failed-save retry, duplicate submissions, IME Enter, cancellation and the accessible title button.

Native Obsidian 1.13.7 in the disposable Task Trellis Readiness Test vault confirmed click-to-edit, saving a new filename, immediate heading/tab/breadcrumb updates, reopening with the saved name and cancelling. The fixture was renamed back afterward. Its task note's SHA-256 remained identical and its board slug remained `review-checks`. This check also caught and fixed the existing missing base FileView rename handler. The final handler change passed the focused BoardView/rename tests and lint. The build was installed only in the disposable test vault; no new iPhone or iPad run was performed.

## Optional board-tag rename (unreleased, October 25)

All **391 tests across 31 files** pass, along with lint, type checking, production packaging and the preview build. New coverage exercises read-only previews, preview invalidation, namespace and filename collisions, excluded/completed/nested tasks, dependent board filters, mixed line endings, code examples, stale previews, backup failure, task/board/settings write failures, interrupted cleanup, restoration after restart, interrupted restoration and protection of later edits or newly created tasks. These are simulated failures, not physical disk or sync-provider fault tests.

Native Obsidian 1.13.7 testing used only the disposable readiness vault. The editor defaulted to title-only rename; opting in previewed four task-tag changes in two notes. Applying renamed the board, placement and label tags while retaining the two main cards, subtask, Urgent label and column positions. Obsidian's own link-update prompt was exercised using **Just once**.

The first native restoration safely rejected Obsidian's shortening of a full-path wiki link as a snapshot mismatch. The correction accepts equivalent wiki-link targets resolving to the restored board while still requiring aliases, headings and all other content to match; a regression test also verifies that a changed alias blocks restoration. After loading the corrected build, the saved recovery entry survived reload and restored both fixture notes **byte-for-byte**, including the original full-path link. The recovery journal reported `restored`, and the temporary renamed file no longer existed.

The tested build remains installed only in the disposable vault. Mason Remote was returned to the foreground without changing its plugin build or migrating personal boards. No new iOS, Android, concurrent-device sync or large-vault migration benchmark is claimed. Ordinary Markdown-link reformatting beyond equivalent wiki links can still require manual recovery; changed notes are protected rather than overwritten.

## Unified filter editor (unreleased, October 25)

All **397 tests across 32 files** pass, along with lint, type checking, production packaging and the preview build. Five new editor tests cover existing-filter round trips, adding/removing every rule type, inclusion/exclusion behavior against the actual matcher, property validation, literal commas, IME input, autocomplete lifecycle, focus, tab-switch persistence and saving state. The native adapter uses documented `TextComponent`, `DropdownComponent` and `AbstractInputSuggest` APIs; the task filter engine and stored filter format are unchanged.

Browser checks at desktop and 390 × 844 verified the shared Field/Condition/Value layout, adding tag/folder/property rules, property exclusions, chip entry, removing rules, retaining values across tabs and Save & open board. Narrow rules had no horizontal overflow and the browser reported no errors. These are responsive-browser checks, not a new native iOS run.

The packaged build was installed in Mason Remote with `data.json` preserved and the previous artifacts backed up at `/private/tmp/task-trellis-before-filter-ui-20261025-213510`. Native reload/visual verification is pending because macOS was locked during the installation.
