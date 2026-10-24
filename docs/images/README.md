# Documentation screenshots

These are screenshots of the shared Task Trellis board renderer in `dev/harness.html`, using fictional home-project tasks. They do not show a personal vault or imply a native Obsidian window. The README identifies them as browser previews.

- `board-desktop.png`: 1120 × 780 CSS pixels, captured at 2× resolution; four columns, a separate undated Backlog, Due now and the following week. Subtasks are collapsed.
- `board-mobile.png`: 402 × 800 CSS pixels, captured at 2× resolution with touch enabled; the first column and its Add task control.
- `label-picker.png`: the actual picker opened from a sample card, with three named labels and the remaining defaults left blank.

The sample board is named **Home projects**, with an eight-day Due now window, one week row, and a fixed date of October 24, 2026. Green means Financial planning, yellow means Paint kitchen, and red means Urgent. Only the preview toolbar, source listing and harness information banner are hidden; product controls and layout are unchanged.

To update screenshots, build the preview with `npm run harness`, open `dev/harness.html` through a local web server, and use sample tasks. Keep screenshots free of private vault content. Review both desktop and phone images after changes to the renderer or styles.
