[← Task Trellis](../README.md)

# Install and create your first board

Requires Obsidian **1.13.7 or newer** on desktop or mobile.

## Install Task Trellis

In Obsidian, open **Settings → Community plugins → Browse**, search for **Task Trellis**, then install and enable it. Obsidian's directory lists it as not manually reviewed by Obsidian staff.

To install a release by hand instead, for example to try a build before it reaches the directory:

1. Download **main.js**, **manifest.json** and **styles.css** from the [latest release](https://github.com/mason-bryant/obsidian-task-trellis/releases/latest).
2. In your vault’s configuration folder (normally `.obsidian`), create `plugins/task-trellis/` if needed.
3. Copy those three files into it. When updating, replace the three files and keep `data.json`, which contains your existing settings.
4. In Obsidian, open **Settings → Community plugins** and enable **Task Trellis**. If it was already enabled, turn it off and on to load the new build.

The plugin also runs on mobile. Install it in the vault you use on your phone before using the iOS shortcut. Installing a desktop copy does not by itself confirm that the plugin is installed and enabled on your phone.

## Create a board

1. Run **Task Trellis: Create board** from Obsidian’s command palette, or open the Task Trellis boards sidebar and choose **Create new board**.
2. Name the board and choose what it starts from; see [Board templates](#board-templates). Its **New tasks** settings open automatically.
3. Open the board’s **Settings → Setup → Filters** to choose the tasks it should show. With no filters, it shows eligible tasks across your vault, except the boards folder and globally excluded folders.
4. In **Settings → New tasks**, choose where new tasks should be saved. For a simple setup, choose a specific note such as `Tasks/Inbox.md`. You can also use today’s daily note; that requires Obsidian’s **Daily notes** core plugin.
5. Choose the **green checkmark** to save, then use **+ Add task** in a column to add your first task.

Boards are notes in the **Boards folder**, which defaults to `Task Trellis/`. Keep task notes outside that folder. Opening a board note shows the board; the note name on a task card takes you to that task’s source.

Make sure the destination for new tasks matches the board’s filters. For example, a board restricted to `Projects/` will not display tasks saved to `Tasks/Inbox.md`.

## Board templates

**Start from** in the new board dialog sets up a board for a way of working. Each is an ordinary board, so you can change any of it later in **Settings**.

| Template | Columns | What it sets up |
| --- | --- | --- |
| **Kanban** | Backlog, Doing, Waiting, Done | The plain board: due dates as rows, and quick filters for High priority, Overdue and the first label. |
| **Weekly planner** | Someday, To do, Doing, Done | **Due now** is this week and the next row is next week. Tasks without a due date wait in **Someday**. Today’s tasks are tinted orange and high-priority ones striped red, with quick filters for Due today, Overdue and High priority. Compact cards. |
| **Project** | Backlog, Ready, In progress, Review, Done | Labels named Feature, Chore, Bug, Blocked, Design and Research. Cards labeled Blocked are striped red. Quick filters for High priority, Overdue, Blocked and Bug, and a two-week Due now. |
| **Eisenhower matrix** | To do, Doing, Done | High priority means important, and due within two days (or overdue) means urgent. Color rules tint each quadrant: **Do** in solid red, **Schedule** in blue stripes, **Delegate** in yellow dots and **Eliminate** in a gray grid. Quick filters for Important and Urgent; turn both on to see what to do first. |
| **Example board** | Backlog, Doing, Waiting, Done | A dozen sample tasks, with labels, priorities, subtasks and due dates from overdue to undated, and a color rule or two. |

The example board writes its sample tasks to a note of their own, **Task Trellis examples/‹board name›.md**, and shows only the tasks in that note: the note has a `task-trellis-example` property that the board filters on. Tasks you add on the board go to that note too. Its New tasks settings don’t open, since it already has a destination. Boards that show tasks from every note will show the sample tasks as well, so delete the note, and the board, when you’re done with them.

## See what’s new

**What’s new**, just before **Settings** on a board’s toolbar, describes recent features, with a button or checkbox to try them:

- **Create board…** opens the new board dialog, with its templates.
- **Add suggested color rules…** opens this board’s settings at **Card color rules**, in the **Appearance** tab, with three rules added: **Overdue** in red stripes, **Due today** in orange and **High priority** in purple dots. Nothing is saved until you save the settings; change or remove the rules first if you like, or discard them.
- **Scroll this board’s No due date column on its own** is a checkbox that saves as soon as you change it, and the window stays open so you can see the board change behind it. It’s the same as **No due date column scrolls** in **Settings → Appearance**, and is off until you turn it on.

**See all release notes on GitHub**, at the end of the window, opens your browser at the notes for every release, including older ones.

When an update adds features worth trying, the first board you open afterwards shows the same window once, with just what the update added. Check **Don’t show this again** there, or turn off **Show what’s new after updates** in **Settings → Task Trellis**, to stop it opening by itself. A new install doesn’t show it, and the toolbar button always works.

## Make it yours

- [Configure columns and dates](boards.md).
- [Filter by tags, folders and note properties](filters.md).
- [Add, edit, move and complete tasks](tasks.md).
- [Name and assign colored labels](labels.md).
- [Set up one-tap access to task capture with iOS Shortcuts](ios-shortcuts.md).

The **Tasks** community plugin is optional. It adds a task editor and recurring-task support. Without it, clicking a card opens its source note, and you can still add, move and complete tasks. See [Privacy and integrations](privacy.md) for details.
