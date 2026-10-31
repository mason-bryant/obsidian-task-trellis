[← Task Trellis](../README.md)

# Choose which tasks appear

The Filters tab works like the filter editor in Obsidian's Bases. It's one group of filters, and the dropdown at its top says how they combine:

- **All the following are true:** a task must match every filter in the group.
- **Any of the following are true:** a task must match at least one.
- **None of the following are true:** a task that matches any of them is hidden.

Each filter after the first says so: **and** in an All group, **or** in an Any or None group, after **where** on the first.

Select **Add filter**, then choose what it tests in its first dropdown: **Tags**, **Note folder** or **Note property**. Tags take any of the listed tags, and a note folder any of the listed folders. For a property, enter its name and choose **exists** or **is any of**. Use a filter's trash button to remove it.

To combine filters another way, select **Add filter group**. A group is a box inside its group, with its own dropdown, its own **Add filter**, and a filter to fill in. Its trash button removes the group and everything in it, and so does removing its last filter. Groups go three levels deep: the whole filter, a group in it, and a group in that. A new group starts with the opposite of its group's choice, Any inside All and All inside Any, since that's usually why you add one.

Filters are named by where they are: **filter 2.1** is the first filter in the second item. An error such as **Filter 2.1: Add at least one value to match.** points to it.

Each Tags or Note folder box takes several values. Type a value and press Enter to make a chip, or choose a suggestion. New values are allowed. Remove a chip with its × button; Backspace in an empty entry brings the last chip back for editing. Tags can also be entered as a comma-separated list. A comma inside a property-value chip stays part of that one value.

- **Within a filter, any listed value can match:** tags `work, urgent` matches either tag, and two folders match a note in either. To require two tags, add two Tags filters to an All group.
- A task matches the combined tags on its own checkbox line and its page. **Page tags** are the note's `tags` property and inline tags in non-task text; they apply to every task in that note. A tag on another task line does not apply to this task. `house` matches `#house` and `#house/kitchen`, but not `#household`. Internal `#tt/…` placement tags are ignored. Folders match the named folder and descendants. A Note folder value can also be one note's path, such as `Projects/Plan.md`, to match just that note. Properties come from the source note's frontmatter.
- Property **Exists** matches a present key even if its value is null, empty, false or zero. **Matches any value** needs at least one value and compares against any scalar or list value. Keys are case-sensitive; values are case-insensitive. Numbers and booleans compare as strings. A missing property never matches, so it fails in an All group and passes in a None group.
- Empty filters and empty groups add no restriction. With no filters at all, the board shows every task.
- The boards folder and globally excluded folders are unavailable to every board. Subtasks displayed inside a visible parent follow that parent without being filtered independently. A subtask shown as a standalone card must pass the filters itself.

For example, to show tasks tagged `#work` or in `Clients/`, from notes whose `status` is `active`, plus anything tagged `#urgent`, which is ((work or Clients) and active) or urgent:

```
Any of the following are true
  ┌ All the following are true
  │   ┌ Any of the following are true
  │   │  where  Tags         include any of  work
  │   │     or  Note folder  is in any of    Clients
  │   └
  │    and  Note property  status  is any of  active
  └
     or  Tags  include any of  urgent
```

### How filters are saved

Boards whose filters fit the plain lists every release reads keep them there: All of the tag, folder and property filters, with one None group for the exclusions, and at most one Tags and one Note folder filter beside them. This board shows tasks tagged `#work` on the task or page (including nested work tags) from `Projects/` whose note has `team: product` or `team: design`, and a `status` property. It hides tasks with `#blocked` on the task or page, notes under `Projects/Archive/`, archived notes and notes marked confidential:

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

Both property lists accept a single string, a list of rules, or a mapping. Use a mapping with a YAML list for literal commas: `- status: ["cancelled, deferred"]` matches that complete value. Repeated rules remain separate; the editor preserves them when saving other settings. It warns when a property every task needs is also excluded by a None group, but allows deliberate overlapping rules. Empty-board diagnostics report the properties every match needs that no note has.

Other filters are saved as one `filter` property: `and`, `or` and `not` groups holding `tags`, `folders` and `property` filters, the same shape as in Obsidian's Bases. The example above is saved as:

```yaml
filter:
  or:
    - and:
        - or:
            - tags: [work]
            - folders: [Clients]
        - property: "status: active"
    - tags: [urgent]
include-folders: [Update Task Trellis to use this filter]
```

A property filter names one property, written as in `filter-properties`. A list on its own is read as an `and` group. With `filter` present, the plain lists are ignored. If `filter` can't be read, the board says why and shows no tasks until it's fixed.

The extra `include-folders` value is for older versions of Task Trellis, which don't know `filter`: on a device that hasn't updated yet, the board shows no tasks, instead of tasks its filter should hide. Update Task Trellis on every device that opens the board. Saving settings simplifies what says nothing extra, such as a group of one filter, and goes back to the plain lists, without `filter`, once the filters fit them again.

## Quick filters

Quick filters are buttons at the top of the board that narrow it further while they're pressed. They never widen the board: a task must pass the board's filters and every quick filter that is on. Each board remembers which of its quick filters are on.

Manage them in **Settings → Quick filters**. Select a filter's name to expand it. **Show on board** makes it available in the toolbar or filter menu. A hidden filter is kept but never applied. Drag the grip beside a filter to reorder it. You can also focus the grip and use the up/down arrow keys (Home or End moves it to the first or last position). Use the copy button to clone a filter and the trash button to remove one.

To save toolbar space, enable **Group filters in a menu**. **Filters to keep visible** keeps the first N enabled filters on the toolbar in settings order; blank or `0` puts them all in the menu. **Filters to keep visible in single-column view** is an optional override for narrow boards (including phones) or a single selected column: blank inherits the main value, while `0` puts all filters in the menu. No menu appears when every filter fits. The menu shows checkmarks, and its button highlights and counts active filters inside it. Moving a filter into the menu does not disable it.

Filters with selected labels show colored squares beside their names, on toolbar buttons, in the menu and in settings. The settings preview updates as you select labels.

A quick filter can match on:

- **Priority**: any checked level. **No priority** matches tasks without one.
- **Labels**: tasks with any checked board label. Choose **No labels** to find tasks with no labels assigned for this board; ordinary tags and labels from other boards do not count. Combine it with specific labels to match either unlabeled tasks or any checked label.
- **Due**: **Overdue**, **Due today**, **Due now** (the board's Due now window, overdue included) or **No due date**. Any checked choice can match.
- **Filters** for tags, note folders and note properties, in groups, exactly like the board's own filters above, and saved the same way in each quick filter's entry.

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
