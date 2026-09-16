<!-- insrc:artifact LLD-0f9a9d06f5da3a5c-s1 -->

# LLD: E202608040f9a9d06:S001

**Epic:** `wire-already-shipped-enforcecodereviewgate-src-workflow`
**HLD base run:** `wf-1785843530754-a74hkd`
**HLD effective hash:** `0f9a9d06f5da...`

## HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## Contract details

**Surface level:** internal-shared

### `approveWorkflowTarget`

```typescript
export function approveWorkflowTarget(req: WorkflowApproveRequest): WorkflowApproveResult
```

**Parameters:**
- `req: WorkflowApproveRequest` — The approve request { repoPath, artifactPath? | epicHash?, overrideReview? }. overrideReview is reused as the code-review-block override (same channel as the meta.review override).

**Returns:** `WorkflowApproveResult` — { approved[], skipped[], codeReview[] } — approved stamped artifacts, skipped (review-blocked, INCLUDING code-review-blocked) with a reason, and the NEW additive codeReview[] carrying each story-scoped artifact's CodeReviewGateResult status for the controller to present (ac: warn/pass/overridden/blocked/no-review).

**Errors:**
- `ArtifactMissingError` when The single artifactPath's json is absent (unchanged behaviour).
- `NoPendingArtifactsError` when An epicHash batch with zero pending artifacts (unchanged).

**Preconditions:**
- Runs daemon-side (via the 'workflow.approve' IPC); enforceCodeReviewGate is fs-only so it runs here without DB access.
- The artifact json meta already carries epicHash/storyId for story-scoped artifacts (LLD/PLAN/BUILD).

**Postconditions:**
- For each story-scoped artifact, BEFORE stamping approvedAt, enforceCodeReviewGate(repoPath, meta.epicHash, meta.storyId, { overrideReview: req.overrideReview }) is consulted as a SECOND, distinct gate (over body.verdict, never meta.review — k8/b6).
- A 'blocked' code-review verdict routes the artifact into skipped[] with the gate message and does NOT stamp approvedAt (b1), exactly as a ReviewBlockedError does; the two gates are independent.
- An 'overridden' verdict (block + req.overrideReview) proceeds to approve and records the override outcome in codeReview[] (b2).
- 'pass' / 'warn' / 'no-review' proceed to the normal meta.review approve unchanged; the status is surfaced in codeReview[] (b3).
- DEF/HLD (no storyId) + any Story with no CR record => 'no-review' => approval byte-identical to today (b5, strictly additive).

### `enforceCodeReviewGate`

```typescript
export function enforceCodeReviewGate(repoPath: string, epicHash: string, storyId: string, opts?: { readonly overrideReview?: string; readonly enforce?: boolean }): CodeReviewGateResult
```

**Parameters:**
- `repoPath: string` — req.repoPath — the repo whose CR-<epic>-<story> record is read.
- `epicHash: string` — meta.epicHash of the artifact being approved.
- `storyId: string` — meta.storyId of the artifact being approved.
- `opts: { readonly overrideReview?: string; readonly enforce?: boolean }` _(optional)_ — overrideReview = req.overrideReview (bypass a block, recording the reason). enforce defaults to the codeReview.enforce config flag; the approve path leaves it unset so the flag governs (tests inject it).

**Returns:** `CodeReviewGateResult` — The S007 discriminated outcome (no-review/pass/warn/blocked/overridden) the approve loop branches on. Existing gate, reused verbatim — NOT reshaped.

**Preconditions:**
- Shipped S007 (src/workflow/code-review/gate.ts); read-only over the CR record + PATHS.config; never throws on an absent/malformed record (=> 'no-review').

**Postconditions:**
- Returns the verdict-based outcome; enforcement is opt-in behind codeReview.enforce (flag off => a block is a non-blocking advisory warn, so approval is unaffected until the flag is turned on).

## Data model changes

### `WorkflowApproveResult.codeReview (additive field)` — field-add

Add an additive `codeReview: readonly CodeReviewApprovalOutcome[]` to WorkflowApproveResult, one entry per story-scoped artifact the approve loop consulted: { path, storyId, status, message?, counts? }. Lets the controller PRESENT the code-review outcome; existing approved[]/skipped[] are unchanged. [[c1]] [[c3]]

