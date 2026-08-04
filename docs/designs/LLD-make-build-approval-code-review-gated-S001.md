<!-- insrc:artifact LLD-a131994ea1f99207-S001 -->

# LLD: S001

**Epic:** `make-build-approval-code-review-gated`
**HLD base run:** `wf-1785846282628-sj1fzh`
**HLD effective hash:** `a131994ea1f9...`

## HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## Contract details

**Surface level:** internal

### `pendingArtifactJsonPaths`

```typescript
function pendingArtifactJsonPaths(repoPath: string, epicHash: string): string[]
```

**Parameters:**
- `repoPath: string` — Repo root locating .insrc/artifacts for the epic sweep.
- `epicHash: string` — 16-char epic hash the sweep filters filenames on.

**Returns:** `string[]` — Sorted JSON paths of every not-yet-approved artifact under the epic. The prefix alternation in the filename regex is widened from (DEF|HLD|LLD|PLAN) to (DEF|HLD|LLD|PLAN|BUILD) so a BUILD-<hash>-<story>.json without meta.approvedAt is now included; malformed files still skipped.

**Preconditions:**
- No signature/return-type change; the ONLY change is the filename prefix alternation.

**Postconditions:**
- An epic-batch approve (approveWorkflowTarget with epicHash) now sweeps pending BUILD artifacts alongside DEF/HLD/LLD/PLAN.
- Already-approved BUILDs (meta.approvedAt present) remain excluded, exactly as for the other kinds.

### `approveWorkflowTarget`

```typescript
function approveWorkflowTarget(req: WorkflowApproveRequest, opts?: { readonly enforce?: boolean }): WorkflowApproveResult
```

**Parameters:**
- `req: WorkflowApproveRequest` — { repoPath, artifactPath? | epicHash?, overrideReview? } — the approval target(s) and optional override.
- `opts: { readonly enforce?: boolean }` _(optional)_ — Test-only seam overriding the codeReview.enforce config flag; production call sites omit it so config governs.

**Returns:** `WorkflowApproveResult` — { approved[], skipped[], codeReview[] } — unchanged shape. The new behavior: inside approveOne, for a story-scoped BUILD artifact (id prefix BUILD-) under EFFECTIVE enforcement, a gate status of 'no-review' is now treated as a completion WITHHOLD (routed to skipped[] with a distinct 'completion requires a code review' reason) instead of proceeding to stamp approvedAt. 'blocked' still withholds; 'pass'/'warn'/'overridden' still complete; overrideReview still bypasses. Every non-BUILD artifact, and every approval when enforcement is off, is byte-identical to today.

**Errors:**
- `ArtifactMissingError` when Single artifactPath resolves to a non-existent json (unchanged).
- `NoPendingArtifactsError` when epicHash batch with zero pending artifacts (unchanged; may now be reached via BUILD-only epics).

**Preconditions:**
- The code-review gate step already runs in approveOne for story-scoped artifacts (meta.epicHash && meta.storyId) — S007 wiring; this story only adds the BUILD-under-enforce 'no-review => withhold' layer on top of the existing gate result.
- Effective enforcement is resolved consistently with enforceCodeReviewGate: opts.enforce when provided, else the codeReview.enforce config flag (default false).

**Postconditions:**
- Under enforcement, a BUILD cannot be completed (approvedAt stamped) unless a PRESENT, non-block CR record exists (or an explicit overrideReview is supplied) — the completion gate now bites for the absent-record case, closing the motivating gap.
- The withhold outcome is surfaced on the existing WorkflowApproveResult.codeReview[] entry (status carries the withheld 'no-review' meaning + a message); approved[]/skipped[] semantics preserved (non-lossy).
- meta.review handling is untouched — the code-review completion gate stays a SEPARATE check over body.verdict (k8).

## Data model changes

### `approveWorkflowTarget completion semantics (approveOne)` — invariant-change

New invariant scoped to BUILD-under-enforcement: gate status 'no-review' WITHHOLDS BUILD completion rather than proceeding. Before: 'no-review' always fell through to approveArtifactByJsonPath. After: for a BUILD id-prefixed artifact with effective enforcement, 'no-review' routes to skipped[] ('completion requires a code review; none was run'). No new persisted field — reuses BUILD.meta.approvedAt (stamped by the generic approveArtifactByJsonPath) as the completion marker.

