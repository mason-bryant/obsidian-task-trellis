# Documentation screenshots

All screenshots use fictional tasks; none show a personal vault. The README says which is which.

- `board-desktop.png`: a sample **Work** board in Obsidian 1.14.5 on macOS, dark theme, captured from the board area at 1506 × 997 CSS pixels and 2× resolution (3012 × 1994). It has five columns of different widths, with Backlog as the No due date column; a one-week Due now row and the following week; six named labels as pills; Compact spacing; quick filters, some in a menu; subtasks, links and completed tasks. The board and its notes were made up in a disposable test vault, modeled on the shape of a real board but none of its content, with links to `example.com`. Obsidian's status bar and a leftover Undo bar were hidden for the capture.
- `board-mobile.png`: 402 × 800 CSS pixels, captured at 2× resolution with touch enabled; the first column and its Add task control.
- `label-picker.png`: the actual picker opened from a sample card, with three named labels and the remaining defaults left blank.

The phone and label-picker screenshots are of the shared board renderer in `dev/harness.html`, a browser preview rather than a native Obsidian window. Their sample board is named **Home projects**, with an eight-day Due now window, one week row, and a fixed date of October 24, 2026. Green means Financial planning, yellow means Paint kitchen, and red means Urgent. Only the preview toolbar, source listing and harness information banner are hidden; product controls and layout are unchanged.

To update the desktop screenshot, open a sample board in a disposable vault and capture only the board area. To update the others, build the preview with `npm run harness`, open `dev/harness.html` through a local web server, and use sample tasks. Keep screenshots free of private vault content. Review both desktop and phone images after changes to the renderer or styles.
