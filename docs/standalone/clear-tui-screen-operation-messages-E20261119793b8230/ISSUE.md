<!-- insrc:artifact ISSUE-793b8230cdbc616e -->

# Clear the TUI screen and operation messages

## Reproduction

1. Launch `insrc` from an interactive terminal after other terminal output is present. Observed: the TUI begins rendering without first clearing the existing terminal contents. Expected: the full-screen TUI starts on a cleared screen. 2. Run an operation such as daemon compact, update, refresh, or a typed command so output appears in the bottom message box. Observed: sticky operation, command, and error messages remain until they are displaced by newer messages, with no user action to clear them. Expected: a documented global action clears the current message box without changing pane state or daemon status.

## Root cause

The TTY-validated CLI entrypoint calls Ink `render` directly and performs no terminal clear before the first frame (`src/cli/index.tsx:23-35`). The root app owns all operation output in one `messages` state and its global input handler implements command, quit, pane switching, refresh, and help, but no action resets that state (`src/cli/app.tsx:56-59`, `src/cli/app.tsx:129-137`). The existing `clearTransient` helper intentionally preserves sticky note/task/error lines, so it cannot satisfy a user-requested full message clear (`src/cli/ui/messages.ts:38-41`).

## Fix intent

Clear the interactive terminal once at TUI startup immediately before the first Ink render. Add a discoverable global keyboard action that clears all currently displayed message rows while the root input handler is active, update the visible key hints/help text, and retain modal/approval input capture behavior. Add focused tests for startup clearing and for clearing success, info, and error operation output; preserve pane state, daemon status, and all IPC/service contracts.

## Citations

- **[[c1]]** `code` `src/cli/index.tsx:23-35`
- **[[c2]]** `code` `src/cli/app.tsx:56-59`
- **[[c3]]** `code` `src/cli/app.tsx:129-137`
- **[[c4]]** `code` `src/cli/ui/messages.ts:38-41`
- **[[c5]]** `code` `src/cli/__tests__/tui.test.ts:305-360`
- **[[c6]]** `analyze-bundle` `src/cli/app.tsx#MessageBox`
- **[[c7]]** `analyze-bundle` `src/cli/ui/messages.ts#clearTransient`