```
// approveOne, after the existing gate call (BUILD only, effective enforce):
// if isBuild && effectiveEnforce && gate.status === 'no-review' => skipped[] + return (no approvedAt)
```

**Call sites:**
- `src/workflow/gates.ts:591`
- `src/workflow/gates.ts:646`

### `pendingArtifactJsonPaths epic-batch sweep set` — invariant-change

The batch sweep filename regex prefix alternation widens from ^(DEF|HLD|LLD|PLAN)-<hash>(-.*)?\.json$ to include BUILD, so pending BUILD artifacts are members of the epic-batch approval set. No downstream consumer reads BUILD.approvedAt today, so widening the set breaks nothing.

```
- const re = new RegExp(`^(DEF|HLD|LLD|PLAN)-${epicHash}(-.*)?\.json$`);
+ const re = new RegExp(`^(DEF|HLD|LLD|PLAN|BUILD)-${epicHash}(-.*)?\.json$`);
```

**Call sites:**
- `src/workflow/gates.ts:587`

## Error paths

### Error cases

- **A BUILD md path passed for single approve has no insrc:artifact marker, or its resolved BUILD json is missing.** (recoverable)
  - Detection: jsonPathForMd falls back to swapExt path; approveWorkflowTarget's existsSync(jsonPath) check fails before approveOne.
  - Response: Throws ArtifactMissingError (unchanged) — surfaced to the caller, NOT routed to skipped[]. The new BUILD-completion branch never runs (no meta read).
  - User impact: Clear 'No artifact at <path>' error; the user rebuilds or points at the correct md.
- **A BUILD json is corrupt / has no meta (no epicHash/storyId).** (recoverable)
  - Detection: readArtifactMeta JSON.parse throws => returns undefined (or meta lacks storyId), so the story-scoped gate branch is skipped; approveArtifactByJsonPath then hits its own 'has no meta' throw.
  - Response: The gate + BUILD-completion layer are byte-identical no-ops (meta undefined). The subsequent approveArtifactByJsonPath error is not a ReviewBlockedError, so approveOne rethrows it (single) — surfaced, not silently skipped.
  - User impact: The malformed BUILD surfaces a real error rather than a false completion; consistent with today's non-BUILD behavior.
- **codeReview.enforce config file is unreadable/absent when resolving effective enforcement for a BUILD.** (recoverable)
  - Detection: readEnforceFlag's try/catch returns false (fail-safe) when opts.enforce is not provided.
  - Response: Effective enforcement resolves to false => the BUILD-under-enforce 'no-review => withhold' layer does NOT trigger; completion proceeds fail-open exactly as today.
  - User impact: A broken/absent config never hard-fails or spuriously withholds a completion; enforcement is opt-in and safe-by-default.

### Edge cases

| Input | Expected |
| :--- | :--- |
| BUILD, effective enforce ON, CR verdict 'warn' (or advisory demoted warn). | Completes (approvedAt stamped) — warn is non-block; codeReview[] records status 'warn'. The withhold applies ONLY to 'no-review' and 'blocked'. |
| BUILD, effective enforce ON, ABSENT CR record, but req.overrideReview supplied. | The no-review withhold is bypassed (an explicit override reason is a deliberate completion assertion) — BUILD completes; the override is recorded on the codeReview[] outcome, mirroring the block-override path. |
| Non-BUILD artifact (e.g. LLD), effective enforce ON, ABSENT CR record. | Unchanged: gate 'no-review' falls through and the artifact is approved. The require-review withhold is scoped to BUILD only (the completion act). |
| BUILD, effective enforce OFF, ABSENT CR record. | Completes (fail-open default); codeReview[] records 'no-review'. Byte-identical to pre-story behavior. |
| Epic batch (enforce ON) with a pending BUILD lacking a CR + a pending LLD that is review-clean. | Non-lossy split: the BUILD is withheld into skipped[] ('completion requires a code review'); the LLD is approved. Both surfaced; nothing dropped. |
| BUILD already carrying meta.approvedAt. | Excluded from the widened pendingArtifactJsonPaths sweep (approvedAt present), exactly as already-approved DEF/HLD/LLD/PLAN are. |

### Invariants to preserve

