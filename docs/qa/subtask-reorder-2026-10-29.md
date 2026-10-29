# Desktop subtask reordering — October 29, 2026

Unreleased working-tree change on top of 0.1.17. Other local Appearance changes were present during this check. Only synthetic tasks in a disposable QA vault were edited.

## Initial implementation (superseded by the grip revision below)

### Behavior

- Reorder direct siblings on a multi-column desktop board by dragging within their list, or focus a subtask and use Alt+Up/Down.
- Save the actual Markdown order, including descendants and indented descriptions. Task fields and other boards' tags remain intact. All boards using the same note see that order.
- Require all siblings to be visible and the Note order appearance setting. Mobile, coarse-pointer and single-column layouts do not enable sibling reordering.
- Reject stale or ambiguous lists. A valid move uses the atomic writer and offers guarded Undo. Dropping outside the list retains the existing subtask-promotion behavior.

## Automated checks

- 642 application tests across 47 files passed.
- 8 Python shortcut tests passed.
- Lint, TypeScript, production packaging and harness build passed.
- New coverage includes upward/downward moves, nested blocks, descriptions, task fields, other-board tags, mixed line endings, EOF with/without a final newline, no-op drops, exact Undo, refusal to overwrite subsequent edits, shifted source lines, duplicate snapshots, new/hidden siblings and ambiguous list structure.
- Renderer tests cover the drop slot and shifting neighbors, cancellation cleanup, keyboard movement, filtered/completed-last lists, composers, mobile/narrow/coarse-pointer guards, different-parent rejection, existing promotion and ordinary card drops.

## Interactive checks

- In-app browser harness at 1280 × 720: keyboard sibling reorder changed the visible order; Undo restored it.
- Native macOS Obsidian 1.13.7, with Tasks 8.5.0, in a disposable QA vault: Alt+Up moved the third sibling before the second, the board refreshed, and keyboard focus stayed on the moved task. The saved Markdown retained its due date and other-board tag. Clicking Undo restored the fixture byte for byte.
- The native board, toolbar, nested child, completion controls and surrounding cards rendered correctly in the dark theme.

## Remaining coverage

Pointer drag attempts through automation did not complete a move in either the browser harness or native Obsidian. The existing main-card drag also did not complete through that automation, so this does not establish a new regression, but it is not a pointer-drag pass. Native keyboard input succeeded when the modifier was held briefly. The Mac locked before the pointer check could be completed. Manually verify sibling dragging, the moving ghost, the insertion gap, and moving a subtask with descendants before release.

No native iOS, Android, VoiceOver or light-theme pass was performed for this change. Mobile gesture code was not changed; its automated regression tests passed. The build was installed only in the disposable QA vault, not the personal vault.

## Desktop-grip revision

This revision follows the agreed desktop-only design at every column count. It supersedes the initial whole-row sibling-drop behavior and the single-column restriction above.

- Desktop sibling lists have narrow right-edge grips with reserved space, Obsidian’s grip icon, accessible names and focus styling. Mobile/coarse-pointer lists omit them; touch input cannot start a sibling reorder.
- The same controller as settings lists moves the row with the pointer, shifts neighbors, draws a dashed slot and scrolls the board at its edges. A grip only reorders its original siblings, never reparents or promotes. Drops outside the list, Escape, lost capture, closing and redraw cancel safely.
- Grip keys are Arrow Up/Down and Home/End; row Alt+Up/Down remains available. Saved moves keep focus on the row or grip and announce the sibling position through the Undo status. Descendants and indented notes remain attached to their task in Markdown.
- Lint, 651 tests across 47 files, 8 Python shortcut tests, harness build and production packaging/type checking passed. Existing dependency installation was reused. The shared settings-list tests also pass.
- Chrome/Chromium browser: actual pointer drags reordered siblings and moved a parent with descendants, with Undo restoring order. Checked keyboard movement, nested grips, focus and saved-position status, a 500px desktop pane with one chosen column, wide desktop in light/dark themes, the disabled state of sorted-list grips, and surrounding toolbar/cards. That pass did not attempt dragging a disabled grip or inspect a held drag preview. A 390px mobile-class fixture showed no sibling grips. The temporary fixture was removed.
- Native Obsidian was unavailable because the Mac was locked. The initial implementation’s native keyboard pass is not validation of this revised grip controller. Native desktop dragging, native iOS/Android and screen-reader behavior remain unverified.
- Installed the packaged revision in the requested maintainer vault, with asset backups and matching SHA-256 hashes. Plugin settings were preserved. Reload remains pending while native app access is locked.


## Disabled-grip drag correction

- Reproduced the reported symptom in Chrome with Completed last enabled: pressing the disabled grip started the draggable ancestor row's native drag, followed by pointer cancellation. It produced no sibling gap and no reorder. The earlier check of the disabled attribute did not catch this browser behavior.
- Unavailable grip presses are now intercepted before the disabled button, and native row dragstart is blocked when the press began on a grip. Disabled grips are faded and use the default cursor. Ordinary row presses still support promotion. Appearance explains the Note order / all siblings requirement. Disabled grips now use the visible task's name and focus identity even when earlier siblings are hidden.
- Automated: lint, 655 tests in 47 files, 8 Python shortcut tests, harness build, type checking and production packaging pass. Existing dependency installation reused. New regressions cover native dragstart targeting the ancestor after sorted/filtered/composer grip presses, ordinary row dragging afterward, and correct names in filtered lists.
- Browser: Chrome/Chromium, 1200px, synthetic tasks. Recorded actual mouse events: Note order received all eight moves with changing row transforms, neighbor offsets and a dashed slot; Completed last reproduced native dragstart before the fix and no native dragstart after it. Inspected and captured the live layout with a temporary fixture retaining the final pointer-move preview at release; this fixture changes release handling, not the renderer or movement. Escape removed that preview. An ordinary nested drag in the final build saved position 2 of 2, and Undo restored the order. Checked light/dark appearance, settings helper text and surrounding board. Temporary instrumentation removed after checking.
- Native desktop reload and verification remain blocked by the locked Mac. Browser coverage is not native Obsidian coverage. No new iOS, Android or screen-reader coverage.
- Installed the tested package in the requested maintainer vault with a backup, matching SHA-256 hashes for all three assets, and unchanged plugin settings. Board ordering preferences were preserved; they still need Note order for manual sibling reordering. Native reload remains pending.
