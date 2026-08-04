<!-- insrc:artifact PLAN-a131994ea1f99207-S001 -->

# Plan: S001

**Epic:** `make-build-approval-code-review-gated`
**LLD run:** `wf-1785846282628-sj1fzh`
**LLD effective hash:** `a131994ea1f9...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** gates.ts: widen the batch sweep to BUILD + the BUILD-under-enforce completion withhold | M | — | unit: pendingArtifactJsonPaths includes a pending BUILD in the epic-batch sweep; excludes an already-approved BUILD; unit: single BUILD approve, enforce ON + CR pass => completes, codeReview[] pass (existing single-path gate firing not regressed); unit: BUILD + enforce ON + absent CR => withheld into skipped[], no approvedAt, codeReview[] no-review; unit: BUILD + enforce ON + absent CR + overrideReview => completes, override recorded on codeReview[]; unit: BUILD + enforce ON + CR block => withheld into skipped[], codeReview[] blocked; unit: BUILD + enforce OFF + absent CR => completes byte-identical (approved + isApproved + codeReview no-review + skipped empty) | [[c1]] [[c2]] [[c3]] |
| 2 | **`t2`** Fake-file unit tests for the widened sweep + the BUILD completion branch table (ac1-ac7) | M | `t1` | unit: non-BUILD LLD + enforce ON + absent CR => completes (withhold is BUILD-scoped); unit: clean meta.review + BUILD withheld only by the code-review gate (distinct from meta.review); unit: epic batch: withheld BUILD + clean LLD => BUILD skipped, LLD approved (non-lossy) | [[c1]] [[c2]] [[c4]] |

### `t1` — gates.ts: widen the batch sweep to BUILD + the BUILD-under-enforce completion withhold

In src/workflow/gates.ts: (a) widen pendingArtifactJsonPaths's filename regex prefix alternation from ^(DEF|HLD|LLD|PLAN)-<hash>(-.*)?\.json$ to include BUILD; already-approved BUILDs stay excluded by the existing approvedAt check. (b) Export a tiny resolver from src/workflow/code-review/gate.ts — resolveEnforce(explicit?: boolean): boolean = explicit ?? readEnforceFlag() — so approveOne can compute the SAME effective-enforcement value the gate uses (readEnforceFlag stays private). (c) In approveWorkflowTarget, resolve effectiveEnforce = resolveEnforce(opts?.enforce) ONCE, and pass { ...(opts?.enforce!==undefined?{enforce:opts.enforce}:{}) } to enforceCodeReviewGate as today. (d) In approveOne, AFTER the existing codeReview.push(projectGateOutcome(...)) and the gate.status==='blocked' handling, add the BUILD-scoped completion layer: compute isBuild from the artifact JSON BASENAME starting with 'BUILD-' (the buildArtifactId prefix) — NOT meta.workflow, so it cannot mis-fire on a non-BUILD artifact whose meta happens to differ; when isBuild && effectiveEnforce && gate.status==='no-review' && req.overrideReview===undefined => push { path: jsonPath, reason: 'completion requires a code review; none was run' } to skipped[] and RETURN without approveArtifactByJsonPath (no approvedAt). Every other status (pass/warn/overridden) and non-BUILD / enforce-off / override path falls through to the UNCHANGED approve. Import resolveEnforce from './code-review/gate.js'. .js imports, import type, getLogger not console.log, strict optional handling; no change to enforceCodeReviewGate's own fail-open contract.

**Acceptance checks:**
- pendingArtifactJsonPaths regex includes BUILD in the prefix alternation; a pending BUILD-<hash>-<story>.json (no approvedAt) is swept by an epicHash batch and an already-approved BUILD is excluded
- src/workflow/code-review/gate.ts exports resolveEnforce(explicit?: boolean): boolean = explicit ?? readEnforceFlag() (readEnforceFlag remains private); approveOne resolves effectiveEnforce ONCE via it and reuses it for the withhold so gate + withhold never disagree
- isBuild is derived from the artifact JSON basename starting with 'BUILD-' (the buildArtifactId prefix), NOT from meta.workflow — so the withhold can never mis-fire on a DEF/HLD/LLD/PLAN/CR artifact
- approveOne, after the existing gate push, withholds a BUILD when effectiveEnforce && gate.status==='no-review' && no overrideReview: routes { path, reason } to skipped[] and returns WITHOUT stamping approvedAt
- gate.status 'blocked' still withholds (unchanged); 'pass'/'warn'/'overridden' still complete; a supplied overrideReview bypasses the no-review withhold (BUILD completes)
- a non-BUILD artifact, or effectiveEnforce===false, is byte-identical to today (the withhold is BUILD+enforce scoped); the withhold reads only the gate result + never touches meta.review (k8)
- tsc --noEmit clean; .js imports + import type; getLogger not console.log; no new persisted field (BUILD.meta.approvedAt reused as the completion marker)

### `t2` — Fake-file unit tests for the widened sweep + the BUILD completion branch table (ac1-ac7)

Extend src/workflow/__tests__/approve-codereview-gate.test.ts (or a new sibling) with BUILD-named artifacts using the existing harness (withRepo tmp .insrc/artifacts, writeArtifact({workflow:'build',storyId}), writeCR via codeReviewArtifactPaths, opts.enforce injected, isApproved): ac1 pendingArtifactJsonPaths sweeps a pending BUILD in an epic batch + excludes an already-approved BUILD; ac2 single BUILD + enforce ON + CR pass => completes (approvedAt) + codeReview[] 'pass'; ac3 BUILD + enforce ON + absent CR => withheld into skipped[] ('completion requires a code review'), NO approvedAt, codeReview[] 'no-review'; ac4 BUILD + enforce ON + absent CR + overrideReview => completes + override recorded on codeReview[]; ac5 BUILD + enforce ON + CR block => withheld into skipped[], codeReview[] 'blocked'; ac6 BUILD + enforce OFF + absent CR => the CONCRETE byte-identical observable: out.approved contains the BUILD, isApproved(jsonPath)===true, codeReview[0].status==='no-review', out.skipped empty — PLUS a non-BUILD LLD + enforce ON + absent CR => completes (withhold is BUILD-scoped) AND a story-scoped non-BUILD artifact whose basename !== 'BUILD-' is NOT withheld even under enforce (guards the basename predicate); ac7 clean meta.review + BUILD withheld only by the code-review gate + an epic batch withheld-BUILD + clean-LLD splits non-lossy (BUILD skipped, LLD approved).

**Acceptance checks:**
- a src/workflow/__tests__ suite runs under npx tsx --test with temp BUILD artifact json + temp CR json under a tmp repo + approveWorkflowTarget(req,{enforce}) — no live daemon/graph/config write
- the seven ac1-ac7 subjects are each covered: widened sweep incl/excl, single-pass-completes, absent-CR withhold (no approvedAt), override bypass, block withhold, enforce-off byte-identical (approved + isApproved===true + codeReview 'no-review' + skipped empty) + non-BUILD unaffected + non-BUILD-basename not withheld, distinct-from-meta.review + non-lossy batch split
- the full `npx tsx --test 'src/workflow/**/*.test.ts'` sweep passes (existing approve-workflow-target + approve-codereview-gate suites stay green)

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| pendingArtifactJsonPaths: a pending BUILD-<hash>-<story>.json (no approvedAt) is now a member of the epic-batch sweep (ac1); an already-approved BUILD is excluded | `t1`, `t2` |
| approveWorkflowTarget (single BUILD by json path): effective enforce ON + CR verdict 'pass' => completes (approvedAt stamped), codeReview[] records 'pass' — no regression of the existing single-path gate firing (ac2) | `t1`, `t2` |
| approveWorkflowTarget: BUILD + effective enforce ON + ABSENT CR record => WITHHELD into skipped[] ('completion requires a code review'), meta.approvedAt NOT stamped, codeReview[] records the no-review withhold (ac3) | `t1`, `t2` |
| approveWorkflowTarget: BUILD + effective enforce ON + ABSENT CR + req.overrideReview => completes (approvedAt stamped), the override recorded on codeReview[] (ac4) | `t1`, `t2` |
| approveWorkflowTarget: BUILD + effective enforce ON + CR verdict 'block' (no override) => withheld into skipped[], codeReview[] 'blocked' (ac5) | `t1`, `t2` |
| approveWorkflowTarget: BUILD + effective enforce OFF + ABSENT CR => completes byte-identical to today (codeReview[] 'no-review'); AND a non-BUILD LLD + enforce ON + ABSENT CR => completes (the require-review withhold is BUILD-scoped) (ac6) | `t1`, `t2` |
| approveWorkflowTarget: the completion gate is DISTINCT from meta.review (a clean meta.review + BUILD withheld only by the code-review gate); an epic batch with a withheld BUILD + a clean LLD splits non-lossy (BUILD skipped, LLD approved) (ac7) | `t2` |

## Citations

- **[[c1]]** `prior-artifact` `LLD S001 — pendingArtifactJsonPaths epic-batch sweep widened to include BUILD + approveWorkflowTarget stays NON-LOSSY (withhold routes to skipped[], not dropped)`
- **[[c2]]** `prior-artifact` `LLD S001 — the code-review completion gate is a SEPARATE check over CR body.verdict, never merged into meta.review (k8); approveArtifactByJsonPath meta.review handling untouched`
- **[[c3]]** `prior-artifact` `LLD S001 — single-artifact BUILD approve already resolves via jsonPathForMd's insrc:artifact marker and fires the gate; the BUILD predicate keys on the 'BUILD-' artifact-id prefix (buildArtifactId)`
- **[[c4]]** `prior-artifact` `LLD S001 testStrategy + invariant — enforceCodeReviewGate keeps its GENERIC fail-open contract (absent/malformed => no-review); the require-review withhold is layered in approveOne (BUILD + effective-enforce only), exercised by the fake-file branch table (ac1-ac7)`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 0 LOW** · model `client` · reviewed 2026-08-04T12:38:16.965Z

_No load-bearing premises were extracted._
