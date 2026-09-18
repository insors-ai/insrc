<!-- insrc:artifact LLD-1703991c69967193-s3 -->

# LLD: E202609181703991c:S003

**Epic:** `add-bugfix-triage-category-insrc-framework`
**HLD base run:** `wf-1789726188697-irhvw2`
**HLD effective hash:** `e08e0c0d9f7b...`

## HLD context

**Framework:** Bugfix becomes a first-class, scope-gated category that reuses the existing stage/artifact/approve/tracker machinery end-to-end. Triage gains a new `bugfix` SizeClass carrying a magnitude (a small fix vs an M/L fix) and a route that is NOT a single fixed startStage but branches on that magnitude. The flow's first stage is a new first-class `issue` workflow whose synthesized IssueArtifact — reproduction + root cause + fix intent — is the single source of truth serving both the internal chain record and, later, the GitHub issue body. A tiered parent-locator (deterministic ref-resolver → graph code-ownership → semantic match → user prompt → standalone) attaches the fix to the epic/story whose behaviour it corrects, recording which tier decided and at what confidence, with auto-attach only above a high threshold. A scope-gated orchestrator then routes a small fix issue→build and an M/L fix issue→design→plan→build, with the existing post-build code-review gating completion; where a tracker is configured a GitHub issue is created from the same issue content, linked to the located parent, and closed on completion. All five constraints k1–k6 are satisfied by conforming to the framework's own conventions rather than inventing a parallel mechanism.
**Rollout phase:** Phase B — issue record + parent attachment
**Owns:** `sc3` (ParentLocation)
**Consumes:** `sc1` (BugfixTriageResult)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The classifier heuristics/prompt that recognise a user-declared defect fix as `bugfix` and size it into small vs sized magnitude — the sizing rubric, the analyze grounding it runs, and the pure route table branch — stay private to s1. No other story reaches into how the size decision is made; they consume only the resulting BugfixTriageResult/TriageRoute values. — owns `sc1`
- `s2`: The `issue` stage's multi-turn step machinery — its decomposer plan, per-step runners, synthesizer, prompt templates, and the storage/path-scheme/gates wiring plus the review/approve gate for the IssueArtifact — is private to s2. Downstream stories see only the finished, approvable IssueArtifact shape, never how its reproduction/root-cause/fix-intent fields are elicited and synthesized. — owns `sc2`
- `s4`: The scope-gated orchestration is private to s4: how the chain/orchestrator sequences the bugfix stages (small: issue→build; sized: issue→design→plan→build), how gates.ts enforces an approved+fresh IssueArtifact and a resolved ParentLocation before proceeding, and how the existing post-build code-review is wired as the completion gate. s4 introduces no new shared type — it composes sc1's route, sc2's approved issue, and sc3's parent into the run sequence and reuses the existing build + code-review stages verbatim.
- `s5`: The GitHub integration path is private to s5: rendering the issue body from the IssueArtifact content via the existing tracker create/link surface, linking the created issue to the ParentLocation (or leaving it standalone), closing it on completion, and the tracker-not-configured no-op branch. s5 reuses tracker/github.ts, refs.ts, link.ts, sync.ts, and setup.ts rather than adding any new external path (k5/k6) and defines no new shared type.

## Contract details

**Surface level:** internal-shared

### `locateParent`

```typescript
declare function locateParent(input: LocateParentInput, deps: LocateParentDeps): Promise<ParentLocation>
```

**Parameters:**
- `input: LocateParentInput` — The locate request: { touchedPaths: string[]; defectDescription: string; explicitRef?: string | undefined }. touchedPaths + defectDescription are the inference inputs; explicitRef is the optional ref a bugfix spec already carries (tier-1).
- `deps: LocateParentDeps` — Injected collaborators so the pure policy is unit-testable without a DB: { repoPath: string; resolveRef: (repoPath, id) => ResolvedRef | null; inferCandidates: (req) => Promise<InferredCandidates>; promptForRef: () => Promise<string | null>; thresholds: LocateThresholds }. Mirrors the injectable-deps pattern used elsewhere so tests fabricate candidate lists.

