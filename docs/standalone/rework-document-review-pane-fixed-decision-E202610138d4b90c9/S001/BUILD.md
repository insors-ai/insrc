<!-- insrc:artifact BUILD-8d4b90c9ab301e66-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-13T12:12:45.679Z  ·  **Updated:** 2026-10-13T12:43:36.906Z

**Commit:** 347bb43b

## Summary

docs-review-client.ts: decide(mdPath, decision, comments) calls 'workflow.reviewDecision' once with the path as given (the id map is not consulted) and throws on the { error } arm; approve() and comment() are removed; content() forwards docPath, contentVersion, feedback, reviewer and state, each an absent key when the daemon sent none. protocol.ts: 'docs-decision' is { artifactId, decision, comments }; 'docs-decision-result' and 'docs-companion' are host messages and 'open-companion' is a webview message, each in its kind list. Because the client's methods and the message shape changed, the pane's host (docs-review-panel.ts, a listed call site of the protocol change) had to change to compile: its decision handler now validates the new shape and calls decide once with the docPath of the document it read, keeping its existing inline notices; the host tests pinned on approve()/comment() were rewritten to that. Known gap until task 9 rebuilds the shell: the current shell's two buttons still post the earlier accept/note shape, which the host now drops, so the pane's buttons do nothing between this task and task 9; the shell text and its pinned baseline are untouched here. docs-content's new fields, the result message, the chat message and the companion handling are task 8. Plugin test files are excluded from the plugin's tsc; I compiled the two changed test files once with a temporary tsconfig and they typecheck. Plugin suite without forced exit: 1217 tests, 1207 pass, 8 skipped, 2 fail (src/config/__tests__/manifest-catalog.test.ts, failing before this Story).

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/index.ts` — **insrc-build** (2026-10-13T12:43:36.906Z)
- `src/workflow/__tests__/artifact-content.test.ts` — **insrc-build** (2026-10-13T12:43:36.906Z)
- `src/workflow/__tests__/feedback-carry-finalize.test.ts` — **insrc-build** (2026-10-13T12:43:36.906Z)
- `src/workflow/__tests__/review-decision.test.ts` — **insrc-build** (2026-10-13T12:43:36.906Z)
- `src/workflow/artifact-content.ts` — **insrc-build** (2026-10-13T12:43:36.906Z)
- `src/workflow/artifacts/companion/__tests__/header.test.ts` — **insrc-build** (2026-10-13T12:43:36.906Z)
- `src/workflow/artifacts/companion/header.ts` — **insrc-build** (2026-10-13T12:43:36.906Z)
- `src/workflow/artifacts/format/bindings.ts` — **insrc-build** (2026-10-13T12:43:36.906Z)
- `src/workflow/artifacts/provenance/__tests__/review-fields.test.ts` — **insrc-build** (2026-10-13T12:43:36.906Z)
- `src/workflow/artifacts/provenance/schema.ts` — **insrc-build** (2026-10-13T12:43:36.906Z)
- `src/workflow/artifacts/provenance/tool.ts` — **insrc-build** (2026-10-13T12:43:36.906Z)
- `src/workflow/artifacts/provenance/types.ts` — **insrc-build** (2026-10-13T12:43:36.906Z)
- `src/workflow/artifacts/provenance/writer.ts` — **insrc-build** (2026-10-13T12:43:36.906Z)
- `src/workflow/orchestrator.ts` — **insrc-build** (2026-10-13T12:43:36.906Z)
- `src/workflow/review-decision.ts` — **insrc-build** (2026-10-13T12:43:36.906Z)
- `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` — **insrc-build** (2026-10-13T12:43:36.906Z)
- `vscode-plugin/src/chat/__tests__/docs-review-client.test.ts` — **insrc-build** (2026-10-13T12:43:36.906Z)
- `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` — **insrc-build** (2026-10-13T12:43:36.906Z)
- `vscode-plugin/src/chat/__tests__/protocol.test.ts` — **insrc-build** (2026-10-13T12:43:36.906Z)
- `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` — **insrc-build** (2026-10-13T12:43:36.906Z)
- `vscode-plugin/src/chat/chat-panel.ts` — **insrc-build** (2026-10-13T12:43:36.906Z)
- `vscode-plugin/src/chat/docs-review-client.ts` — **insrc-build** (2026-10-13T12:43:36.906Z)
- `vscode-plugin/src/chat/docs-review-panel.ts` — **insrc-build** (2026-10-13T12:43:36.906Z)
- `vscode-plugin/src/chat/protocol.ts` — **insrc-build** (2026-10-13T12:43:36.906Z)
- `vscode-plugin/src/chat/turn-lifecycle.ts` — **insrc-build** (2026-10-13T12:43:36.906Z)
