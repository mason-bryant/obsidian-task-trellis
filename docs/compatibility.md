[← Task Trellis](../README.md)

# Formats and compatibility

Task Trellis keeps everything in your notes. From 1.0, the formats below are stable: every 1.x release reads what earlier 1.x releases wrote, so updating never strands a board, a label or a script. A change that would break one of them waits for 2.0 and comes with migration notes.

## Stable through 1.x

- **Placement tags** at the end of a task line: `#tt/<board>/<column>/<n>`. See [tasks](tasks.md).
- **Label tags:** `#tt/<board>/label/<id>`. See [labels](labels.md).
- **Board notes:** the properties in the [property reference](boards.md#property-reference), and the label and quick-filter properties the board settings write. A later 1.x release may add properties; their defaults keep today's behavior. Saving settings writes only what you changed, and properties Task Trellis doesn't know are left alone.
- **Task lines:** dates, priorities and recurrence use the Tasks plugin's format. Task Trellis adds only its tags, and the `<!-- task-trellis-request:<id> -->` marker when an add passes a request id.
- **Plugin settings,** which updates keep.
- **The iOS shortcut's link,** `obsidian://task-trellis-create` with `vault`, `board` and `text`. See [iOS shortcuts](ios-shortcuts.md).
- **The command line:** command names and documented options keep their meaning. JSON output may gain fields in a 1.x release; existing fields keep their names and meaning, so scripts should ignore fields they don't use. See the [command-line guide](cli.md).

## Not covered

- CSS class names and page structure, which CSS snippets may rely on. These can change in any release.
- Plugin internals and the browser harness.
- Formats from before 0.1.15, which 1.0 no longer reads: `<!-- tt-labels:… -->` label comments, the `due-now-days` property, and Compact remembered per device. Choose Compact in a board's Appearance settings to save it in the board note.

## Requirements

Obsidian 1.13.7 or later, on desktop and mobile. The command line needs desktop Obsidian with its command line interface turned on.
