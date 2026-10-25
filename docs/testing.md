[← Task Trellis](../README.md)

# Community readiness test report

October 25, 2026. Candidate 0.1.10 on `codex/community-readiness`, based on release 0.1.9. Test data is synthetic. Stress tests ran in a disposable vault; a separate synthetic QA folder in the maintainer’s synced vault was used for sync checks. No existing personal tasks were used for stress testing.

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

Application suite: **290 tests across 24 files**. Shortcut generator: **8 Python tests**. Lint, TypeScript checking, production packaging, notice/asset validation and preview build pass.

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
| Real iOS Obsidian 1.14.5 (387), maintainer’s device | Candidate 0.1.10 verified in installed plugins and reloaded. Synced QA board opened; label assignment/color save, completion/Undo, horizontal swipe and vertical column retention passed. Native safe-area fix verified. | Text entry was unreliable through Mirroring; fresh task capture, renaming and software-keyboard coverage remain unverified for this native candidate. Broad integration matrix not completed. |
| iPhone simulator / Safari | Shared UI tested, including current destination guidance, software keyboard and save visibility | Does not establish native Obsidian integration behavior |
| macOS Obsidian 1.13.7 | Fresh-vault workflow, Tasks absent/present, Daily notes off/on, Templater off/on, recurrence and Undo, pop-out labels, light/dark themes, enlarged settings, and 1,000-card native rendering. Details below. [Initial evidence](qa/native-readiness.png) | Every combination of optional-plugin settings and third-party themes has not been tested |
| Declared minimum: Obsidian 1.13.7 | Candidate 0.1.10 raises the minimum to the version actually tested natively. Historical releases retain their original minimum in versions.json. Type checking still uses the narrower 1.8.7 API package. | Earlier app versions are no longer claimed by this candidate |
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

No directory submission or author outreach has been made. This report accompanies the 0.1.10 release preparation; check the repository release history for publication status. The remaining decision points are the compatibility gaps above and directory eligibility given the historical adaptations. See [provenance](provenance.md) and [submission draft](submission.md).
