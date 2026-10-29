[← Development](../development.md)

# Shared UX guidance

Task Trellis should feel like one tool across the board, its settings, and its editors. These documents describe interaction contracts, implementation locations, and checks to run when changing them. They are contributor guidance; task instructions for users remain in the [user documentation](../../README.md).

## Choose the relevant contract

| Area | Read before changing |
| --- | --- |
| [Drag and drop](drag-and-drop.md) | Card movement, reordered settings lists, drag handles and insertion feedback |
| [Editing and saving](editing-and-saving.md) | Editors, draft lifetime, save/cancel controls and keyboard behavior |
| [Buttons, icons and menus](buttons-icons-and-menus.md) | Action placement, naming, overflow and visual states |
| [Responsive layouts and gestures](responsive-layouts-and-gestures.md) | Phone layouts, scrolling, paging, column resizing and keyboard clearance |
| [Filters and selection](filters-and-selection.md) | Filter semantics, label previews, subtask context and bulk triage |
| [Feedback and recovery](feedback-and-recovery.md) | Busy indicators, write failures, previews and Undo |
| [Accessibility](accessibility.md) | Keyboard access, focus, screen-reader output, color and motion |
| [Implementation and testing](implementation-and-testing.md) | Component boundaries, CSS scope and regression coverage |

## How to use these documents

Read the contract before implementing a second version of an interaction. Follow the linked implementation rather than copying its markup or CSS into a new screen. Shared behavior does not require every interaction to use one universal controller: native card dragging and a draft settings list have different persistence and gesture needs.

Each document separates expected behavior from current exceptions or verification limits. A checklist is a requirement for evaluating a change, not evidence that the current release has passed every check. Record actual results in the PR or [test report](../testing.md).

When behavior deliberately changes, update the contract, related user documentation, and meaningful regression tests together. Keep implementation details in these documents rather than exposing them in product labels. Link to source files and named behaviors rather than line numbers that drift.
