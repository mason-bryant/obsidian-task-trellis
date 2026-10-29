[← Shared UX guidance](README.md)

# UI implementation and testing

## Component boundaries

Keep task rules and transformations in core logic, UI rendering and interaction in `src/ui`, and Obsidian persistence/navigation in host adapters under `src/obsidian`. The browser harness uses the real renderers with an in-memory host. Reuse a renderer or helper when the behavior matches; avoid a parallel copy that will drift.

Create DOM nodes in the owning document/window using [dom.ts](../../src/ui/dom.ts). Pop-out windows must retain their own focus, geometry and menu content. Use public Obsidian APIs for new integrations; do not import undocumented UI internals merely to imitate a built-in screen.

Keep CSS component-specific, with explicit state classes. Do not apply layout rules to a shared semantic noun across unrelated surfaces. In particular:

- `.tt-quick-filter` is a toolbar button; `.tt-quick-filter-editor` is a settings row.
- The editor's inline-size container, border, spacing and drag layout must never apply to the toolbar button.
- Container queries should follow the component's available width. Hidden responsive alternatives must not leave duplicate keyboard controls exposed.
- Broad button, flex, width, overflow and container-containment changes need checks on every affected surface.

The toolbar regression occurred because editor containment suppressed the intrinsic width of toolbar buttons sharing a class. A DOM test could still find all the buttons while their text visibly overlapped. Geometry and visual inspection are required for layout changes.

## Verification matrix

| Change | Minimum useful checks |
| --- | --- |
| Settings styles / shared controls | Edited settings section, main toolbar, card actions, long names, visible and grouped filters |
| Drag / resize / scroll | Mouse, touch-controller tests, cancel/dispose, edge scroll, keyboard alternative, unchanged scroll position; native host interaction where available |
| Editor / saving | Success, failure with draft retained, duplicate submit prevention, IME, focus and keyboard-open layout |
| Filter / bulk selection | Actual matches versus context, scope/counts, stale tasks, partial writes and Undo |
| Shared CSS / responsive layout | Wide desktop, narrow desktop pane, phone width, explicit single column, light/dark, installed theme, enlarged text |

Use relevant behavioral tests, not assertions that merely repeat implementation details. For layout, inspect screenshots and measure visible bounds where useful: no overlapping adjacent controls, no text outside its button, and final content reachable above overlays. Check the whole board after returning from settings, not just the isolated editor.

Run the project's checks described in [CONTRIBUTING.md](../../CONTRIBUTING.md) and [development](../development.md). At the time of writing these include lint, Vitest, Python shortcut tests, production packaging/release checks and the browser harness build. For a documentation-only change, validate local links and the diff; do not claim UI coverage from a prose edit.

## Native verification and reporting

Use synthetic fixtures or a disposable vault for failure, bulk-write and recovery scenarios. Do not leave test tasks or changed settings in a personal vault. When a local install is requested, preserve plugin settings, back up replaced artifacts, verify the installed files match the build, reload the plugin and inspect the result.

Report evidence precisely: automated suite, browser engine/width, native desktop, simulator and real device are different coverage. Native Obsidian can intercept events that work in the harness; a phone-sized browser cannot reproduce all iOS sidebar, keyboard or toolbar behavior. If a platform is unavailable, state that gap without turning it into a passing check.

PR validation should identify what was tested, any failures found and resolved, and remaining limits. Keep historical evidence in [testing.md](../testing.md); these contracts describe what to verify, not a blanket certification of the current build.
