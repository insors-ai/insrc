<!-- insrc:artifact LLD-dfc0371b7200f5b5-S001 -->

# LLD: E20260926dfc0371b:S001

**Epic:** `surface-bugfix-workflow-properly-so-first`
**HLD base run:** `wf-1790422725372-b14sql`
**HLD effective hash:** `dfc0371b7200...`

## HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## Contract details

**Surface level:** internal

### `approveWorkflowTarget`

```typescript
async function approveWorkflowTarget(input: { repoPath: string; artifactPath?: string; epicHash?: string; overrideReview?: string }): Promise<ApproveWorkflowTargetResult>
```

**Parameters:**
- `input.repoPath: string` — Registered repo the approval targets.
- `input.artifactPath: string` _(optional)_ — Single artifact to approve (mutually exclusive with epicHash).
- `input.epicHash: string` _(optional)_ — Batch-approve every pending artifact under the epic.
- `input.overrideReview: string` _(optional)_ — Explicit override reason that lets a review/code-review-blocked artifact through.

**Returns:** `ApproveWorkflowTargetResult` — Existing result (approved[], skipped[] with block reasons) EXTENDED with an optional followOn descriptor describing any post-approval seam that fired (e.g. bugfix advance / tracker completion). [c5]

**Errors:**
- `Error` when repo not registered / artifact path invalid — unchanged from current behaviour.

**Preconditions:**
- Artifact exists and is pending; existing review/code-review block gate is evaluated before completion. [c5]
- The seam must only be consulted for artifacts that actually completed (were added to approved[]), never for skipped[].

**Postconditions:**
- approvedAt stamped exactly as today. [c5]
- If a completed artifact is an approved 'issue' artifact (meta.issueHash present / workflow==='issue'), advanceBugfixAfterIssue was invoked and its outcome recorded in followOn. [c1]
- If a completed artifact is a bugfix BUILD reaching completion, completeBugfixTracker was invoked and its outcome recorded in followOn. [c1]
- Existing skipped[]/block-verdict semantics are byte-for-byte unchanged for non-bugfix artifacts. [c5]

### `advanceBugfixAfterIssue`

```typescript
async function advanceBugfixAfterIssue(input: { repoPath: string; issueArtifactPath: string }): Promise<BugfixAdvanceResult>
```

**Parameters:**
- `input.repoPath: string` — Repo the bugfix run belongs to.
- `input.issueArtifactPath: string` — The just-approved IssueArtifact path that triggers stamp→admit→nextAfterIssue.

**Returns:** `BugfixAdvanceResult` — The composed post-issue advance outcome (existing seam return — consumed as-is, not redesigned). [c1]

**Errors:**
- `Error` when Issue artifact missing required bugfix meta — surfaced from the existing seam; the mount catches and records rather than crashing the approve.

**Preconditions:**
- Called ONLY after the issue artifact has been approved (approvedAt stamped).
- The exact parameter shape is read from advance.ts:28 during build — the LLD consumes the existing signature and must not redefine it. [c1]

**Postconditions:**
- Bugfix chain advanced to its next stage per magnitude (small→build, sized→design→plan→build). [c3]

### `completeBugfixTracker`

```typescript
async function completeBugfixTracker(input: { repoPath: string; buildArtifactPath: string }): Promise<BugfixTrackerResult>
```

**Parameters:**
- `input.repoPath: string` — Repo the bugfix run belongs to.
- `input.buildArtifactPath: string` — The just-completed bugfix BUILD artifact whose approval closes the GH issue.

**Returns:** `BugfixTrackerResult` — Tracker-completion outcome (existing seam return — consumed as-is). [c1]

**Errors:**
- `Error` when GH tracker unavailable / issue already closed — surfaced from the existing seam; mount records it in followOn, does not fail the approval.

**Preconditions:**
- Called ONLY when a bugfix BUILD artifact reached completion (passed the code-review gate, added to approved[]).
- Exact parameter shape read from advance.ts:79 during build — consume, do not redefine. [c1]

**Postconditions:**
- The GH issue for the bugfix run is closed / the tracker is finalized. [c1]

## Data model changes

### `ApproveWorkflowTargetResult` — field-add

Add an optional `followOn?` field capturing any post-approval seam that fired: { kind: 'bugfix-advance' | 'bugfix-complete'; artifactPath: string; ok: boolean; note?: string }[]. Additive and optional so every existing caller (daemon workflow.approve, MCP insrc_workflow_approve, gate tests) compiles and behaves identically when no seam fires.

