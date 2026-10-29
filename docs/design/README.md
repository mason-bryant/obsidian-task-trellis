[← Development](../development.md)

# UX rules

Task Trellis should look and behave the same way wherever the same kind of thing happens: on the board, in its settings, and in every editor and menu. These documents say what that means, so that a change to one screen doesn't drift away from the others. They are written for contributors and coding agents; the [user guide](../../README.md) explains the features to users.

| Document | Covers |
| --- | --- |
| [Look and feel](look-and-feel.md) | Colors, type, icons, sizes, control styles and states, and the layout of the board, cards, editors, menus and sidebar |
| [Wording](wording.md) | Capitalization, names for buttons and commands, tooltips, notices and error messages |
| [Buttons, icons and menus](buttons-icons-and-menus.md) | Which control and icon each action uses, and how toggles and menus behave |
| [Editing and saving](editing-and-saving.md) | How each editor saves, cancels and keeps drafts, and its keys |
| [Drag and drop](drag-and-drop.md) | Moving cards, reordering settings lists, handles and drop feedback |
| [Responsive layouts and gestures](responsive-layouts-and-gestures.md) | Narrow boards, scrolling, paging, column resizing and the phone keyboard |
| [Filters and selection](filters-and-selection.md) | What filters show, quick-filter states, subtask context and bulk selection |
| [Feedback and recovery](feedback-and-recovery.md) | Busy states, failures, previews, Undo and recovery |
| [Accessibility](accessibility.md) | Keyboard access, focus, screen readers, color and motion |

## How these documents work

Each document has three parts:

- **Rules:** what users see and do. New and changed screens follow them.
- **Exceptions:** every place the product differs from a rule, and why. A difference that isn't listed is a bug, either in the document or in the code.
- **Where it lives:** the files that implement it today. Using that code keeps behavior matched and is preferred when it fits, but matching the look and behavior is what matters.

When a change has to differ from a rule, record it under Exceptions, with the reason, in the same change. When a rule itself changes, update the document, the user guide pages that describe the behavior, and the tests together. Name files and functions rather than line numbers, which drift.

How to check a change, and how to report what was tested, is in the [testing rules](../testing/README.md).
