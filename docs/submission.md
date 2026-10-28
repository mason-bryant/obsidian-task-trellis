[← Task Trellis](../README.md)

# Community-directory submission

Updated October 27, 2026 for **0.1.16**. The plugin is already submitted. The last portal outcome recorded here was the failed automatic review of 0.1.13; its source fixes have since merged and shipped. A current portal result or directory acceptance has not been verified. Use the existing submission, not a duplicate.

## Listing

- Name: **Task Trellis**
- ID: `task-trellis`
- Repository: https://github.com/mason-bryant/obsidian-task-trellis
- Author: Mason Bryant
- Description: Manage tasks across your notes with configurable kanban boards, due-date rows, colored labels, and mobile task capture.
- License: MIT, with historical MIT and bundled ISC notices retained.
- Minimum Obsidian version: **1.13.7**.
- Mobile: enabled. Device-specific evidence and remaining gaps are recorded in [testing](testing.md).

## Suggested listing introduction

Bring tasks scattered across your notes into a configurable kanban board. See what you are working on now, what needs attention this week, and what should come next from your backlog. Use board-specific colored labels for projects and categories, while keeping tasks in their original Markdown notes.

Customize columns, due-date groups, and filters for tags, folders or note properties. Use quick filters to focus, then select individual cards, a column, or all matching tasks to change dates, labels, priority or workflow stage together. Undo protects notes edited after the action.

Capture ideas on your phone with the task button above each list or the ready-made iOS shortcut. Swipe between columns, manage subtasks, and open a task's source note in a pop-up editor without losing the board. Tasks is optional; enable it for its editor and recurring-task behavior.

## Reviewer notes

- The [README](../README.md) includes a quick start, sample desktop/mobile screenshots and focused guides. The [0.1.16 release notes](releases/0.1.16.md) describe changes since 0.1.15.
- Tasks remain Markdown checkboxes in source notes. Board configuration lives in board-note properties; labels and workflow placement use ordinary board-specific tags.
- No telemetry, account requirement, payment or remote service. Obsidian may load remote embeds in user-authored Markdown. See [privacy and integrations](privacy.md).
- Tasks, Daily notes and Templater integrations are optional and guarded. Internal navigation/editor integrations need continued compatibility testing after Obsidian updates. The pop-up editor falls back to ordinary navigation if its guarded integration is unavailable.
- Two small implementations identified as adapted from 4D Eisenhower Matrix were replaced after 0.1.9. The developer had access to the prior implementations; no clean-room claim is made. Historical attribution remains. See [provenance](provenance.md).
- The maintainer chose to proceed without a separate eligibility inquiry. No author approval or directory eligibility determination is claimed; this document does not authorize contacting other authors.

## Release validation

- **484 application tests in 37 files**, **8 shortcut tests**, lint, TypeScript, production packaging/release validation and preview build pass. PR 28 CI passed on Node 22 and 24; the release preparation PR must pass the same checks.
- Native macOS Obsidian 1.13.7: pop-up save/recovery, task promotion, plugin reload, bulk dates and Done movement across two notes, unchanged subtasks, saved-file verification and exact Undo restoration. See the dated test report for scope and limitations.
- Browser checks cover selection shortcuts, click-away behavior, editor validation and the 390px layout. This is not a native mobile test.
- Earlier real-iPhone evidence includes agent-operated 0.1.10 checks and the maintainer-confirmed 0.1.12 checklist. The 0.1.16 bulk-triage phone attempt was incomplete because Mirroring/Obsidian input was unreliable; no native phone pass is claimed; Android remains deferred by the maintainer. No new VoiceOver or cross-device conflict-resolution pass is claimed.
- Required install assets are **main.js**, **manifest.json** and **styles.css**. Notices are embedded in the bundle. The release workflow verifies metadata, tests, builds and publishes those assets with provenance attestations.

## Update the existing submission

1. Open [Task Trellis in the submission portal](https://community.obsidian.md/account/plugins/task-trellis).
2. For a pre-release scan, choose **Review branch**, enter the release branch or exact commit under **Branch, tag, or commit SHA**, and use **Run preview scan**. For this release the preparation branch is `codex/release-0.1.16`; after publication use tag `0.1.16`.
3. Review the actual scan result and address actionable findings. A successful branch scan does not imply directory acceptance.
4. After publishing, use **Check for new releases** if the portal has not picked up the tag. Read the release-specific result rather than relying on the historical 0.1.13 outcome.
5. After confirmed acceptance, update the README and installation guide to describe Community Plugins installation.

The previously retained `display: contents` warning concerns a structural desktop-grid wrapper overridden to a scrolling block on narrow layouts. It has no interactive semantics; retaining it avoids changing the tested mobile scroll structure solely for that warning. Any new scanner finding should be assessed separately. Vault enumeration and user-initiated clipboard writing are documented in [privacy](privacy.md).