```
interface ApproveWorkflowTargetResult { approved: ...; skipped: ...; followOn?: FollowOnOutcome[] }
```

**Call sites:**
- `src/daemon/index.ts:610`
- `src/mcp/server.ts:853`
- `src/workflow/gates.ts:611`

## Error paths

### Error cases

- **advanceBugfixAfterIssue rejects (e.g. issue artifact missing required bugfix meta, or stamp/admit fails) after the issue artifact was already approved.** (recoverable)
  - Detection: The mount wraps the dynamically-imported seam call in try/catch; a rejected promise is caught at the await inside approveWorkflowTarget.
  - Response: Record a followOn entry { kind:'bugfix-advance', artifactPath, ok:false, note:<error message> } and continue — do NOT rethrow. approvedAt is already stamped, so the approval itself stands; the failed advance is surfaced, not swallowed.
  - User impact: The issue is approved but the chain did not advance; the controller sees ok:false in followOn and can re-drive the next stage manually.
- **completeBugfixTracker rejects (GH CLI unavailable, issue already closed, or network error) at bugfix BUILD completion.** (recoverable)
  - Detection: try/catch around the dynamically-imported completeBugfixTracker await.
  - Response: Record followOn { kind:'bugfix-complete', artifactPath, ok:false, note } and continue; the BUILD completion (approvedAt) is not rolled back.
  - User impact: BUILD is completed but the GH issue was not auto-closed; controller/user can close it manually. No corruption of the ledger.
- **Dynamic import of src/workflow/bugfix fails to resolve (module moved/renamed, or build artifact missing).** (recoverable)
  - Detection: The `await import('../workflow/bugfix/index.js')` (or equivalent) rejection is caught before the seam is invoked.
  - Response: Record a followOn ok:false with an import-failure note; approval proceeds unchanged.
  - User impact: Seam silently no-ops for that approval but the failure is visible in followOn; non-bugfix approvals are unaffected.
- **An 'issue'-workflow artifact reaches approval WITHOUT the meta the seam requires (e.g. meta.issueHash absent).** (recoverable)
  - Detection: A guard reads the completed artifact's meta before calling the seam; if the bugfix discriminant (workflow==='issue' && meta.issueHash) is not satisfied, the seam is not called.
  - Response: Skip the seam for that artifact (no followOn entry, or a followOn note explaining it was not a bugfix issue); approval unchanged.
  - User impact: No spurious advance is triggered for a non-conforming artifact.

### Edge cases

| Input | Expected |
| :--- | :--- |
| Batch approval via epicHash where the completed set contains BOTH an 'issue' artifact and an unrelated non-bugfix artifact. | The seam is evaluated per completed artifact: advanceBugfixAfterIssue fires only for the issue artifact; the non-bugfix artifact is untouched. followOn lists exactly the seams that fired. |
| An artifact that was WITHHELD into skipped[] by a review/code-review block verdict (no overrideReview). | The seam is NOT consulted for skipped artifacts — only approved[] entries are eligible. No followOn entry for it. |
| A bugfix BUILD artifact completed only because overrideReview was supplied for a code-review block. | It is in approved[] (completed), so completeBugfixTracker fires normally — completion, however reached, triggers tracker closure. |
| A completely non-bugfix approval (e.g. a normal design.story LLD) — the common case. | No bugfix discriminant matches; no seam import, no seam call, followOn absent/empty; behaviour byte-for-byte identical to today. |
| insrc_guide called after the new bugfix marker is added to steering-block.md. | listWorkflowGuides auto-derives 'bugfix' into validWorkflows with no code change; the existing keys and their order are unchanged; insrc_guide({workflow:'bugfix'}) returns the new section text. |

### Invariants to preserve

- The review/code-review block-verdict gating and skipped[] semantics are unchanged for every non-bugfix artifact: approveWorkflowTarget still withholds blocked completions into skipped[] exactly as before, and the seam never fires for a skipped artifact. [[c5]]
- approvedAt is stamped by approveArtifactByJsonPath on completion exactly as today; the seam runs AFTER stamping and never gates or reverts it. [[c5]]
- insrc_guide's validWorkflows is derived from steering-block.md marker pairs at runtime; adding a bugfix marker must add exactly one key and not alter the existing enumeration or per-key guidance text. [[c4]]
- All bugfix orchestration logic remains inside src/workflow/bugfix/ (advance.ts etc.); the mount only detects completion and calls the existing exported seam — it does not reimplement stamp/admit/nextAfterIssue/tracker. [[c1]]

