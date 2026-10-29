[← Shared UX guidance](README.md)

# Filters and selection

## Expected behavior

Board filters define scope. Each active quick filter narrows that scope; it must never admit tasks excluded by the board. Preserve filter IDs independently of names and list positions so renaming or reordering does not lose active state.

Distinguish three states: disabled from Show on board (not applied), available but inactive, and active. Overflow placement is presentation only. Count the first N enabled filters in settings order; moving an active filter into the menu must not turn it off. See [filter documentation](../filters.md) for persisted options and matching semantics.

Label filters use the board's label IDs and palette. Support No labels as an explicit condition. Reuse the same color-square preview in settings, toolbar and menus; color editing must be reflected everywhere without changing assignments.

Match subtasks is opt-in and defaults off. When enabled, show matching subtasks with their parent context. A context-only parent must be visibly identified with the subdued italic context label and must not become a matching main task for bulk operations. Do not lose hierarchy merely to flatten filter results.

## Bulk selection

- Select starts multi-selection; selection controls must not resemble task completion controls.
- Cmd-click on Mac or Ctrl-click elsewhere toggles a main task. Shift-click selects a displayed range within the same column; link modifier behavior remains intact.
- Select all includes matching main tasks beyond collapsed rows and display limits. The column picker constrains scope; swiping between columns does not change scope. Select column restricts selection to that column.
- Nested subtasks and context-only parents cannot be selected independently for bulk edits.
- Empty board space, outside clicks, Escape and Done selecting exit selection. Keep it active while a bulk editor is open or work is busy.
- Changing filters or the column picker clears selection. After an edit, retain selected snapshots even when tasks leave the visible filter, and explain that state. Undo clears selection.

Bulk actions reuse task-write validation and report applied and skipped tasks. Never silently expand a selection to every task in the vault or overwrite edits made since selection.

## Reuse and verify

Start with [renderBoard.ts](../../src/ui/renderBoard.ts), [renderQuickFilters.ts](../../src/ui/renderQuickFilters.ts), [renderBoardSettings.ts](../../src/ui/renderBoardSettings.ts), [renderBulkEditor.ts](../../src/ui/renderBulkEditor.ts) and the existing core filter/model logic. The [bulk triage user guide](../tasks.md#bulk-triage) explains scope and action effects.

- Compare visible results, selected counts and actual written tasks, including filtered descendants and context-only ancestors.
- Check label-less tasks, renamed labels, disabled filters, overflow and single-column overrides.
- Check modifier-click, same-column ranges, Select all with collapsed rows, outside-click dismissal and modal preservation.
- Verify partial writes, subsequent edits, selection retention and Undo.
- Relevant suites: [quick-filter hierarchy](../../tests/quickFilterHierarchy.test.ts), [quick filters](../../tests/quickFilters.test.ts), [bulk triage](../../tests/bulkTriage.test.ts), [filters](../../tests/filters.test.ts) and [BoardView](../../tests/BoardView.test.ts).