**Returns:** `Promise<ParentLocation>` — The tier that decided (deterministic|graph-ownership|semantic|prompt|standalone), the resolved parentRef (null iff tier==='standalone'), a 0..1 confidence, and the cited evidence that grounded the match. This is the sc3 contract value s4/s5 consume.

**Errors:**
- `never-throws-on-not-found` when No owner found is NOT an error: it resolves to a 'prompt' then 'standalone' ParentLocation. A thrown error is reserved for a malformed input (empty touchedPaths AND empty defectDescription AND no explicitRef).

**Preconditions:**
- deps.inferCandidates reaches the daemon (which alone holds DB access, rule 1); on a tier-1 explicit-ref hit locateParent short-circuits and never calls it.
- input paths are repo-relative and belong to the registered repo.

**Postconditions:**
- The fixed tier order is honored: explicit-ref deterministic -> graph-ownership -> semantic -> prompt -> standalone; a threshold-clearing earlier tier short-circuits later tiers (nonFunctional perf).
- parentRef is non-null for every tier except 'standalone'; confidence is >= the tier's auto-attach threshold whenever an attach was made (lc1).
- The returned ParentLocation is pure data; locateParent does NOT itself persist meta.parentRef (s4/s5 stamp it).

### `inferParentCandidates`

```typescript
declare function inferParentCandidates(db: DbClient, req: { touchedPaths: string[]; defectDescription: string; repoPath: string }): Promise<InferredCandidates>
```

**Parameters:**
- `db: DbClient` — The live daemon DB handle (LMDB graph + Lance). This function runs ONLY daemon-side behind an IPC method; the controller never receives a DbClient (rule 1).
- `req: { touchedPaths: string[]; defectDescription: string; repoPath: string }` — The two DB-bound inference inputs plus the repo path used to enumerate candidate work items.

**Returns:** `Promise<InferredCandidates>` — { graph: RankedCandidate[]; semantic: RankedCandidate[] } — each RankedCandidate = { parentRef: WorkItemRef; score: number; evidence: string[] }, graph ranked by code-ownership over the touched entities, semantic ranked by ANN over epic/story artifact vectors. Raw scores; the controller applies the thresholds and tier order.

**Errors:**
- `empty-result-not-error` when No graph or semantic candidate is an empty array, not an error. An UnregisteredRepoError propagates if repoPath is not in the registry (rule 6).

