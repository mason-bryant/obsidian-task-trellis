[← Task Trellis](../README.md)

# Community-directory submission draft

Updated October 25, 2026 for **release 0.1.13**. **Submitted; automatic review of 0.1.13 failed.** The portal lists the source error and recommendations. The `codex/community-review-fixes` branch addresses the findings; no passing portal result is claimed yet.

## Listing

- Name: **Task Trellis**
- ID: `task-trellis`
- Repository: https://github.com/mason-bryant/obsidian-task-trellis
- Author: Mason Bryant
- Description: Manage tasks across your notes with configurable kanban boards, due-date rows, colored labels, and mobile task capture.
- License: MIT, with historical MIT and bundled ISC notices retained.
- Mobile: enabled. The maintainer confirmed the 0.1.12 iPhone smoke checklist on October 25, 2026. Android remains untested. See [testing](testing.md).

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

## Release and validation status

- Release 0.1.13 adds eleven label color schemes, exact Previous scheme restoration and multi-column resizing. Required release assets are `main.js`, `manifest.json` and `styles.css`; license notices are embedded in the bundle. Future releases attach only the three supported install files.
- Validation: **319 application tests**, **8 shortcut tests**, lint, build, release validation and preview build. The release PR must pass CI before merge.
- The new scheme picker and resize controls were verified loaded in native macOS Obsidian after local installation. Scheme apply/restore was verified in the browser harness; native iPad resizing and cross-device scheme sync remain untested.
- Minimum Obsidian version is **1.13.7**, tested natively on macOS. No compatibility with earlier versions is claimed.
- The maintainer confirmed the requested 0.1.12 iPhone checks: moving cards between columns in both directions, vertical reordering and subsequent scrolling, task creation, and label renaming/saving with the keyboard open. This is maintainer-reported evidence, separate from the earlier automated and Mirroring checks.
- The short macOS VoiceOver attempt remains inconclusive: activation could not be verified through the available computer controls. VoiceOver was restored to off. Android, Windows/Linux native behavior and broader assistive-technology coverage remain untested; these are disclosed coverage gaps, not known plugin failures.
- Neither `task-trellis` nor “Task Trellis” appeared in the [official community plugin list](https://github.com/obsidianmd/obsidian-releases/blob/master/community-plugins.json) rechecked October 25, 2026. Availability is not reserved.

## Submission steps

1. Review the listing text and disclosed test coverage above. Recheck name/ID availability if submission happens later.
2. Sign in to the [Community directory](https://community.obsidian.md/) with an Obsidian account linked to GitHub and add the repository. See the [official submission instructions](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin).
3. Address automated review feedback and any questions from reviewers. Publish a new version if code or release assets need correction.
4. After acceptance, update the installation guide and README quick start with Community Plugins installation instructions.

The maintainer has chosen to proceed without a separate provenance eligibility inquiry. Historical attribution and the [provenance record](provenance.md) remain available; no author approval or directory eligibility determination is claimed. This decision is not an instruction to contact other authors.

The maintainer authorized starting the directory submission process on October 25. Account linking and any binding agreement still require the appropriate account flow. The portal now contains the submission and its 0.1.13 automated review.

## Resubmitting fixes

1. Open [Task Trellis in the submission portal](https://community.obsidian.md/account/plugins/task-trellis).
2. Choose **Review branch**, enter `codex/community-review-fixes` in **Branch, tag, or commit SHA**, and click **Run preview scan** to scan the PR before release.
3. After the branch passes review and CI, merge it. Update the package, manifest and versions map together for the next release, then push the matching version tag.
4. The release workflow builds, checks and attests the three install assets and publishes the release. The portal scans new releases automatically; use **Check for new releases** if needed.
5. Read the new review result. Do not create another plugin listing or assume a branch pass is final directory acceptance.

The remaining `display: contents` warning concerns a structural wrapper in the desktop grid, overridden to a scrolling block on narrow layouts. It has no interactive semantics. Retaining it avoids rewriting the tested mobile scroll structure solely for a scanner warning targeting an older Obsidian release. Vault enumeration and user-initiated clipboard writing are documented in [privacy](privacy.md).