```
+ readonly codeReview: readonly { path: string; storyId: string; status: 'no-review'|'pass'|'warn'|'blocked'|'overridden'; message?: string; counts?: { high:number; med:number; low:number } }[];
```

**Call sites:**
- `src/workflow/gates.ts (approveWorkflowTarget)`
- `src/mcp/server.ts (handleWorkflowApprove relay)`
- `src/mcp/daemon-stream.ts (approveWorkflow forward)`

### `approveWorkflowTarget approveOne (behaviour, additive)` — invariant-change

approveOne gains a code-review gate step BEFORE approveArtifactByJsonPath, keyed on meta.epicHash/storyId; a 'blocked' status routes to skipped[] (no approvedAt), else the meta.review approve runs unchanged. INVARIANT PRESERVED: no CR record / enforce off => approve outcome byte-identical to today. [[c1]] [[c3]]

```
+ if meta.epicHash && meta.storyId: gate=enforceCodeReviewGate(...); if gate.status==='blocked': skipped.push(...); return
```

**Call sites:**
- `src/workflow/gates.ts (approveWorkflowTarget)`

## Error paths

### Error cases

- **enforce is ON, a story-scoped artifact's CR record verdict is 'block', and NO overrideReview is supplied.** (recoverable)
  - Detection: approveOne calls enforceCodeReviewGate after reading meta and inspects the returned CodeReviewGateResult.status === 'blocked'.
  - Response: Route the artifact into skipped[] with { path, reason: gate.message } and DO NOT call approveArtifactByJsonPath (no approvedAt stamped) — exactly the ReviewBlockedError=>skipped[] pattern. The code-review status is also recorded in codeReview[].
  - User impact: Completion is withheld and the blocking reason (HIGH/MED counts) is relayed; the user re-approves with an explicit override to proceed (b1).
- **The artifact json has no meta, or meta is not an object.** (terminal)
  - Detection: approveArtifactByJsonPath already throws 'Artifact has no meta' when meta is absent/non-object; approveOne's existing try/catch does NOT catch this (only ReviewBlockedError), so it propagates (unchanged).
  - Response: The code-review gate step is SKIPPED for a meta-less artifact (the gate step guards on meta.epicHash && meta.storyId), so the new wiring never runs before the existing no-meta throw — behaviour is unchanged.
  - User impact: Same error as today for a malformed artifact; the wiring adds nothing to this path.
- **The CR record json exists but is corrupt / unreadable, or carries an unrecognized verdict.** (recoverable)
  - Detection: enforceCodeReviewGate (S007) catches its own parse/shape failure and returns { status:'no-review' } (fail-open) — the approve loop never sees a throw.
  - Response: approveOne treats 'no-review' as a non-blocking pass-through: the normal meta.review approve runs unchanged; codeReview[] records 'no-review'.
  - User impact: A corrupt CR record never blocks approval (fail-open, matching the S007 gate); the reviewer regenerates the record.

### Edge cases

| Input | Expected |
| :--- | :--- |
| Approving a DEF or HLD artifact (epic-scoped, meta has no storyId). | The gate step is skipped (guard on meta.storyId); approval proceeds exactly as today; no codeReview[] entry for that artifact. |
| A Story whose CR record is absent (review never run), enforce on or off. | enforceCodeReviewGate => 'no-review'; approval proceeds unchanged; codeReview[] records 'no-review' (strictly additive). |
| enforce is OFF (config default) and the CR verdict is 'block'. | The S007 gate demotes the block to a non-blocking advisory ('warn' with advisory:true); approval PROCEEDS; codeReview[] surfaces the advisory so the user still sees the demoted block. |
| CR verdict is 'warn' (enforce on or off). | Approval proceeds; codeReview[] records 'warn' + counts so the warnings are surfaced before the user acts (b3). |
| enforce on, verdict 'block', a non-empty overrideReview is supplied. | enforceCodeReviewGate => 'overridden'; approval proceeds; codeReview[] records 'overridden' + overrideReason + at (b2). The SAME overrideReview also clears a meta.review block if present (shared channel) — acceptable + documented. |
| An epicHash BATCH where story A's CR is 'block' (enforce on) and story B's CR is 'pass'. | A is routed to skipped[] (withheld), B is approved — the per-artifact loop handles each independently (non-lossy); codeReview[] carries both statuses. |