**Preconditions:**
- Runs behind a new daemon IPC method (mirrored to the IDE fork per the IPC lock-step rule); reuses findCallers/inNeighbors (src/db/search.ts, src/db/graph/edges.ts), searchEntityVecs + artifact-vec ANN (src/db/lance/*), embed (provider), and listWorkItems/listArtifactMdPaths/readArtifactCore (path-scheme/storage) verbatim (k6).
- Any batch of embeds is serial (for...of), never Promise.all (convention).

**Postconditions:**
- Returns only inference; makes NO attach decision and applies NO threshold — that policy is the controller's (locateParent).
- Graph candidates are derived by mapping touched entities to owning entities then to work items via the artifact tree; semantic candidates by embed(defectDescription) -> ANN over epic/story artifact vecs.

## Data model changes

### `ParentLocation` — new

The sc3 decision record. { tier: LocateTier; parentRef: WorkItemRef | null; confidence: number; evidence: string[] }. parentRef is null iff tier==='standalone'. confidence is 0..1. evidence holds cited files/entities/artifact ids that grounded the match. New type in the workflow layer (co-located with the locator).

```
+type LocateTier = 'deterministic' | 'graph-ownership' | 'semantic' | 'prompt' | 'standalone';
+interface ParentLocation { readonly tier: LocateTier; readonly parentRef: WorkItemRef | null; readonly confidence: number; readonly evidence: readonly string[]; }
```

**Call sites:**
- `src/workflow/types.ts (WorkItemRef reused, 417-421)`

### `RankedCandidate / InferredCandidates` — new

The daemon inference return shape carried across the new IPC. RankedCandidate = { parentRef: WorkItemRef; score: number; evidence: string[] }; InferredCandidates = { graph: RankedCandidate[]; semantic: RankedCandidate[] }. Internal to s3's boundary (not an sc-level shared contract), but mirrored to the IDE fork as the IPC payload type.

```
+interface RankedCandidate { readonly parentRef: WorkItemRef; readonly score: number; readonly evidence: readonly string[]; }
+interface InferredCandidates { readonly graph: readonly RankedCandidate[]; readonly semantic: readonly RankedCandidate[]; }
```

**Call sites:**
- `src/db/search.ts:186-197 (findCallers/findCallees)`
- `src/db/graph/edges.ts:87-118 (outNeighbors/inNeighbors)`
- `src/db/lance/entity-vec.ts (searchEntityVecs)`
- `src/db/lance/artifact-vec.ts:188 (artifact ANN)`

### `WorkItemRef` — field-modify

No shape change — reused verbatim as ParentLocation.parentRef and RankedCandidate.parentRef. Listed to record that s3 CONSUMES it unchanged (added in S002 as meta.parentRef's type); s3 does not alter it.

```
// unchanged: interface WorkItemRef { readonly epicHash?: string; readonly storyId?: string; readonly slug?: string; }
```

**Call sites:**
- `src/workflow/types.ts:417-421`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc3` | implements | s3 owns sc3. locateParent is the sc3 entry point returning ParentLocation; the HLD boundary.internal explicitly keeps the graph/semantic scoring + thresholds + prompt private to s3, so inferParentCandidates and the LocateThresholds live inside this boundary and are not exposed to s4/s5. Consumers see only ParentLocation. Deviation from the sc3 interfaceSketch: locateParent takes an added injectable `deps` param (deterministic resolver + daemon inference + prompt + thresholds) so the tier policy unit-tests without a DB — an additive signature refinement, not a contract-shape change (ParentLocation is exactly as sketched). |
| `sc1` | consumes | s3 consumes sc1's BugfixTriageResult/route only as upstream context: the bugfix magnitude/route decided in s1 is what causes the orchestrator (s4) to invoke locateParent at all. locateParent itself does not read sc1's types; it takes touchedPaths/defectDescription/explicitRef. No reshaping of sc1. |

## Error paths

### Error cases

- **The daemon inference IPC (inferParentCandidates) is unreachable or times out mid-locate (daemon restarting, socket dropped).** (recoverable)
  - Detection: deps.inferCandidates rejects or exceeds its timeout; locateParent catches the rejection at the call site rather than letting it bubble.
  - Response: Treat graph+semantic as having produced zero candidates and fall through to the prompt tier (then standalone). NEVER auto-attach and NEVER crash the bugfix flow — an absent inference degrades to 'ask the user', preserving lc1.
  - User impact: The fix is not auto-attached; the user is prompted for a ref and can still proceed standalone. No lost work.
- **An explicit ref carried by the bugfix spec is stale or malformed (points at a deleted/renamed work item).** (recoverable)
  - Detection: Tier-1 resolveWorkflowRef(repoPath, explicitRef) returns null.
  - Response: Do not throw and do not attach to a guessed item; fall through to the inference tiers (graph -> semantic -> prompt -> standalone) exactly as if no explicitRef had been supplied.
  - User impact: A wrong/stale ref never silently mis-attaches the fix; the framework re-derives the parent from evidence.
- **A touched path maps to no indexed graph entity (a brand-new file, or a path outside the indexed set).** (recoverable)
  - Detection: The daemon's per-path entity lookup returns empty for that path; findCallers/inNeighbors have no seed entity to expand.
  - Response: That path contributes no graph candidate; the remaining touched paths and the semantic tier still run. If ALL paths are unindexed, graph yields [] and the flow proceeds to semantic then prompt.
  - User impact: A fix that only touches new files still gets a semantic attempt and, failing that, a prompt — never an error.
- **A ranked candidate's parentRef resolves to a work item whose on-disk artifacts are gone (partial delete / manual edit of the docs tree).** (recoverable)
  - Detection: readArtifactCore(repoPath, candidateArtifactId) returns undefined when the controller tries to cite evidence for that candidate.
  - Response: Drop the candidate from consideration (it cannot be grounded with evidence, and sc3 requires cited evidence); continue with the remaining candidates or fall to the next tier.
  - User impact: The fix is never attached to a phantom parent with no artifacts; attach only survives on grounded candidates.

### Edge cases

| Input | Expected |
| :--- | :--- |
| Two or more graph candidates tie at or above the auto-attach threshold (a touched entity is owned by multiple stories' artifacts). | Ambiguity defers to the user prompt rather than picking one arbitrarily (lc1). The evidence for the tied candidates is surfaced to the prompt so the user can choose. |
| An explicitRef is present AND the touched paths point at a different work item. | Tier-1 deterministic wins and short-circuits: the explicit ref is authoritative (deterministic-first), inference is not run, tier='deterministic'. |
| defectDescription is empty/whitespace but touchedPaths are present. | The graph tier runs normally; the semantic tier is skipped (nothing to embed) rather than embedding an empty string. Order preserved: graph -> (skip semantic) -> prompt -> standalone. |
| The best semantic candidate scores just below the auto-attach threshold. | No auto-attach; defer to the prompt tier with that near-miss candidate surfaced as a suggestion (lc1: a low-confidence match must not silently attach). |
| At the prompt tier the user supplies a ref that resolveWorkflowRef cannot resolve (or supplies nothing). | Resolve to standalone (tier='standalone', parentRef=null). The fix proceeds unattached rather than looping or erroring. |

### Invariants to preserve

- Location is deterministic-first and never silently attaches to a wrong parent: code-ownership is attempted before the fuzzy semantic step, and any low-confidence, ambiguous, or below-threshold match defers to the user prompt. The fixed order deterministic -> graph-ownership -> semantic -> prompt -> standalone and the standalone fallback are load-bearing (grounded by the s1 tracker/resolve.ts + graph + lance bundles showing each tier's reuse surface). [[c5]]
- The parent-locator reuses the existing tracker ref-resolver (resolveWorkflowRef), the LMDB graph query API (findCallers/inNeighbors), the LanceDB ANN surface, and the path-scheme candidate enumerators verbatim — it adds a locate-parent resolver on top rather than re-implementing any of them, and introduces no direct cloud REST path (grounded by the s1 symbol.locate bundles on resolve.ts, db/search.ts, db/graph/edges.ts, db/lance/*). [[c7]]
- All DB access (graph + Lance + embeddings) stays daemon-side behind IPC; the controller-side policy never opens LMDB/LanceDB directly and never receives a DbClient (architectural rule 1), grounded by the s1 bundle noting findCallers/searchEntityVecs/embed all require a live DbClient the daemon alone holds. [[c2]]

## Test strategy

**Test framework:** `node:test via tsx (npx tsx --test 'src/**/__tests__/*.test.ts'), matching the existing workflow/mcp test layout; unit policy tests need no live services and run in the fast workflow subset.`

### Test levels

- **unit** — Prove the locateParent tier POLICY in isolation — fixed order, thresholds, short-circuit, prompt/standalone fallback — by injecting fabricated deps (resolveRef, inferCandidates, promptForRef, thresholds). No DB, no daemon; this is where the correctness-critical lc1 guarantees are pinned.
  - Subjects: `locateParent: tier-1 explicit-ref hit -> tier='deterministic', short-circuits (inferCandidates never called)`, `locateParent: graph candidate >= threshold -> tier='graph-ownership', semantic pass skipped (short-circuit)`, `locateParent: graph empty/below-threshold, semantic >= threshold -> tier='semantic'`, `locateParent: nothing clears threshold -> promptForRef called; a resolvable ref -> attached, an unresolvable/empty ref -> tier='standalone', parentRef=null`, `locateParent: tied graph candidates at/above threshold -> defers to prompt (no arbitrary pick)`, `locateParent: inferCandidates rejects/times out -> degrades to prompt then standalone, never throws, never auto-attaches`, `locateParent: empty defectDescription -> semantic tier skipped, graph+prompt order preserved`, `locateParent: stale explicitRef (resolveRef returns null) -> falls through to inference tiers`, `ParentLocation shape invariant: parentRef non-null iff tier!=='standalone'; confidence >= threshold whenever attached`
  - Fixtures: `A fake LocateParentDeps: stub resolveRef returning a canned ResolvedRef|null, stub inferCandidates returning fabricated InferredCandidates (graph/semantic RankedCandidate[] with chosen scores), stub promptForRef returning a canned ref|null, and a fixed LocateThresholds object`, `Hand-built WorkItemRef + RankedCandidate literals (no DB)`
- **unit** — Prove the daemon-side inferParentCandidates mapping logic (touched entity -> owning work item; embed+ANN -> ranked semantic candidates) over an in-memory/fixture graph+lance, asserting it RANKS but makes NO attach decision and applies NO threshold.
  - Subjects: `inferParentCandidates: a touched path whose entity is owned by a story's artifacts yields a graph RankedCandidate with that WorkItemRef + cited evidence`, `inferParentCandidates: unindexed path contributes no graph candidate; other paths still resolve`, `inferParentCandidates: returns raw scores only; no filtering/threshold applied (policy stays in the controller)`, `inferParentCandidates: embeds are issued serially (for...of), not Promise.all`
  - Fixtures: `A small seeded LMDB graph + Lance artifact-vec fixture (reuse existing db test-harness helpers) OR injected db stubs for findCallers/inNeighbors/searchEntityVecs`, `A fake embed() returning a deterministic vector`
- **integration** — Prove the controller policy composed with a real (fixture-backed) daemon inference path end-to-end: a locate request over a seeded work-item tree returns the expected ParentLocation, exercising the code-ownership and semantic tiers against real graph/lance data.
  - Subjects: `End-to-end locate: touched paths under an existing story's artifacts -> graph attach with grounded evidence`, `End-to-end locate: unrelated touched paths + a defect description matching a story's artifact prose -> semantic attach`, `End-to-end locate: neither matches -> prompt -> standalone`
  - Fixtures: `A seeded repo work-item tree (epic + a couple of stories with approved artifacts) indexed into the fixture graph + artifact-vec table`, `Reuse of the existing workflow/db integration test harness`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `locateParent: graph candidate >= threshold -> tier='graph-ownership', semantic pass skipped`, `inferParentCandidates: a touched path whose entity is owned by a story's artifacts yields a graph RankedCandidate + evidence`, `End-to-end locate: touched paths under an existing story's artifacts -> graph attach with grounded evidence` |
| `ac2` | `locateParent: graph empty/below-threshold, semantic >= threshold -> tier='semantic'`, `End-to-end locate: unrelated touched paths + defect description matching a story's artifact prose -> semantic attach`, `locateParent: semantic candidate just below threshold -> defers to prompt (no silent attach)` |
| `ac3` | `locateParent: nothing clears threshold -> promptForRef called; resolvable ref attaches, empty/unresolvable ref -> tier='standalone', parentRef=null`, `locateParent: inferCandidates rejects/times out -> degrades to prompt then standalone`, `End-to-end locate: neither tier matches -> prompt -> standalone` |

## Migration

**State before:** No parent-locator exists. Bugfix category (sc1) and the IssueArtifact stage (sc2) exist, and ArtifactMetaBase already carries an OPTIONAL meta.parentRef?: WorkItemRef | null (added in S002, src/workflow/types.ts:412; WorkItemRef interface at :417-421) that nothing currently populates. The deterministic ref-resolver resolveWorkflowRef (src/workflow/tracker/resolve.ts:292) resolves EXPLICIT identifiers only; the graph query API (findCallers/inNeighbors, src/db/search.ts:186-197, src/db/graph/edges.ts:87-118) and the LanceDB ANN surface (src/db/lance/*) exist but no code composes them to infer a parent from touched paths. The daemon IPC registry (src/daemon/index.ts) has no locate/infer method. Every DB touch is daemon-only (rule 1).

**State after:** A new controller-side locateParent policy + a new daemon-side inferParentCandidates function behind a new additive daemon IPC method compose the five tiers. New types LocateTier/ParentLocation/RankedCandidate/InferredCandidates/LocateParentInput/LocateParentDeps/LocateThresholds exist in the workflow layer (ParentLocation reusing the already-present WorkItemRef). meta.parentRef stays optional and is still populated by a later story (s4), not by s3 — s3 only produces the ParentLocation value. All behind the existing `bugfixCategory` feature flag.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the new value types (LocateTier, ParentLocation, RankedCandidate, InferredCandidates, LocateParentInput, LocateParentDeps, LocateThresholds) to the workflow layer. Purely additive type declarations; no existing type changes shape. — ↩ rollbackable
2. Add the daemon-side inferParentCandidates function that composes the existing findCallers/inNeighbors + searchEntityVecs/artifact-vec ANN + embed + listWorkItems/readArtifactCore surfaces into ranked graph+semantic candidates. New code path only; touches no existing function. — ↩ rollbackable
3. Register a new additive daemon IPC method exposing inferParentCandidates, and mirror its payload type to the IDE fork per the IPC lock-step rule. Additive to the method registry — no existing method signature changes. — ↩ rollbackable _(needs: `bugfixCategory`)_
4. Add the controller-side locateParent policy that injects the deterministic resolver (resolveWorkflowRef), the new inferCandidates IPC client, a promptForRef callback, and the LocateThresholds, applying the fixed tier order + auto-attach thresholds + prompt/standalone fallback. New function; consumed by s4 later, so nothing calls it yet at s3's completion. — ↩ rollbackable _(needs: `bugfixCategory`)_
5. Add unit + integration tests (fabricated deps for the policy; seeded graph/lance fixtures for the inferrer). Test-only; no production behavior change. — ↩ rollbackable

**Backward compat:** Fully backward compatible: every change is additive. No existing public API changes signature or shape — locateParent and inferParentCandidates are new symbols, the daemon IPC method is a new registry entry, and the only reused type (WorkItemRef / meta.parentRef) already exists as an optional field from S002 and is left untouched (still unpopulated by s3). The new surface is reachable only under the `bugfixCategory` feature flag and is not yet wired into any live orchestration (s4's job), so an existing non-bugfix workflow run is entirely unaffected.

## Alternatives considered

### a1: Split locator: daemon infers candidates, controller decides — **CHOSEN**

One focused daemon IPC does only the DB-bound inference (graph-ownership + semantic ANN) returning ranked candidates + evidence; the controller owns the deterministic ref-resolve, the fixed tier order, the confidence/auto-attach policy, the user prompt, and the standalone fallback.

sc3 splits along the rule-1 DB boundary. A new daemon-side function/IPC `inferParentCandidates({ touchedPaths, defectDescription }): Promise<{ graph: RankedCandidate[]; semantic: RankedCandidate[] }>` runs ONLY the two DB-bound tiers server-side: graph code-ownership (findCallers/inNeighbors over the touched entities → owning story via the artifact tree) and semantic (embed(defectDescription) → LanceDB ANN over epic/story artifact vecs), each returning WorkItemRef candidates with a raw score + cited evidence. The controller-side `locateParent` is a pure orchestration function that: (tier-1) tries `resolveWorkflowRef` on any explicit ref in the input (pure fs, no DB); (tier-2/3) calls the one daemon IPC and reads its ranked candidates; applies the FIXED order and per-tier high-confidence auto-attach thresholds (lc1); (tier-4) if nothing clears threshold, returns a 'prompt' ParentLocation the orchestrator surfaces to the user; (tier-5) if the user supplies nothing, returns standalone (parentRef:null). ParentLocation is assembled controller-side so the tier/confidence/evidence policy is unit-testable without a live DB.

### a2: All-in-daemon locateParent

A single daemon-side `locateParent` runs every inference tier server-side and returns the finished ParentLocation, with the prompt tier degraded to a 'needs-user-ref' signal the controller must interpret.

sc3's `locateParent({ touchedPaths, defectDescription }): Promise<ParentLocation>` is implemented entirely daemon-side as one IPC. It runs deterministic ref-resolve, graph ownership, and semantic ANN in the fixed order, applies the thresholds, and returns a ParentLocation. Because a daemon function cannot interact with the user, the 'prompt' tier is expressed as a ParentLocation whose tier='prompt' and parentRef=null — a signal the controller/orchestrator must then turn into an actual user prompt and, on a supplied ref, call resolveWorkflowRef again (or a second IPC) to finalize. Standalone is the same shape with tier='standalone'.

**Rejected because:** Correct on ac1/ac2 but only PARTIAL on ac3 and sc3: the prompt tier is inherently interactive and cannot be owned by a pure daemon function, so the interaction logic splits back to the controller regardless — giving up a1's clean separation while additionally forcing the threshold policy into DB-fixture-bound tests and adding a round trip for the cheap explicit-ref case. Ranked 2nd.

### a3: Reuse insrc_analyze_step for inference

No new daemon surface: the controller drives the graph/semantic tiers by calling the existing insrc_analyze_step IPC and parses its 7-layer bundle into a ParentLocation.

locateParent is a pure controller routine that reuses the existing analyze pipeline for its inference tiers: for tier-2/3 it issues an insrc_analyze_step run focused on the touched paths + defect description, then interprets the returned symbol.locate / structural bundle to derive candidate owning stories, and maps them to a ParentLocation. Deterministic (resolveWorkflowRef), prompt, and standalone tiers stay controller-side as in a1.

**Rejected because:** VIOLATES sc3: deriving ParentLocation.confidence + the auto-attach threshold from analyze's prose bundle is lossy exactly where the load-bearing lc1 'never silently attach to a wrong parent' guarantee lives, and trades accuracy for reuse — the wrong trade under the project's accuracy-first principle for a correctness-critical decision. Ranked 3rd.

## Citations

- **[[c1]]** `analyze-bundle` `src/workflow/tracker/resolve.ts:292 — resolveWorkflowRef(repoPath, identifier): ResolvedRef | null (deterministic tier-1)` — "resolveWorkflowRef resolves an explicit ref a bugfix spec ALREADY carries — it does NOT infer a parent from touched code paths."
- **[[c2]]** `analyze-bundle` `src/db/search.ts:186-197 (findCallers/findCallees) + src/db/graph/edges.ts:87-118 (outNeighbors/inNeighbors) — graph code-ownership tier; all require a live DbClient (daemon-only, rule 1)`
- **[[c3]]** `analyze-bundle` `src/db/lance/entity-vec.ts (searchEntityVecs) + src/db/lance/artifact-vec.ts:188 (artifact ANN) + embed(text):Promise<number[]> — semantic tier`
- **[[c4]]** `analyze-bundle` `src/workflow/path-scheme.ts:158-195 (listWorkItems/listArtifactMdPaths) + src/workflow/storage.ts:213-224 (readArtifactCore) + src/workflow/types.ts:417-421 (WorkItemRef) — candidate enumeration + parentRef shape`
- **[[c5]]** `step-output` `s3 alternatives.judge — winnerId a1; lc1 deterministic-first / no-silent-wrong-attach is load-bearing`
- **[[c6]]** `convention` `node:test via tsx (npx tsx --test); embeds serial (for...of) never Promise.all; daemon owns all DB access (CLAUDE.md rules 1/4)`
- **[[c7]]** `prior-artifact` `HLD sc3 ParentLocation (ownedByStory s3) + Epic k3/k6 — tiered locate order + reuse existing tracker resolver/graph/lance`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 1 LOW** · model `client` · reviewed 2026-09-18T13:35:13.207Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| c4 | semantic | LOW | auto | ArtifactMetaBase already carries an optional meta.parentRef?: WorkItemRef \| null (added in S002) which nothing currently populates; s3 does not populate it (s4 does). | Probe confirms the optional field `readonly parentRef?: WorkItemRef \| null;` exists at src/workflow/types.ts:412 (not 417-421). The Migration section attributes meta.parentRef to `src/workflow/types.ts:417-421`, but 417-421 is the WorkItemRef INTERFACE (confirmed by cl9). The parentRef field itself sits at line 412. A cosmetic line-reference imprecision in the LLD prose; the underlying fact (parentRef is an existing optional field added in S002, reused unchanged) is correct and confirmed. | Optionally correct the Migration citation to read `src/workflow/types.ts:412 (parentRef field), :417-421 (WorkItemRef interface)`. Non-blocking; does not affect any contract or the design. |

#### Proposed fixes

- **c4** (auto) — Distinguish the parentRef field line (412) from the WorkItemRef interface lines (417-421) in the migration citation.
  - edit: `meta.parentRef?: WorkItemRef | null (added in S002, src/workflow/types.ts:417-421)` → `meta.parentRef?: WorkItemRef | null (added in S002, src/workflow/types.ts:412; WorkItemRef interface at :417-421)`
