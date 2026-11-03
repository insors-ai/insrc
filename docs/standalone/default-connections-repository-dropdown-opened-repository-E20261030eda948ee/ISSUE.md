<!-- insrc:artifact ISSUE-eda948eef958a33d -->

# Default the Connections repository dropdown to the opened repository

## Reproduction

Open a VS Code workspace in a registered repository (or a subdirectory of one), then open Connections for the first time. Observed: the repository dropdown has no selection and connections require manually choosing the already-open repository. Expected: preselect the registered repository containing the opened path. [[c1]] [[c3]]

## Root cause

ConnectionsManagerHost.open loads and dispatches registered-roots but receives no opened-path context and only refreshes an existing model.repoRoot. createConnectionManager initializes repoRoot to null, while registered-roots retains existing selection without choosing an initial one. Thus the first open remains unselected. Grounding: analyze located the host/reducer; direct source inspection confirmed this behavior and activation wiring. [[c1]] [[c2]]

## Fix intent

Use VS Code's opened path to preselect the deepest containing registered repository when there is no prior manager selection or retained draft. Prefer a local active file's containing workspace; otherwise use the opened workspace folder. Keep manual selection and unsaved draft ownership on reopen, preserve registered-root admission and path boundaries, and leave selection empty if there is no registered match. Never register a repository implicitly. Verify initial selection, nested paths, sibling-prefix rejection, multi-root context, no-match and manual/draft retention. [[c1]] [[c2]] [[c3]]

## Citations

- **[[c1]]** `code` `vscode-plugin/src/connections/host.ts`
- **[[c2]]** `code` `src/shared/connection-manager/model.ts`
- **[[c3]]** `stakeholder` `User UX feedback, 2026-10-31` — "the select repo dropdown should show the current repo based on the opened path"
