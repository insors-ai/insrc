<!-- insrc:artifact PLAN-dfc0371b7200f5b5-s001 -->

# Plan: E20260926dfc0371b:S001

**Epic:** `surface-bugfix-workflow-properly-so-first`
**LLD run:** `wf-1790422725372-b14sql`
**LLD effective hash:** `dfc0371b7200...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add optional additive followOn field to ApproveWorkflowTargetResult | S | — | unit: existing gate callers + tests compile with the optional followOn field (tsc --noEmit gate) | [[c5]] |
| 2 | **`t2`** Mount the bugfix seam in approveWorkflowTarget (deps-wire FIRST, then detect + call, guarded) | L | `t1` | unit: approveWorkflowTarget fires advanceBugfixAfterIssue exactly once for a completed 'issue' artifact (meta.issueHash present); unit: approveWorkflowTarget fires completeBugfixTracker for a completed bugfix BUILD artifact; unit: seam NOT called for a skipped (block-verdict) artifact; unit: seam NOT called for a non-bugfix approval (byte-for-byte identical result, followOn absent); unit: a rejecting seam is caught → followOn ok:false, approvedAt still stamped, approval not rethrown; unit: batch epicHash approval fires the seam per matching completed artifact only; unit: opts.bugfixCategory disabled → seam not invoked / skipped, no followOn entry | [[c1]] [[c5]] |
| 3 | **`t3`** Author bugfix guide section + triage-routed front-door mentions | M | — | integration: src/prompts/steering-block.md contains bugfix in the routing overview + workflow table + a guide marker section; integration: src/daemon/steering-inject.ts / src/mcp/steering-template.md reference bugfix | [[c4]] [[c6]] |
| 4 | **`t4`** Add guide-enumeration + triage-regression tests | M | `t1`, `t2`, `t3` | unit: listWorkflowGuides(steering-block.md) includes 'bugfix' after the marker is added; unit: guideGetResult({workflow:'bugfix'}) returns the bugfix section text; unit: existing keys + order unchanged (triage..tracker still present); unit: routeForSizeClass('bugfix','small') → startStage 'issue', small chain; unit: routeForSizeClass('bugfix','sized') → startStage 'issue', design→plan→build; unit: triage nextCall returns insrc_workflow_step workflow:'issue' for a bugfix result | [[c2]] [[c4]] |
| 5 | **`t5`** Rebuild + verify (tsc clean, asset copy, targeted sweep) | S | `t1`, `t2`, `t3`, `t4` | smoke: npm run build + targeted workflow/mcp/daemon test sweep both green; bugfix marker present in out/prompts/steering-block.md | [[c4]] [[c5]] |

### E20260926dfc0371b:S001:T001 — Add optional additive followOn field to ApproveWorkflowTargetResult

Extend the ApproveWorkflowTargetResult type in src/workflow/gates.ts with an optional `followOn?: FollowOnOutcome[]` where FollowOnOutcome = { kind: 'bugfix-advance' | 'bugfix-complete'; artifactPath: string; ok: boolean; note?: string }. Additive + optional so every existing caller compiles unchanged. No behaviour change in this task.

**Acceptance checks:**
- ApproveWorkflowTargetResult has an optional followOn field typed as the FollowOnOutcome[] union described.
- tsc --noEmit passes with no changes required at any existing call site (daemon/index.ts:610, mcp/server.ts:853, gate tests).

### E20260926dfc0371b:S001:T002 — Mount the bugfix seam in approveWorkflowTarget (deps-wire FIRST, then detect + call, guarded)

In approveWorkflowTarget (src/workflow/gates.ts), mount the existing bugfix seam. FIRST sub-step (open-risk mitigation from critique): locate the production readIssue + GH tracker deps already used elsewhere in src/workflow/ to construct real StampDeps / TrackerCloseDeps; if no production constructor exists, prefer a minimal injectable seam over inventing one, and if the deps genuinely cannot be built within this story's boundary raise it as an openQuestion rather than expanding scope. THEN: after an artifact lands in approved[] and approvedAt is stamped, add a guarded post-completion pass — per completed artifact detect the bugfix discriminant from meta (workflow==='issue' && meta.issueHash → advance; a completed bugfix BUILD → tracker completion), resolve issueHash + repo/repoPath, dynamically import src/workflow/bugfix, and call advanceBugfixAfterIssue / completeBugfixTracker with the real deps + the existing opts.bugfixCategory flag, inside try/catch, recording each outcome in followOn (ok:false + note on throw, never rethrow). Non-bugfix approvals take an early no-op path; skipped[] artifacts are never consulted. All orchestration logic stays inside src/workflow/bugfix/ (consume, do not reimplement).

**Acceptance checks:**
- The production StampDeps / TrackerCloseDeps are constructed from existing src/workflow/ machinery (or a minimal injectable seam); no bugfix orchestration internals are reimplemented in gates.ts.
- A completed 'issue' artifact (meta.workflow==='issue', meta.issueHash present) triggers advanceBugfixAfterIssue with {repoPath, issueHash, repo} + real StampDeps; outcome recorded in followOn.
- A completed bugfix BUILD artifact triggers completeBugfixTracker with {repoPath, issueHash} + real TrackerCloseDeps; outcome recorded in followOn.
- opts.bugfixCategory disabled → the seam is not invoked (or returns skipped) and no followOn advance/complete entry is produced.
- A seam that throws is caught → followOn entry ok:false with a note; approvedAt stays stamped and approveWorkflowTarget does not rethrow.
- Non-bugfix and skipped[] artifacts produce no followOn entry and the approved[]/skipped[]/block-verdict result is byte-for-byte unchanged from before.

### E20260926dfc0371b:S001:T003 — Author bugfix guide section + triage-routed front-door mentions

Add a `<!-- insrc:guide:bugfix:start -->` … `:end -->` marker section to src/prompts/steering-block.md with the full bugfix step-by-step procedure (brainstorm-if-rough → triage → issue → [design→plan if sized] → build → code-review → completion closes the GH issue). Per critique, phrase the front-door overview + workflow-table mention as 'a bug/defect → triage classifies it bugfix → issue stage → …' (triage-routed, NOT a hand-picked 'run bugfix' entry), keeping insrc_guide({workflow:'bugfix'}) as the procedure reference. Reference bugfix the same triage-routed way in src/daemon/steering-inject.ts and src/mcp/steering-template.md. Do not alter existing guide keys or their order.

**Acceptance checks:**
- src/prompts/steering-block.md contains a single insrc:guide:bugfix marker pair with a step-by-step procedure between the markers.
- The front-door overview + workflow table (and steering-inject.ts / steering-template.md) describe bugfix as triage-routed (bug → triage → bugfix → issue), not a directly hand-picked workflow.
- The existing guide marker keys (triage, brainstorm, define, design.epic, design.story, plan, build, review, code-review, tracker) and their order are unchanged.

### E20260926dfc0371b:S001:T004 — Add guide-enumeration + triage-regression tests

Add a guide-sections test that listWorkflowGuides now includes 'bugfix' and guideGetResult({workflow:'bugfix'}) returns the section with existing keys/order unchanged. Add/confirm a triage regression assertion that routeForSizeClass('bugfix', small|sized) still routes to startStage 'issue' and that the triage nextCall returns workflow:'issue' for a bugfix result. (The gate-mount behaviour tests are authored alongside t2; the steering-content assertions alongside t3.)

**Acceptance checks:**
- A guide-enumeration test asserts 'bugfix' is present in listWorkflowGuides output and the section text is returned, order unchanged.
- A triage regression test asserts routeForSizeClass('bugfix', small|sized) → startStage 'issue' and the nextCall workflow is 'issue'.
- All new + existing workflow/mcp/daemon tests pass under `npx tsx --test`.

### E20260926dfc0371b:S001:T005 — Rebuild + verify (tsc clean, asset copy, targeted sweep)

Run npm run build so tsc compiles and copy-assets.mjs propagates the updated steering-block.md to out/ (+ plugin copies). Verify tsc --noEmit is clean and run the targeted test subsets (workflow + mcp + daemon) green. This is the final integration/verification task.

**Acceptance checks:**
- npm run build succeeds; the bugfix marker section is present in the copied out/prompts/steering-block.md.
- tsc --noEmit is clean.
- The workflow + mcp + daemon test subsets pass.

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| approveWorkflowTarget fires advanceBugfixAfterIssue exactly once for a completed 'issue' artifact (meta.issueHash present) | `t2` |
| approveWorkflowTarget fires completeBugfixTracker for a completed bugfix BUILD artifact | `t2` |
| seam NOT called for a skipped (block-verdict) artifact | `t2` |
| seam NOT called for a non-bugfix approval (byte-for-byte identical result, followOn absent) | `t2` |
| a rejecting seam is caught → followOn ok:false, approvedAt still stamped, approval not rethrown | `t2` |
| batch epicHash approval fires the seam per matching completed artifact only | `t2` |
| listWorkflowGuides(steering-block.md) includes 'bugfix' after the marker is added | `t4` |
| guideGetResult({workflow:'bugfix'}) returns the bugfix section text | `t4` |
| existing keys + order unchanged (triage..tracker still present) | `t4` |
| routeForSizeClass('bugfix','small') → startStage 'issue', small chain | `t4` |
| routeForSizeClass('bugfix','sized') → startStage 'issue', design→plan→build | `t4` |
| triage nextCall returns insrc_workflow_step workflow:'issue' for a bugfix result | `t4` |
| src/prompts/steering-block.md contains bugfix in the routing overview + workflow table + a guide marker section | `t3` |
| src/daemon/steering-inject.ts / src/mcp/steering-template.md reference bugfix | `t3` |

## Citations

- **[[c1]]** `prior-artifact` `LLD S001 — bugfix orchestration seam advanceBugfixAfterIssue/completeBugfixTracker (src/workflow/bugfix/advance.ts:28,79) exported but unmounted; the mount consumes it, never reimplements.`
- **[[c2]]** `prior-artifact` `LLD S001 — triage already routes sizeClass='bugfix' to workflow:'issue' via routeForSizeClass (src/workflow/triage/classify.ts:50); regression-guard only.`
- **[[c4]]** `prior-artifact` `LLD S001 — insrc_guide validWorkflows is auto-derived from insrc:guide markers by listWorkflowGuides (src/daemon/guide-sections.ts:75); adding a bugfix marker is content-only.`
- **[[c5]]** `prior-artifact` `LLD S001 — approveWorkflowTarget (src/workflow/gates.ts:611) is the approve/completion choke point; add the additive optional followOn field + mount the seam here after approvedAt is stamped.`
- **[[c6]]** `prior-artifact` `LLD S001 — bugfix absent from all shipped steering/front-door assets (steering-block.md, steering-inject.ts, steering-template.md); net-new content.`
