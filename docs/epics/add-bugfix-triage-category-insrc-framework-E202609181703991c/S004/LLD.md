<!-- insrc:artifact LLD-1703991c69967193-s4 -->

# LLD: E202609181703991c:S004

**Epic:** `add-bugfix-triage-category-insrc-framework`
**HLD base run:** `wf-1789726188697-irhvw2`
**HLD effective hash:** `e08e0c0d9f7b...`

## HLD context

**Framework:** Bugfix becomes a first-class, scope-gated category that reuses the existing stage/artifact/approve/tracker machinery end-to-end. Triage gains a new `bugfix` SizeClass carrying a magnitude (a small fix vs an M/L fix) and a route that is NOT a single fixed startStage but branches on that magnitude. The flow's first stage is a new first-class `issue` workflow whose synthesized IssueArtifact — reproduction + root cause + fix intent — is the single source of truth serving both the internal chain record and, later, the GitHub issue body. A tiered parent-locator (deterministic ref-resolver → graph code-ownership → semantic match → user prompt → standalone) attaches the fix to the epic/story whose behaviour it corrects, recording which tier decided and at what confidence, with auto-attach only above a high threshold. A scope-gated orchestrator then routes a small fix issue→build and an M/L fix issue→design→plan→build, with the existing post-build code-review gating completion; where a tracker is configured a GitHub issue is created from the same issue content, linked to the located parent, and closed on completion. All five constraints k1–k6 are satisfied by conforming to the framework's own conventions rather than inventing a parallel mechanism.
**Rollout phase:** Phase C — scope-gated orchestration + GitHub surface
**Consumes:** `sc1` (BugfixTriageResult), `sc2` (IssueArtifact), `sc3` (ParentLocation)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The classifier heuristics/prompt that recognise a user-declared defect fix as `bugfix` and size it into small vs sized magnitude — the sizing rubric, the analyze grounding it runs, and the pure route table branch — stay private to s1. No other story reaches into how the size decision is made; they consume only the resulting BugfixTriageResult/TriageRoute values. — owns `sc1`
- `s2`: The `issue` stage's multi-turn step machinery — its decomposer plan, per-step runners, synthesizer, prompt templates, and the storage/path-scheme/gates wiring plus the review/approve gate for the IssueArtifact — is private to s2. Downstream stories see only the finished, approvable IssueArtifact shape, never how its reproduction/root-cause/fix-intent fields are elicited and synthesized. — owns `sc2`
- `s3`: The tiered resolver internals stay private to s3: the deterministic ref-resolver reuse, the graph code-ownership scoring over candidate stories, the semantic embedding match against epic/story artifacts, the per-tier high-confidence auto-attach thresholds, and the user-prompt interaction and its standalone fallback. Consumers see only the ParentLocation decision (tier + parentRef + confidence + evidence), not the scoring that produced it. — owns `sc3`
- `s5`: The GitHub integration path is private to s5: rendering the issue body from the IssueArtifact content via the existing tracker create/link surface, linking the created issue to the ParentLocation (or leaving it standalone), closing it on completion, and the tracker-not-configured no-op branch. s5 reuses tracker/github.ts, refs.ts, link.ts, sync.ts, and setup.ts rather than adding any new external path (k5/k6) and defines no new shared type.

## Contract details

**Surface level:** internal

### `nextAfterIssue`

```typescript
declare function nextAfterIssue(issue: IssueArtifact, repo: string): BugfixNextCall
```

