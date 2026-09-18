<!-- insrc:artifact PLAN-1703991c69967193-s4 -->

# Plan: E202609181703991c:S004

**Epic:** `add-bugfix-triage-category-insrc-framework`
**LLD run:** `wf-1789741345654-adobe9`
**LLD effective hash:** `e08e0c0d9f7b...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add the bugfix-orchestration module types | S | — | unit: BugfixNextCall/StampDeps compile + shape check (tsc-level, exercised via the t2/t3/t4 tests) | [[c4]] |
| 2 | **`t2`** Implement nextAfterIssue (the pure magnitude advance-route) | S | `t1` | unit: nextAfterIssue: magnitude='small' -> a standalone insrc_build_step nextCall (issue->build), no design.story/plan tool; unit: nextAfterIssue: magnitude='sized' -> a standalone insrc_workflow_run design.story nextCall (issue->design->plan->build); unit: nextAfterIssue: the emitted route matches routeForSizeClass('bugfix', magnitude) (producesLld/needsPlan consistency); unit: nextAfterIssue: the small build nextCall carries the standalone param (mirrors buildNextCall's trivial branch); unit: nextAfterIssue: magnitude absent/invalid -> throws invalid-magnitude (no silent default route) | [[c1]] |
| 3 | **`t3`** Implement admitBugfixAdvance (the pure advance gate) | S | `t1` | unit: admitBugfixAdvance: approved + parentRef resolved (WorkItemRef) -> admitted; unit: admitBugfixAdvance: approved + parentRef===null (standalone) -> admitted (null is resolved, not absent); unit: admitBugfixAdvance: approved + parentRef ABSENT -> not admitted, reason names the missing parent resolution; unit: admitBugfixAdvance: not approved (no meta.approvedAt) -> not admitted, reason names approval | [[c4]] |
| 4 | **`t4`** Implement locateAndStampParent (locate + meta-only parentRef patch) | M | `t1` | unit: locateAndStampParent: locateParent returns a WorkItemRef -> writeParentRef called with that ref; returns the ParentLocation; unit: locateAndStampParent: locateParent returns standalone (null) -> writeParentRef called with null; unit: locateAndStampParent: readIssue null -> throws issue-not-found, writeParentRef NOT called; unit: locateAndStampParent: issue present but no approvedAt -> throws not-approved, writeParentRef NOT called; unit: locateAndStampParent: locateParent rejects (infra failure) -> propagates, writeParentRef NOT called (no partial stamp); unit: locateAndStampParent: defectDescription passed to locateParent is derived from reproduction+rootCause+fixIntent; touchedPaths empty at issue-approval | [[c3]] [[c5]] |
| 5 | **`t5`** Wire the advance + stamp into the issue-approval flow | M | `t2`, `t3`, `t4` | integration: issue-approval wiring: under bugfixCategory + meta.workflow==='issue', approval stamps parentRef, gates via admitBugfixAdvance, and surfaces the routed nextCall; a non-bugfix approval is byte-unchanged | [[c2]] [[c6]] |
| 6 | **`t6`** Unit + integration tests for the orchestration | M | `t2`, `t3`, `t4`, `t5` | integration: A bugfix BUILD under codeReview.enforce with a CR pass -> completes (approvedAt set), codeReview[] pass; integration: A bugfix BUILD under codeReview.enforce with an absent/block CR -> withheld into skipped[], no approvedAt (unless overrideReview); integration: A bugfix standalone-build path with enforce OFF -> completes byte-identical (no new completion path) | [[c1]] [[c2]] [[c3]] |

### E202609181703991c:S004:T001 — Add the bugfix-orchestration module types

Create the s4 orchestration module (src/workflow/bugfix/ or similar) and declare its internal helper types: BugfixNextCall = { tool: 'insrc_workflow_run' | 'insrc_build_step'; params: Record<string, unknown> } (mirroring the buildNextCall descriptor shape, without importing triage-step internals) and StampDeps = { readIssue; locateParent; writeParentRef } (the injectable-deps bundle). Import IssueArtifact (S002), WorkItemRef (types.ts), ParentLocation + locateParent (S003 src/workflow/locate/), BugfixMagnitude (triage/types.ts). No new shared type; s4 owns none.

**Acceptance checks:**
- BugfixNextCall + StampDeps compile under strict mode; BugfixNextCall.tool is the two-member union; no import of triage-step internals.
- No change to any sc-level shared type; tsc clean.

### E202609181703991c:S004:T002 — Implement nextAfterIssue (the pure magnitude advance-route)

Implement nextAfterIssue(issue: IssueArtifact, repo: string): BugfixNextCall. Read issue.meta.magnitude, re-derive the route via the consumed routeForSizeClass('bugfix', magnitude) (triage/classify.ts:36), and emit: small => a standalone insrc_build_step nextCall (issue->build, mirroring buildNextCall's trivial branch's standalone param); sized => a standalone insrc_workflow_run design.story nextCall (issue->design->plan->build). Throw invalid-magnitude when magnitude is neither 'small' nor 'sized'. Pure: reads meta only, no IO.

**Acceptance checks:**
- magnitude='small' -> insrc_build_step standalone nextCall (no design.story/plan); magnitude='sized' -> insrc_workflow_run design.story standalone nextCall.
- The emitted route matches routeForSizeClass('bugfix', magnitude) (producesLld/needsPlan consistency).
- magnitude absent/invalid -> throws invalid-magnitude (no silent default). tsc clean.

### E202609181703991c:S004:T003 — Implement admitBugfixAdvance (the pure advance gate)

Implement admitBugfixAdvance(issue: IssueArtifact): { admitted: boolean; reason?: string } as a pure predicate over meta (mirroring the admitBuild admission pattern, no IO). admitted=true only when meta.approvedAt is set AND meta.parentRef has been RESOLVED (present, including explicit null for standalone); admitted=false with a descriptive reason otherwise (not approved, or parentRef absent/unresolved).

**Acceptance checks:**
- approved + parentRef WorkItemRef -> admitted; approved + parentRef===null -> admitted (null is resolved); approved + parentRef absent -> not admitted; not approved -> not admitted.
- Pure predicate, no IO; reason string names the failing condition. tsc clean.

### E202609181703991c:S004:T004 — Implement locateAndStampParent (locate + meta-only parentRef patch)

Implement locateAndStampParent(input: { repoPath; issueHash }, deps: StampDeps): Promise<ParentLocation>. Via injected deps: readIssue (throw issue-not-found on null; throw not-approved when no meta.approvedAt), derive defectDescription from the issue body (title+reproduction+rootCause+fixIntent) with empty touchedPaths, call deps.locateParent (the consumed sc3 entry point; let an infra rejection propagate WITHOUT writing), then deps.writeParentRef(repoPath, issueHash, location.parentRef) as a single-field meta patch. Return the ParentLocation. Never rewrites the body (k4). Provide a default StampDeps wiring readIssue/writeParentRef to the existing storage round-trip (read ISSUE-<hash>.json -> set meta.parentRef -> writeAtomic) and locateParent to src/workflow/locate.

**Acceptance checks:**
- locateParent returns a WorkItemRef -> writeParentRef called with it; returns null -> writeParentRef(null); both leave the issue body byte-unchanged (k4).
- readIssue null -> throws issue-not-found (no write); no approvedAt -> throws not-approved (no write); locateParent rejects -> propagates, no write.
- The default StampDeps round-trips via the existing storage helpers (single-field meta patch, not a re-finalize). tsc clean.

### E202609181703991c:S004:T005 — Wire the advance + stamp into the issue-approval flow

Wire the orchestration into the controller/MCP path so that, after an IssueArtifact is approved, the flow: (1) invokes locateAndStampParent, (2) gates on admitBugfixAdvance, (3) emits nextAfterIssue's nextCall. FIRST locate the concrete issue-approval hook (where approveWorkflowTarget stamps an ISSUE artifact's approvedAt) and gate the new wiring behind the bugfixCategory flag AND a meta.workflow==='issue' check so a non-bugfix approval path is provably byte-unchanged. Additive only. Completion continues to use approveWorkflowTarget verbatim (no new completion path). Keep this wiring thin — it composes t2/t3/t4 and reuses the existing approve gate.

**Acceptance checks:**
- After issue approval under the bugfixCategory flag + meta.workflow==='issue': parentRef is stamped, admitBugfixAdvance gates, and the routed nextCall is surfaced; a non-bugfix approval is byte-unchanged.
- Completion of the resulting bugfix build reuses approveWorkflowTarget unchanged (no new completion path). tsc clean.

### E202609181703991c:S004:T006 — Unit + integration tests for the orchestration

Unit-test nextAfterIssue (small/sized/invalid-magnitude, route-consistency, standalone param) and admitBugfixAdvance (approved+resolved / null / absent / not-approved) with fabricated IssueArtifacts; unit-test locateAndStampParent with an injected fake StampDeps (WorkItemRef / null / readIssue-null / not-approved / locateParent-rejects, asserting writeParentRef call/no-call). Add an integration test reusing the approve-build-completion harness proving a bugfix BUILD completes under codeReview.enforce with a CR pass and is withheld on absent/block CR (ac3). node:test via tsx; no live services.

**Acceptance checks:**
- Every nextAfterIssue/admitBugfixAdvance/locateAndStampParent subject from the LLD test strategy has a passing test (ac1/ac2 route + gate + stamp).
- The completion integration test covers ac3 (CR pass completes; absent/block CR withholds) via the existing approve-build harness.
- The relevant workflow/mcp subsets are green locally via npx tsx --test.

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| nextAfterIssue: magnitude='small' -> a standalone insrc_build_step nextCall (issue->build), no design.story/plan tool | `t2` |
| nextAfterIssue: magnitude='sized' -> a standalone insrc_workflow_run design.story nextCall (issue->design->plan->build) | `t2` |
| nextAfterIssue: the emitted route matches routeForSizeClass('bugfix', magnitude) (producesLld/needsPlan consistency) | `t2` |
| nextAfterIssue: the small build nextCall carries the standalone param (mirrors buildNextCall's trivial branch) | `t2` |
| nextAfterIssue: magnitude absent/invalid -> throws invalid-magnitude (no silent default route) | `t2` |
| admitBugfixAdvance: approved + parentRef resolved (WorkItemRef) -> admitted | `t3` |
| admitBugfixAdvance: approved + parentRef===null (standalone) -> admitted (null is resolved, not absent) | `t3` |
| admitBugfixAdvance: approved + parentRef ABSENT -> not admitted, reason names the missing parent resolution | `t3` |
| admitBugfixAdvance: not approved (no meta.approvedAt) -> not admitted, reason names approval | `t3` |
| locateAndStampParent: locateParent returns a WorkItemRef -> writeParentRef called with that ref; returns the ParentLocation | `t4` |
| locateAndStampParent: locateParent returns standalone (null) -> writeParentRef called with null | `t4` |
| locateAndStampParent: readIssue null -> throws issue-not-found, writeParentRef NOT called | `t4` |
| locateAndStampParent: issue present but no approvedAt -> throws not-approved, writeParentRef NOT called | `t4` |
| locateAndStampParent: locateParent rejects (infra failure) -> propagates, writeParentRef NOT called (no partial stamp) | `t4` |
| locateAndStampParent: defectDescription passed to locateParent is derived from reproduction+rootCause+fixIntent; touchedPaths empty at issue-approval | `t4` |
| A bugfix BUILD under codeReview.enforce with a CR pass -> completes (approvedAt set), codeReview[] pass | `t6` |
| A bugfix BUILD under codeReview.enforce with an absent/block CR -> withheld into skipped[], no approvedAt (unless overrideReview) | `t6` |
| A bugfix standalone-build path with enforce OFF -> completes byte-identical (no new completion path) | `t6` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s4 contractDetails.nextAfterIssue + invariant 'scope gate is sc1's route table' — routeForSizeClass('bugfix', magnitude) (src/workflow/triage/classify.ts:36); small->build, sized->design->plan->build`
- **[[c2]]** `prior-artifact` `LLD s4 invariant 'completion reuses approveWorkflowTarget unchanged' (src/workflow/gates.ts:617) + ac3 — the post-build code-review completion gate reused verbatim`
- **[[c3]]** `prior-artifact` `LLD s4 contractDetails.locateAndStampParent + dataModelChanges.ArtifactMetaBase.parentRef (types.ts:412) — the meta-only parentRef stamp via the storage round-trip (k4 body untouched)`
- **[[c4]]** `prior-artifact` `LLD s4 contractDetails (BugfixNextCall/StampDeps types + admitBugfixAdvance gate) + HLD boundary — s4 owns no new shared type; admitBugfixAdvance mirrors admitBuild (runners/build/admission.ts)`
- **[[c5]]** `prior-artifact` `S003 src/workflow/locate/ — locateParent + ParentLocation, the sc3 entry point locateAndStampParent invokes (degrades to semantic/prompt/standalone with empty touchedPaths)`
- **[[c6]]** `convention` `insrc framework has no auto sequencer — buildNextCall (mcp/triage-step/phases/classify.ts:41) emits only stage-1; advance is per-stage nextCall + admission/approve gates; the issue-approval wiring is additive + bugfixCategory-gated`