- enforceCodeReviewGate keeps its GENERIC fail-open contract: absent / malformed / unknown-verdict => no-review, and it never throws. The new 'require review present' behavior is layered in approveOne (BUILD + effective-enforce only), NOT inside the gate helper — so every other caller of the gate is unaffected. [[c4]]
- The code-review completion gate is a SEPARATE check over the CR body.verdict and NEVER merges into meta.review (k8). The BUILD-completion layer only reads the gate result; meta.review approval logic in approveArtifactByJsonPath is untouched. [[c2]]
- approveWorkflowTarget stays NON-LOSSY: every target lands in exactly one of approved[] / skipped[], with codeReview[] as the additive gate surfacing. The new withhold routes to skipped[] (not dropped) and returns without stamping approvedAt. [[c1]]
- Story-completion reuses BUILD.meta.approvedAt (stamped by the generic approveArtifactByJsonPath) as the completion marker — NO new persisted field is introduced, and no existing consumer of approvedAt changes meaning. [[c5]]
- Single-artifact BUILD approval already resolves via the insrc:artifact marker (jsonPathForMd) and fires the gate; this story must not regress that path — only add batch inclusion + the BUILD-under-enforce withhold. [[c3]]

## Test strategy

**Test framework:** `node:test + node:assert/strict via `npx tsx --test` (matching src/workflow/__tests__/approve-workflow-target.test.ts and approve-codereview-gate.test.ts)`

### Test levels

