<!-- insrc:artifact TESTS-599f1d0bd42e0c37-s1 -->

# Tests: 599f1d0bd42e0c37 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 86 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

## t1

Run at 2026-11-07T05:08:26.091Z on commit `816d06a0a`. Tests check: **passed**. 10 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Required-pin PacketSchema/decodeReview rejects absent or symbolic pins and fresh before blocks; historical schemas decode unchanged old packets.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | final pin schema requires the pin without mutating historical schemas | `src/workflow/code-review/task-review/__tests__/contracts.test.ts` |

**unit: Pinned commit object and ancestry checks reject unavailable, noncommit or nonancestor input and preserve source/transport/integrity errors.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | final pin validates object type and ancestry with truthful source failures | `src/workflow/code-review/task-review/__tests__/contracts.test.ts` |

**unit: Original parent, changed-hunk and safe-path validation remains strict; caller-supplied projection metadata is rejected.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | selected-change packet: commit pointers, exact ranges, committed documents and excluded same-commit changes | `src/workflow/code-review/task-review/__tests__/contracts.test.ts` |
| pass | final pin schema requires the pin without mutating historical schemas | `src/workflow/code-review/task-review/__tests__/contracts.test.ts` |

**unit: New pinned zero-segment origins reject scope_conflict before source work, checkpoint replacement or provider dispatch; historical metadata decoding remains unchanged.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | zero-segment fresh admission rejects before history source work, checkpoint replacement or provider dispatch on both routes | `src/workflow/code-review/task-review/__tests__/admission.test.ts` |
| pass | selected-change packet preserves deletion rename and non-textual limits without invented ranges | `src/workflow/code-review/task-review/__tests__/contracts.test.ts` |

**unit: Same-attempt resume rejects a changed pin; interrupted no-pin history cannot execute and its checkpoint bytes remain unchanged.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | recovery admission: saved pins, latest-only resume, contiguous attempts and immutable prior sections | `src/workflow/code-review/task-review/__tests__/admission.test.ts` |
| pass | interrupted unpinned attempts remain readable but cannot execute on resume | `src/workflow/code-review/task-review/__tests__/admission.test.ts` |

**unit: Strict pending/accepted/failed and accepted/unmapped schema branches require their own fields and refuse cross-branch fields.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | accepted attribution decision unions retain only permitted fields | `src/workflow/code-review/task-review/__tests__/final-scope-contracts.test.ts` |
| pass | permanent snapshot branches cannot fabricate accepted rows for unmapped failure | `src/workflow/code-review/task-review/__tests__/final-scope-contracts.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/task-review/__tests__/admission.test.ts` | 0 | 4 | 2.3 s |  |
| `src/workflow/code-review/task-review/__tests__/contracts.test.ts` | 0 | 7 | 1.2 s |  |
| `src/workflow/code-review/task-review/__tests__/final-scope-contracts.test.ts` | 0 | 2 | 0.5 s |  |

## t2

Run at 2026-11-07T05:14:21.146Z on commit `3a632606b`. Tests check: **passed**. 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Identity/shifted-line interval mapping preserves selected text and excludes unrelated insertions and worktree canaries.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | committed projection uses identical-blob fast path and ignores HEAD/worktree changes | `src/workflow/code-review/task-review/__tests__/projection-intervals.test.ts` |
| pass | interval offsets exclude insertions inside selected spans and support negative shifts | `src/workflow/code-review/task-review/__tests__/projection-intervals.test.ts` |
| pass | all small single-edit intervals preserve exactly the selected surviving line identities | `src/workflow/code-review/task-review/__tests__/projection-intervals.test.ts` |

**unit: Changed runs split original intervals into exact surviving and superseded source parts without inventing active historical scope.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | interval projection partitions changed overlaps without granting replacement text | `src/workflow/code-review/task-review/__tests__/projection-intervals.test.ts` |
| pass | all small single-edit intervals preserve exactly the selected surviving line identities | `src/workflow/code-review/task-review/__tests__/projection-intervals.test.ts` |

