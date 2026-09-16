<!-- insrc:artifact PLAN-761a43a6fa645815-s1 -->

# Plan: E20260803761a43a6:S001

**Epic:** `add-daemon-driven-code-review-stage`
**LLD run:** `wf-1785742820116-unucjl`
**LLD effective hash:** `47535369867a...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Declare the sc1/sc2/sc3 types in a new src/workflow/code-review/ module | S | — | unit: sc3 type-shape assertions: a representative DimensionResult literal exercises each ReviewDimension and compiles against DimensionFinding/DimensionResult; unit: type-level check that DimensionFinding.severity IS the Severity imported from src/workflow/review/types.ts (assignability both ways) | [[c3]] |
| 2 | **`t2`** Implement resolveCodeReviewSubject (sc1 resolver) | M | `t1` | unit: resolveCodeReviewSubject returns subject.changedFiles exactly equal to the fake GitDiffData.files (no extra/unrelated paths) and reads the build record for identity only (record not mutated); unit: requireApprovedLld/requireApprovedPlan throw-to-result mapping: missing LLD and unapproved PLAN each yield {ok:false, reason:'no-approved-contract'}; unit: gitDiffTool ToolError (unresolvable range) yields {ok:false, reason:'no-build-record'}; empty-diff yields {ok:true} with changedFiles=[]; unit: unregistered repo surfaces UnregisteredRepoError unchanged (not collapsed into a reason result); unit: resolver invokes no write/edit tool (tool-invocation spy fails on any mutating call) | [[c1]] |
| 3 | **`t3`** Implement assembleCodeReviewGrounding (sc2 producer) | M | `t1` | unit: assembleCodeReviewGrounding (entity lookup + caller/callee + testsReaching edges): returns ChangedSymbolSummary rows with no raw file-content field, over a small in-memory graph fixture; unit: omit-unindexed-file behaviour: a changedFiles list with one indexed + one unindexed + one non-code file yields symbols only for the indexed entities, none dropped from the subject; unit: per-symbol (not per-file) row keying: a file with multiple entities yields one row per entityId sharing the file path | [[c2]] |
| 4 | **`t4`** Register the codeReview.grounding daemon IPC handler | S | `t2`, `t3` | integration: the new 'codeReview.grounding' IPC handler returns CodeReviewGrounding over the socket for a tiny registered+indexed fixture repo; integration: a resolve+ground pass over the fixture repo leaves file bytes + mtimes identical before and after (byte/mtime snapshot) | [[c4]] |

### E20260803761a43a6:S001:T001 — Declare the sc1/sc2/sc3 types in a new src/workflow/code-review/ module

Create src/workflow/code-review/types.ts declaring ReviewDimension = 'adherence'|'conventions'|'coverage'|'quality', DimensionFinding + DimensionResult (importing Severity from src/workflow/review/types.ts — not redefining it), CodeReviewSubject + the discriminated CodeReviewSubjectResult, and ChangedSymbolSummary + CodeReviewGrounding. Type-only, purely additive; follows repo conventions (.js import extensions, import type). buildRecord is typed as the persisted build record (StandaloneBuildRecord), consumed for identity.

**Acceptance checks:**
- The module type-checks under strict mode and DimensionFinding.severity is the Severity imported from src/workflow/review/types.ts (not a local copy)
- ReviewDimension is the exact 4-member union; CodeReviewSubjectResult is a discriminated union with reason 'no-approved-contract'|'no-build-record'
- No existing file is modified (new module only)

### E20260803761a43a6:S001:T002 — Implement resolveCodeReviewSubject (sc1 resolver)

Add resolveCodeReviewSubject(repoPath, epicHash, storyId) that composes requireApprovedLld + requireApprovedPlan (catching ArtifactMissingError/ArtifactNotApprovedError => {ok:false, reason:'no-approved-contract'}) and derives changedFiles from gitDiffTool over the Story's build commit range (ToolError/unresolvable range => {ok:false, reason:'no-build-record'}); UnregisteredRepoError propagates unchanged. Read-only; the build record is read for identity only, never mutated.

**Acceptance checks:**
- ac1: subject.changedFiles equals the GitDiffData.files set exactly (no unrelated paths); the build record is read for identity only and not mutated
- ac2: missing/unapproved LLD or PLAN yields {ok:false, reason:'no-approved-contract'} with no subject/verdict; unresolvable range yields {ok:false, reason:'no-build-record'}
- An unregistered repo surfaces UnregisteredRepoError UNCHANGED — it is NOT collapsed into a no-approved-contract/no-build-record result (operator-misconfig path)
- ac5: the resolver invokes only read operations — no write/edit tool is called (files byte-unchanged)

### E20260803761a43a6:S001:T003 — Implement assembleCodeReviewGrounding (sc2 producer)

Add assembleCodeReviewGrounding(repoPath, changedFiles) that enumerates the graph entities in each changed file and builds ChangedSymbolSummary rows using the src/db/graph/edges.ts traversal API (callers via inNeighbors+CALLS filter, callees via outNeighbors, testsReaching via inNeighbors from test entities). If the graph store exposes no entity-by-file enumeration, adding that read-only helper is IN SCOPE for this task (additive + read-only — does not spill into t4). Omits files with no indexed entities (observably, not as 'no changes'); one row per entity keyed by entityId; no raw file contents. Read-only graph reads only.

**Acceptance checks:**
- ac3: returns ChangedSymbolSummary rows (entityId/signature/callers/callees/testsReaching) with NO raw file-content field
- edge cases: a changed file with no indexed entities is omitted from symbols but not dropped from the subject; a file with multiple entities yields one row per entity sharing the file path
- any entity-by-file helper added is read-only and additive (no graph-store mutation)
- ac5: only graph read operations are invoked — no mutation of the graph store or the working tree

### E20260803761a43a6:S001:T004 — Register the codeReview.grounding daemon IPC handler

Add a 'codeReview.grounding' request/response handler to the src/daemon/index.ts handler map (following the 'repo.reindex'/'workflow.approve' simple-handler shape) that resolves the subject and returns assembleCodeReviewGrounding's CodeReviewGrounding, so CLI/MCP consumers reach the summaries only through the daemon. Additive handler; no existing IPC method changed.

**Acceptance checks:**
- ac4: the 'codeReview.grounding' IPC handler returns a CodeReviewGrounding over the socket for a fixture repo, and no exported path lets a non-daemon surface open LMDB/Lance directly for these summaries
- ac5: a full resolve+ground pass over a fixture repo leaves every file byte-for-byte + mtime unchanged
- The handler entry is additive — existing IPC methods are unchanged

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| resolveCodeReviewSubject (ok:true subject; ok:false 'no-approved-contract'; ok:false 'no-build-record') | `t2` |
| the requireApprovedLld/requireApprovedPlan throw-to-result mapping | `t2` |
| the gitDiffTool GitDiffData.files -> subject.changedFiles derivation | `t2` |
| assembleCodeReviewGrounding (entity lookup + caller/callee + testsReaching edges) | `t3` |
| the omit-unindexed-file behaviour | `t3` |
| the per-symbol (not per-file) row keying | `t3` |
| the new 'codeReview.grounding' IPC handler returning CodeReviewGrounding over the socket | `t4` |
| a resolve+ground pass over a tiny real indexed fixture repo asserting file bytes + mtimes unchanged | `t4` |
| DimensionFinding/DimensionResult/ReviewDimension type-shape assertions | `t1` |
| a type-level check that DimensionFinding.severity IS the Severity imported from src/workflow/review/types.ts | `t1` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s1 contractDetails.api — resolveCodeReviewSubject (sc1 resolver: requireApprovedLld/requireApprovedPlan + gitDiffTool-derived changedFiles)`
- **[[c2]]** `prior-artifact` `LLD s1 contractDetails.api — assembleCodeReviewGrounding (sc2 producer over the src/db/graph traversal API)`
- **[[c3]]** `prior-artifact` `LLD s1 dataModelChanges — the sc1/sc2/sc3 new types (CodeReviewSubject/Result, ChangedSymbolSummary/CodeReviewGrounding, ReviewDimension/DimensionFinding/DimensionResult reusing Severity)`
- **[[c4]]** `prior-artifact` `LLD s1 migration step 4 — the new codeReview.grounding daemon IPC handler`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 6 LOW** · model `client` · reviewed 2026-08-03T08:17:13.240Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| t3 | citation | LOW | manual | src/db/graph/edges.ts exports inNeighbors and outNeighbors — the traversal functions t3's assembleCodeReviewGrounding uses for callers/callees/testsReaching. | outNeighbors at src/db/graph/edges.ts:87 and inNeighbors at :104 both confirmed — the traversal functions t3 uses for callers/callees/testsReaching exist. | none — verified sound |
| t4 | citation | LOW | manual | src/daemon/index.ts registers request/response IPC handlers including 'repo.reindex' and 'workflow.approve' — the simple-handler shape t4's new 'codeReview.grounding' handler mirrors. | 'workflow.approve' at src/daemon/index.ts:551 and 'repo.reindex' at :587 confirmed as simple `async (params) =>` handlers — the exact shape t4's new 'codeReview.grounding' handler mirrors. | none — verified sound |
| t1 | semantic | LOW | manual | src/workflow/code-review/ does not exist yet — t1 creates it as a new module (purely additive, no existing file modified). | The only match for 'code-review/types' is inside the plan doc itself (docs/plans/PLAN-add-daemon-driven-code-review-stage-s1.md) — no src/workflow/code-review/ file exists, confirming t1 creates a genuinely new module. | none — verified sound |
| t1 | citation | LOW | manual | Severity is exported from src/workflow/review/types.ts and is imported (not redefined) by t1's DimensionFinding. | Severity = 'HIGH'\|'MED'\|'LOW' at src/workflow/review/types.ts:41 — t1 imports it (not redefines). | none — verified sound |
| t2 | citation | LOW | manual | t2's reused seams all exist: requireApprovedLld (gates.ts:255), requireApprovedPlan (gates.ts:354), and gitDiffTool (git/diff.ts:54). | requireApprovedLld at src/workflow/gates.ts:255, requireApprovedPlan at :354, and gitDiffTool at src/daemon/tools/builtins/git/diff.ts:54 all confirmed — every seam t2 reuses exists at the cited location. | none — verified sound |
| tasks | inventory | LOW | manual | The plan enumerates exactly 4 tasks (t1-t4) with a valid dependency chain t1 -> {t2,t3} -> t4. | For this epic (E20260803761a43a6) the plan lists exactly T001-T004 (lines 18/27/37/47 of the plan doc); other S001:T00x matches are unrelated epics' plans. The dependency chain t1 -> {t2,t3} -> t4 was verified acyclic + topologically ordered at checklist.verify. | none — verified sound |