- **unit** — Prove the widened epic-batch sweep + the BUILD-under-enforce completion semantics over temp BUILD artifact json + temp CR-<epic>-<story>.json under a tmp repo, with codeReview.enforce injected via the opts.enforce seam. Same fake-file harness the existing gates tests use; no live daemon/graph/config.
  - Subjects: `pendingArtifactJsonPaths: a pending BUILD-<hash>-<story>.json (no approvedAt) is now a member of the epic-batch sweep (ac1); an already-approved BUILD is excluded`, `approveWorkflowTarget (single BUILD by json path): effective enforce ON + CR verdict 'pass' => completes (approvedAt stamped), codeReview[] records 'pass' — no regression of the existing single-path gate firing (ac2)`, `approveWorkflowTarget: BUILD + effective enforce ON + ABSENT CR record => WITHHELD into skipped[] ('completion requires a code review'), meta.approvedAt NOT stamped, codeReview[] records the no-review withhold (ac3)`, `approveWorkflowTarget: BUILD + effective enforce ON + ABSENT CR + req.overrideReview => completes (approvedAt stamped), the override recorded on codeReview[] (ac4)`, `approveWorkflowTarget: BUILD + effective enforce ON + CR verdict 'block' (no override) => withheld into skipped[], codeReview[] 'blocked' (ac5)`, `approveWorkflowTarget: BUILD + effective enforce OFF + ABSENT CR => completes byte-identical to today (codeReview[] 'no-review'); AND a non-BUILD LLD + enforce ON + ABSENT CR => completes (the require-review withhold is BUILD-scoped) (ac6)`, `approveWorkflowTarget: the completion gate is DISTINCT from meta.review (a clean meta.review + BUILD withheld only by the code-review gate); an epic batch with a withheld BUILD + a clean LLD splits non-lossy (BUILD skipped, LLD approved) (ac7)`
  - Fixtures: `A tmp repo dir with .insrc/artifacts; a BUILD-<hash>-<story>.json (meta.epicHash+storyId, optionally meta.review) written directly; a CR-<epic>-<story>.json (verdict pass/warn/block, or omitted for absent) via codeReviewArtifactPaths`, `opts.enforce injected true/false into approveWorkflowTarget so the config read is bypassed`, `node:test + node:assert/strict via npx tsx --test; the src/workflow/__tests__ layout (extend approve-codereview-gate.test.ts / a new sibling)`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: 'pendingArtifactJsonPaths includes a pending BUILD in the epic-batch sweep; excludes an already-approved BUILD'` |
| `ac2` | `unit: 'single BUILD approve, enforce ON + CR pass => completes, codeReview[] pass (existing single-path gate firing not regressed)'` |
| `ac3` | `unit: 'BUILD + enforce ON + absent CR => withheld into skipped[], no approvedAt, codeReview[] records the no-review withhold'` |
| `ac4` | `unit: 'BUILD + enforce ON + absent CR + overrideReview => completes, override recorded on codeReview[]'` |
| `ac5` | `unit: 'BUILD + enforce ON + CR block => withheld into skipped[], codeReview[] blocked'` |
| `ac6` | `unit: 'BUILD + enforce OFF + absent CR => completes byte-identical'`, `unit: 'non-BUILD LLD + enforce ON + absent CR => completes (withhold is BUILD-scoped)'` |
| `ac7` | `unit: 'clean meta.review + BUILD withheld only by the code-review gate (distinct from meta.review)'`, `unit: 'epic batch: withheld BUILD + clean LLD => BUILD skipped, LLD approved (non-lossy)'` |

## Migration

**State before:** pendingArtifactJsonPaths matches only ^(DEF|HLD|LLD|PLAN)-<hash>(-.*)?\.json$, so epic-batch approve never sweeps BUILD artifacts (s1 bundle 1: gates.ts:587). approveWorkflowTarget's approveOne already runs the code-review gate for story-scoped artifacts (S007 wiring) but treats gate status 'no-review' as a fall-through to approveArtifactByJsonPath => under codeReview.enforce ON, an ABSENT CR record still completes a BUILD silently (s1 bundle 4: gate.ts:66/74). BUILD.meta.approvedAt is never stamped or read in production (s1 bundle 5: admitBuild gates on an approved PLAN and consumes it).

**State after:** BUILD is a first-class approval target: the batch sweep includes BUILD, and under effective enforcement a BUILD completion requires a PRESENT, non-block CR record (gate 'no-review' => withhold into skipped[], no approvedAt) unless an explicit overrideReview is given. Non-BUILD approvals and enforce-off remain byte-identical to today. Story-completion = BUILD.meta.approvedAt stamped, gated by the code review.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Widen the pendingArtifactJsonPaths filename-prefix alternation to include BUILD (add BUILD to the DEF|HLD|LLD|PLAN group). Pure inclusion; already-approved BUILDs stay excluded by the existing approvedAt check. — ↩ rollbackable
2. In approveOne, after the existing code-review gate call, add a BUILD-scoped layer: when the artifact id/prefix is BUILD- AND effective enforcement is on AND the gate status is 'no-review' (and no overrideReview), route the artifact into skipped[] with a distinct 'completion requires a code review' reason and return without stamping. 'blocked' already withholds; 'pass'/'warn'/'overridden' still complete. — ↩ rollbackable
3. Resolve effective enforcement once, consistently with enforceCodeReviewGate (opts.enforce when provided, else the codeReview.enforce config flag defaulting false), and reuse it for both the gate call and the new BUILD withhold so the two never disagree. — ↩ rollbackable
4. Extend the fake-file unit suite with BUILD artifacts covering the widened sweep + the completion branch table (absent/withheld, override-bypass, block, warn/pass-complete, enforce-off byte-identical, non-BUILD unaffected, non-lossy batch split). — ↩ rollbackable

**Backward compat:** Strictly additive. The only public-ish surface is approveWorkflowTarget / pendingArtifactJsonPaths (internal to the workflow module; reached via the workflow.approve IPC + insrc_workflow_approve). Signatures are unchanged. Behavior change is confined to BUILD artifacts UNDER effective enforcement (codeReview.enforce ON): a BUILD with no code review can no longer be silently completed. With enforcement OFF (the default), and for every non-BUILD artifact, behavior is byte-identical. No existing consumer reads BUILD.approvedAt, so widening the batch sweep breaks nothing. overrideReview remains the escape hatch.

## Alternatives considered

### a1: Batch-inclusion only (gate unchanged, fully fail-open)

Widen pendingArtifactJsonPaths to include BUILD; BUILD becomes a batch approval target; the gate keeps its exact current fail-open behavior.

Single change of surface: extend the epic-batch sweep regex in pendingArtifactJsonPaths from ^(DEF|HLD|LLD|PLAN)- to include BUILD, so an epicHash batch approve stamps pending BUILD artifacts too (single-artifact BUILD approve already works via jsonPathForMd + the existing approveOne gate step). 'Story-completion' is defined purely as BUILD.meta.approvedAt being stamped. The code-review gate guards it exactly as it guards any story-scoped approval today: a PRESENT block verdict withholds (under enforce), and an ABSENT CR record stays no-review => completion proceeds. No new field, no new require-review rule. The completion act is: run the code review (S008 controller path) to produce CR-<epic>-<story>.json, THEN approve the BUILD.

**Rejected because:** Winner-rank 2. Correct and minimal but leaves k-gate-meaningful only PARTIAL — a BUILD with no CR record still completes silently under enforcement, so the feature's central purpose (a completion that provably required a review) is unmet. Good fallback, not the winner.

### a2: Batch-inclusion + require-present-review for BUILD completion under enforce — **CHOSEN**

Widen the sweep AND, only for a BUILD completion under codeReview.enforce ON, require a PRESENT non-block CR record — an absent/no-review record withholds completion instead of failing open.

Two additive changes. (1) Extend pendingArtifactJsonPaths to include BUILD (as a1). (2) Add a BUILD-scoped completion rule layered on TOP of the existing gate result (not inside enforceCodeReviewGate, keeping that helper's generic fail-open contract intact): in approveOne, when the artifact is a BUILD (id/prefix BUILD-) AND enforcement is effective, treat a gate status of 'no-review' as a WITHHOLD ('completion requires a code review; none was run') routed to skipped[] with a distinct reason, rather than proceeding. 'blocked' still withholds; 'pass'/'warn'/'overridden' still complete; overrideReview still bypasses (records the override). For every non-BUILD artifact, and whenever enforcement is off, behavior is byte-identical to today (fully fail-open). The completion outcome is surfaced on the existing WorkflowApproveResult.codeReview[] entry (reuse; the 'no-review-withheld' case gets a clear message). Story-completion = BUILD approved, and under enforcement that approval is provably gated on a review having run and not blocked.

### a3: First-class completion status (meta.completedAt distinct from approvedAt)

Model story-completion as its own stamped status (meta.completedAt + a completion outcome), separate from the generic approvedAt, gated by the code review.

Introduce a distinct completion concept rather than overloading approvedAt: a BUILD gains meta.completedAt (and optionally a CompletionOutcome record) stamped by a dedicated completion path that runs the code-review gate. approvedAt on DEF/HLD/LLD/PLAN keeps its current meaning; BUILD 'completion' is a new verb with its own result field, batch sweep, and possibly its own IPC/MCP surface. The gate guards completedAt specifically; absent-review handling is a policy on the completion path.

**Rejected because:** Winner-rank 3. Best-in-class separation but VIOLATES k-minimal-surface: L cost, broad approvedAt-vs-completedAt fallout, and a second unused-until-wired field for a gap a2 closes additively at S. Disproportionate for a standalone feature.

## Citations

- **[[c1]]** `analyze-bundle` `s1 symbol.locate — approveWorkflowTarget + approveOne gate step + pendingArtifactJsonPaths (src/workflow/gates.ts:586/591/587/646): the non-lossy approval whose approveOne already runs the S007 gate; the batch sweep regex excludes BUILD.`
- **[[c2]]** `analyze-bundle` `s1 symbol.locate — approveArtifactByJsonPath + WorkflowApproveRequest/Result (src/workflow/gates.ts:488/547/556): generic meta.approvedAt stamp + meta.review gate distinct from the code-review gate (k8); result already carries codeReview[].`
- **[[c3]]** `analyze-bundle` `s1 usage.example — jsonPathForMd (src/workflow/gates.ts:488; storage.ts:293/56): resolves a BUILD md's insrc:artifact marker to its hash-named json, so single-artifact BUILD approve already fires the gate.`
- **[[c4]]** `analyze-bundle` `s1 symbol.locate — enforceCodeReviewGate + codeReviewArtifactPaths (src/workflow/code-review/gate.ts:66/74; storage.ts:318): CodeReviewGateResult union + fail-open contract (absent/malformed => no-review); the gate the completion act guards.`
- **[[c5]]** `analyze-bundle` `s1 data-model.trace — BUILD artifact production + admitBuild (src/workflow/storage.ts:163/293; runners/build/__tests__/admit-build.test.ts:146): admitBuild gates on an approved PLAN and consumes it; BUILD.approvedAt is never stamped or read in production.`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 0 LOW** · model `client` · reviewed 2026-08-04T12:32:48.606Z

_No load-bearing premises were extracted._