**unit: Normalize overlapping final intervals with origin accounting, preserve deletion anchors including empty-file zero and never coalesce unselected gaps.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | normalization retains every origin and never coalesces unselected gaps | `src/workflow/code-review/task-review/__tests__/projection-intervals.test.ts` |
| pass | deletion anchors preserve empty-file zero and mark touched boundaries for witness verification | `src/workflow/code-review/task-review/__tests__/projection-intervals.test.ts` |

**unit: Invalid UTF-8/binary textual mapping and unprovable interval boundaries fail explicitly without dropping origin entries.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | projection refuses malformed or omitted changes, invalid UTF-8 and binary sources without invented partitions | `src/workflow/code-review/task-review/__tests__/projection-intervals.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/task-review/__tests__/projection-intervals.test.ts` | 0 | 7 | 0.9 s |  |

## t3

Run at 2026-11-07T13:39:59.722Z on commit `200ab3286`. Tests check: **passed**. 13 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Selected later ancestor-verified witnesses justify full/partial replacement or deletion; unknown, cyclic or backward witnesses and out-of-set overwrite reject.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | selected later witnesses justify complete supersession and immutable origin accounting | `src/workflow/code-review/task-review/__tests__/projection.test.ts` |
| pass | partial replacement witnesses must cover the entire changed target and deletions retain explicit witnesses | `src/workflow/code-review/task-review/__tests__/projection.test.ts` |
| pass | selected rename then deletion projects absent final blobs and still requires the deletion witness | `src/workflow/code-review/task-review/__tests__/projection.test.ts` |
| pass | verified rename deletion ignores unrelated and identical recreation at the original pathname | `src/workflow/code-review/task-review/__tests__/projection.test.ts` |

**unit: Actual selected rename and merge-resolution lineage maps exact final paths; unverified/colliding paths and unselected conflict resolution reject.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | selected rename chains compare exact blobs independently of rename similarity and reject unselected moves | `src/workflow/code-review/task-review/__tests__/projection.test.ts` |
| pass | unselected merge resolution rejects and explicit selected merge replacement supplies the witness | `src/workflow/code-review/task-review/__tests__/projection.test.ts` |
| pass | competing selected path moves fail instead of choosing a rename by array order | `src/workflow/code-review/task-review/__tests__/projection.test.ts` |
| pass | typed blob diff mode requires both objects and cannot fall back to HEAD or the working tree | `src/workflow/code-review/task-review/__tests__/projection.test.ts` |

**unit: Projected entry segments equal normalized active disposition union; fully superseded nonempty origins retain complete dispositions with findingScope=none.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | selected later witnesses justify complete supersession and immutable origin accounting | `src/workflow/code-review/task-review/__tests__/projection.test.ts` |
| pass | partial replacement witnesses must cover the entire changed target and deletions retain explicit witnesses | `src/workflow/code-review/task-review/__tests__/projection.test.ts` |

**unit: Projection read/byte/fragment bounds and existing input/diff truncation retain their distinct error fields, with serial reads and no preparation/model side effects on refusal.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | projection budgets refuse before exceeding limits, preserve source fields and use serial reads | `src/workflow/code-review/task-review/__tests__/projection.test.ts` |
| pass | production projection budgets accept their exact ceilings and refuse the next unit | `src/workflow/code-review/task-review/__tests__/projection.test.ts` |
| pass | actual diff truncation stays changes while oversized JSON refuses input before source/provider work | `src/workflow/code-review/task-review/__tests__/projection.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/task-review/__tests__/projection.test.ts` | 0 | 12 | 3.6 s |  |

## t4

Run at 2026-11-07T05:54:35.209Z on commit `671f18101`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Attribution accounts for all original entries/tests and replacement-witness closure, refusing missing coverage.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | effective attribution preserves all entries/tests and requires replacement witness closure | `src/workflow/code-review/task-review/__tests__/effective-scope.test.ts` |

