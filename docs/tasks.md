[← Task Trellis](../README.md)

# Add and manage tasks

## Add a task

- **On a board:** **+ Add task** appears at the top of each mobile task list and at the bottom of each desktop cell. Enter adds the task and keeps the box open for the next one; Cmd/Ctrl+Enter or **Details…** opens the Tasks editor first; Esc closes it. The task gets the cell's column and the date a drop into that row would set, unless you type a 📅 date yourself. Done has no add button.
- **Subtasks:** the list-plus icon on an open card (or, on hover, on a subtask) opens the same box under its subtasks. The subtask goes in the parent's note, after its last subtask, indented the way the editor indents (Settings → Editor → Indent using tabs), with no date or column of its own.
- **Anywhere:** the **Add task** command opens the Tasks editor and files the task with no column, so it shows in each matching board's first column.
- **Where they go:** by default, the end of `### 🚀 things I plan to accomplish` in today's daily note (Settings → Task Trellis → New tasks). The note comes from the core Daily notes plugin's own find-or-create, so it has your usual name, folder and template, and Templater runs on it as it always does. A board can send its tasks to a specific note and heading instead. If the board's filters would hide tasks from the destination note, you get a notice.
- New tasks get a `➕` created date when the Tasks plugin's "set created date" setting is on.

## Work with cards

- Each board places a task with one tag, `#tt/<board>/<column>/<n>`, at the end of the line. `<n>` orders cards within a cell. A task can sit in different columns on different boards.
- Dragging a card to another row sets its due date: Due now → the last day of the window; a week row → the first day of that week (or the day after the window for a partial first week); Later → the first day after the last week row; No due date → removes it.
- The arrow at a card's bottom right is a shortcut for the most common drag: a Due now card moves to the next row, and a card in any other row moves into Due now. It keeps its column and goes to the end of the cell. Completed cards don't have one.
- With a No due date column (`undated-column`), undated tasks live in that column instead of a row. Dropping a card there removes its due date, and its tag keeps the column it had before, which is where its arrow sends it; dragging one out gives it the date of the row you drop it in. Completed undated tasks show in Done, in Due now.
- Dragging into the Done column completes the task, and dragging out reopens it. Checked tasks always show in Done. A recurring task's next occurrence keeps the column it was in.
- Clicking a card opens the Tasks plugin's edit modal. Without the Tasks plugin it opens the source line.
- The note name on a card jumps to the task's line, reusing a tab that already shows the note in any window. Cmd/Ctrl-click opens a new tab.
- Cards use theme-aware surfaces, line icons and a single metadata footer. Overdue cards have a slim red edge and a relative overdue label. A partial first week displays its actual date range.
- Tasks indented under a task are its subtasks. They show inside the parent's card, in note order, and go wherever the parent goes, whatever their own date or column. Completed ones stay visible, struck through. A chevron and completion count (for example **1/3**) above each list shares a row with the add-subtask button. Its tooltip says **Hide subtasks** or **Show subtasks**. The board remembers each list’s visibility. **Collapse all subtasks** and **Expand all subtasks** apply to the whole board, including nested lists and hidden columns or rows, and are remembered when you reopen it. If the parent isn't on the board (filtered out, or completed long ago), its open subtasks show as cards of their own.
- **Compact** reduces card spacing without changing which subtask lists are expanded. Use the column picker to focus on one workflow column, especially in a narrow pane. These display choices last for the open board view.
- On a board under 600px wide (a phone, or a narrow pane on desktop), each column fills the board and a sideways swipe moves one column; the dots above the board show which column is in view. Column headers and row labels stay in view on every column.
- On touch screens and narrow boards, open cards have a ⋯ button. **Move to…** lists the board's columns (in the card's row) and rows (in its column), with what the move also does, such as the due date it sets. The card goes to the end of the chosen cell, as if dragged there. On touch screens the card buttons are 44px tap targets, and the add buttons show without hovering.
- On touch screens, drag the six-dot handle at the top right of a card to reorder it or move it into another date row. Hold near the top or bottom of the list to scroll while dragging. Swipe elsewhere on a card to scroll the list; in the narrow view, a deliberate sideways swipe moves between columns. **Add task** appears above each mobile task list.
- After moving, completing or changing labels on a task, **Undo** restores the latest change, including a recurring task's generated occurrence. To protect subsequent edits, Undo skips any note whose content has changed since that action.

For color coding, see [Use colored labels](labels.md). For quick capture on an iPhone, see [Set up the iOS shortcut](ios-shortcuts.md).
