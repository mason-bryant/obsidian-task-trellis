[← Task Trellis](../README.md)

# Privacy and integrations

Task Trellis works locally and has no remote service integration. It collects no telemetry, includes no ads, requires no account or payment, and does not access files outside the vault. It does not install or update plugins or dependencies. Its runtime dependency is bundled in `main.js`. Obsidian renders card text as Markdown, so remote images or embeds included in your task text can cause Obsidian to load that content from its source.

The plugin reads Markdown tasks and metadata throughout the vault, except configured exclusions and the boards folder. Board actions edit task lines; board settings edit the board note's properties. Plugin preferences are saved through Obsidian's plugin data API.

The optional **Also rename board tags** action scans all ordinary Markdown notes, including excluded folders, so it can update a board's task tags and dependent board filters consistently. Before changing notes, it saves JSON recovery files containing their full original and proposed contents in **Task Trellis recovery/** inside the vault. These files are not automatically deleted and may be copied by your vault's backup or sync tools according to their configuration. No recovery content is sent to a Task Trellis service. Remove a recovery file only when you no longer need to restore or reconcile that rename.

The **Tasks** community plugin is optional: it provides the task editor and recurring-task behavior when available. Task Trellis reads its `setCreatedDate` preference from `<vault>/<configDir>/plugins/obsidian-tasks-plugin/data.json`. Without Tasks, cards open the source note and new tasks use a plain text prompt. The **Daily notes** core plugin is needed only when the destination is today's daily note; choosing a specific note works without it. If **Templater** is enabled, Task Trellis waits briefly for template processing so newly added tasks survive it. These integrations operate inside the vault.

The `task-trellis:` [command line commands](cli.md) run only when a program on this computer invokes Obsidian's command line interface, which is off until you turn it on. They read and write the open vault the same way the board does and send nothing elsewhere; what an agent does with their output is up to that agent.

The board index enumerates vault paths to discover tasks and board notes; it does not send those paths elsewhere. **Copy shortcut URL** writes the generated URL to the clipboard only after you click it. Task Trellis never reads the clipboard.