**integration: The same final blobs/paths/spans reach selectedCode, attributionPrompt, assignmentPrompt, native grants, result schemas and host validation.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | final blobs, paths and spans reach prompts, native grants and strict result validation | `src/workflow/code-review/task-review/__tests__/effective-scope.test.ts` |
| pass | renamed final paths alone authorize findings; previousPath remains provenance context | `src/workflow/code-review/task-review/__tests__/effective-scope.test.ts` |
| pass | native response schema bounds decimal intervals, gaps and deletion anchors | `src/workflow/code-review/task-review/__tests__/effective-scope.test.ts` |

**integration: Both routes reject historical/unassigned coordinates and all findings on none scopes; genuine final defects and mandatory coverage omissions still block.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | native and controller routes share final scope and reject historical findings without suppressing final defects | `src/workflow/code-review/task-review/__tests__/effective-scope.test.ts` |
| pass | both reviewer routes reject invalid locations and preserve mandatory coverage omissions | `src/workflow/code-review/task-review/__tests__/effective-scope.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/task-review/__tests__/effective-scope.test.ts` | 0 | 6 | 3.3 s |  |

## t5

Run at 2026-11-07T06:09:49.147Z on commit `a937e90c0`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Canonical accepted task rows, decisions, task identities and summary persist before ACK/reuse/dispatch even without diagnostics.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | both routes durably accept direct/model mapping before acknowledgement or assessment without diagnostics | `src/workflow/code-review/task-review/__tests__/attribution-binding.test.ts` |

**integration: Canonical final-attribution-v1 binding detects changed indexes, selectedTaskIds, testCount, state or decisions; shared valid rows and empty scopes remain valid.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | offline binding rejects index-only, decision-only, selected task, state and test count tampering | `src/workflow/code-review/task-review/__tests__/attribution-binding.test.ts` |

**integration: Task identities bind final relevant source, requirements/doc identities and full assigned tests; unrelated global pin movement permits reuse while changed relevant inputs or wrong party/source ordinal reject.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | task identity binds relevant code requirements documents and full tests but excludes unrelated revision movement | `src/workflow/code-review/task-review/__tests__/attribution-binding.test.ts` |

**integration: After loss of memory restore exact mixed reassess/reuse action/reason/sourceAttempt and summary without attribution rediscovery; no completed origin is fabricated before actual reuse completion.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | fresh native/controller resume restores exact mixed decisions and summary before a planned reuse completes | `src/workflow/code-review/task-review/__tests__/attribution-binding.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/task-review/__tests__/attribution-binding.test.ts` | 0 | 4 | 3.5 s |  |

## t6

Run at 2026-11-07T12:25:29.995Z on commit `0b6204998`. Tests check: **passed**. 9 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Pre-rename file open/write/sync/close and rename failures classify not_replaced; post-rename directory/cleanup failures classify replaced; uncertain/read-failed outcomes remain explicit.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | checkpoint writer classifies pre-replacement, visible replacement and uncertain acknowledgement failures | `src/workflow/code-review/task-review/__tests__/checkpoint-outcomes.test.ts` |
| pass | unsupported directory sync retains successful-save policy and cleanup never removes an unowned collision | `src/workflow/code-review/task-review/__tests__/checkpoint-outcomes.test.ts` |
| pass | same coordinator refreshes its fence after repeated visible resume acknowledgement failure on both routes | `src/workflow/code-review/task-review/__tests__/checkpoint-outcomes.test.ts` |

**integration: Every failed acceptance acknowledgement fences both routes with no dispatch or rollback overwrite and no attribution/model-failure relabel.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | both routes fence failed acceptance, reconcile exact visible state and require successful explicit re-acknowledgement | `src/workflow/code-review/task-review/__tests__/checkpoint-outcomes.test.ts` |
| pass | failed mixed-plan acceptance dispatches neither an immediate reuse nor a fresh assessment | `src/workflow/code-review/task-review/__tests__/checkpoint-outcomes.test.ts` |