### Invariants to preserve

- The code-review gate is a SEPARATE check over the sc4 body.verdict and NEVER merges into approveArtifactByJsonPath's meta.review enforcement — the two verdict kinds stay distinct (k8); approveOne consults enforceCodeReviewGate independently, before the unchanged meta.review approve. [[c1]]
- A blocked code-review verdict is routed into the EXISTING skipped[] channel with a reason (never a new error type + never a silent drop), exactly as a ReviewBlockedError is — approved[]/skipped[] stay the non-lossy contract every current reader relies on. [[c1]]
- The wiring is strictly ADDITIVE: DEF/HLD (no storyId), an absent/corrupt CR record ('no-review'), and the codeReview.enforce flag OFF all leave the approve outcome byte-identical to today — only a PRESENT block under enforcement (no override) newly withholds approval. [[c3]]
- enforceCodeReviewGate is read-only + fs-only (reads the CR record + PATHS.config, never a DB) and never throws (fail-open to 'no-review'), so adding it to the daemon approve loop introduces no new failure mode or DB access (k5 respected). [[c3]]
- The overrideReview channel is reused end-to-end (WorkflowApproveArgs => WorkflowApproveRequest => the gate opts) rather than adding a new parameter — the code-review-block override travels the same path as the meta.review override. [[c2]]

## Test strategy

**Test framework:** `node:test + node:assert/strict via `npx tsx --test` (matching src/workflow/__tests__ and src/workflow/code-review/__tests__)`

### Test levels

- **unit** — Prove approveWorkflowTarget's new code-review gate step over temp story-scoped artifact json + temp CR-<epic>-<story>.json under a tmp repo, with the codeReview.enforce flag toggled — the same file-based harness the existing gates.ts + gate.ts tests use; no live daemon/graph.
  - Subjects: `approveWorkflowTarget: enforce on + CR verdict 'block' + no override => the story-scoped artifact is routed into skipped[] with the gate message, meta.approvedAt is NOT stamped, and codeReview[] records 'blocked' (b1)`, `approveWorkflowTarget: enforce on + 'block' + overrideReview => the artifact is approved (approvedAt stamped), codeReview[] records 'overridden' + overrideReason (b2)`, `approveWorkflowTarget: CR verdict 'warn'/'pass' => approved unchanged; codeReview[] records the status + counts (b3)`, `approveWorkflowTarget: absent CR record / DEF-HLD (no storyId) / enforce OFF + block => approval byte-identical to today; codeReview[] records 'no-review' (or the demoted advisory) (b5 additive)`, `approveWorkflowTarget: an epic BATCH with story A 'block' (enforce on) + story B 'pass' => A skipped, B approved (per-artifact, non-lossy)`, `the code-review gate is SEPARATE from meta.review: an artifact with a clean meta.review but a code-review 'block' is withheld ONLY by the code-review gate (k8/b6); a corrupt CR record => 'no-review' => never blocks (fail-open)`, `WorkflowApproveResult.codeReview[] is the additive surfacing the controller presents; approved[]/skipped[] shapes are unchanged`
  - Fixtures: `A tmp repo dir with a story-scoped artifact json (LLD/PLAN/BUILD meta.epicHash+storyId, optionally meta.review) + a CR-<epic>-<story>.json (verdict block/warn/pass, or absent) written via codeReviewArtifactPaths`, `opts.enforce injected true/false into enforceCodeReviewGate so the config read is bypassed (or a codeReview.enforce seam threaded through approveWorkflowTarget for the test)`, `node:test + node:assert/strict via `npx tsx --test`; the src/workflow/__tests__ + src/workflow/code-review/__tests__ layout`