**Parameters:**
- `issue: IssueArtifact` — The APPROVED sc2 IssueArtifact. Only its meta.magnitude (+ its standalone identity/slug) is read to route — the body is not touched.
- `repo: string` — Repo path, forwarded into the emitted nextCall params (matching buildNextCall's shape).

**Returns:** `BugfixNextCall` — The routed next-stage descriptor { tool; params } — the SAME nextCall shape buildNextCall emits (src/mcp/triage-step/phases/classify.ts). small => a standalone insrc_build_step nextCall (issue→build, no LLD/plan); sized => a standalone insrc_workflow_run design.story nextCall (issue→design→plan→build). The controller follows it, exactly as it follows buildNextCall's stage-1.

**Errors:**
- `invalid-magnitude` when issue.meta.magnitude is neither 'small' nor 'sized' (a non-bugfix or malformed issue reached the bugfix advance) — throws rather than silently mis-routing.

**Preconditions:**
- issue is a bugfix issue (meta.workflow==='issue' with meta.magnitude present); the caller has already confirmed approval via admitBugfixAdvance.
- The route is re-derived via the consumed routeForSizeClass('bugfix', issue.meta.magnitude) — s4 does NOT re-implement the size decision (s1 private).

**Postconditions:**
- The emitted nextCall's stage matches the sc1 route: small→build (producesLld:false, needsPlan:false), sized→design.story (producesLld:true, needsPlan:true).
- The small build nextCall carries a standalone param (the build-step resolver cannot target a hierarchical task without a tracker), mirroring buildNextCall's trivial branch.
- Pure: reads meta only, performs no IO.

### `locateAndStampParent`

```typescript
declare function locateAndStampParent(input: { repoPath: string; issueHash: string }, deps: StampDeps): Promise<ParentLocation>
```

**Parameters:**
- `input: { repoPath: string; issueHash: string }` — Identifies the approved IssueArtifact to attach (issueHash keys ISSUE-<hash>.json).
- `deps: StampDeps` — Injected collaborators so the stamp is testable without a DB: { readIssue: (repoPath, issueHash) => IssueArtifact | null; locateParent: (input) => Promise<ParentLocation>; writeParentRef: (repoPath, issueHash, ref: WorkItemRef | null) => void }. locateParent is the consumed sc3 entry point; readIssue/writeParentRef wrap the existing storage round-trip.

**Returns:** `Promise<ParentLocation>` — The sc3 decision. As a SIDE EFFECT the persisted IssueArtifact's meta.parentRef is set to location.parentRef (null for standalone) — a targeted META patch, never a body rewrite (k4).

**Errors:**
- `issue-not-found` when deps.readIssue returns null for issueHash — throws (an advance was attempted against a missing/unapproved issue).
- `not-approved` when the read IssueArtifact has no meta.approvedAt — refuses to stamp (parentRef is a post-approval act).

**Preconditions:**
- The IssueArtifact is approved (meta.approvedAt set).
- defectDescription passed to locateParent is derived from the issue body (reproduction + rootCause + fixIntent); touchedPaths are empty at issue-approval (the fix is not yet built) so the graph tier is inert and sc3 degrades to semantic/prompt/standalone per its own contract.

**Postconditions:**
- meta.parentRef is populated (WorkItemRef or null) on the persisted issue JSON; the markdown body (renderIssueMarkdown) is byte-unchanged (k4).
- The returned ParentLocation's tier/confidence/evidence are available for logging/observability and for s5's GH link.

### `admitBugfixAdvance`

```typescript
declare function admitBugfixAdvance(issue: IssueArtifact): { readonly admitted: boolean; readonly reason?: string }
```

**Parameters:**
- `issue: IssueArtifact` — The candidate issue to advance past. Its meta.approvedAt + meta.parentRef presence are checked.

**Returns:** `{ admitted: boolean; reason?: string }` — Whether the bugfix may proceed to stage-2. admitted=false with a reason when the issue is not approved/fresh OR meta.parentRef has not been resolved (the field is absent). parentRef===null (standalone) is a RESOLVED value and admits.

**Preconditions:**
- Mirrors the existing admission pattern (runners/build/admission.ts admitBuild) — a pure predicate over meta, no IO.

**Postconditions:**
- admitted=true only when meta.approvedAt is set AND meta.parentRef has been resolved (present, incl. explicit null); enforces the HLD gate 'an approved+fresh IssueArtifact AND a resolved ParentLocation before proceeding'.

## Data model changes

### `ArtifactMetaBase.parentRef` — invariant-change

No SHAPE change — meta.parentRef?: WorkItemRef | null already exists (types.ts:412, added S002) and s2 leaves it ABSENT. s4 becomes the WRITER that populates it (post-approval, via locateAndStampParent): the invariant tightens from 'always absent' to 'resolved (WorkItemRef|null) once the bugfix advances past its approved issue'. No other artifact's parentRef semantics change; renderIssueMarkdown never reads it (k4).

```
// unchanged shape: readonly parentRef?: WorkItemRef | null;
// invariant: absent on a just-finalized issue (s2); resolved by s4 at advance (WorkItemRef, or null for standalone)
```

**Call sites:**
- `src/workflow/types.ts:412 (ArtifactMetaBase.parentRef)`
- `src/workflow/orchestrator.ts:364-406 (finalizeArtifact mints meta; parentRef left absent there)`
- `src/workflow/storage.ts (readArtifactCore/writeAtomic round-trip the patch)`

### `BugfixNextCall / StampDeps` — new

Internal (non-shared) helper types for s4's module. BugfixNextCall = { tool: 'insrc_workflow_run' | 'insrc_build_step'; params: Record<string, unknown> } — structurally the same nextCall descriptor buildNextCall returns, re-declared locally so s4 does not import triage-step internals. StampDeps is the injectable-deps bundle for locateAndStampParent. Neither is an sc-level shared type (s4 owns none).

```
+interface BugfixNextCall { readonly tool: 'insrc_workflow_run' | 'insrc_build_step'; readonly params: Record<string, unknown>; }
+interface StampDeps { readonly readIssue: (repoPath: string, issueHash: string) => IssueArtifact | null; readonly locateParent: (input: { touchedPaths: string[]; defectDescription: string }) => Promise<ParentLocation>; readonly writeParentRef: (repoPath: string, issueHash: string, ref: WorkItemRef | null) => void; }
```

**Call sites:**
- `src/mcp/triage-step/phases/classify.ts:41-94 (buildNextCall — the nextCall shape mirrored)`
- `src/workflow/locate/ (sc3 locateParent + ParentLocation, from S003)`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | nextAfterIssue re-derives the post-issue path from the consumed routeForSizeClass('bugfix', issue.meta.magnitude) (src/workflow/triage/classify.ts:36-69) — small→build, sized→design.story. s4 reads the route/magnitude only; it never re-implements the size decision (s1's private classifier scope). |
| `sc2` | consumes | s4 consumes the finished, approved IssueArtifact shape (sc2): it reads meta.magnitude to route and STAMPS meta.parentRef via locateAndStampParent as a meta-only patch (k4 — renderIssueMarkdown body unchanged). It does NOT touch s2's private issue-stage machinery (decomposer/synthesizer/finalize) — only the persisted artifact + the existing storage round-trip. The parentRef stamp realizes S002's documented intent ('s2 leaves parentRef absent; s3/s4 fill it'). |
| `sc3` | consumes | locateAndStampParent invokes the consumed sc3 locateParent({ touchedPaths, defectDescription }) (src/workflow/locate/, S003) and writes its returned parentRef onto the issue meta. s4 treats ParentLocation as an opaque decision (tier/parentRef/confidence/evidence) — it does not re-implement or re-order the tiers (s3's private scope). At issue-approval touchedPaths are empty, so sc3 degrades to its semantic/prompt/standalone tiers exactly as its contract specifies. |

## Error paths

### Error cases

- **nextAfterIssue receives an issue whose meta.magnitude is absent or is neither 'small' nor 'sized' (a non-bugfix artifact, or a malformed/legacy issue, reached the bugfix advance).** (terminal)
  - Detection: nextAfterIssue reads issue.meta.magnitude and finds it outside the BugfixMagnitude union before any routing branch matches.
  - Response: Throw `invalid-magnitude` rather than defaulting to a stage — silently routing a mis-magnitude issue to build or design would violate the scope gate (k2). The controller surfaces the error and the operator corrects the issue.
  - User impact: The advance halts with a clear error instead of a wrong-ceremony route; no artifact is produced.
- **locateAndStampParent is invoked for an issueHash whose IssueArtifact is missing, or is present but not yet approved.** (recoverable)
  - Detection: deps.readIssue returns null (missing), or the read artifact has no meta.approvedAt (unapproved).
  - Response: Throw `issue-not-found` / `not-approved` and DO NOT write parentRef — parent-stamp is a strictly post-approval act. Nothing is mutated.
  - User impact: The stamp is refused until the issue is approved; no partial/wrong parentRef is written.
- **The consumed sc3 locateParent rejects unexpectedly (e.g. the daemon inference IPC is down) rather than returning a standalone ParentLocation.** (recoverable)
  - Detection: The awaited deps.locateParent(...) promise rejects inside locateAndStampParent.
  - Response: Let the rejection propagate WITHOUT writing parentRef (do not stamp a guessed/partial value). meta.parentRef stays absent, so admitBugfixAdvance then withholds the advance — the operator retries the stamp once the daemon is back. (sc3's own contract makes 'no owner found' a standalone result, NOT a rejection, so this path is only an infrastructure failure.)
  - User impact: The bugfix cannot advance until the parent is resolved; no wrong attach, no lost work.
- **deps.writeParentRef fails to persist the meta patch (disk error / concurrent write).** (recoverable)
  - Detection: The writeParentRef call throws while patching the ISSUE-<hash>.json.
  - Response: Propagate the write error; parentRef remains absent (the patch is a single-field atomic write via the existing storage round-trip, so a failure leaves the prior state, not a half-written meta). admitBugfixAdvance keeps withholding until a successful stamp.
  - User impact: Advance is blocked until the stamp persists; the issue record is never left partially mutated.

### Edge cases

| Input | Expected |
| :--- | :--- |
| locateParent resolves tier='standalone' (parentRef = null) — no owner found for the fix. | locateAndStampParent writes meta.parentRef = null. admitBugfixAdvance treats null as a RESOLVED value (not absent) and ADMITS — the standalone bugfix proceeds unattached, exactly per the sc3/k3 standalone fallback. |
| The issue already carries a stamped meta.parentRef (locateAndStampParent re-run, e.g. after an operator re-approves). | The stamp is idempotent last-writer: it re-locates and overwrites meta.parentRef; the body is untouched (k4). admitBugfixAdvance still admits (parentRef resolved). |
| A SIZED bugfix advances: nextAfterIssue emits the design.story nextCall. | s4's own code ends at that handoff — the subsequent design→plan→build sequencing runs entirely through the EXISTING upstream/approve gates (readPlanUpstream etc.), which s4 consumes, not re-implements. No bugfix-specific code past the design.story nextCall. |
| A SMALL bugfix reaches completion, but (as in S001/S002/S003) the build-step resolver cannot target a hierarchical task without a GH tracker, so no BUILD artifact exists. | Completion is the standalone-build + approveWorkflowTarget path (the same framework gap the epic has hit throughout); under codeReview.enforce a CR record is still required for completion (ac3). s4 adds no new completion path — it reuses approveWorkflowTarget verbatim. |
| The IssueArtifact carries an explicit parent reference the reporter supplied. | The defectDescription/explicitRef flows into locateParent, whose tier-1 deterministic resolver attaches it (tier='deterministic') — s4 passes the input through and stamps the resolved ref; it does not itself parse refs (s3's private scope). |
| The early (issue-approval) locate resolves standalone where a POST-BUILD locate (with real touched paths feeding the graph tier) would have attached to an owner. | Accepted for this story: the fix proceeds standalone. A post-build re-confirm of the parent (re-running locate once touched paths are known) is a documented FUTURE enhancement / openQuestion (the a2 alternative), NOT built here — s4 resolves the parent before proceeding per the HLD gate, trading some graph-tier accuracy for an early, gate-satisfying attach. |

### Invariants to preserve

- The scope gate is sc1's route table, consumed not re-implemented: nextAfterIssue re-derives the post-issue path via routeForSizeClass('bugfix', magnitude) — small→build (no LLD/plan), sized→design→plan→build — so the amount of process always matches the magnitude (k2), and the size decision stays private to s1. Grounded by the s1 symbol.locate bundle on routeForSizeClass (triage/classify.ts:36-69) proving the bugfix route branch already exists. [[c1]]
- Completion reuses approveWorkflowTarget(req, { enforce }) UNCHANGED — a bugfix build is completed through the exact same BUILD-approval + codeReview.enforce gate as any other built work (a block/absent CR withholds completion unless overrideReview); s4 adds no new completion path (ac3). Grounded by the s1 symbol.locate bundle on approveWorkflowTarget (gates.ts:617-685) + the approve-build-completion tests. [[c2]]
- parentRef is a META-ONLY stamp: locateAndStampParent writes meta.parentRef and never touches the issue body, so renderIssueMarkdown stays the single source of truth for the chain record AND the GitHub issue body (k4). Grounded by the s1 data-model.trace bundle showing meta.parentRef exists on ArtifactMetaBase (types.ts:412) and s2 leaves it absent for s3/s4 to fill. [[c3]]

## Test strategy

**Test framework:** `node:test via tsx (npx tsx --test 'src/**/__tests__/*.test.ts'), matching the existing workflow/mcp test layout (approve-build-completion.test.ts, triage/__tests__/classify.test.ts). The nextAfterIssue/admit/stamp unit tests need no live services; the completion test reuses the existing approve-build harness.`

### Test levels

- **unit** — Prove the pure advance-route `nextAfterIssue` maps magnitude to the correct next stage with fabricated IssueArtifacts — the scope gate (ac1/ac2). No DB, no daemon.
  - Subjects: `nextAfterIssue: magnitude='small' -> a standalone insrc_build_step nextCall (issue->build), no design.story/plan tool`, `nextAfterIssue: magnitude='sized' -> a standalone insrc_workflow_run design.story nextCall (issue->design->plan->build)`, `nextAfterIssue: the emitted route matches routeForSizeClass('bugfix', magnitude) (producesLld/needsPlan consistency)`, `nextAfterIssue: the small build nextCall carries the standalone param (mirrors buildNextCall's trivial branch)`, `nextAfterIssue: magnitude absent/invalid -> throws invalid-magnitude (no silent default route)`
  - Fixtures: `Hand-built IssueArtifact literals with meta.magnitude='small'|'sized'|undefined (no persistence)`
- **unit** — Prove the admission gate `admitBugfixAdvance` enforces the HLD gate (approved+fresh issue AND a resolved ParentLocation) with fabricated meta.
  - Subjects: `admitBugfixAdvance: approved + parentRef resolved (WorkItemRef) -> admitted`, `admitBugfixAdvance: approved + parentRef===null (standalone) -> admitted (null is resolved, not absent)`, `admitBugfixAdvance: approved + parentRef ABSENT -> not admitted, reason names the missing parent resolution`, `admitBugfixAdvance: not approved (no meta.approvedAt) -> not admitted, reason names approval`
  - Fixtures: `Hand-built IssueArtifact metas varying approvedAt + parentRef (present WorkItemRef / null / absent)`
- **unit** — Prove `locateAndStampParent` runs sc3 locateParent and meta-patches parentRef (k4 body untouched) via injected StampDeps — no DB.
  - Subjects: `locateAndStampParent: locateParent returns a WorkItemRef -> writeParentRef called with that ref; returns the ParentLocation`, `locateAndStampParent: locateParent returns standalone (null) -> writeParentRef called with null`, `locateAndStampParent: readIssue null -> throws issue-not-found, writeParentRef NOT called`, `locateAndStampParent: issue present but no approvedAt -> throws not-approved, writeParentRef NOT called`, `locateAndStampParent: locateParent rejects (infra failure) -> propagates, writeParentRef NOT called (no partial stamp)`, `locateAndStampParent: defectDescription passed to locateParent is derived from reproduction+rootCause+fixIntent; touchedPaths empty at issue-approval`
  - Fixtures: `A fake StampDeps: stub readIssue returning a canned IssueArtifact|null, stub locateParent returning a canned ParentLocation (or rejecting), and a spy writeParentRef recording (issueHash, ref)`
- **integration** — Prove completion reuses approveWorkflowTarget UNCHANGED for a bugfix build (ac3) — the post-build CR gate applies exactly as for other built work.
  - Subjects: `A bugfix BUILD under codeReview.enforce with a CR pass -> completes (approvedAt set), codeReview[] pass`, `A bugfix BUILD under codeReview.enforce with an absent/block CR -> withheld into skipped[], no approvedAt (unless overrideReview)`, `A bugfix standalone-build path with enforce OFF -> completes byte-identical (no new completion path)`
  - Fixtures: `Reuse the existing approve-build-completion test harness (writeCR/writeBuild helpers) with a bugfix-shaped BUILD/standalone record`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `nextAfterIssue: magnitude='small' -> a standalone insrc_build_step nextCall (issue->build), no design.story/plan tool`, `nextAfterIssue: the emitted route matches routeForSizeClass('bugfix', magnitude) (producesLld/needsPlan consistency)` |
| `ac2` | `nextAfterIssue: magnitude='sized' -> a standalone insrc_workflow_run design.story nextCall (issue->design->plan->build)`, `nextAfterIssue: the emitted route matches routeForSizeClass('bugfix', magnitude) (producesLld/needsPlan consistency)` |
| `ac3` | `A bugfix BUILD under codeReview.enforce with a CR pass -> completes (approvedAt set), codeReview[] pass`, `A bugfix BUILD under codeReview.enforce with an absent/block CR -> withheld into skipped[], no approvedAt (unless overrideReview)` |

## Migration

**State before:** The bugfix flow exists only up to the approved IssueArtifact (S002) + the parent-locator (S003, src/workflow/locate/), but nothing SEQUENCES the bugfix past its issue. The framework has no automatic stage sequencer: buildNextCall (src/mcp/triage-step/phases/classify.ts:41-94) emits only stage-1's nextCall (the `issue` workflow for a bugfix, carrying magnitude); chain.ts is an epic-only status reporter (NextAction has no issue/build). meta.parentRef?: WorkItemRef|null already exists on ArtifactMetaBase (types.ts:412) but is UNPOPULATED — s2 leaves it absent, and nothing calls sc3 locateParent to fill it. Completion via approveWorkflowTarget (gates.ts:617-685) + codeReview.enforce already exists and gates every built story; the sized-bugfix design→plan→build path would already flow through the existing readPlanUpstream/approve gates — they are just never reached because no advance emits the design.story/build nextCall.

**State after:** A thin, feature-flagged bugfix-orchestration module exists: nextAfterIssue (magnitude→routed next nextCall: small→build, sized→design.story), admitBugfixAdvance (approved+fresh issue AND resolved parentRef gate), and locateAndStampParent (runs sc3 locateParent at issue-approval and meta-patches parentRef). meta.parentRef is now RESOLVED (WorkItemRef|null) once a bugfix advances past its approved issue. Completion is the existing approveWorkflowTarget path, reached for a bugfix build for the first time. No new shared type; all behind the existing `bugfixCategory` flag.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the internal helper types (BugfixNextCall, StampDeps) to the bugfix-orchestration module. Purely additive type declarations; no existing type changes shape. — ↩ rollbackable
2. Add the pure `nextAfterIssue(issue, repo)` advance-route that re-derives the post-issue path from the consumed routeForSizeClass('bugfix', magnitude) and emits the routed standalone nextCall (small→build, sized→design.story). New pure function; touches no existing function. — ↩ rollbackable _(needs: `bugfixCategory`)_
3. Add the pure `admitBugfixAdvance(issue)` gate predicate (approved+fresh AND parentRef resolved). New pure function mirroring the existing admitBuild admission pattern. — ↩ rollbackable _(needs: `bugfixCategory`)_
4. Add `locateAndStampParent(input, deps)` that reads the approved issue, calls the consumed sc3 locateParent with the description-derived input, and writes meta.parentRef as a single-field meta patch through the existing storage round-trip. New code path; does not re-finalize or rewrite the body (k4). — ↩ rollbackable _(needs: `bugfixCategory`)_
5. Wire the advance + stamp into the controller/MCP flow at issue-approval: after the IssueArtifact is approved, invoke locateAndStampParent, then gate on admitBugfixAdvance, then emit nextAfterIssue's nextCall. Completion continues to use approveWorkflowTarget unchanged. Additive wiring — the non-bugfix approve path is untouched. — ↩ rollbackable _(needs: `bugfixCategory`)_
6. Add unit tests (fabricated IssueArtifacts + injected StampDeps for the route/gate/stamp) + an integration test reusing the approve-build-completion harness for a bugfix BUILD under enforce. Test-only; no production behavior change. — ↩ rollbackable

**Backward compat:** Fully backward compatible: every change is additive and behind the `bugfixCategory` flag. No existing public API changes signature or shape — nextAfterIssue/admitBugfixAdvance/locateAndStampParent are new functions; BugfixNextCall/StampDeps are new internal types; buildNextCall, routeForSizeClass, approveWorkflowTarget, readPlanUpstream, and finalizeArtifact are all consumed UNCHANGED. The only reused field (meta.parentRef) already exists as an optional field (S002); s4 populates it where it was previously always absent — an invariant tightening, not a shape change, and only for bugfix issues. A non-bugfix workflow run and every existing approve/completion path are byte-identical.

## Alternatives considered

### a1: Dedicated advance module; locate + stamp at issue-approval — **CHOSEN**

A small bugfix-orchestration module: a pure `nextAfterIssue(issue)` advance-route (magnitude→routed next nextCall), a `locateAndStampParent` that runs sc3 locateParent at issue-approval and meta-patches parentRef, and an `admitBugfixAdvance` gate that refuses to advance until the issue is approved+fresh AND a ParentLocation is resolved — completion reuses approveWorkflowTarget unchanged.

s4 adds a thin, dependency-injected orchestration module that COMPOSES the three consumed contracts and owns no new shared type. (1) nextAfterIssue reads issue.meta.magnitude (via routeForSizeClass('bugfix', magnitude)) and emits small→standalone build, sized→standalone design.story. (2) locateAndStampParent runs at issue-approval, calls sc3 locateParent grounded on the issue's defect text, and writes meta.parentRef as a META patch (k4). (3) admitBugfixAdvance refuses stage-2 until the issue is approved+fresh and parentRef is resolved. Completion is the existing approveWorkflowTarget. Parent is located BEFORE design/build so a sized bugfix's design + s5's GH link can reference it.

### a2: Advance module; locate + stamp POST-BUILD at completion

Same advance-route + gate, but the parentRef stamp runs at BUILD completion using the touched paths from the build diff (richest graph code-ownership), stamped just before approveWorkflowTarget.

nextAfterIssue + admitBugfixAdvance as in a1, but parent-location is deferred: locateAndStampParent runs at completion fed the build's touched paths so sc3's graph tier is fully usable; the stamp patches meta.parentRef just before the reused approveWorkflowTarget. The stage-2 admit gate then requires only an approved+fresh issue.

**Rejected because:** Correct on all acceptance criteria and stronger on locate ACCURACY, but PARTIAL on sc3: deferring parent resolution to completion means the fix advances through design/build unattached, at odds with the HLD gate 'a resolved ParentLocation before proceeding' and s5 cannot create-and-link until completion. Its accuracy edge is captured as a1's openQuestion (an optional post-build re-confirm), not adopted as the primary shape. Ranked 2nd.

### a3: Fold advance + stamp into the issue stage's done/approve response

No separate orchestration module: extend the issue stage's finalize/approve to compute the next nextCall and run locateParent inline, so the issue stage's `done` response already carries the routed advance + stamped parentRef.

The post-issue advance and the parent stamp are folded into the `issue` stage's own finalize/approve path: finalizeIssue (or the issue approve hook) calls sc3 locateParent, writes meta.parentRef, and the stage's done/pendingApproval response includes the routed nextCall. Completion still reuses approveWorkflowTarget.

**Rejected because:** VIOLATES sc2 + the scope boundary: it folds s4's orchestration + sc3 dependency into the issue stage's private finalize/approve, which the HLD assigns to s2. That is exactly the adjacent-boundary over-reach STAY-IN-SCOPE forbids — it would need an HLD amendment moving that scope, not a silent build. Ranked 3rd.

## Open questions

- Post-build parent re-confirm (the a2 accuracy edge): the issue-approval locate has empty touchedPaths so it cannot use sc3's graph code-ownership tier; a future enhancement could re-run locateParent after the build with the real touched paths to upgrade a standalone/low-confidence early attach. Deferred (not built in s4); the fix still resolves a parent before proceeding per the HLD gate.

## Citations

- **[[c1]]** `prior-artifact` `LLD s4 s1 symbol.locate bundle — routeForSizeClass(sizeClass, magnitude?): TriageRoute (src/workflow/triage/classify.ts:36-69), the bugfix scope-gate route table nextAfterIssue consumes (small→build, sized→design→plan→build)`
- **[[c2]]** `prior-artifact` `LLD s4 s1 symbol.locate bundle — approveWorkflowTarget(req, { enforce }): WorkflowApproveResult (src/workflow/gates.ts:617-685) + approve-build-completion tests, the reused post-build code-review completion gate (ac3)`
- **[[c3]]** `prior-artifact` `LLD s4 s1 data-model.trace bundle — meta.parentRef?: WorkItemRef|null on ArtifactMetaBase (src/workflow/types.ts:412), absent from s2, meta-patched by s4 via the storage round-trip (k4 body untouched)`
- **[[c4]]** `prior-artifact` `HLD sc1/sc2/sc3 (consumed) + Epic k1/k2/k4/k6 — s4 composes the route, the approved IssueArtifact, and the ParentLocation; owns no new shared type; reuses build + code-review`
- **[[c5]]** `prior-artifact` `S003 src/workflow/locate/ — locateParent + ParentLocation, the sc3 entry point locateAndStampParent invokes (degrades to semantic/prompt/standalone when touchedPaths are empty)`
- **[[c6]]** `convention` `insrc framework has no automatic stage sequencer — buildNextCall (mcp/triage-step/phases/classify.ts:41-94) emits only stage-1; the flow advances via per-stage nextCall + admission (runners/build/admission.ts admitBuild) + approve gates`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 0 LOW** · model `client` · reviewed 2026-09-18T14:34:48.899Z

_No load-bearing premises were extracted._