**integration: Explicit recovery compares exact prior/candidate under ownership, validates source/mapping/bindings and obtains a successful same-mapping save ACK before continuation; repeated failure/conflict remains fenced.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | both routes fence failed acceptance, reconcile exact visible state and require successful explicit re-acknowledgement | `src/workflow/code-review/task-review/__tests__/checkpoint-outcomes.test.ts` |
| pass | unreadable or conflicting acceptance readback stays fenced without overwrite or model work | `src/workflow/code-review/task-review/__tests__/checkpoint-outcomes.test.ts` |
| pass | later explicit resume rejects a valid conflicting checkpoint until the exact candidate is restored | `src/workflow/code-review/task-review/__tests__/checkpoint-outcomes.test.ts` |
| pass | a proven prior pending checkpoint may re-attribute only after explicit resume, as the approved LLD permits | `src/workflow/code-review/task-review/__tests__/checkpoint-outcomes.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/task-review/__tests__/checkpoint-outcomes.test.ts` | 0 | 8 | 5 s |  |

## t7

Run at 2026-11-07T12:27:09.623Z on commit `0b6204998`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Source-verified final snapshot publication and offline merge/validate/render roundtrip preserve shifted/renamed per-task scope, provenance and byte-idempotence without live Git in readers.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | final history: source-verified shifted renamed per-task scope roundtrips offline and idempotently | `src/workflow/code-review/task-review/__tests__/final-scope-history.test.ts` |
| pass | failed accepted reuse publishes truthful failure without invented provenance on both routes | `src/workflow/code-review/task-review/__tests__/history.test.ts` |

**integration: Accepted/unmapped snapshot required fields, partitions, witness closure, task subsets and canonical bindings reject tampering, omitted metadata and foreign findings.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | final history: missing bindings partitions witnesses task subsets and foreign locations reject offline | `src/workflow/code-review/task-review/__tests__/final-scope-history.test.ts` |
| pass | final history: replacement witness closure and graph are checked independently of recomputed digests | `src/workflow/code-review/task-review/__tests__/final-scope-history.test.ts` |
| pass | final history: unmapped attribution preserves bounded true failure without fabricated scopes or accepted downgrade | `src/workflow/code-review/task-review/__tests__/final-scope-history.test.ts` |

**integration: Attribution timeout/provider/invalid-scope failure publishes every selected failed/incomplete outcome with true bounded diagnostics, no invented identity/findings/reuse or accepted downgrade, then allows the next sequential attempt.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | final history: fresh native and controller attribution failures publish all tasks and allow only the next attempt | `src/workflow/code-review/task-review/__tests__/final-scope-history.test.ts` |

**integration: Completed historical no-pin histories remain byte-identical/read-only and cannot authorize fresh unpinned execution.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | final history: completed no-pin records retain byte-identical read-only coordinates | `src/workflow/code-review/task-review/__tests__/final-scope-history.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/task-review/__tests__/final-scope-history.test.ts` | 0 | 6 | 2.4 s |  |
| `src/workflow/code-review/task-review/__tests__/history.test.ts` | 0 | 6 | 10.9 s |  |

## t8

Run at 2026-11-07T13:42:05.443Z on commit `200ab3286`. Tests check: **passed**. 11 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Actual pretty checkpoint and merged CR serializers qualify failed/incomplete terminal reserves against configurable review.maxJsonBytes (default4MiB), including all tasks, prior history, mapping/decisions, diagnostics and completion metadata before save/ACK/provider.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | terminal capacity: real serializers account for all outcomes prior history accepted decisions and exact fit | `src/workflow/code-review/task-review/__tests__/capacity.test.ts` |
| pass | terminal capacity: both routes persist late diagnostics and every outcome at the qualified boundary | `src/workflow/code-review/task-review/__tests__/capacity.test.ts` |
| pass | terminal capacity: diagnostic-bearing attribution failure and timeout publish unmapped outcomes at the boundary on both routes | `src/workflow/code-review/task-review/__tests__/capacity.test.ts` |

