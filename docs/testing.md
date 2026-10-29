[← Task Trellis](../README.md)

# Community readiness test report

The latest unreleased-branch check is the [October 28 pre-release report](qa/pre-release-2026-10-28.md): 609 application tests, 8 shortcut tests, browser layout measurements, native desktop checks and native iPhone checks through Mirroring. Its remaining gaps are recorded separately; the historical results below are not claims about that candidate.

Updated October 27, 2026 for version **0.1.16**. The original readiness review covered 0.1.10; version-specific follow-ups and maintainer confirmations are recorded below. Test data is synthetic. Stress tests ran in a disposable vault; a separate synthetic QA folder in the maintainer’s synced vault was used for sync checks. No existing personal tasks were used for stress testing.

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

Current application suite: **484 tests across 37 files** (290 at the initial 0.1.10 review). Shortcut generator: **8 Python tests**. Lint, TypeScript checking, production packaging, notice/asset validation and preview build pass.

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

The plugin has been submitted to the community directory. The last portal result recorded here was the failed automatic review of 0.1.13; the resulting source fixes have since merged and shipped. The current portal outcome has not been reverified for 0.1.16. No author outreach has been made. The maintainer has chosen to proceed without a separate provenance eligibility inquiry; history and notices remain documented without claiming a directory determination. Remaining coverage gaps are disclosed above. See [provenance](provenance.md) and the updated [submission draft](submission.md).


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


## Community review fixes (pre-release check, October 25, 2026)

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

## Board title rename (pre-release check, October 25)

The 368-test suite, lint, type checking, production packaging and preview build pass. Seven new tests cover filename collisions/validation, stale files, preserving the board slug and labels, legacy slug pinning, failed-save retry, duplicate submissions, IME Enter, cancellation and the accessible title button.

Native Obsidian 1.13.7 in the disposable Task Trellis Readiness Test vault confirmed click-to-edit, saving a new filename, immediate heading/tab/breadcrumb updates, reopening with the saved name and cancelling. The fixture was renamed back afterward. Its task note's SHA-256 remained identical and its board slug remained `review-checks`. This check also caught and fixed the existing missing base FileView rename handler. The final handler change passed the focused BoardView/rename tests and lint. The build was installed only in the disposable test vault; no new iPhone or iPad run was performed.

## Optional board-tag rename (pre-release check, October 25)

All **391 tests across 31 files** pass, along with lint, type checking, production packaging and the preview build. New coverage exercises read-only previews, preview invalidation, namespace and filename collisions, excluded/completed/nested tasks, dependent board filters, mixed line endings, code examples, stale previews, backup failure, task/board/settings write failures, interrupted cleanup, restoration after restart, interrupted restoration and protection of later edits or newly created tasks. These are simulated failures, not physical disk or sync-provider fault tests.

Native Obsidian 1.13.7 testing used only the disposable readiness vault. The editor defaulted to title-only rename; opting in previewed four task-tag changes in two notes. Applying renamed the board, placement and label tags while retaining the two main cards, subtask, Urgent label and column positions. Obsidian's own link-update prompt was exercised using **Just once**.

The first native restoration safely rejected Obsidian's shortening of a full-path wiki link as a snapshot mismatch. The correction accepts equivalent wiki-link targets resolving to the restored board while still requiring aliases, headings and all other content to match; a regression test also verifies that a changed alias blocks restoration. After loading the corrected build, the saved recovery entry survived reload and restored both fixture notes **byte-for-byte**, including the original full-path link. The recovery journal reported `restored`, and the temporary renamed file no longer existed.

The tested build remains installed only in the disposable vault. Mason Remote was returned to the foreground without changing its plugin build or migrating personal boards. No new iOS, Android, concurrent-device sync or large-vault migration benchmark is claimed. Ordinary Markdown-link reformatting beyond equivalent wiki links can still require manual recovery; changed notes are protected rather than overwritten.

## Unified filter editor (pre-release check, October 25)

All **397 tests across 32 files** pass, along with lint, type checking, production packaging and the preview build. Five new editor tests cover existing-filter round trips, adding/removing every rule type, inclusion/exclusion behavior against the actual matcher, property validation, literal commas, IME input, autocomplete lifecycle, focus, tab-switch persistence and saving state. The native adapter uses documented `TextComponent`, `DropdownComponent` and `AbstractInputSuggest` APIs; the task filter engine and stored filter format are unchanged.