## Test strategy

**Test framework:** `node:test (node --test / `npx tsx --test`) with node:assert/strict — the repo-wide convention; existing bugfix tests live in src/workflow/__tests__/bugfix-orchestration.test.ts and bugfix-tracker.test.ts.`

### Test levels

- **unit** — Prove the approve/completion mount fires the right seam for the right completed artifact and NEVER for skipped or non-bugfix artifacts, with the seam injected/faked so no real GH or filesystem side effects run.
  - Subjects: `approveWorkflowTarget fires advanceBugfixAfterIssue exactly once for a completed 'issue' artifact (meta.issueHash present)`, `approveWorkflowTarget fires completeBugfixTracker for a completed bugfix BUILD artifact`, `seam NOT called for a skipped (block-verdict) artifact`, `seam NOT called for a non-bugfix approval (byte-for-byte identical result, followOn absent)`, `a rejecting seam is caught → followOn ok:false, approvedAt still stamped, approval not rethrown`, `batch epicHash approval fires the seam per matching completed artifact only`
  - Fixtures: `in-memory / temp repo with a pending 'issue' artifact carrying meta.issueHash`, `a pending bugfix BUILD artifact`, `a non-bugfix design.story artifact`, `an injected/faked bugfix seam module (spy) so calls are asserted without side effects`
- **unit** — Prove insrc_guide surfaces the new bugfix key from the steering markers with no code change to the enumerator.
  - Subjects: `listWorkflowGuides(steering-block.md) includes 'bugfix' after the marker is added`, `guideGetResult({workflow:'bugfix'}) returns the bugfix section text`, `existing keys + order unchanged (triage..tracker still present)`
  - Fixtures: `the updated src/prompts/steering-block.md content (or a fixture copy) with the bugfix marker pair`
- **contract** — Regression-guard that triage still classifies + routes a declared bugfix to workflow:'issue' (already wired; must not regress).
  - Subjects: `routeForSizeClass('bugfix','small') → startStage 'issue', small chain`, `routeForSizeClass('bugfix','sized') → startStage 'issue', design→plan→build`, `triage nextCall returns insrc_workflow_step workflow:'issue' for a bugfix result`
- **integration** — Prove the front-door steering assets now advertise bugfix so the controller routes reflexively.
  - Subjects: `src/prompts/steering-block.md contains bugfix in the routing overview + workflow table + a guide marker section`, `src/daemon/steering-inject.ts / src/mcp/steering-template.md reference bugfix`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `listWorkflowGuides includes 'bugfix' + guideGetResult({workflow:'bugfix'}) returns the section`, `existing guide keys + order unchanged after adding the marker` |
| `ac2` | `routeForSizeClass('bugfix', small|sized) regression tests`, `triage nextCall → workflow:'issue' regression test` |
| `ac3` | `approveWorkflowTarget fires advanceBugfixAfterIssue for a completed issue artifact`, `approveWorkflowTarget fires completeBugfixTracker for a completed bugfix BUILD`, `seam not fired for skipped / non-bugfix artifacts`, `rejecting seam → followOn ok:false, approval stands` |
| `ac4` | `steering-block.md contains bugfix in overview + table + guide marker`, `steering-inject/steering-template reference bugfix` |

## Migration

**State before:** The bugfix flow is half-wired: triage classifies sizeClass='bugfix' + magnitude and routes to workflow:'issue' (triage/classify.ts:50, mcp/triage-step/phases/classify.ts:51), and the 'issue' stage runs end-to-end (types.ts:81, orchestrator.ts:154/272/385). BUT the orchestration seam advanceBugfixAfterIssue/completeBugfixTracker (advance.ts:28,79, re-exported index.ts:16) has ZERO production callers — approveWorkflowTarget (gates.ts:611) and the daemon workflow.approve handler (daemon/index.ts:610) have no bugfix awareness (grep 'bugfix|issue' in gates.ts = 0 hits). And bugfix appears NOWHERE in steering (steering-block.md, steering-inject.ts, steering-template.md = 0 hits), so insrc_guide does not enumerate it and the front door never routes to it.

