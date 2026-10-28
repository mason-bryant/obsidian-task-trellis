[← Task Trellis](../README.md)

# Choose which tasks appear

The Filters tab groups rules under **Must include — Match all rules** and **Must not include — Match any rule**. Choose **Tags**, **Note folder** or **Note property**, then select **Add filter**. Every rule uses the same **Field → Condition → Value** layout. For a property, enter its name and choose **Exists** or **Matches any value**. Use the trash button to remove a whole rule.

Each Tags box combines task and page tags. Type a value and press Enter to make a chip, or choose a suggestion. New values are allowed. Remove a chip with its × button; Backspace in an empty entry brings the last chip back for editing. Tags can also be entered as a comma-separated list. A comma inside a property-value chip stays part of that one value. Tags and folders each have one rule per group; add alternatives as more values in that rule. Property rules can be added repeatedly.

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

## Quick filters

Quick filters are buttons at the top of the board that narrow it further while they're pressed. They never widen the board: a task must pass the board's filters and every quick filter that is on. Each board remembers which of its quick filters are on.

Manage them in **Settings → Quick filters**. Select a filter's name to expand it. **Show on board** puts its button in the toolbar. A hidden filter is kept but never applied. Use the arrows to reorder the buttons, the copy button to clone a filter, and the trash button to remove one.

Filters with selected labels show colored squares beside their names, both on the board and in settings. The settings preview updates as you select labels.

A quick filter can match on:

- **Priority**: any checked level. **No priority** matches tasks without one.
- **Labels**: tasks with any checked board label. Choose **No labels** to find tasks with no labels assigned for this board; ordinary tags and labels from other boards do not count. Combine it with specific labels to match either unlabeled tasks or any checked label.
- **Due**: **Overdue**, **Due today**, **Due now** (the board's Due now window, overdue included) or **No due date**. Any checked choice can match.
- **Must include** and **Must not include** rules for tags, note folders and note properties. These work exactly like the board's own filters above.

Within Priority, Labels or Due, any checked choice can match. Every part you fill in must match. A quick filter with nothing chosen matches every task.

**Match subtasks** is off by default for each quick filter. With it off, only main tasks can bring a card into the filtered view; their existing subtasks remain available through the normal expand control. Turn it on to let a matching subtask bring its parent into view. When combining filters, filters without this option must match the main task. Enabled filters can match that task or the same subtask—separate siblings cannot satisfy different filters.

A parent brought in only for context is marked **Matching subtask** and stays in its usual column and date row. Matching branches are expanded temporarily, including intervening parents, and the matching subtasks retain their own dates. Other siblings are behind **Show other subtasks**. These disclosures do not overwrite your saved collapse settings; turning the filters off restores the normal view. Matching branches are also revealed inside collapsed rows and past card limits. The usual completed-task visibility rules still apply when deciding whether a subtask can match.

Quick filters do not widen the underlying board's task membership. If an eligible subtask has ancestors outside the board, those ancestors appear as compact context headings that open the source note, not as editable board cards. Parents shown only for context are excluded from bulk selection; bulk editing still applies only to main tasks that match directly.

Boards come with three quick filters: **High priority** (high or highest), **Overdue**, and one for the board's first label, named after it with a 🏷️ in front (for example **🏷️ Critical**). Boards created before quick filters existed show the same three until their quick filters are edited. They're stored in the board note:

```yaml
quick-filters:
  - id: high-priority
    name: High priority
    show: true
    priority: [highest, high]
  - id: late-work
    name: Late work
    show: true
    due: [overdue]
    include-tags: [work]
  - id: unlabeled
    name: Needs a label
    show: true
    no-labels: true
  - id: overdue-work
    name: Overdue work
    show: true
    due: [overdue]
    match-subtasks: true
```

`id` keeps a filter's on/off state when it's renamed. Set `quick-filters: []` for a board with none.