Browser checks at desktop and 390 × 844 verified the shared Field/Condition/Value layout, adding tag/folder/property rules, property exclusions, chip entry, removing rules, retaining values across tabs and Save & open board. Narrow rules had no horizontal overflow and the browser reported no errors. These are responsive-browser checks, not a new native iOS run.

The packaged build was installed in Mason Remote with `data.json` preserved and the previous artifacts backed up at `/private/tmp/task-trellis-before-filter-ui-20261025-213510`. Native reload/visual verification is pending because macOS was locked during the installation.

## Quick filters and Appearance (0.1.15, October 26)

All **418 tests across 34 files** pass, along with lint, type checking, `check:release` and `npm run package`. The packaged build ran natively on macOS Obsidian 1.14.4 in a disposable vault of fictional tasks, using a separate Obsidian profile driven through its developer-tools port.

- **Upgrade:** a board note in the pre-quick-filter format showed High priority, Overdue and 🏷️ Critical without being written. Opening settings, visiting every tab and saving with no edits left it byte-for-byte unchanged. Saving one Appearance change added only that key; `owner`, `column-widths`, labels and the note body were preserved.
- **Concurrent edits (bug found and fixed):** with the settings dialog open, a toolbar change to Hide completed subtasks was reverted when the dialog was later saved with an unrelated edit, because saving rewrote every setting. Saves now write only the settings edited in the dialog; re-run natively, the toolbar change survived.
- **Toolbar toggles:** Hide completed subtasks redrew about 19 ms after a click and stayed in sync with the note. Clicks closer together than one redraw (5 ms in the test) collapse into one change; normal clicking was unaffected.
- **Rename:** with a quick filter and Compact on, a board-and-tags rename (`#tt/house/` → `#tt/home-base/`) kept both, and Restore board rename brought back the name, tags and view state.
- **Matching:** priority, label, overdue, today, no-priority, page-tag and task-tag filters returned the expected cards. Two filters together narrowed further. A filter for a missing label showed "Turn off quick filters". Completed subtasks sorted last and were hidden as expected, except one with an open subtask.
- **Tooltips:** no element on the board, in any settings tab or in the label picker has both `title` and `aria-label`. Hovering with a real pointer showed one Obsidian tooltip each.
- **Overdue bar off:** matched a normal card's border in the default theme and AnuPpuccin, dark and light.
- **Performance:** `npm run benchmark` now includes a board with three quick filters on, each checked for every task: 12.3 ms at 10,000 tasks and 55.7 ms at 50,000, against 9.7 ms and 46.7 ms without (Apple M5 Pro, Node 24).

Not covered: the six-tab settings dialog on a phone, quick-filter state with two synced devices, and a VoiceOver pass over the new controls.


## Pop-up editor lifecycle repairs (pre-release check, October 27)

The popup preserves the board behind it without creating a workspace tab. Obsidian has no dedicated public embedded-editor factory, so the unsupported detached-leaf constructor and native close-command guard are isolated in `popupEditor.ts`, with a guarded fallback to ordinary navigation if it cannot open. Native editor command context is claimed only while the popup owns it, and its focus handler is removed on close. Expansion saves first and reuses an existing note tab, including a deferred tab or one in another window.

After integrating the merged PR 25, all **457 tests across 36 files** pass, along with lint, type checking and production packaging. Twenty-three popup cases cover successful/failed/cancelled loading, unsupported-constructor fallback, no tab activation during opening, source-line clamping, failed close/expand saves and retries, duplicate close attempts, typing during an awaited save, existing/deferred tab reuse, navigation failure, editor-context ownership, unload during opening/saving, failed-save recovery after unload, keyboard dismissal, IME isolation and non-Markdown navigation.

Plugin unload requests a save and keeps the editor alive until saving succeeds. If it fails, the recovery popup and its draft remain available for retry. There is no fire-and-forget save followed by immediate detachment. This intentionally favors recoverable text over forcibly removing every modal on unload.

Native macOS Obsidian **1.13.7** verification of the revised implementation used only synthetic notes in the disposable readiness vault:

