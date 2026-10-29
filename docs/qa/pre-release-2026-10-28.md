# Pre-release checks — October 28, 2026

Candidate: `codex/ux-design-guidelines` at `5a50310`, plus the release-note enforcement and regression tests added during this pass. The manifest still says **0.1.16**; this is an unreleased candidate, not a retest of the published 0.1.16 assets. No version was bumped or tag published.

## Automated checks

Passed on macOS with Node 22.13.1:

- Clean dependency installation and lint with zero warnings allowed.
- **609 tests across 45 files**, including task safety, partial writes, stale snapshots, drag/scroll behavior, settings and bulk edits.
- **8 Python shortcut tests**.
- TypeScript checking, production build, mobile-import validation, packaging and browser harness build.
- Packaged `main.js` matched the copy installed in the disposable native test vault. SHA-256: `8e482b7d02b58275e0974823b68af57462431a49419bde1875d627e7d7825890`.

New regression coverage checks that Select column adds to an existing selection without duplicating it; actual BoardView Undo clears selected snapshots while retaining selection mode; and a mixed main-task/subtask label edit changes only the main task, reports the unchanged subtask, and can be undone exactly. Existing coverage also checks the status for selected tasks outside the current view.

Four release-check cases reject missing, empty, mismatched-version and heading-only release notes before packaging. Valid notes still allow packaging. The release workflow now uses the committed notes as the GitHub release description; publication itself was not exercised.

## Browser layout

Used the real renderer in the in-app browser harness, in light and dark themes, with synthetic tasks. These are browser checks, not native touch-device claims.

- Viewed toolbar and settings at desktop and phone widths, including labeled quick filters and a long filter name.
- Grouped quick filters with two visible on desktop and zero visible in the single-column layout. The remaining filters appeared in the appropriate menu.
- Measured toolbar control rectangles after resizing through **601, 600, 599, 390 and 1280 CSS pixels**: no overlapping controls at any sampled width. Column paging and the single-column filter override activated at 600px and below, and deactivated when widened again.
- Switched to the second column and scrolled vertically without returning to the first column.
- Inspected the main toolbar again after visiting and saving settings.

## Native desktop

Obsidian **1.13.7**, default dark theme, in a new disposable vault containing synthetic tasks, with Tasks **8.5.0** enabled. Installed the exact packaged candidate.

- Dragged Done to the first settings position; its Done designation remained intact. Cancelled and reopened settings: the original order was restored.
- Reordered a quick filter using the keyboard, saved, and verified the saved order and intact toolbar layout.
- Confirmed the task created on the iPhone, its label assignment and the renamed label reached the Mac through iCloud. This is evidence of those writes syncing, not a guarantee about sync timing or concurrent conflict resolution.

## Native iPhone

Obsidian **1.14.5**, controlled through iPhone Mirroring in the same disposable iCloud vault. This exercised native Obsidian on a real phone, with remote pointer/keyboard input.

- Created a task and verified that it appeared at the top of Backlog.
- Renamed a label with the header Save control, assigned it to the new task, and saw the colored indicator on the card.
- Dragged that card below another card within Backlog. Undo restored its original position.
- Swiped from Backlog to Doing, then scrolled vertically: Doing stayed selected. The next-column button also moved to Waiting correctly.
- Scrolled the final Doing card entirely above Obsidian's floating toolbar.
- Reordered quick filters using the right-side grip. Save & open board returned to the regular board, and the filter menu reflected the new order.
- Observed no sidebar opening during these gestures. This does not cover every edge gesture.

## Remaining coverage and release decision

No failure was found in the checks above. The following are **not certified by this pass**:

- Native software-keyboard clearance for the new inline composer. Mirroring used the Mac keyboard, so successful typing did not expose the iPhone keyboard. The automated focus/viewport tests are not a substitute for that check.
- Holding a dragged card at the phone edge to move it between columns. Within-column drag and paging passed; the remote gesture tools did not establish edge-dwell behavior.
- A fresh VoiceOver pass, Android, custom themes, enlarged text, and a full native plugin-disable/re-enable or pop-out-window matrix.
- Node 24 and remote CI on the final PR revision.

Before publishing, prioritize a short direct-phone check of software-keyboard clearance and edge-dwell dragging, and require green PR CI. The other platform/theme gaps should remain explicit. Merge the final changes and add matching version metadata and a new version's release notes before tagging; do not repurpose the existing 0.1.16 notes.

## Maintainer confirmation and release preparation

On October 28, the maintainer confirmed testing both remaining phone checks—software-keyboard clearance and dragging between columns—and authorized the release. This is maintainer confirmation, distinct from the Mirroring checks above. The tested product changes were merged in PR 34; release preparation uses main commit `abd3a7c`, whose source tree matches the tested candidate, plus the validation/report changes and version metadata for **0.1.17**.

The earlier phone-check recommendation is satisfied by that confirmation. Final PR CI and the tag-triggered packaging workflow remain the publication gates. Other platform/theme limitations above still apply.
