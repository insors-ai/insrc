<!-- insrc:artifact PLAN-1703991c69967193-s3 -->

# Plan: E202609181703991c:S003

**Epic:** `add-bugfix-triage-category-insrc-framework`
**LLD run:** `wf-1789737573900-72sf3a`
**LLD effective hash:** `e08e0c0d9f7b...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add the parent-locator value types | S | — | unit: ParentLocation shape invariant: parentRef non-null iff tier!=='standalone'; confidence >= threshold whenever attached | [[c1]] [[c2]] |
| 2 | **`t2`** Add the daemon-side inferParentCandidates function | M | `t1` | unit: inferParentCandidates: a touched path whose entity is owned by a story's artifacts yields a graph RankedCandidate with that WorkItemRef + cited evidence; unit: inferParentCandidates: unindexed path contributes no graph candidate; other paths still resolve; unit: inferParentCandidates: returns raw scores only; no filtering/threshold applied (policy stays in the controller); unit: inferParentCandidates: embeds are issued serially (for...of), not Promise.all | [[c2]] [[c3]] [[c4]] |
| 3 | **`t3`** Register the inferParentCandidates daemon IPC method + mirror its type | S | `t2` | integration: IPC method dispatches to inferParentCandidates and returns InferredCandidates; UnregisteredRepoError on an unregistered repoPath | [[c2]] [[c6]] |
| 4 | **`t4`** Add the controller-side locateParent tier policy | M | `t1`, `t3` | unit: locateParent: tier-1 explicit-ref hit -> tier='deterministic', short-circuits (inferCandidates never called) | [[c1]] [[c5]] [[c7]] |
| 5 | **`t5`** Unit-test the locateParent policy with fabricated deps | M | `t4` | unit: locateParent: graph candidate >= threshold -> tier='graph-ownership', semantic pass skipped (short-circuit); unit: locateParent: graph empty/below-threshold, semantic >= threshold -> tier='semantic'; unit: locateParent: nothing clears threshold -> promptForRef called; a resolvable ref -> attached, an unresolvable/empty ref -> tier='standalone', parentRef=null; unit: locateParent: tied graph candidates at/above threshold -> defers to prompt (no arbitrary pick); unit: locateParent: inferCandidates rejects/times out -> degrades to prompt then standalone, never throws, never auto-attaches; unit: locateParent: empty defectDescription -> semantic tier skipped, graph+prompt order preserved; unit: locateParent: stale explicitRef (resolveRef returns null) -> falls through to inference tiers | [[c5]] |
| 6 | **`t6`** Test inferParentCandidates + end-to-end locate | M | `t2`, `t4` | integration: End-to-end locate: touched paths under an existing story's artifacts -> graph attach with grounded evidence; integration: End-to-end locate: unrelated touched paths + a defect description matching a story's artifact prose -> semantic attach; integration: End-to-end locate: neither matches -> prompt -> standalone | [[c2]] [[c3]] [[c5]] |

### E202609181703991c:S003:T001 — Add the parent-locator value types

Declare the additive types in the workflow layer (co-located with the locator module): LocateTier ('deterministic'|'graph-ownership'|'semantic'|'prompt'|'standalone'), ParentLocation { tier; parentRef: WorkItemRef|null; confidence; evidence: readonly string[] }, RankedCandidate { parentRef: WorkItemRef; score; evidence }, InferredCandidates { graph: readonly RankedCandidate[]; semantic: readonly RankedCandidate[] }, LocateParentInput { touchedPaths; defectDescription; explicitRef? }, LocateParentDeps { repoPath; resolveRef; inferCandidates; promptForRef; thresholds: LocateThresholds }, and LocateThresholds { graph: number; semantic: number }. Reuse the existing WorkItemRef (types.ts:417-421) verbatim; do NOT touch meta.parentRef.

**Acceptance checks:**
- All seven types compile under strict mode with readonly fields; LocateTier is a 5-member union in the fixed order; ParentLocation.parentRef is WorkItemRef | null.
- No change to WorkItemRef or ArtifactMetaBase.parentRef; tsc clean.

### E202609181703991c:S003:T002 — Add the daemon-side inferParentCandidates function

Implement inferParentCandidates(db: DbClient, req: { touchedPaths; defectDescription; repoPath }): Promise<InferredCandidates> daemon-side. FIRST resolve readArtifactCore's visibility: it is currently module-private in storage.ts (line 213) — export it or add a sibling accessor before composing it. Graph tier: map each touched path to its indexed entity, expand via findCallers/inNeighbors (src/db/search.ts, src/db/graph/edges.ts), map owning entities back to a work item through the artifact tree (listWorkItems/listArtifactMdPaths + readArtifactCore), producing RankedCandidate[] with raw score + cited evidence. Semantic tier: embed(defectDescription) (serial, never Promise.all) then artifact-vec ANN (src/db/lance/artifact-vec.ts) over epic/story artifact vectors. Returns raw scores ONLY — no threshold, no attach decision. Empty candidates is a valid empty array, not an error.

**Acceptance checks:**
- Returns { graph, semantic } RankedCandidate arrays; a touched path owned by a story's artifacts yields a graph candidate carrying that WorkItemRef + evidence.
- An unindexed touched path contributes no graph candidate but does not throw; all-unindexed yields graph:[].
- No threshold/filter is applied inside the function; embeds are issued serially (for...of).
- readArtifactCore is reachable from the daemon inference (exported or via a sibling accessor); tsc + existing db test subset green.

### E202609181703991c:S003:T003 — Register the inferParentCandidates daemon IPC method + mirror its type

Add a new additive daemon IPC method that exposes inferParentCandidates, wiring it into the daemon handler registry (src/daemon/index.ts). Mirror the request/response payload types to the IDE fork per the IPC lock-step rule. Additive only — no existing method signature changes. Guard the method behind the existing bugfixCategory feature flag where the registry supports flag-gating.

**Acceptance checks:**
- The new IPC method is registered and dispatches to inferParentCandidates; no existing IPC method signature changes.
- An UnregisteredRepoError propagates when repoPath is not in the registry (rule 6).
- tsc clean; the mirrored payload type matches the daemon-side InferredCandidates shape.

### E202609181703991c:S003:T004 — Add the controller-side locateParent tier policy

Implement locateParent(input: LocateParentInput, deps: LocateParentDeps): Promise<ParentLocation> as a pure injectable-deps policy. Enforce the fixed order: tier-1 deterministic (deps.resolveRef on input.explicitRef; on hit short-circuit, never call inferCandidates); else tier-2 graph-ownership and tier-3 semantic over deps.inferCandidates results, applying deps.thresholds with short-circuit on a threshold-clearing earlier tier; tier-4 prompt (deps.promptForRef) when nothing clears / ties / near-miss; tier-5 standalone (parentRef:null). Handle all error/edge paths from the LLD: inferCandidates rejection -> degrade to prompt/standalone (never throw, never auto-attach); stale explicitRef (resolveRef null) -> fall through; empty defectDescription -> skip semantic; candidate with missing artifacts -> drop. Returns pure data; does NOT persist meta.parentRef. Add the IPC-client shim satisfying deps.inferCandidates.

**Acceptance checks:**
- Fixed tier order honored; a tier-1 explicit-ref hit or a threshold-clearing graph hit short-circuits later tiers (inferCandidates not called on the tier-1 hit).
- parentRef is non-null for every tier except 'standalone'; confidence >= the tier threshold whenever an attach is made (lc1).
- inferCandidates rejection/timeout degrades to prompt then standalone without throwing; malformed input (no paths, no description, no ref) is the only thrown case.
- tsc clean.

### E202609181703991c:S003:T005 — Unit-test the locateParent policy with fabricated deps

Add unit tests (node:test via tsx) that inject a fake LocateParentDeps (stub resolveRef, stub inferCandidates returning hand-built InferredCandidates, stub promptForRef, fixed LocateThresholds) to pin every tier-policy branch and the lc1 guarantees without a DB: tier-1 short-circuit, graph>=threshold, semantic>=threshold, tied-graph->prompt, below-threshold->prompt, nothing->prompt->standalone, inferCandidates-rejection degrade, empty-defectDescription skip-semantic, stale-explicitRef fall-through, and the ParentLocation shape invariant (parentRef null iff standalone).

**Acceptance checks:**
- Every locateParent subject from the LLD test strategy has a passing test; ac1/ac2/ac3 policy branches covered.
- Tests use fabricated deps only (no DB, no daemon) and run in the fast workflow subset.
- npx tsx --test on the new file is green.

### E202609181703991c:S003:T006 — Test inferParentCandidates + end-to-end locate

Add tests for the daemon inference (t2) over injected db stubs or a small seeded LMDB graph + Lance artifact-vec fixture: a touched path owned by a story yields a graph RankedCandidate + evidence; unindexed path contributes none; raw-scores-only (no threshold); embeds serial. Add an integration test composing the controller policy with the fixture-backed inference end-to-end: graph attach, semantic attach, and neither->prompt->standalone. Reuse the existing workflow/db test harness; keep live services out (fake embed returns a deterministic vector).

**Acceptance checks:**
- inferParentCandidates tests assert ranking + evidence + no-threshold + serial embeds.
- End-to-end tests cover ac1 (graph attach), ac2 (semantic attach), ac3 (prompt->standalone).
- The relevant db + workflow test subsets are green locally via npx tsx --test.

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| locateParent: tier-1 explicit-ref hit -> tier='deterministic', short-circuits (inferCandidates never called) | `t4`, `t5` |
| locateParent: graph candidate >= threshold -> tier='graph-ownership', semantic pass skipped (short-circuit) | `t5` |
| locateParent: graph empty/below-threshold, semantic >= threshold -> tier='semantic' | `t5` |
| locateParent: nothing clears threshold -> promptForRef called; a resolvable ref -> attached, an unresolvable/empty ref -> tier='standalone', parentRef=null | `t5` |
| locateParent: tied graph candidates at/above threshold -> defers to prompt (no arbitrary pick) | `t5` |
| locateParent: inferCandidates rejects/times out -> degrades to prompt then standalone, never throws, never auto-attaches | `t5` |
| locateParent: empty defectDescription -> semantic tier skipped, graph+prompt order preserved | `t5` |
| locateParent: stale explicitRef (resolveRef returns null) -> falls through to inference tiers | `t5` |
| ParentLocation shape invariant: parentRef non-null iff tier!=='standalone'; confidence >= threshold whenever attached | `t1`, `t5` |
| inferParentCandidates: a touched path whose entity is owned by a story's artifacts yields a graph RankedCandidate with that WorkItemRef + cited evidence | `t2`, `t6` |
| inferParentCandidates: unindexed path contributes no graph candidate; other paths still resolve | `t2`, `t6` |
| inferParentCandidates: returns raw scores only; no filtering/threshold applied (policy stays in the controller) | `t2`, `t6` |
| inferParentCandidates: embeds are issued serially (for...of), not Promise.all | `t2`, `t6` |
| End-to-end locate: touched paths under an existing story's artifacts -> graph attach with grounded evidence | `t6` |
| End-to-end locate: unrelated touched paths + a defect description matching a story's artifact prose -> semantic attach | `t6` |
| End-to-end locate: neither matches -> prompt -> standalone | `t6` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s3 contractDetails.locateParent + dataModelChanges.ParentLocation/LocateTier — the sc3 entry point + new value types (resolveWorkflowRef tier-1 at tracker/resolve.ts:292)`
- **[[c2]]** `prior-artifact` `LLD s3 contractDetails.inferParentCandidates + dataModelChanges.RankedCandidate/InferredCandidates — daemon graph tier (findCallers/inNeighbors, src/db/search.ts:186-197, src/db/graph/edges.ts:87-118); DB-only per rule 1`
- **[[c3]]** `prior-artifact` `LLD s3 — semantic tier reuse surface: searchEntityVecs (src/db/lance/entity-vec.ts) + artifact-vec ANN (src/db/lance/artifact-vec.ts:188) + embed(text):Promise<number[]> (providers), serial embeds`
- **[[c4]]** `prior-artifact` `LLD s3 — candidate enumeration + parentRef shape: listWorkItems/listArtifactMdPaths (path-scheme.ts:158-195), readArtifactCore (storage.ts:213, module-private), WorkItemRef (types.ts:417-421)`
- **[[c5]]** `prior-artifact` `LLD s3 chosenAlternative a1 + errorPaths + testStrategy — the fixed-order tier policy, lc1 deterministic-first/no-silent-wrong-attach, and every locateParent/inferParentCandidates test subject`
- **[[c6]]** `convention` `CLAUDE.md rules 1/4 + IPC lock-step — daemon owns all DB access; a new daemon IPC method is additive and mirrored to the IDE fork; UnregisteredRepoError on unregistered repo (rule 6)`
- **[[c7]]** `prior-artifact` `LLD s3 interactionWithShared + HLD sc3 (ownedByStory s3) + Epic k3/k6 — s3 implements sc3, consumes sc1, reuses existing resolver/graph/lance, does NOT stamp meta.parentRef (s4)`