**State after:** approveWorkflowTarget, after stamping approvedAt on a completed artifact, detects a completed bugfix 'issue' artifact and invokes advanceBugfixAfterIssue, and a completed bugfix BUILD and invokes completeBugfixTracker — recording each in an optional followOn field — while leaving skipped[]/block-verdict semantics unchanged for every non-bugfix artifact. steering-block.md carries a bugfix guide marker section (so insrc_guide auto-enumerates 'bugfix') plus bugfix mentions in the routing overview + workflow table, and steering-inject/steering-template reference bugfix, so the controller routes bugs to the tracked bugfix flow reflexively.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the optional additive `followOn?` field to the ApproveWorkflowTargetResult type. No existing caller reads it, so this is transparent. — ↩ rollbackable
2. In approveWorkflowTarget, after the existing completion/stamp step, add a guarded post-completion pass that (only for artifacts in approved[]) detects the bugfix discriminant from meta and dynamically imports + calls the existing seam, wrapping each call in try/catch and recording followOn. Non-bugfix approvals take an early no-op path. — ↩ rollbackable
3. Add a bugfix guide marker section (<!-- insrc:guide:bugfix:start/end -->) with the full step-by-step procedure to src/prompts/steering-block.md; the enumerator auto-derives it — no code change to guide-sections.ts. — ↩ rollbackable
4. Add bugfix mentions to the steering front-door: routing overview + workflow table in steering-block.md, and steering-inject.ts / steering-template.md, so the controller routes bugs to triage→issue reflexively. — ↩ rollbackable
5. Add/extend tests: gate-mount unit tests (seam fires for completed issue/build, not for skipped/non-bugfix, rejecting-seam → followOn ok:false), a guide-enumeration test (bugfix present, order unchanged), and triage-routing regression assertions. Then rebuild so out/ + copied steering assets refresh. — ↩ rollbackable

**Backward compat:** The only public-surface change is the ADDITIVE optional followOn field on ApproveWorkflowTargetResult — every existing caller (daemon/index.ts:610, mcp/server.ts:853, gate tests) compiles unchanged and behaves identically when no seam fires (followOn absent/empty). The seam runs only for bugfix artifacts in approved[], so non-bugfix approvals are byte-for-byte identical. No signature of approveWorkflowTarget's inputs changes. Steering additions are content-only and additive (existing guide keys + order preserved).

## Alternatives considered

### a1: Mount inside gates.ts approveWorkflowTarget (single choke point) — **CHOSEN**

Add bugfix awareness directly in approveWorkflowTarget so both the daemon IPC handler and MCP forwards trigger the seam.

Extend approveWorkflowTarget (gates.ts:611) so that after it stamps approvedAt on an artifact, it inspects the just-approved artifact's meta: if it is an approved 'issue' artifact (meta.issueHash / workflow==='issue'), invoke advanceBugfixAfterIssue; if it is a bugfix BUILD artifact reaching completion (and passing the existing review/code-review block gate), invoke completeBugfixTracker. The existing skipped[]/block-verdict semantics are preserved unchanged — the seam only fires on a genuinely completed approval. Return value gains an optional advance descriptor so callers can relay what happened next.

### a2: Mount in the daemon workflow.approve handler (orchestration layer)

Keep gates.ts pure; let the daemon handler post-process the approve result and fire the seam.

Leave approveWorkflowTarget unchanged but enrich its result to report which artifact(s) were actually completed (path + meta). The daemon 'workflow.approve' handler (index.ts:610) then inspects that result and, for a completed 'issue' artifact, calls advanceBugfixAfterIssue; for a completed bugfix BUILD, calls completeBugfixTracker. Orchestration lives at the daemon layer where dynamic imports and IPC side effects already happen.

**Rejected because:** Keeps gates pure but splits the 'what is a completed bugfix artifact' decision across two places and widens the return contract; weakest on c1/c3 (all-callers, minimal-surface) without a3's reusable-dispatcher upside.

### a3: Dedicated post-approval dispatcher module consumed by the daemon handler

Introduce a thin advanceAfterApproval dispatcher that maps a completed artifact to its follow-on seam, called once by the daemon handler.

Add a small dispatcher (e.g. src/workflow/after-approval.ts) exporting advanceAfterApproval(completed[]) that, per completed artifact, pattern-matches on workflow/stage/meta and calls the right follow-on — today only the bugfix seams (advanceBugfixAfterIssue, completeBugfixTracker), but structured so future workflows can register follow-ons. approveWorkflowTarget returns the completed set; the daemon handler calls the dispatcher once.

**Rejected because:** Cleanest layering and most testable, but adds indirection/new surface for one follow-on and leaves non-handler callers uncovered — loses to a1 on c1 (all-callers) and c3 (minimal-surface). Can be revisited if a second workflow later needs post-approval follow-ons.

## Citations

