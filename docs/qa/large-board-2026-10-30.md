# Large boards on iPhone — October 30, 2026

Unreleased change on top of `main` at `89de2d4` (0.1.17 with PRs 36 and 37). No version was bumped. Only synthetic tasks were used, in the disposable iCloud vault **Trellis Large Board QA**. On the phone, **Trellis Release QA** was only switched away from and back to, and no other vault was opened.

## The problem

With the 0.1.17 + PR 38 candidate, opening the `Load QA` board (2,000 synthetic tasks in 20 notes) on an iPhone sent Obsidian to its launch screen within about 3 seconds, twice out of two tries. Obsidian came back on the previous board. A 500-task board opened and paged, but restarted once while iCloud was delivering more notes. In desktop Obsidian 1.14.5's mobile emulation at 400px, the same board drew 952 cards, about 56,000 elements and 7,000 icons.

## Cause

Every open card was drawn, with about seven SVG icons each, so the page's memory grew with the size of the board. Each redraw, such as the one after a note syncs, built all of it again before the old one was freed.

Safari's Web Inspector couldn't be used: Xcode lists no paired iPhone on this Mac (`xcrun devicectl list devices` shows only a simulator), and iPhone Mirroring doesn't carry Web Inspector. So the memory was measured in WebKit on the Mac at phone size instead: Playwright's WebKit 26.4 rendered the browser harness (`dev/harness.html?load=N`, synthetic notes shaped like the native ones) at 402 × 874 CSS pixels and 3× scale, with touch and Obsidian's mobile class. The page's WebContent process footprint, which is what iOS limits, was read with macOS's `footprint` tool. [Raw measurements](large-board-2026-10-30.json).

Before the change, memory grew with the number of cards drawn:

| Tasks | Cards drawn | SVG icons | Elements | Footprint after opening | Highest during 5 redraws |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 500 | 236 | 1,755 | 9,964 | 88 MB | 115 MB |
| 1,000 | 460 | 3,392 | 19,192 | 136 MB | 213 MB |
| 2,000 | 970 | 7,115 | 40,167 | 219 MB | 421 MB |
| 10,000 | 4,915 | 35,903 | 202,318 | 784 MB | 1,565 MB |

The harness drew 970 cards for 2,000 tasks, close to the 952 seen in native emulation. Leaving every icon out of the 2,000-task board (a temporary harness switch, not shipped) cut its elements from 40,167 to 16,777. Against a run with icons earlier in the same session, its footprint fell from 225 MB to 120 MB after opening and from 430 MB to 182 MB at the redraw peak, so the icons were about half the memory. Redraws aren't more frequent than expected: the task index already waits 150 ms after the last change before it tells the board.

These are desktop WebKit figures. They show how memory grows with the cards drawn; they don't give the iPhone's limit or Obsidian's own memory on top.

## Change

A cell draws its first 25 cards. Below them, **N more** shows the next 25 each time, and **Show fewer** goes back to the first 25. Done and No due date keep their own limits (5 and 10 by default) and their saved expanded state; once expanded, they also go 25 at a time. The extra pages last while the board is open and aren't saved, so reopening a board never draws everything. A focused card, or one an action just changed, stays drawn even when it moves past the page. Counts, Select all and Select column still include every card. The rule is in [look and feel](../design/look-and-feel.md), and [Configure a board](../boards.md) explains it to users.

After the change, at the same size and scale:

| Tasks | Cards drawn | SVG icons | Elements | Footprint after opening | Highest during 5 redraws |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 500 | 161 | 1,214 | 6,898 | 86 MB | 119 MB |
| 1,000 | 180 | 1,357 | 7,701 | 94 MB | 121 MB |
| 2,000 | 215 | 1,609 | 9,109 | 108 MB | 134 MB |
| 10,000 | 225 | 1,684 | 9,528 | 131 MB | 209 MB |

The 2,000-task board now draws fewer cards than the 500-task board used to, and a 10,000-task board draws about as many. A redraw of the 2,000-task board took 188 ms instead of 544 ms. Pages of 50 were also measured: 367 cards and 114 MB after opening for 2,000 tasks, nearly twice the cards of 25, so 25 was kept.

Not done: drawing only the column in view on one-column boards, and adding icons as cards scroll into view. Either would cut more, but each changes how paging, dragging or layout behaves, and the page limit alone brings the 2,000-task board below what the 500-task board drew before.

## Automated checks

Passed on macOS with Node 22.13.1: `npm ci`, lint, **653 tests across 48 files**, the 8 shortcut tests, the harness build and packaging. The packaged `main.js` is the copy installed in the test vault (SHA-256 `93842b401e1cc852870ba9afb60af1528832ac3bbab4ed504ae85bae06e4f3f3`).

New renderer tests (`tests/cellPaging.test.ts`) cover:

- drawing 25 cards, then 25 more per press, with the right counts, until Show fewer returns to 25;
- leaving cells of 25 or fewer alone;
- focus moving to the first card a page adds;
- pages surviving a redraw and starting over on another board;
- keeping a card that was just changed, or that has focus and moved past the page, drawn;
- Done paging past its own limit, collapsing again, and starting over from the first page when re-expanded;
- Select all still counting all 60 cards in a cell that draws 25.

## Browser harness

In the app's browser pane (Chromium), with `?load=2000`:

- 375 × 812 with the mobile class: one column at a time, 215 cards, and **179 more** after the 25th Backlog card in Due now. Pressing it drew 25 more in its place without moving the view, put focus on the first new card, and showed **154 more** and **Show fewer**.
- 1024 wide: **139 more** and **178 more** under the Doing and Waiting cells, in the existing "more" style, with Add task still floating at the bottom of each cell. The Backlog page shown at phone width stayed shown after resizing.
- Without `?load`, the sample board is unchanged: 14 cards and Done's **2 more**.

## Native iPhone

An iPhone 15 Pro Max, through iPhone Mirroring. The Obsidian and iOS versions weren't rechecked. The packaged build went into a new iCloud vault, **Trellis Large Board QA**, holding copies of the 20 synthetic `Load/` notes, the `Load QA` board note and the Tasks plugin, so the release candidate in **Trellis Release QA** stayed as it was.

- After trusting the vault's plugins and one reload for the iCloud configuration, `Load QA` opened showing **2000 cards**: Backlog 693, Due now 566. With the old build, this board restarted Obsidian within about 3 seconds, twice out of two tries.
- It stayed up for over two minutes while paging to Doing (660) and Waiting (647) with Next column, and through entering and leaving selection mode, each a full redraw. The selection bar offered **Select all 2000**. Obsidian didn't restart. [Screenshot](iphone-2000-cards.png).
- Afterwards the phone was switched back to **Trellis Release QA**.

Not checked natively: scrolling down a column and pressing **N more**. Through Mirroring, scrolling needs full-screen control, and macOS VoiceOver was running at the time, so its overlay blocked full-screen input; it was left on. The old build wasn't reopened on the 2,000-task board.

## Remaining gaps

- On the iPhone, scroll a long column, press **N more** a few times and **Show fewer**, and expand the Later row. Delete the **Trellis Large Board QA** vault afterwards.
- The iPhone's memory limit and Obsidian's own use weren't measured, so how much headroom the 2,000-task board has on a phone is unknown.
- Boards bigger than 2,000 tasks were measured only in desktop WebKit, not on a phone.
- A card with hundreds of subtasks still draws all of them.
- Expanding many cells at once can still draw a lot; each press adds at most 25 cards to one cell.
