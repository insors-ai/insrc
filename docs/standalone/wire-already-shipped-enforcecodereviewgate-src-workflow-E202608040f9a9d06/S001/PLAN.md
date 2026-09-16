<!-- insrc:artifact PLAN-0f9a9d06f5da3a5c-s1 -->

# Plan: E202608040f9a9d06:S001

**Epic:** `wire-already-shipped-enforcecodereviewgate-src-workflow`
**LLD run:** `wf-1785843530754-a74hkd`
**LLD effective hash:** `0f9a9d06f5da...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** gates.ts: codeReview[] field + CodeReviewApprovalOutcome + the approveOne gate step + enforce test-seam | M | — | unit: approveWorkflowTarget: enforce on + block + no override => skipped, no approvedAt, codeReview[] 'blocked'; unit: approveWorkflowTarget: enforce on + block + overrideReview => approved, codeReview[] 'overridden' + overrideReason; unit: approveWorkflowTarget: warn/pass => approved, codeReview[] records status + counts; unit: approveWorkflowTarget: absent CR / DEF-HLD (no storyId) / enforce OFF + block => approvedAt byte-identical, codeReview[] 'no-review'; unit: approveWorkflowTarget: epic batch A 'block' + B 'pass' => A skipped, B approved; unit: approveWorkflowTarget: clean meta.review + code-review 'block' withheld only by the gate; corrupt CR => 'no-review' fail-open | [[c1]] [[c2]] [[c3]] |
| 2 | **`t2`** Fake-file unit tests: gates-approve gate integration + the MCP relay passthrough | M | `t1` | unit: handleWorkflowApprove relay: stubbed approveWorkflow's codeReview[] forwarded verbatim in the dispatch JSON | [[c1]] [[c4]] [[c5]] |

### E202608040f9a9d06:S001:T001 — gates.ts: codeReview[] field + CodeReviewApprovalOutcome + the approveOne gate step + enforce test-seam

In src/workflow/gates.ts: (a) add the CodeReviewApprovalOutcome type { readonly path: string; readonly storyId: string; readonly status: CodeReviewGateResult['status']; readonly message?: string; readonly counts?: { high:number; med:number; low:number }; readonly overrideReason?: string; readonly at?: string } (the overrideReason/at arm carries the OVERRIDE audit on status==='overridden' so the controller-presented outcome records the bypass, not only the stamped approvedAt) and add the additive `readonly codeReview: readonly CodeReviewApprovalOutcome[]` field to WorkflowApproveResult; (b) add an OPTIONAL second param to approveWorkflowTarget — approveWorkflowTarget(req: WorkflowApproveRequest, opts?: { readonly enforce?: boolean }): WorkflowApproveResult — the additive test-seam threaded into the gate's opts.enforce (existing single-arg callers unaffected); (c) declare a `codeReview: CodeReviewApprovalOutcome[]` accumulator beside approved/skipped and return it in `{ approved, skipped, codeReview }`; (d) INSIDE approveOne(jsonPath), BEFORE approveArtifactByJsonPath, read the artifact json meta (JSON.parse the file the approve already opens) and if story-scoped (meta.epicHash && meta.storyId) call enforceCodeReviewGate(req.repoPath, meta.epicHash, meta.storyId, { ...(req.overrideReview!==undefined?{overrideReview:req.overrideReview}:{}), ...(opts?.enforce!==undefined?{enforce:opts.enforce}:{}) }); project the CodeReviewGateResult to a CodeReviewApprovalOutcome (preserve overrideReason+at on 'overridden') and push to codeReview[]; on status==='blocked' push { path: jsonPath, reason: gate.message } to skipped[] and RETURN (no approveArtifactByJsonPath, no approvedAt). Every non-blocked status (no-review/pass/warn/overridden) falls through to the UNCHANGED approveArtifactByJsonPath. Import enforceCodeReviewGate from './code-review/gate.js' + CodeReviewGateResult from './code-review/types.js'; .js imports, import type, getLogger not console.log, strict optional handling.

**Acceptance checks:**
- src/workflow/gates.ts exports the CodeReviewApprovalOutcome type (with optional overrideReason?/at? carried on the 'overridden' arm) + WorkflowApproveResult gains the additive `readonly codeReview: readonly CodeReviewApprovalOutcome[]`; approved[]/skipped[] shapes unchanged
- approveWorkflowTarget gains an OPTIONAL opts?: { enforce?: boolean } second param threaded into enforceCodeReviewGate's opts.enforce (existing single-arg callers keep compiling)
- the daemon 'workflow.approve' registration in src/daemon/index.ts (and the src/mcp/server.ts handleWorkflowApprove relay) continues to reach approveWorkflowTarget via req ONLY — NO production call site passes opts; opts is a test-only seam so the codeReview.enforce config flag governs in production
- approveOne, BEFORE approveArtifactByJsonPath, calls enforceCodeReviewGate for a story-scoped artifact (meta.epicHash && meta.storyId), pushes the projected CodeReviewApprovalOutcome to codeReview[], and on status 'blocked' routes { path, reason: gate.message } into skipped[] and returns WITHOUT stamping approvedAt
- on status 'overridden' the pushed CodeReviewApprovalOutcome carries the override audit (overrideReason from the gate) so ac2's 'records the override' is provable on the presented outcome, not only via approvedAt
- a non-story-scoped artifact (no epicHash/storyId) or a non-blocked status (no-review/pass/warn/overridden) falls through to the UNCHANGED approveArtifactByJsonPath meta.review approve — the gate is a SEPARATE check over body.verdict, never merged into meta.review (k8)
- overrideReview is threaded from req into the gate opts (reused channel, no new param); tsc --noEmit clean; .js imports + import type; getLogger not console.log; read-only over the CR record (no writeAtomic added beyond the existing approve stamp)

### E202608040f9a9d06:S001:T002 — Fake-file unit tests: gates-approve gate integration + the MCP relay passthrough

Add a test file under src/workflow/__tests__ (node:test + node:assert/strict via npx tsx --test): write a story-scoped artifact json (meta.epicHash+storyId, optionally meta.review) + a CR-<epic>-<story>.json (verdict block/warn/pass, or omit for absent) under a tmp repo via codeReviewArtifactPaths, then call approveWorkflowTarget(req, { enforce }) and assert the branch table: (ac1) enforce true + block + no override => the artifact in skipped[] with the gate message + its json has NO meta.approvedAt + codeReview[] records 'blocked'; (ac2) enforce true + block + req.overrideReview => approved (approvedAt stamped) + codeReview[] 'overridden' + the entry carries overrideReason; (ac3) warn/pass => approved + codeReview[] records the status + counts; (ac5) absent CR / DEF-HLD (no storyId) / enforce false + block => approvedAt stamped exactly as WITHOUT the wiring (byte-identical) + codeReview[] 'no-review' (or the demoted advisory); batch (epicHash) A=block/B=pass => A skipped + B approved; (ac6) distinct-from-meta.review (clean meta.review + code-review block => withheld only by the code-review gate) + corrupt-CR-json => 'no-review' fail-open (approved). PLUS a handleWorkflowApprove relay test (ac4): an injected UnaryRpcDeps stub returns a canned WorkflowApproveResult with a codeReview[] entry; assert it appears verbatim in the dispatch's JSON response.

**Acceptance checks:**
- a new src/workflow/__tests__ file runs under `npx tsx --test` with temp artifact json + temp CR json under a tmp repo + approveWorkflowTarget(req,{enforce}) — no live daemon/graph/config write
- tests cover the branch table: block=>skipped (no approvedAt), override=>approved+overridden with overrideReason surfaced on the codeReview[] entry, warn/pass=>approved+surfaced, absent/DEF-HLD/enforce-off=>byte-identical-to-today, batch mixed, distinct-from-meta.review, corrupt-CR=>no-review
- a handleWorkflowApprove relay test asserts a stubbed approveWorkflow's codeReview[] is forwarded verbatim in the dispatch JSON (ac4)
- the full `npx tsx --test 'src/workflow/**/*.test.ts'` + `'src/mcp/**/*.test.ts'` sweeps pass (existing suites stay green)

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| approveWorkflowTarget: enforce on + CR verdict 'block' + no override => the story-scoped artifact is routed into skipped[] with the gate message, meta.approvedAt is NOT stamped, and codeReview[] records 'blocked' (b1) | `t1`, `t2` |
| approveWorkflowTarget: enforce on + 'block' + overrideReview => the artifact is approved (approvedAt stamped), codeReview[] records 'overridden' + overrideReason (b2) | `t1`, `t2` |
| approveWorkflowTarget: CR verdict 'warn'/'pass' => approved unchanged; codeReview[] records the status + counts (b3) | `t1`, `t2` |
| approveWorkflowTarget: absent CR record / DEF-HLD (no storyId) / enforce OFF + block => approval byte-identical to today; codeReview[] records 'no-review' (or the demoted advisory) (b5 additive) | `t1`, `t2` |
| approveWorkflowTarget: an epic BATCH with story A 'block' (enforce on) + story B 'pass' => A skipped, B approved (per-artifact, non-lossy) | `t1`, `t2` |
| the code-review gate is SEPARATE from meta.review: an artifact with a clean meta.review but a code-review 'block' is withheld ONLY by the code-review gate (k8/b6); a corrupt CR record => 'no-review' => never blocks (fail-open) | `t1`, `t2` |
| WorkflowApproveResult.codeReview[] is the additive surfacing the controller presents; approved[]/skipped[] shapes are unchanged | `t1`, `t2` |
| handleWorkflowApprove: a stubbed approveWorkflow returning { approved, skipped, codeReview } is relayed verbatim in the JSON response the controller presents (no logic added in the dispatch) | `t2` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s1 — add WorkflowApproveResult.codeReview[] (CodeReviewApprovalOutcome) additive result field surfaced by approveWorkflowTarget`
- **[[c2]]** `prior-artifact` `LLD s1 — approveOne calls enforceCodeReviewGate BEFORE approveArtifactByJsonPath for story-scoped artifacts; on 'blocked' route to skipped[] and return without stamping approvedAt; the gate is a SEPARATE check over body.verdict, never merged into meta.review (k8)`
- **[[c3]]** `prior-artifact` `LLD s1 — thread req.overrideReview into the gate opts (reused channel) + an optional opts.enforce test-seam on approveWorkflowTarget so the codeReview.enforce config flag governs in production`
- **[[c4]]** `prior-artifact` `LLD s1 testStrategy — fake-file unit branch table over temp artifact json + temp CR-<epic>-<story>.json via codeReviewArtifactPaths (block/override/warn-pass/absent-DEF-enforce-off/batch/distinct-from-meta.review/corrupt-CR)`
- **[[c5]]** `prior-artifact` `LLD s1 testStrategy — handleWorkflowApprove relay test asserting a stubbed approveWorkflow's codeReview[] is forwarded verbatim in the dispatch JSON`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 0 LOW** · model `client` · reviewed 2026-08-04T11:58:48.113Z

_No load-bearing premises were extracted._
