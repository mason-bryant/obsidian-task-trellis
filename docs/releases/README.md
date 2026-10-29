# Release notes

Every new release needs a committed `<version>.md` here, in the same PR as the version bump. This applies to patches as well as feature releases. The filename must match `manifest.json`, without a `v` prefix, and its first line must be `# Task Trellis <version>`.

Write for people installing the update:

- Lead with the useful changes and important fixes, grouped by user task rather than commit.
- Describe compatibility, any migration or setup needed, and whether existing settings are preserved.
- State the checks actually completed and material gaps. Separate automated tests, browser previews, simulator checks and native device testing. Link to the detailed test report when useful.

Use [0.1.16](0.1.16.md) as a formatting example. Do not copy its test counts or compatibility claims into a new release without checking them.

`npm run check:release` and `npm run package` require a nonempty document with the matching version heading and body. The tag-triggered release workflow publishes that document as the GitHub release description. CI enforces presence and version consistency; the reviewer still checks accuracy and usefulness.

Before tagging, merge the notes and matching version metadata to main, run the release checks, and smoke-test the packaged assets. Do not overwrite an earlier release's notes to describe an upcoming version. Earlier versions that predate this policy may exist only in GitHub Releases; do not invent retrospective testing evidence to fill the archive.
