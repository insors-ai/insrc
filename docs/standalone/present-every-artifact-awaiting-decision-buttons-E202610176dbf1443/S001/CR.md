<!-- insrc:artifact CR-6dbf14435972af7a-S001 -->

# Code review: 6dbf14435972af7a:S001

⚠️ **WARN** — HIGH 0 · MED 5 · LOW 1 · model `claude:claude-sonnet-5`

**Changed files:** 8

## adherence — 0 finding(s)

_No findings._

## conventions — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | vscode-plugin/src/chat/docs-review-panel.ts:openDoc | openDoc's `opts` parameter declares its optional fields as `kind?: string`, `path?: string`, `readOnly?: boolean`, `reveal?: boolean`, `changed?: boolean` without the explicit `\| undefined` union. Under exactOptionalPropertyTypes (strict-optional-indexed), the project convention is to write optional properties as `prop?: T \| undefined` — followed correctly elsewhere in this same Story's changes (e.g. src/mcp/server.ts's `handleWorkflowRun(..., client?: StepClient \| undefined)` and `forward`'s `extra._meta?: {...} \| undefined`, and the sibling test file's `runWebview(opts: { markedMissing?: boolean \| undefined; ... })`). |
| MED | vscode-plugin/src/chat/docs-review-panel.ts:reopen | reopen's `how` parameter declares `changed?: boolean` instead of `changed?: boolean \| undefined`, the same strict-optional-indexed deviation as openDoc's `opts`, inconsistent with the explicit `\| undefined` idiom used elsewhere in this Story's own changed files. |

## coverage — 0 finding(s)

_No findings._

## quality — 4 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/mcp/server.ts:1 | `err()` and `errorResult()` both build the identical MCP error envelope shape (`{ content: [{ type: 'text', text }], isError: true }`). `err` is used by handleWorkflowApprove/handleInsrcPresent while `errorResult` has no recorded callers, meaning the same helper was duplicated rather than reused and one copy may now be dead. Unify on a single error-envelope helper. |
| MED | vscode-plugin/src/chat/docs-review-panel.ts:1 | createDocsReviewHost defines ~29 nested closures (post, refreshPending, startPoll, tickPoll, openDoc, reopen, setOpened, startQuiet, dropWatch, decide, decideNow, openCompanion, …) with a cyclic call path: openDoc -> setOpened -> startQuiet -> reopen -> openDoc. This is exactly the shape that produced the known openDoc-supersede race; the routine is hard to reason about and easy to regress when adding another entry point into the cycle. |
| MED | vscode-plugin/src/chat/docs-review-panel.ts:1 | `decide` calls `decideNow`, and `decideNow`'s own callee list includes `decide` again, i.e. mutual recursion between the two with no depth/attempt guard visible in either signature. If a decision keeps hitting the `refuse`/error branch inside decideNow and that branch re-enters decide, this can recurse indefinitely instead of surfacing a bounded retry or failure to the user. |
| LOW | src/workflow/pending.ts:1 | `handleWorkflowPending` has no recorded callers in the changed symbol set, unlike every other IPC-style handler in this diff (handleWorkflowApprove, handleInsrcPresent, handleWorkflowRun) which are wired into buildInsrcMcpServerWithRegistry. Confirm this new pending-listing entry point is actually dispatched from the daemon/MCP layer and not just covered by its own unit test. |

