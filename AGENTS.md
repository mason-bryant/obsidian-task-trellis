# Working on Task Trellis

Before changing a UI interaction, read the relevant [shared UX guidance](docs/design/README.md). Reuse the linked components and behavior where practical. If intentionally changing a convention, update its design document in the same change and explain the exception.

- Keep notes as the source of truth. Preserve unrelated Markdown and other boards' tags; use the existing write and Undo paths.
- Scope styles to their component and surface. A settings editor and a toolbar button must not share a layout class merely because both represent a quick filter.
- Check affected neighboring screens as well as the edited screen. Use the [verification matrix](docs/design/implementation-and-testing.md), and report the environments actually tested. Automated DOM tests and phone-sized browser previews do not establish native iOS compatibility.
- Follow [CONTRIBUTING.md](CONTRIBUTING.md) and [development instructions](docs/development.md) for build and test commands. Use synthetic fixtures or a disposable vault for destructive or failure tests.

`docs/agents.md` is the user-facing guide to CLI automation; this file is repository guidance for contributors and coding agents.
