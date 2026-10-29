[← Shared UX guidance](README.md)

# Accessibility

## Expected behavior

Every essential action needs a keyboard or explicit-control alternative to dragging or swiping. Prefer native buttons, inputs and checkboxes; custom roles must include their state and keyboard behavior. Icon-only controls need action names, including the item name where ambiguity matters.

Keep a visible focus indicator. After redraw, restore focus using a stable item/control identity rather than a previous DOM reference. Menus return focus to their trigger; nested editors return to their originating control. Do not steal focus from another window during background updates.

Use headings and groups to describe form structure, live status for results such as reorder positions or selection counts, and alerts for errors requiring attention. Mark purely visual placeholders and drag copies as hidden from assistive technology; a drag copy must not introduce duplicate focusable controls.

Color is supplemental. Label squares and strips need descriptions; selection and active filters need checkmarks or semantic state. Choose readable text contrast for editable label colors through [labels.ts](../../src/core/labels.ts). Prefer Obsidian theme variables for surfaces and text.

Aim for 44px touch targets for ordinary actions and adequate separation. **Existing exception:** narrow full-height drag strips deliberately use less width to avoid consuming card/editor space. Keep their full height and non-drag alternatives; do not use this exception to shrink unrelated action buttons.

Honor reduced motion: animated neighbor movement and page settling should not be required to understand the result. Keep the destination indicator visible without animation. Long text and enlarged text must remain usable without covering adjacent controls.

## Current alternatives and limits

- Cards: Enter edits; Alt+Up/Down reorders open cards within a cell; Move to… provides column/date moves.
- Filter handles: Arrow Up/Down and Home/End reorder, with position announcements.
- Column separators: Arrow Left/Right resize; Shift uses larger steps; Home resets widths.
- Settings tabs support keyboard navigation. Editor headers provide labeled Save and Cancel controls.
- A semantic attribute or passing DOM test does not establish usable VoiceOver behavior. Test the actual screen reader before claiming coverage.

## Verify

Complete the changed workflow without a pointer, then check focus after save, cancel, redraw and menu dismissal. Check a screen reader's names, state changes and reading order when available. Test light/dark themes, enlarged text, reduced motion and narrow layouts. On native iOS, include the keyboard and touch exploration.

Start with [editor header](../../tests/editorHeader.test.ts), [appearance](../../tests/appearance.test.ts), [label picker](../../tests/labelPicker.test.ts), [reorder](../../tests/reorderQuickFilters.test.ts) and [column resize](../../tests/columnResize.test.ts) tests. Record what was actually exercised rather than declaring accessibility from automation alone.