- **[[c1]]** `analyze-bundle` `src/workflow/bugfix/advance.ts:28,79 + index.ts:16 — bugfix orchestration seam (advanceBugfixAfterIssue, completeBugfixTracker) exported + unit-tested but with zero production callers.` — "The ONLY importers are tests (bugfix-orchestration.test.ts:29, bugfix-tracker.test.ts:36) — zero production callers. EXISTS + fully tested but UNMOUNTED."
- **[[c2]]** `analyze-bundle` `src/workflow/triage/classify.ts:50 + mcp/triage-step/phases/classify.ts:51 — triage already classifies sizeClass='bugfix' and routes to workflow:'issue'.` — "routeForSizeClass has a bugfix branch: small→issue→build, sized→issue→design→plan→build; nextCall returns workflow:'issue'. No triage code change needed — already wired."
- **[[c3]]** `analyze-bundle` `src/workflow/types.ts:81 + orchestrator.ts:154/272/385 — the 'issue' workflow stage is fully wired and runnable.` — "The 'issue' stage is a first-class, fully-wired workflow ... reachable today via insrc_workflow_step workflow:'issue'."
- **[[c4]]** `analyze-bundle` `src/daemon/guide-sections.ts:75 + src/prompts/steering-block.md marker pairs — insrc_guide validWorkflows is auto-derived from <!-- insrc:guide:<key>:start/end --> markers.` — "validWorkflows is NOT hardcoded — it is derived at runtime from marker pairs ... adding one is net-new content; the enumeration auto-picks it up with no code change."
- **[[c5]]** `analyze-bundle` `src/daemon/index.ts:610 + src/workflow/gates.ts:611 (approveWorkflowTarget) — the approve/completion choke point that stamps approvedAt and enforces review/code-review block verdicts.` — "approveWorkflowTarget batch/single approves, stamps approvedAt ... enforces review/code-review block verdicts, withholding completion into skipped[]. grep 'bugfix|issue' in gates.ts returns ZERO hits."
- **[[c6]]** `analyze-bundle` `src/prompts/steering-block.md + src/mcp/steering-template.md + src/daemon/steering-inject.ts — bugfix/issue absent from all shipped steering/front-door assets.` — "bugfix/issue appear NOWHERE in the shipped steering/front-door ... Net-new content required."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 5 LOW** · model `client` · reviewed 2026-09-26T11:48:52.593Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| c1 | citation | LOW | manual | advanceBugfixAfterIssue and completeBugfixTracker are exported at src/workflow/bugfix/advance.ts:28 and :79 and re-exported at index.ts:16. | grep + reads confirm `export async function advanceBugfixAfterIssue(` at advance.ts:28, `export async function completeBugfixTracker(` at advance.ts:79, and the re-export `export { advanceBugfixAfterIssue, completeBugfixTracker } from './advance.js';` at index.ts:16. | none — verified sound |
| c5 | citation | LOW | manual | approveWorkflowTarget is the approve/completion choke point in src/workflow/gates.ts and the daemon 'workflow.approve' handler in src/daemon/index.ts delegates to it. | read gates.ts:611 lands in the approveWorkflowTarget docblock ('Each artifact goes through approveArtifactByJsonPath'), confirming the choke point is in gates.ts; read daemon/index.ts:610 is the `'workflow.approve': async (params) => {` handler that delegates to it. | none — verified sound |
| c2 | citation | LOW | manual | routeForSizeClass in src/workflow/triage/classify.ts has a 'bugfix' case (line 50) routing to startStage 'issue'. | grep + read confirm `case 'bugfix': {` at src/workflow/triage/classify.ts:50; the prior-artifact docs corroborate it returns startStage 'issue'. | none — verified sound |
| c4 | citation | LOW | manual | listWorkflowGuides in src/daemon/guide-sections.ts derives validWorkflows by scanning GUIDE_START_RE marker pairs (not hardcoded). | grep confirms `const GUIDE_START_RE = /<!--\\s*insrc:guide:([A-Za-z0-9._-]+):start\\s*-->/g;` at guide-sections.ts:50 and read confirms `export function listWorkflowGuides(steeringText: string): string[]` at :75 — validWorkflows is marker-derived, not hardcoded. | none — verified sound |
| c3 | citation | LOW | manual | 'issue' is a registered workflow name in WORKFLOW_NAMES at src/workflow/types.ts:81. | read types.ts:81 confirms `'issue',` inside WORKFLOW_NAMES with the comment 'Bugfix flow — the defect issue record ... NAME only here'. | none — verified sound |