- The board stayed visible behind the native popup, with no extra tab. Typing followed immediately by Escape saved the task line to disk.
- Expanding saved into a normal note tab. Reopening from the board and expanding again reused that tab, preserved the new text and did not create another tab.
- An internal link opened the correct note. Cmd+B inserted bold Markdown into that note, verified on disk.
- Native Cmd+W initially closed the board as well as the popup: macOS menu accelerators bypassed DOM handlers and `Scope`. A narrow, reversible guard now routes Obsidian's native close-tab command through the popup's save path only while that popup has focus. The repeated native test saved and closed the popup while retaining the board. The unsupported command registry is guarded; if unavailable, opening falls back to ordinary navigation. Automated tests verify focused/unfocused command behavior, cleanup, and fallback.
- Making just the synthetic task note read-only induced a real EACCES write failure. The complete draft and error message remained open. Disabling Task Trellis from its settings window attempted another save, failed safely and left the recovery editor available. After restoring write access, Escape saved the complete draft to disk and closed the editor. The plugin was re-enabled afterward.

The build was installed only in the disposable vault, and Mason Remote was returned to the foreground without changing its files or installed plugin. No new native iOS/Android, popout-window or concurrent-device sync pass is claimed.

## PR 25 review repairs (October 27)

All **434 tests across 35 files**, lint, type checking and production packaging pass. New cases cover a stale label picker after another label is created, explicit create/update intent, focus on the final allocated ID, deleted-label edit rejection with draft retention, monotonic allocation from the current counter, and nested subtask composers disabling/restoring every draggable ancestor. Promotion write failures now use a general message instead of assuming indentation or stale content.

The label counter protects writes against the latest local board contents; it is not a distributed allocator. Simultaneous offline additions on different devices can still conflict. No new real-device sync or native mobile test is claimed.

## Bulk triage and release 0.1.16 (October 27)

Includes merged PRs 24–28: pop-up note editing and lifecycle fixes, subtask promotion and sequential label names, compact subtask controls, quick-filter label swatches, and bulk triage. The task guide documents selection, its scope, save behavior and Undo.

- **Automated:** 484 application tests in 37 files and 8 Python shortcut tests; lint, TypeScript, production packaging/release checks and the browser harness build pass. PR 28 CI passed on Node 22 and Node 24. Regression coverage includes selected snapshots across consecutive edits, filters hiding selected cards, duplicate task identities, recurrence inserting lines, partial file failures, later-note edits during Undo, keyboard/modifier selection, click-away dismissal and listener cleanup.
- **Native desktop:** Obsidian 1.13.7 in the disposable readiness vault. Selected three main tasks in two notes, applied a due date and moved them to Done. Verified the saved Markdown and the unchanged child task. Undo restored both notes byte-for-byte and cleared selection. Earlier checks applied priority and labels to selections retained after they stopped matching the active filter. The final implementation was installed/reloaded in Mason Remote; Command-click and click-away dismissal were verified without editing personal tasks.
- **Browser:** Command-click and Shift-click ranges, empty-date validation, date changes, Done and Undo. At 390px wide the toolbar actions fit above the list, Select all included 17 matching tasks including hidden rows/cards, and applying a label updated all 17.
- **Repairs found during this pass:** completing a bulk dialog after its board closes no longer resurrects that board; a failed remove-date save keeps the date input disabled. Regression tests cover both.
- **Release-specific mobile attempt:** connected to the maintainer’s iPhone 15 Pro Max through Mirroring. Obsidian settings initially showed Task Trellis 0.1.15, disabled. Text entry and taps were unreliable; Mirroring closed once, and reconnecting and restarting Obsidian did not yield a usable bulk-edit session. The exact candidate bundle on the phone could not be established. Two synthetic test tasks and a board were prepared in the synced vault but never edited from the phone, then removed with a recoverable backup. The agent-operated attempt was incomplete. The maintainer then took over and confirmed that the requested phone smoke check looked good. **The phone smoke checklist is closed on maintainer-reported evidence**, not on a completed automated or agent-operated run; the exact installed phone build/app versions were not independently reconfirmed. Android remains deliberately deferred by the maintainer; no new VoiceOver or cross-device conflict-resolution pass is claimed.

These implementation checks used the 0.1.16 source while the local manifest still read 0.1.15; a clean dependency installation, all 484 application and 8 shortcut tests, lint, preview build and final 0.1.16 packaging passed again on the release branch. Historical sections above retain their original version-specific counts and limitations.
