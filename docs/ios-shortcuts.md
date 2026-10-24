[← Task Trellis](../README.md)

# Create tasks with an iOS shortcut

Use the ready-made shortcut to add a task to a board from your iPhone. Requires **Task Trellis 0.1.3 or later**, enabled in the destination vault.

### Set up once

1. [Download Create Task Trellis Task](https://github.com/mason-bryant/obsidian-task-trellis/releases/download/0.1.3/Create-Task-Trellis-Task-v5.shortcut) on your iPhone, open the downloaded file, and tap **Add Shortcut**.
2. In Shortcuts, tap **…** on the new shortcut to open its editor.
3. Fill in the two **Text** boxes at the top, beneath the **VAULT** and **BOARD** labels. Enter the exact vault name on your iPhone and the board's name or unique slug.
4. Rename the shortcut for its destination, such as **Add personal task**, then tap **Done**.

Each shortcut saves **one vault and one board**. To add tasks somewhere else, duplicate the shortcut, change those two fields, and give the copy a different name. Each copy keeps its own destination.

### Add a task

Run the shortcut for the board you want, enter the task text, then choose **No due date** or **Choose date**. Obsidian opens, creates the task, and displays the board. The confirmation **Task saved on this device** means the task was saved locally. Leave Obsidian open until its sync indicator shows **Synced** before closing it.

Tasks go to the note and heading configured under the board's **Settings → New tasks**, or the plugin's default destination. If that destination is today's daily note, enable Obsidian's **Daily notes** core plugin. The shortcut uses the board's default workflow column; undated tasks appear in its **No due date** column when one is configured.

If a task is not created, read the message shown in Obsidian. Check that the saved vault and board names are correct and that the task's tags and destination note meet the board's filters. Check the destination note before running the shortcut again, since each successful run creates a new task.
