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
2. Name the board. Its **New tasks** settings open automatically. It starts with **Backlog**, **Doing**, **Waiting** and **Done** columns.
3. Open the board’s **Settings → Filters** to choose the tasks it should show. With no filters, it shows eligible tasks across your vault, except the boards folder and globally excluded folders.
4. In **Settings → New tasks**, choose where new tasks should be saved. For a simple setup, choose a specific note such as `Tasks/Inbox.md`. You can also use today’s daily note; that requires Obsidian’s **Daily notes** core plugin.
5. Choose the **green checkmark** to save, then use **+ Add task** in a column to add your first task.

Boards are notes in the **Boards folder**, which defaults to `Task Trellis/`. Keep task notes outside that folder. Opening a board note shows the board; the note name on a task card takes you to that task’s source.

Make sure the destination for new tasks matches the board’s filters. For example, a board restricted to `Projects/` will not display tasks saved to `Tasks/Inbox.md`.

## Make it yours

- [Configure columns and dates](boards.md).
- [Filter by tags, folders and note properties](filters.md).
- [Add, edit, move and complete tasks](tasks.md).
- [Name and assign colored labels](labels.md).
- [Set up one-tap access to task capture with iOS Shortcuts](ios-shortcuts.md).

The **Tasks** community plugin is optional. It adds a task editor and recurring-task support. Without it, clicking a card opens its source note, and you can still add, move and complete tasks. See [Privacy and integrations](privacy.md) for details.
