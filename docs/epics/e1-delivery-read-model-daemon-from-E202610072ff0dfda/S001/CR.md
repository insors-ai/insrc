<!-- insrc:artifact CR-2ff0dfdadb1c8d1c-s1 -->

# Code review: 2ff0dfdadb1c8d1c:s1

⚠️ **WARN** — HIGH 0 · MED 1 · LOW 10 · model `claude:opus`

**Changed files:** 48

## adherence — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/workflow/delivery/graph.ts:281 | The graph builder defines its own inline `lldAnchorOf` (`lld.epicCreatedAt ?? lld.createdAt`) instead of calling `storage.ts::workItemAnchorCreatedAt`. The LLD lists that helper as a call site for sc2 identity and says the builder reuses storage.ts's anchor helper. The logic is the same today; the likely reason for the copy is that the helper does not accept a null `createdAt`. If the helper's anchor rule ever changes, the delivery ids will silently stop matching the folder scheme. Either wrap the helper with a null guard or record the deviation. |

## conventions — 0 finding(s)

_No findings._

## coverage — 3 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/workflow/delivery/graph.ts:1 | The grounding is hollow for this Story's delivery symbols. buildWorkItemGraph, groupRecordsByWorkItem, loadArtifactRecordSet, liftStoreFile, makeNotice, sortNotices and DeliveryStoreUnreadableError all show empty testsReaching, yet graph.test.ts, load.test.ts, notice.test.ts and types.test.ts call them directly. I ran the suite (npx tsx --test 'src/workflow/delivery/__tests__/*.test.ts'): 40 tests, 40 pass, 0 fail. The empty edges are a missing test-edge index entry for newly created files, not a real coverage gap, so I am not reporting HIGH breaches for them. |
| LOW | src/workflow/delivery/load.ts:1 | All 36 promised tests are in the delivery __tests__ files under their exact names: types (1), notice (3), fixtures (1), load (6), identity-contract (1) and graph (24). Each one passed when I ran the suite myself. No build record is attached, so this pass state comes from my run, not from the BUILD record. |
| LOW | src/workflow/delivery/types.ts:1 | The changed set covers more than this Story. It includes cli-provider.ts, daemon/db/drivers/sqlite.ts, package.json, mcp/build-step/*, workflow/code-review/*, runners/build/* and shared/types.ts, which come from other stories and bugfixes merged inside the story range. I judged coverage only on the delivery read-model behaviour. The empty testsReaching on those other files belongs to their own stories' reviews and is not a gap in this Story. |

## quality — 7 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/workflow/code-review/dimensions/quality.ts:114 | `fileOf(location)` is copied byte-for-byte into all five dimension judges: adherence.ts:121, conventions.ts:138, coverage.ts:154, functional-coverage.ts:130 and quality.ts:114. Each judge also repeats the same `call(note)` / `validate(raw)` / withStructuredRetry / changed-set filter steps. The changed-set filter decides which findings survive, so if one copy is fixed and the others are not, the dimensions will quietly disagree. Pull `fileOf` and the shared judge steps into one shared helper. |
| LOW | src/agent/providers/cli-provider.ts:357 | `runReviewSession` writes its own retry loop that calls `isTransientCliError` directly, alongside `withTransientRetry`. The doc comment explains why: retry at most once, inside the time left before the deadline. But the rule for which errors count as transient now lives in two places. Consider giving `withTransientRetry` options for attempt count and deadline so there is one retry routine. |
| LOW | src/mcp/build-step/phases/validate.ts:386 | `err(code, message)` is identical in validate.ts:386 and implement.ts:179. Both build the same `BuildStepError` with `retryable: false`, and render.ts already holds shared build-step error code (`mergeInProgressError`). Move it into one shared module. |
| LOW | src/workflow/delivery/graph.ts:123 | `sortedUnique` in graph.ts copies `sortedUnique` in notice.ts:39 (the notice.ts version also accepts `undefined`). These are two modules in the same package, so export the notice.ts helper and reuse it. |
| LOW | src/mcp/build-step/phases/validate.ts:221 | `runValidateSession` is about 165 lines (221–386) and has roughly 12 callees: provider routing, inheriting the standalone route, reading the epic definition, persisting the build record, collecting the change log, rendering check evidence and validating the judge's output shape, all in one routine. Splitting it into a 'run checks + judge' step and a 'persist record' step would make each failure path easier to follow. |
| LOW | src/workflow/delivery/graph.ts:206 | `buildWorkItemGraph` has 19 callees and a nested `seed` closure, and it builds epic, story and task drafts, corrected parents, specs and notices in one pass. That is avoidable complexity in the module's main entry point; splitting it into named phases would make it easier to review. |
| LOW | src/agent/providers/__tests__/cli-subprocess.test.ts:1 | Several test files define their own copies of small helpers. `isAlive(pid)` appears in cli-subprocess.test.ts, cli-subprocess.live.test.ts and validation-checks.test.ts. A local `git(...)` / `write` / `put` helper is repeated across build-start, build-step, validation-checks, diff-grounding, changed-files, story-commits and git-diff-paths tests. This is test-only, so it is LOW, but a shared test-utils module would reduce drift. |