**integration: Exercise 10000-task small-input overflow, exact-fit/one-byte-over, long IDs and escaped/Unicode diagnostics at unchanged 32 KiB aggregate policy with shared bounded failure detail.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | terminal capacity: 10000-task small packet refuses both routes before save or provider dispatch | `src/workflow/code-review/task-review/__tests__/capacity.test.ts` |
| pass | terminal capacity: unchanged 32 KiB Unicode escaped diagnostics retain reserved completion space | `src/workflow/code-review/task-review/__tests__/capacity.test.ts` |
| pass | terminal capacity: long task IDs and large accepted decisions are qualified before becoming visible | `src/workflow/code-review/task-review/__tests__/capacity.test.ts` |
| pass | review JSON limit is configurable discoverable live and rejects invalid values | `src/config/__tests__/review.test.ts` |
| pass | configured review JSON limit reaches decoders checkpoint writers readers projection and CR store | `src/config/__tests__/review.test.ts` |

**integration: Both routes preserve terminal reserve through accepted mapping and later results/diagnostics; boundary failures publish all outcomes, next attempts requalify and can be admitted after raising configured capacity without rewriting history; oversized work dispatches/saves nothing.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | terminal capacity: oversized accepted mappings and results cannot consume remaining terminal reserve | `src/workflow/code-review/task-review/__tests__/capacity.test.ts` |
| pass | terminal capacity: boundary failures publish and raising configured capacity admits the next attempt on both routes | `src/workflow/code-review/task-review/__tests__/capacity.test.ts` |
| pass | terminal capacity: both actual routes refuse oversized results and preserve publishable remaining outcomes | `src/workflow/code-review/task-review/__tests__/capacity.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/config/__tests__/review.test.ts` | 0 | 2 | 1.3 s |  |
| `src/workflow/code-review/task-review/__tests__/capacity.test.ts` | 0 | 9 | 22.6 s |  |

## t9

Run at 2026-11-07T08:39:55.471Z on commit `1a761053e`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Every fresh in-repo producer and MCP submission schema requires explicit final pin with actionable validation errors and caller-selected change-set scope.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | transition: every fresh producer and MCP schema explicitly supplies the final pin | `src/workflow/code-review/task-review/__tests__/transition.test.ts` |
| pass | MCP transition rejects missing final pins before dispatch on both independent reviewer routes | `src/mcp/__tests__/task-review.test.ts` |

**integration: Historical reader and interrupted-unpinned recovery semantics remain route-correct; coordinated producer/daemon rollout documents drain/interruption, no activation flag and state-preserving rollback only.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | transition: interrupted unpinned work is read-only on both reviewer routes without mutation | `src/workflow/code-review/task-review/__tests__/transition.test.ts` |
| pass | transition: coordinated rollout and adjacent ownership are explicit in shipped guidance | `src/workflow/code-review/task-review/__tests__/transition.test.ts` |
| pass | final history: completed no-pin records retain byte-identical read-only coordinates | `src/workflow/code-review/task-review/__tests__/final-scope-history.test.ts` |

**integration: Adjacent native diagnostics, rejected-result repair and coverage classification ownership remains separate with shared-module sequencing documented.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | transition: coordinated rollout and adjacent ownership are explicit in shipped guidance | `src/workflow/code-review/task-review/__tests__/transition.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/mcp/__tests__/task-review.test.ts` | 0 | 4 | 2.9 s |  |
| `src/workflow/code-review/task-review/__tests__/final-scope-history.test.ts` | 0 | 6 | 2.6 s |  |
| `src/workflow/code-review/task-review/__tests__/transition.test.ts` | 0 | 3 | 3.3 s |  |

## t10

Run at 2026-11-07T12:35:13.672Z on commit `02ca57144`. Tests check: **passed**. 12 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

**integration: Both routes review immutable later-fixed code without stale blocker while retaining a demonstrated final provenance/requiredReferences coverage defect; synthetic reviewer responses assert received final code and test evidence.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | historical reproduction: both reviewer routes inspect asserted final code and tests, suppress stale root finding and retain genuine requiredReferences defect | `src/workflow/code-review/task-review/__tests__/historical-regression.test.ts` |
| pass | fresh native/controller resume restores exact mixed decisions and summary before a planned reuse completes | `src/workflow/code-review/task-review/__tests__/attribution-binding.test.ts` |