- **unit** — Prove the MCP relay passes the new codeReview[] through unchanged (handleWorkflowApprove is a pure forward).
  - Subjects: `handleWorkflowApprove: a stubbed approveWorkflow returning { approved, skipped, codeReview } is relayed verbatim in the JSON response the controller presents (no logic added in the dispatch)`
  - Fixtures: `An injected UnaryRpcDeps stub returning a canned WorkflowApproveResult with a codeReview[] entry`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: 'enforce on + block + no override => skipped, no approvedAt' — assert the artifact is in skipped[] with the gate message and its json has no meta.approvedAt (b1, block withholds completion)` |
| `ac2` | `unit: 'enforce on + block + overrideReview => approved + overridden' — assert the artifact is approved and codeReview[] records status:'overridden' + overrideReason (b2)` |
| `ac3` | `unit: 'warn/pass => approved, status surfaced' — assert approval proceeds and codeReview[] records 'warn'/'pass' + counts for presentation (b3)` |
| `ac4` | `unit: 'the codeReview[] outcome is returned on WorkflowApproveResult and relayed by handleWorkflowApprove' — the controller receives the outcome to present before/with the explicit approval act (b4)` |
| `ac5` | `unit: 'absent CR / DEF-HLD (no storyId) / enforce OFF => approval byte-identical to today' — assert approvedAt stamped exactly as without the wiring; codeReview[] records 'no-review' or the demoted advisory (b5 strictly additive)` |
| `ac6` | `unit: 'the code-review gate is distinct from meta.review' — a clean meta.review + a code-review 'block' is withheld only by the code-review gate; a corrupt CR record fails open to 'no-review' and never blocks (k8/b6)` |

## Migration

**State before:** S007 shipped enforceCodeReviewGate + CodeReviewGateResult (src/workflow/code-review/gate.ts) + the codeReview.enforce config flag, but the gate is NEVER invoked — it is dead code at the approval site. Story approval today runs through approveWorkflowTarget (gates.ts:586): a per-artifact loop where approveOne reads the artifact json meta + calls approveArtifactByJsonPath, which enforces the meta.review block verdict (ReviewBlockedError => skipped[]) and stamps meta.approvedAt. Returns WorkflowApproveResult { approved[], skipped[] }. The MCP handleWorkflowApprove (server.ts) + approveWorkflow (daemon-stream.ts) are pure forwards over the 'workflow.approve' IPC; the overrideReview already threads end-to-end. The sc4 CR-<epic>-<story> body.verdict has NO effect on approval.

**State after:** approveWorkflowTarget's approveOne gains a SECOND, distinct gate BEFORE the meta.review approve: for a story-scoped artifact (meta.epicHash + meta.storyId) it calls enforceCodeReviewGate(repoPath, epicHash, storyId, { overrideReview }); a 'blocked' status routes the artifact into skipped[] (no approvedAt) exactly like a ReviewBlockedError, an 'overridden' proceeds, and pass/warn/no-review proceed unchanged. Each story-scoped outcome is recorded in a NEW additive WorkflowApproveResult.codeReview[] the MCP relay forwards verbatim so the controller presents it. Enforcement stays opt-in behind codeReview.enforce (off => a block is a non-blocking advisory, approval unchanged). The gate, the config flag, the meta.review path, and the approved[]/skipped[] shapes are otherwise untouched.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the additive `codeReview: CodeReviewApprovalOutcome[]` field to WorkflowApproveResult (gates.ts) + the CodeReviewApprovalOutcome type ({ path, storyId, status, message?, counts? }). Type-only; every existing reader of approved[]/skipped[] is unaffected. — ↩ rollbackable
2. In approveWorkflowTarget's approveOne, BEFORE approveArtifactByJsonPath, guard on meta.epicHash && meta.storyId and call enforceCodeReviewGate(repoPath, epicHash, storyId, { overrideReview: req.overrideReview }); push the outcome to codeReview[]; on status 'blocked' push to skipped[] (reason = gate.message) and return without stamping. No existing branch is edited — the meta.review approve path runs unchanged for every non-blocked outcome. — ↩ rollbackable _(needs: `codeReview.enforce`)_
3. Confirm the MCP relay forwards the new field: handleWorkflowApprove (server.ts) + approveWorkflow (daemon-stream.ts) already JSON-forward the whole WorkflowApproveResult, so the codeReview[] surfaces to the controller with no dispatch change (verify + a relay test). — ↩ rollbackable
4. Add unit tests (gates approve + code-review-gate integration) over temp artifact json + temp CR json under a tmp repo, toggling the enforce flag: block=>skipped, override=>approved, warn/pass/absent/DEF-HLD/enforce-off=>approved-as-today, batch mixed, distinct-from-meta.review, corrupt-CR=>no-review. Test-only. — ↩ rollbackable
5. (Optional, additive) refresh the insrc approval steering so the controller PRESENTS the codeReview[] outcome when relaying an approve result — opt-in doc/steering only, no runtime behaviour. — ↩ rollbackable

**Backward compat:** Affects one internal-shared API (approveWorkflowTarget / WorkflowApproveResult) additively. WorkflowApproveResult gains a codeReview[] field — additive, so existing readers of approved[]/skipped[] are unaffected. The approve BEHAVIOUR changes only in the strict superset direction: a story-scoped artifact with a PRESENT code-review 'block' AND the codeReview.enforce flag ON AND no override is now routed to skipped[] instead of approved — every other case (no CR record, DEF/HLD, warn/pass, flag OFF, override supplied) is byte-identical to today. Because the flag defaults OFF, the shipped default behaviour is unchanged until an operator opts in; a Story reviewed before this wiring (no CR record) always completes as before. The overrideReview channel is reused, not extended. Reverting is clean: remove the approveOne gate step + the codeReview[] field; the meta.review approve + the S007 gate remain intact.

## Alternatives considered

### a1: Daemon-side second gate in approveWorkflowTarget's per-artifact loop — **CHOSEN**

Add a code-review gate check inside approveWorkflowTarget's approveOne, symmetric with the existing meta.review/ReviewBlockedError => skipped[] routing.



### a2: Controller-side gate in the insrc_workflow_approve dispatch

Run enforceCodeReviewGate in handleWorkflowApprove (MCP process) before forwarding to the daemon.



**Rejected because:** Violates single-enforcement (b7): the code-review gate would live only in the MCP dispatch, leaving the CLI approve service + batch (epicHash) approval ungated, and duplicates the meta-read the daemon approve loop already performs. More cost (M) for a weaker guarantee.

### a3: Advisory-only present step (no enforcement on approve)

Surface the code-review outcome for presentation but never withhold approval.



**Rejected because:** Violates the core b1 (a block never withholds completion), making the codeReview.enforce flag meaningless at the approval site — it does not WIRE the gate, only displays it.

## Citations

- **[[c1]]** `analyze-bundle` `s1 symbol.locate — the approve path: src/workflow/gates.ts approveWorkflowTarget:586 + approveOne + approveArtifactByJsonPath:488 + ReviewBlockedError => skipped[] routing + WorkflowApproveRequest/Result; the per-artifact loop that already reads meta + routes blocked verdicts`
- **[[c2]]** `analyze-bundle` `s1 symbol.locate — the MCP dispatch + daemon forward: src/mcp/server.ts handleWorkflowApprove + src/mcp/daemon-stream.ts approveWorkflow (unaryRpc 'workflow.approve'); the overrideReview channel threading end-to-end`
- **[[c3]]** `analyze-bundle` `s1 symbol.locate — the S007 gate consumed: src/workflow/code-review/gate.ts enforceCodeReviewGate + CodeReviewGateResult (fs-only, fail-open to 'no-review', codeReview.enforce flag, body.verdict distinct from meta.review)`
- **[[c4]]** `analyze-bundle` `s1 search.text — epicHash+storyId live on the artifact meta (ArtifactMetaBase/PlanMeta) the approve loop already parses; DEF/HLD have no storyId => 'no-review'`
- **[[c5]]** `analyze-bundle` `s1 test.locate — the harness: src/workflow/__tests__ (gates approve + ReviewBlockedError=>skipped) + src/workflow/code-review/__tests__/gate.test.ts (temp CR json + injected opts.enforce), node:test + node:assert/strict via npx tsx --test`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 0 LOW** · model `client` · reviewed 2026-08-04T11:47:44.125Z

_No load-bearing premises were extracted._
