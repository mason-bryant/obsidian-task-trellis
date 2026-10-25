[← Task Trellis](../README.md)

# Use colored labels

Click or tap the **tag icon** on a main task card to open its label picker. Check one or more labels to assign them; uncheck a label to remove it. Selections save immediately. If enabled, the search box finds labels by name or color.

Each board starts with six unnamed labels: green, yellow, orange, red, purple and blue. Use a label’s **pencil** to name it or change its color, then choose the **green checkmark** at the top to save. Pick a color swatch or enter an HTML hex code such as `#FFCC00`. **+ Add Label** adds another label to that board. Names are optional. Editing a label updates every card using it on that board.

Assigned labels appear as short colored bars above the card’s title. Hover to see a description such as **Red: Urgent**; custom colors use their hex code. On a phone, open the picker to see the labels’ names and selections. Subtasks do not have label controls or indicators.

Labels and assignments are independent on each board, even when the same task appears on several boards. Each assignment is an ordinary Obsidian tag, such as `#tt/personal-projects/label/l8f2a31`. You can search for it in Obsidian or use it in a board's tag filters. Label tags do not change the task's column or sort order.

The final part is a short, permanent label ID, unique within that board. Names can be as long as you like: renaming or recoloring a label keeps its ID and tags unchanged. Older labels may retain IDs such as `red`; those are permanent IDs too, regardless of the current name or color. The board note's `labels` properties map IDs to names and colors. Both the board definitions and task tags travel with your vault's sync. **Undo** reverses the latest assignment change.

Older hidden-comment assignments are still readable. Changing a task's selection rewrites that board's assignments as tags. There is no automatic vault-wide migration.

![Label picker with Urgent, Financial planning and Paint kitchen labels](images/label-picker.png)

When editing a label, use the green checkmark at the top left to save, or the X at the top right to discard the edit and return to the picker. These controls stay above the scrolling fields while the phone keyboard is open. Checking labels in the picker still saves each selection immediately.

Label search is hidden by default. To show it, turn on **Settings → Task Trellis → Show label search**, then reopen the label picker. This preference applies to all boards.
