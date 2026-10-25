[← Task Trellis](../README.md)

# Community-directory submission draft

Prepared October 25, 2026. **Not submitted.** Review this draft against the version actually released before applying.

## Listing

- Name: **Task Trellis**
- ID: `task-trellis`
- Repository: https://github.com/mason-bryant/obsidian-task-trellis
- Author: Mason Bryant
- Description: Manage tasks across your notes with configurable kanban boards, due-date rows, colored labels, and mobile task capture.
- License: MIT, with historical MIT and bundled ISC notices retained.
- Mobile: enabled. See the compatibility evidence and remaining tests below.

## Suggested listing introduction

Bring tasks scattered across your notes into a configurable kanban board. See progress and due dates together, add board-specific colored labels, and capture tasks from your phone. Tasks stay in Markdown, and each card links back to its source note.

Customize columns and filter tasks by tags, folders or note properties. On phones, add tasks at the top of the list, swipe between columns, and use the ready-made iOS shortcut for quick capture. Tasks is optional; enable it for its editor and recurring-task behavior.

## Reviewer notes

- The [README](../README.md) includes a short quick start, desktop/mobile sample screenshots and focused setup guides.
- Task lines remain in source Markdown notes. Board configuration is stored in board-note properties. Labels and workflow positions use board-specific tags.
- There is no telemetry, account requirement, payment or remote service. Obsidian may load remote embeds present in user-authored Markdown. See [privacy](privacy.md).
- The Tasks, Daily notes and Templater integrations are optional and guarded. Internal view/navigation interfaces need continued compatibility testing after Obsidian upgrades.
- Two small sorting/filtering files identified as adapted from 4D Eisenhower Matrix were replaced after version 0.1.9. The developer had access to the prior implementations; this is not claimed as a clean-room rewrite. Full historical attribution remains. See [provenance](provenance.md) for the scope and directory-policy caveat.
- See [testing](testing.md) for measured stress results, actual iOS evidence, simulator coverage and untested platforms.

## Before pressing Submit

1. Complete the outstanding compatibility and accessibility checks in the test report. The candidate minimum has been raised to the natively tested 1.13.7; earlier app versions are not claimed.
2. Disclose provenance; resolve any directory eligibility question raised by reviewers. No original-author approval is recorded.
3. Recheck name and ID availability at submission time. Neither `task-trellis` nor “Task Trellis” appeared in the official community plugin list checked October 25, 2026.
4. Merge the reviewed source and publish a new release containing these changes. Its tag must exactly match the default-branch manifest version; attach `main.js`, `manifest.json`, `styles.css` and the license files. Version 0.1.10 contains this work; 0.1.9 predates it. Confirm 0.1.10 or a newer version is published before submitting.
5. Sign in to the [Community directory](https://community.obsidian.md/) with an Obsidian account linked to GitHub, add the plugin, and follow the automated review feedback. See the [official submission instructions](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin).

The maintainer makes the final submission and account decisions. This document does not claim acceptance or authorize outreach to other authors.