**integration: Labelled synthetic t3/t9 reproduction uses the two approved immutable commits and durable CR evidence without claiming unavailable raw packet/attribution/timing recovery.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | historical reproduction: exact immutable sources prove the old root failure and included fix without raw checkpoint claims | `src/workflow/code-review/task-review/__tests__/historical-regression.test.ts` |

**integration: Whole-pipeline fresh-memory reuse, save fencing/re-ACK, final-history publication and capacity tests pass on both routes; independent review ids/pins and cleanup remain isolated.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | qualification: independent IDs and final pins publish concurrently on both routes without changing each others feedback | `src/workflow/code-review/task-review/__tests__/qualification.test.ts` |
| pass | qualification: canonical appended reviews requalify while altered baseline history or metadata is an explicit conflict | `src/workflow/code-review/task-review/__tests__/qualification.test.ts` |
| pass | fresh native/controller resume restores exact mixed decisions and summary before a planned reuse completes | `src/workflow/code-review/task-review/__tests__/attribution-binding.test.ts` |
| pass | both routes fence failed acceptance, reconcile exact visible state and require successful explicit re-acknowledgement | `src/workflow/code-review/task-review/__tests__/checkpoint-outcomes.test.ts` |
| pass | terminal capacity: boundary failures publish and raising configured capacity admits the next attempt on both routes | `src/workflow/code-review/task-review/__tests__/capacity.test.ts` |
| pass | Successful story BUILD approval removes only matching fully preserved task/story checkpoints | `src/workflow/code-review/task-review/__tests__/cleanup.test.ts` |

**smoke: Disposable compiled MCP/IPC smoke pins final multi-commit scope, excludes unrelated HEAD/worktree changes and publishes truthful final results.**

Reported by the builder, not run by the gate: **pass**. Evidence: /tmp/599-round1-smoke-final.log; current committed runtime compiled by /tmp/599-round1-build-final.log. Isolated HOME, Node22, scripts/smoke-task-review.mjs. compiled:true, hostedModels:false, realWorkerThread:2, independentReviews:2, nativeCalls:12, explicitRestartResume:true, priorAttemptsPreserved:true, excludedHeadAndWorktreeCanaries:true, cleanup.deleted4/errors[]. Installed daemon untouched.

**integration: Scoped task-review/MCP tests, production build and complete 35-subject ac1-ac5 traceability qualify coordinated rollout; no partial deployment or direct cloud/retired engine introduced.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | qualification: all 35 exact LLD subjects and ac1-ac5 have existing behavioral test references | `src/workflow/code-review/task-review/__tests__/qualification.test.ts` |
| pass | MCP transition rejects missing final pins before dispatch on both independent reviewer routes | `src/mcp/__tests__/task-review.test.ts` |
| pass | MCP tool surface: the thirteen tools keep their names, descriptions and input schemas | `src/mcp/__tests__/forward-step.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/mcp/__tests__/forward-step.test.ts` | 0 | 6 | 2.2 s |  |
| `src/mcp/__tests__/task-review.test.ts` | 0 | 4 | 2.5 s |  |
| `src/workflow/code-review/task-review/__tests__/attribution-binding.test.ts` | 0 | 4 | 3.6 s |  |
| `src/workflow/code-review/task-review/__tests__/capacity.test.ts` | 0 | 8 | 18 s |  |
| `src/workflow/code-review/task-review/__tests__/checkpoint-outcomes.test.ts` | 0 | 8 | 4.8 s |  |
| `src/workflow/code-review/task-review/__tests__/cleanup.test.ts` | 0 | 5 | 2.8 s |  |
| `src/workflow/code-review/task-review/__tests__/historical-regression.test.ts` | 0 | 2 | 2.9 s |  |
| `src/workflow/code-review/task-review/__tests__/qualification.test.ts` | 0 | 4 | 3.3 s |  |
