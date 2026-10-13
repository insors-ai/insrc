<!-- insrc:artifact BUILD-8d4b90c9ab301e66-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-13T12:12:45.679Z  ·  **Updated:** 2026-10-13T13:07:10.483Z

**Commit:** e0d1a19f

## Summary

vscode-plugin/src/chat/docs-review-panel.ts renderShell is rebuilt. Layout: html and body are the pane's height, the body is a flex column with overflow hidden; .rv-head and .rv-bar are flex 0 0 auto and .rv-scroll (flex 1 1 auto, min-height 0, overflow-y auto) holds the section chooser, the notice, the diagram and experience hosts, the body and the open questions, and is the only scrolling element. Theme: the pane's own style block uses VS Code theme variables for every colour, font and border and defines --it-bg, --it-fg, --it-dim, --it-accent, --it-warn, --it-err, --it-ok, --it-sel, --it-border and --it-font on the body from them, so the existing body, functional-requirement, diagram and experience rules are unchanged; renderTerminalStyle, the terminal surface classes, the 'theme' message and the renderStyle/theme deps are removed, and there is no literal colour (transparent included). Header: a select of the pending documents (the shown document is always an option), a kind badge and a state line. Comment panel: a rounded box with a textarea and three round icon-only buttons (name in title and aria-label), a line naming the reviewer and a result line. A button posts one docs-decision { artifactId, decision, comments } where comments is the whole-document comment (with the contentVersion as version) or an empty list; all three buttons are disabled until a docs-decision-result for the shown document arrives; the result's message is shown; the field is cleared only when ok and recorded equals the number sent; send feedback with a blank field posts nothing and says so. A blocked document cannot be approved; a read-only open or a state of approved or rejected hides approve and reject. A re-post of the same document keeps the field and the result line; another document resets them. The section chooser, functional-requirement placement, diagram slot and experience slot code is untouched. Tests: the webview harness now builds the new elements; the tests that asserted on the old approve / request-changes controls and the terminal class were rewritten to the new controls; SHELL_BASELINE is the new shell's (92305 chars, 92350 bytes); the old arithmetic test (base pin plus declared deltas) could not hold for a rebuilt shell and was replaced by one that checks each of the five source strings is inlined verbatim, once and in order. Four mutations (a hex colour, no disable while unanswered, the body scrolling instead of the region, no blank-feedback check) each fail the matching named test. I rendered the real shell in headless Chrome with dark and light stand-in theme values (/tmp/t9/shell-dark.png, /tmp/t9/shell-light.png): the header, the document region and the comment panel are placed as in the approved mock in both. Not in this task: tabs for HTML documents (t10), inline drafts (t11), saved-comment history (t12). The host still posts `commentable`; the shell no longer reads it, since every kind takes comments. Plugin suite without forced exit: 1230 tests, 1220 pass, 8 skipped, 2 fail (src/config/__tests__/manifest-catalog.test.ts, failing before this Story).

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`
- ✓ `t8`
- ✓ `t9`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/index.ts` — **insrc-build** (2026-10-13T13:07:10.483Z)
- `src/workflow/__tests__/artifact-content.test.ts` — **insrc-build** (2026-10-13T13:07:10.483Z)
- `src/workflow/__tests__/feedback-carry-finalize.test.ts` — **insrc-build** (2026-10-13T13:07:10.483Z)
- `src/workflow/__tests__/review-decision.test.ts` — **insrc-build** (2026-10-13T13:07:10.483Z)
- `src/workflow/artifact-content.ts` — **insrc-build** (2026-10-13T13:07:10.483Z)
- `src/workflow/artifacts/companion/__tests__/header.test.ts` — **insrc-build** (2026-10-13T13:07:10.483Z)
- `src/workflow/artifacts/companion/header.ts` — **insrc-build** (2026-10-13T13:07:10.483Z)
- `src/workflow/artifacts/format/bindings.ts` — **insrc-build** (2026-10-13T13:07:10.483Z)
- `src/workflow/artifacts/provenance/__tests__/review-fields.test.ts` — **insrc-build** (2026-10-13T13:07:10.483Z)
- `src/workflow/artifacts/provenance/schema.ts` — **insrc-build** (2026-10-13T13:07:10.483Z)
- `src/workflow/artifacts/provenance/tool.ts` — **insrc-build** (2026-10-13T13:07:10.483Z)
- `src/workflow/artifacts/provenance/types.ts` — **insrc-build** (2026-10-13T13:07:10.483Z)
- `src/workflow/artifacts/provenance/writer.ts` — **insrc-build** (2026-10-13T13:07:10.483Z)
- `src/workflow/orchestrator.ts` — **insrc-build** (2026-10-13T13:07:10.483Z)
- `src/workflow/review-decision.ts` — **insrc-build** (2026-10-13T13:07:10.483Z)
- `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` — **insrc-build** (2026-10-13T13:07:10.483Z)
- `vscode-plugin/src/chat/__tests__/docs-review-client.test.ts` — **insrc-build** (2026-10-13T13:07:10.483Z)
- `vscode-plugin/src/chat/__tests__/docs-review-decision.test.ts` — **insrc-build** (2026-10-13T13:07:10.483Z)
- `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` — **insrc-build** (2026-10-13T13:07:10.483Z)
- `vscode-plugin/src/chat/__tests__/protocol.test.ts` — **insrc-build** (2026-10-13T13:07:10.483Z)
- `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` — **insrc-build** (2026-10-13T13:07:10.483Z)
- `vscode-plugin/src/chat/chat-panel.ts` — **insrc-build** (2026-10-13T13:07:10.483Z)
- `vscode-plugin/src/chat/docs-review-client.ts` — **insrc-build** (2026-10-13T13:07:10.483Z)
- `vscode-plugin/src/chat/docs-review-panel.ts` — **insrc-build** (2026-10-13T13:07:10.483Z)
- `vscode-plugin/src/chat/protocol.ts` — **insrc-build** (2026-10-13T13:07:10.483Z)
- `vscode-plugin/src/chat/turn-lifecycle.ts` — **insrc-build** (2026-10-13T13:07:10.483Z)
