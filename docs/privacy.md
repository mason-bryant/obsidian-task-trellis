[← Task Trellis](../README.md)

# Privacy and integrations

Task Trellis works locally and has no remote service integration. It collects no telemetry, includes no ads, requires no account or payment, and does not access files outside the vault. It does not install or update plugins or dependencies. Its runtime dependency is bundled in `main.js`. Obsidian renders card text as Markdown, so remote images or embeds included in your task text can cause Obsidian to load that content from its source.

The plugin reads Markdown tasks and metadata throughout the vault, except configured exclusions and the boards folder. Board actions edit task lines; board settings edit the board note's properties. Plugin preferences are saved through Obsidian's plugin data API.

The **Tasks** community plugin is optional: it provides the task editor and recurring-task behavior when available. Task Trellis reads its `setCreatedDate` preference from `<vault>/<configDir>/plugins/obsidian-tasks-plugin/data.json`. Without Tasks, cards open the source note and new tasks use a plain text prompt. The **Daily notes** core plugin is needed only when the destination is today's daily note; choosing a specific note works without it. If **Templater** is enabled, Task Trellis waits briefly for template processing so newly added tasks survive it. These integrations operate inside the vault.

The board index enumerates vault paths to discover tasks and board notes; it does not send those paths elsewhere. **Copy shortcut URL** writes the generated URL to the clipboard only after you click it. Task Trellis never reads the clipboard.
