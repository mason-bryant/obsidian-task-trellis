[← Release notes](README.md)

# Next release

What has changed since the last release (1.3.0), so the maintainer knows what to validate before tagging. Every pull request that changes something users see adds a line here. A version bump starts its release notes from this list, then empties it.

## New

- **Board templates:** **Create board** can start from Kanban, Weekly planner, Project, Eisenhower matrix or an Example board with sample tasks.
- **First run:** turning Task Trellis on in a vault with no boards brings the boards sidebar to the front, listing the templates, and a notice points to it. Choosing a template opens **New board** with it chosen. Until then, turning it on showed nothing.
- **Template previews:** **New board** shows a picture of the chosen template's board, with sample tasks in its columns, rows and colors, and is wider to fit it beside the choices.
- **Color picker:** the label editor and card color rules share Hue, Saturation and Lightness sliders, along with the palette and HTML color code.
- **Color rule opacity and patterns:** a rule can set its own opacity and use Stripes, Dots, Grid or Checks, with a Preview card and a contrast warning.
- **What's new:** a toolbar button just before Settings lists recent features, with buttons to try them and a link to all release notes. After an update that adds features, it opens by itself once, with **Don't show this again**.
- **Show completed subtasks:** in the toolbar's Arrange menu. It's the same setting as **Hide completed subtasks** in Appearance.
- **No due date column scrolls:** the last option in Appearance, per board: **With the board** (the default) or **On its own**, which needs several columns showing. What's new has a checkbox for it too.

## Changed

- **Board settings:** the tabs are now Appearance, Quick filters, Setup, New tasks and General. Columns, Date rows and Filters moved into Setup, Card color rules moved into Appearance, and settings reopen on the last tab used.

## Fixed

- **Column commands:** on a board with a No due date column, **Add task to ‹board›: ‹column›** now puts the task in the chosen column, by filling in the Due now row's last day.
- **Add task box:** typing no longer scrolls a desktop board. Opening another box keeps what you typed, ready for when you reopen the first. Escape closes a box from anywhere inside it.
- **Subtask composer:** near the bottom of a wide board, the pinned Add task box no longer covers it.
- **Long No due date column:** its outline and drop highlight cover the whole list, and a drop in any gap lands there.
- **Long cells:** Done and No due date follow the same More and kept-card rules as other cells.
- **Negative orders:** a hand-edited tag such as `#tt/<board>/<column>/-50` keeps the card in its column, first in its cell.
- **Selecting:** cards keep their strike-through and overdue bar. A click in the bulk bar, or a quick filter from the menu, no longer drops the selection. Focus stays on the board after the bulk editor and Undo. A partial bulk edit names what it skipped.
- **Search:** it finds any completed subtask a card shows, and doesn't run on a word still being composed.
- **Touch:** 44px tap areas around a card's checkbox and source link and around settings checkboxes, with the same look.
- **Failures:** Sort by due date says when it couldn't move things. A source link to a missing note and a failed save of plugin settings say so. Task not saved can't be dismissed during a retry, and it confirms where the task went.
- **Screen readers and keyboard:** repeated icon buttons name their task, general settings errors are said and take focus, and focus survives a redraw.
- **Undo after a failed write:** it restores every note it can, names the ones it couldn't, and stays, so choosing it again tries just those. `task-trellis:undo` does the same.
- **Filters that can't be read:** a mistake such as a mapping under `include-tags` used to show every task. Now the board, quick filter or color rule matches no tasks and warns. Saving something else keeps those rules, where it used to erase a quick filter's, and choosing new rules really replaces them, which it didn't before.
- **Pop-out windows:** dragging a column, quick filter or color rule in settings works there too.
- **Damaged rename recovery file:** the others can still be restored, and Task Trellis names the bad file. A new tag rename waits, and says which file to deal with, including one that used to be skipped silently.
- **Boards and columns called Constructor or `__proto__`:** cards stay in their tagged column, and moves stick. A column called that keeps its normal width, and a board called that remembers its collapsed rows.
- **Column widths:** saving an unrelated setting no longer erases the width of a column added in another window or by Sync.
- **Small look fixes:** the accent focus ring in dialogs, errors in the error color, and reduced motion in the sidebar and the touch drag copy.

## Still needs checking

No pull request has covered these, so they need a person or a real device:

- **iPhone and Android:** the new tap areas, the phone keyboard with the Add task box and Search, the color sliders, the settings tabs and What's new.
- **iPad:** the same, plus **On its own** for the No due date column, including touch drags over it.
- **First run and template previews on a phone:** turning Task Trellis on should open the boards sidebar as the left drawer, and **New board** should show the preview above the templates.
- **What's new opening by itself:** after a real update, which needs the version bump.
- **VoiceOver:** results and notices being spoken, and the settings' extra status regions.
- **Desktop mouse:** drags with a physically held mouse, and the checkmark in Arrange in macOS's native menu.
- **Windows and Linux.**
- **Real sync conflicts.**
