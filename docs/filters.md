[← Task Trellis](../README.md)

# Choose which tasks appear

The Filters tab keeps **Must include** and **Must not include** visible together, with Tags, Note folders and Note properties in the same order. Each Tags box combines task and page tags. Type a value and press Enter to make a chip, or choose a suggestion. New values are allowed. Remove a chip with its × button; Backspace in an empty entry brings the last chip back for editing. Tags can also be entered as a comma-separated list. A comma inside a property-value chip stays part of that one value.

- Included tags match **any** listed tag; included folders match **any** listed folder; included property rules must **all** match. All configured inclusion categories must pass. Empty categories add no restriction.
- **Any exclusion wins**, whether it matches a task tag, source-note folder or property rule. A missing property fails an inclusion rule and passes an exclusion rule.
- Property **Exists** matches a present key even if its value is null, empty, false or zero. **Matches any value** needs at least one value and compares against any scalar or list value. Keys are case-sensitive; values are case-insensitive. Numbers and booleans compare as strings.
- A task matches the combined tags on its own checkbox line and its page. **Page tags** are the note's `tags` property and inline tags in non-task text; they apply to every task in that note. A tag on another task line does not apply to this task. `house` matches `#house` and `#house/kitchen`, but not `#household`. Internal `#tt/…` placement tags are ignored. Folders match the named folder and descendants; properties come from the source note's frontmatter.
- The boards folder and globally excluded folders are unavailable to every board. Subtasks displayed inside a visible parent follow that parent without being filtered independently. A subtask shown as a standalone card must pass the filters itself.

For example, this board shows tasks tagged `#work` on the task or page (including nested work tags) from `Projects/` whose note has `team: product` or `team: design`, and a `status` property. It hides tasks with `#blocked` on the task or page, notes under `Projects/Archive/`, archived notes and notes marked confidential:

```yaml
include-tags: [work]
include-folders: [Projects]
filter-properties:
  - "team: product, design"
  - status
exclude-tags: [blocked]
exclude-folders: [Projects/Archive]
exclude-properties:
  - "status: archived"
  - "confidential: true"
```

Both property lists accept a single string, a list of rules, or a mapping. Use a mapping with a YAML list for literal commas: `- status: ["cancelled, deferred"]` matches that complete value. Repeated rules remain separate; the editor preserves them when saving other settings. It warns when a required property's existence is also excluded, but allows deliberate overlapping rules. Empty-board diagnostics report missing required keys only.
