<!-- insrc:artifact LLD-761a43a6fa645815-s1 -->

# LLD: E20260803761a43a6:S001

**Epic:** `add-daemon-driven-code-review-stage`
**HLD base run:** `wf-1785741597494-lbzdo7`
**HLD effective hash:** `47535369867a...`

## HLD context

**Framework:** A hybrid code-review stage (winner a3): a code-review-specific orchestrator runs the four dimensions (adherence/conventions/coverage/quality) as an explicit SERIAL provider loop, reusing src/daemon/workflow-rpc.ts's proven machinery and mirroring the existing review vocabulary (ReviewVerdict / Severity / ReviewReport from src/workflow/review/types.ts). The stage runs after build, consumes the build record + approved LLD/PLAN as its fixed subject without re-deriving them, and never modifies the code it judges.
**Rollout phase:** Phase A — Subject + grounding foundation
**Owns:** `sc1` (CodeReviewSubject), `sc2` (CodeReviewGrounding), `sc3` (DimensionFinding)

## Contract details

**Surface level:** internal-shared

### `resolveCodeReviewSubject`

```typescript
(repoPath: string, epicHash: string, storyId: string) => CodeReviewSubjectResult
```

**Parameters:**
- `repoPath: string` — the registered repo whose Story is being reviewed
- `epicHash: string` — the Epic the Story belongs to
- `storyId: string` — the Story whose build output is the review subject

**Returns:** `CodeReviewSubjectResult` — {ok:true, subject} when an approved LLD+PLAN and a build both exist; otherwise {ok:false, reason:'no-approved-contract'|'no-build-record'} — never a verdict (ac2, c101)

**Errors:**
- `UnregisteredRepoError` when repoPath is not a registered repo (propagated from the storage layer, not swallowed)

**Preconditions:**
- repoPath is a registered, indexed repo

**Postconditions:**
- No file under repoPath is modified — resolution is read-only (ac5, c102)
- subject.changedFiles is exactly the files the Story's build changed, git-derived, never a re-recorded copy
- subject.approvedLld / subject.approvedPlan are the approved artifacts (via the gates); absence yields ok:false rather than a throw escaping the resolver

### `requireApprovedLld`

```typescript
(repoPath: string, epicHash: string, storyId: string) => LldArtifact
```

**Parameters:**
- `repoPath: string` — repo root
- `epicHash: string` — epic id
- `storyId: string` — story id

**Returns:** `LldArtifact` — the approved LLD; existing gate reused (src/workflow/gates.ts:255)

**Errors:**
- `ArtifactMissingError` when no LLD artifact exists for the Story — mapped to reason:'no-approved-contract'
- `ArtifactNotApprovedError` when the LLD exists but is unapproved — mapped to reason:'no-approved-contract'

**Preconditions:**
- called inside resolveCodeReviewSubject, wrapped so the throw becomes an ok:false result

**Postconditions:**
- read-only

### `requireApprovedPlan`

```typescript
(repoPath: string, epicHash: string, storyId: string) => PlanArtifact
```

**Parameters:**
- `repoPath: string` — repo root
- `epicHash: string` — epic id
- `storyId: string` — story id

**Returns:** `PlanArtifact` — the approved PLAN; existing gate reused (src/workflow/gates.ts:354)

**Errors:**
- `ArtifactMissingError` when no PLAN for the Story — mapped to reason:'no-approved-contract'
- `ArtifactNotApprovedError` when PLAN exists but unapproved — mapped to reason:'no-approved-contract'

**Preconditions:**
- called inside resolveCodeReviewSubject

**Postconditions:**
- read-only

### `gitDiffTool`

```typescript
(input: { readonly range: string; readonly cwd: string }) => Promise<GitDiffData>
```

**Parameters:**
- `range: string` — the Story's build commit range whose changed files are the subject
- `cwd: string` — the repo working directory

**Returns:** `GitDiffData` — existing builtin (src/daemon/tools/builtins/git/diff.ts:54); its files: GitDiffFileStat[] supplies subject.changedFiles — git is the file-set source of truth

**Errors:**
- `ToolError` when the git range cannot be resolved (e.g. no build commits) — mapped to reason:'no-build-record'

**Preconditions:**
- a build ran for the Story, so a commit range exists

**Postconditions:**
- read-only — git diff does not mutate the working tree

### `assembleCodeReviewGrounding`

```typescript
(repoPath: string, changedFiles: readonly string[]) => CodeReviewGrounding
```

**Parameters:**
- `repoPath: string` — the repo whose graph is queried
- `changedFiles: readonly string[]` — subject.changedFiles — the files whose entities are summarized

**Returns:** `CodeReviewGrounding` — structured ChangedSymbolSummary rows assembled from the graph traversal API; served daemon-side over a new IPC method, never raw file dumps (ac3, k6)

**Errors:**
- `UnregisteredRepoError` when the repo is not registered (propagated from the graph store)

**Preconditions:**
- runs INSIDE the daemon; consumers reach it only via IPC (ac4, k5)
- the changed files' entities are indexed in the graph

**Postconditions:**
- read-only
- every ChangedSymbolSummary is a structured entity summary + relations, not file text

## Data model changes

### `CodeReviewSubject / CodeReviewSubjectResult` — new

sc1: the fixed per-Story subject { repoPath, epicHash, storyId, changedFiles: readonly string[] (git-derived), approvedLld: LldArtifact, approvedPlan: PlanArtifact, buildRecord } wrapped in a discriminated CodeReviewSubjectResult ({ok:true,subject} | {ok:false, reason:'no-approved-contract'|'no-build-record'}). REFINEMENT of the HLD sketch: changedFiles is git-derived (not a build-record field), and buildRecord is typed as the persisted build record (StandaloneBuildRecord identity), consumed not re-derived.

**Call sites:**
- `src/workflow/gates.ts`
- `src/daemon/tools/builtins/git/diff.ts`
- `src/workflow/runners/build/standalone-record.ts`

### `ChangedSymbolSummary / CodeReviewGrounding` — new

sc2: { entityId, file, kind, name, signature, callers, callees, testsReaching } assembled from the LMDB graph traversal API; CodeReviewGrounding { symbols: readonly ChangedSymbolSummary[] } is the IPC-served bundle — no raw file contents.

**Call sites:**
- `src/db/graph/`
- `src/daemon/index.ts`

### `ReviewDimension / DimensionFinding / DimensionResult` — new

sc3: ReviewDimension = 'adherence'|'conventions'|'coverage'|'quality'; DimensionFinding { dimension, severity: Severity (reused from src/workflow/review/types.ts), location, message, expectationRef?, counterpartRef?, confidence? }; DimensionResult { dimension, findings }. S001 owns only these TYPES — aggregation is s6's.

**Call sites:**
- `src/workflow/review/types.ts`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | implements | resolveCodeReviewSubject IS sc1's resolver: it composes requireApprovedLld + requireApprovedPlan (throw => ok:false, reason:'no-approved-contract') and the git-derived changedFiles (unresolvable range => ok:false, reason:'no-build-record'), returning CodeReviewSubjectResult. The buildRecord field is the persisted build record consumed for identity only (never modified/duplicated — k9); changedFiles is git-derived, refining the HLD sketch's 'from the build record' wording without changing sc1's field shape. |
| `sc2` | implements | assembleCodeReviewGrounding IS sc2's producer: it runs inside the daemon, looks up the entities in subject.changedFiles and reads their caller/callee + test-reaching edges from the graph, returning CodeReviewGrounding served over a new daemon IPC method so no other surface opens the stores (ac4, k5) and no raw file dumps are used (ac3, k6). |
| `sc3` | implements | S001 declares the ReviewDimension / DimensionFinding / DimensionResult type vocabulary (reusing Severity from src/workflow/review/types.ts) that the four dimension Stories emit. S001 owns the TYPES only; it does not itself judge any dimension or aggregate findings. |

## Error paths

### Error cases

- **The Story has no approved LLD and/or no approved PLAN when a review is requested.** (recoverable)
  - Detection: resolveCodeReviewSubject calls requireApprovedLld/requireApprovedPlan, which throw ArtifactMissingError/ArtifactNotApprovedError; the resolver catches those specific errors and converts them to a result.
  - Response: Return { ok:false, reason:'no-approved-contract' } — no verdict is produced; the caller is told there is no approved contract to review against.
  - User impact: The requester learns the review cannot run because the design/plan is not yet approved, not a spurious pass/fail.
- **No build commit range can be resolved for the Story (no build ran / no commits to diff).** (recoverable)
  - Detection: gitDiffTool rejects with a ToolError because the range does not resolve; resolveCodeReviewSubject catches it at the diff step.
  - Response: Return { ok:false, reason:'no-build-record' } — no changedFiles set, no verdict.
  - User impact: The requester learns the Story has not been built yet, so there is nothing to review.
- **A changed file's entities are not present in the graph (index stale or file not yet indexed after build).** (recoverable)
  - Detection: assembleCodeReviewGrounding looks up entities for each changed file and finds none for that file.
  - Response: Omit that file from the ChangedSymbolSummary rows (it still appears in subject.changedFiles); the grounding is returned with the entities that DO resolve, and the omission is observable, not silently treated as 'no changes'.
  - User impact: Grounding for that file is thinner until re-indexed; the file is not dropped from the subject.
- **repoPath is not a registered repo.** (recoverable)
  - Detection: The gates/graph storage layer throws UnregisteredRepoError when reading artifacts or the graph.
  - Response: Propagate UnregisteredRepoError unchanged — it is NOT collapsed into a no-approved-contract/no-build-record result, because it is an operator misconfiguration, not a missing-contract condition.
  - User impact: The caller sees a clear registration error rather than a misleading 'no contract' result.

### Edge cases

| Input | Expected |
| :--- | :--- |
| The Story's build changed zero files (empty diff). | { ok:true, subject } with changedFiles = [] and empty grounding — a valid (if trivial) subject, not an error; downstream dimensions simply have nothing to judge. |
| changedFiles includes non-code files (config, markdown, assets) with no graph entities. | Those paths remain in subject.changedFiles (the file set is complete), but produce no ChangedSymbolSummary rows — grounding covers code entities only, without dropping the file from the subject. |
| A file changed by the build was subsequently deleted before the review runs. | git diff still reports it in the changed set; the grounding lookup finds no current entity and omits its symbols — the subject stays faithful to what the build changed. |
| The same file appears with multiple changed entities. | One ChangedSymbolSummary per entity (keyed by entityId), all sharing the same file path — the summary is per-symbol, not per-file. |

### Invariants to preserve

- The review is strictly read-only: resolveCodeReviewSubject and assembleCodeReviewGrounding invoke only read operations (git diff, graph reads) and never any write/edit tool, so the Story's files are byte-for-byte unchanged (ac5). [[c102]]
- The daemon owns all DB access; grounding (sc2) is served over an IPC method and no CLI/MCP/other surface opens LMDB or LanceDB directly (ac4). [[c16]]
- changedFiles is git-derived (git is the single source of truth for the changed set); the build record is consumed for identity only and never modified or duplicated — the code-review stage does not re-record what the build stage owns. [[c9]]
- sc3's DimensionFinding reuses Severity from src/workflow/review/types.ts verbatim, so the four dimensions and the eventual aggregate record all speak one severity vocabulary. [[c2]]

## Test strategy

**Test framework:** `node:test + node:assert/strict, run via `npx tsx --test 'src/**/__tests__/*.test.ts'` (live/daemon-touching suites gate behind INSRC_LIVE_TESTS and skip cleanly when unset)`

### Test levels

- **unit** — Prove resolveCodeReviewSubject's branching in isolation — the approved/unapproved gate mapping, the git-derived changedFiles, and the discriminated result — with fake gate + git-diff seams so no real repo or daemon is needed.
  - Subjects: `resolveCodeReviewSubject (ok:true subject; ok:false 'no-approved-contract'; ok:false 'no-build-record')`, `the requireApprovedLld/requireApprovedPlan throw-to-result mapping`, `the gitDiffTool GitDiffData.files -> subject.changedFiles derivation`
  - Fixtures: `a fake approved LLD + PLAN pair and an unapproved/missing variant`, `a fake GitDiffData with a known files[] set (and an empty-diff variant)`, `a stub that makes gitDiffTool reject with ToolError for the no-build-record case`
- **unit** — Prove assembleCodeReviewGrounding maps changed files to ChangedSymbolSummary rows from a small in-memory graph, omitting unindexed files and never emitting raw file text.
  - Subjects: `assembleCodeReviewGrounding (entity lookup + caller/callee + testsReaching edges)`, `the omit-unindexed-file behaviour`, `the per-symbol (not per-file) row keying`
  - Fixtures: `a small graph fixture with a few entities, caller/callee edges, and one test->symbol edge`, `a changedFiles list that includes one indexed file, one unindexed file, and one non-code file`
- **integration** — Prove the grounding is served through the daemon IPC surface (not by a consumer opening the stores) and that a full resolve+ground pass leaves the working tree byte-for-byte unchanged.
  - Subjects: `the new 'codeReview.grounding' IPC handler returning CodeReviewGrounding over the socket`, `a resolve+ground pass over a tiny real indexed fixture repo asserting file bytes + mtimes unchanged`
  - Fixtures: `a tiny registered+indexed fixture repo with an approved LLD/PLAN and a build commit range`, `a byte/mtime snapshot of the fixture's files taken before and after the pass`
- **contract** — Pin the sc3 type vocabulary so downstream dimension Stories compile against a fixed shape and Severity stays the review/types.ts value.
  - Subjects: `DimensionFinding/DimensionResult/ReviewDimension type-shape assertions`, `a type-level check that DimensionFinding.severity IS the Severity imported from src/workflow/review/types.ts`
  - Fixtures: `a representative DimensionResult literal exercising each ReviewDimension`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: resolveCodeReviewSubject returns subject.changedFiles exactly equal to the fake GitDiffData.files (no extra/unrelated paths)`, `unit: the build record is read for identity only — the record object is not mutated and is not the source of changedFiles` |
| `ac2` | `unit: with a missing LLD -> { ok:false, reason:'no-approved-contract' } and no subject/verdict`, `unit: with an unapproved PLAN -> { ok:false, reason:'no-approved-contract' }` |
| `ac3` | `unit: assembleCodeReviewGrounding returns ChangedSymbolSummary rows (entityId/signature/callers/callees/testsReaching) and NO raw file contents field` |
| `ac4` | `integration: the 'codeReview.grounding' IPC handler returns CodeReviewGrounding over the socket for a fixture repo`, `integration: the grounding assembler is only reachable via the daemon — no exported path lets a CLI/MCP caller open LMDB/Lance directly for these summaries` |
| `ac5` | `integration: a byte + mtime snapshot of the fixture repo's files is identical before and after a resolve+ground pass`, `unit: resolveCodeReviewSubject/assembleCodeReviewGrounding invoke no write/edit tool (asserted via a tool-invocation spy that fails on any mutating call)` |

## Migration

**State before:** No code-review capability exists. Per s1 grounding: the existing review subsystem (src/workflow/review/) audits DEF/HLD/LLD/PLAN artifacts, not code; src/workflow/gates.ts already exports requireApprovedLld/requireApprovedPlan and readBuildUpstream returns only {plan}; the build record (StandaloneBuildRecord.body = {focus, producesLld}) persists NO changed-file set; gitDiffTool + GitDiffData.files already exist; and the LMDB graph traversal API + daemon IPC exist but expose no code-review grounding method. None of CodeReviewSubject / CodeReviewGrounding / DimensionFinding exist yet.

**State after:** A new src/workflow/code-review/ module declares the sc1/sc2/sc3 types and resolveCodeReviewSubject; the daemon assembles grounding via assembleCodeReviewGrounding and exposes a new 'codeReview.grounding' IPC method. gates.ts, the build record, gitDiffTool, and the graph layer are READ but unchanged. changedFiles is git-derived; nothing re-records the build's file set (k9).

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add a new type module under src/workflow/code-review/ declaring ReviewDimension, DimensionFinding, DimensionResult (sc3, importing Severity from src/workflow/review/types.ts), CodeReviewSubject, CodeReviewSubjectResult (sc1), and ChangedSymbolSummary, CodeReviewGrounding (sc2). Purely additive new types. — ↩ rollbackable
2. Add resolveCodeReviewSubject that composes the existing requireApprovedLld/requireApprovedPlan gates (mapping their throws to reason:'no-approved-contract') and derives changedFiles from the existing gitDiffTool over the Story's build commit range (unresolvable range -> reason:'no-build-record'). Reads only; adds no field to any existing record. — ↩ rollbackable
3. Add assembleCodeReviewGrounding that looks up the changed files' entities in the graph and reads their caller/callee + test-reaching edges to build ChangedSymbolSummary rows. Daemon-internal; no change to the graph store. — ↩ rollbackable
4. Register a new 'codeReview.grounding' handler in the daemon IPC handler map so consumers fetch grounding through the daemon only (never opening the stores). Additive handler; existing IPC methods unchanged. — ↩ rollbackable

**Backward compat:** Purely additive: no existing type, function, IPC method, or on-disk record is modified. The sc1 'changedFiles is git-derived' refinement affects only the NEW contract — the build record and gates are read, not changed — so no existing consumer (build stage, artifact review, CLI, IDE) is affected. Removing the new module fully reverts the state.

## Alternatives considered

### a1: Git-derived changed set, no build-record change (in-Epic) — **CHOSEN**

sc1 derives changedFiles from the git diff of the Story build commit range; the build record is consulted only for identity, never extended.



### a2: Persist the full changed-file list into the build record

Extend the build stage to record its changedFiles so sc1 reads the list directly (rejected: VIOLATES k9 by amending/duplicating the build Epic record).



### a3: Commit-SHA-pinned range (minimal build-record hint)

The build record pins only the build head commit SHA; sc1 derives changedFiles via git diff over that range (rejected: still a cross-Epic build-record field, k9 partial).



## Citations

- **[[c1]]** `analyze-bundle` `s1 symbol.locate — src/workflow/runners/build/standalone-record.ts + src/workflow/gates.ts` — "The build record does NOT persist a changed-file set: StandaloneBuildRecord.body is {focus, producesLld} and BuildUpstream is {plan}; so sc1's changedFiles must be git-derived, not a build-record fiel"
- **[[c2]]** `analyze-bundle` `s1 symbol.locate — src/daemon/tools/builtins/git/diff.ts` — "gitDiffTool (54) returns GitDiffData whose files: GitDiffFileStat[] (39) is parsed from git numstat — supplies subject.changedFiles; git is the file-set source of truth."
- **[[c9]]** `analyze-bundle` `s1 symbol.locate — src/workflow/gates.ts` — "requireApprovedLld (255) + requireApprovedPlan (354) throw ArtifactMissingError/ArtifactNotApprovedError until approved; sc1 maps the throw to reason:'no-approved-contract'."
- **[[c16]]** `doc` `s1 doc+concept — CLAUDE.md Key architectural rules + src/db/graph/` — "The daemon owns all DB access (IPC only) and grounding is structured entity summaries from the graph traversal API, not raw file dumps (k5/k6)."
- **[[c17]]** `analyze-bundle` `s1 symbol.locate — src/workflow/review/types.ts` — "Severity = 'HIGH'|'MED'|'LOW' (41) is reused verbatim by sc3's DimensionFinding so all dimensions speak one severity vocabulary."
- **[[c102]]** `step-output` `s3 alternatives.judge — winner a1` — "a1 is the only alternative satisfying ac1-ac5 + sc1/sc2/sc3 + k9: git-derived changed set, build record consumed for identity only, grounding served daemon-side, all read-only."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 6 LOW** · model `client` · reviewed 2026-08-03T08:11:05.680Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| sc1/c9 | citation | LOW | manual | requireApprovedLld is at src/workflow/gates.ts:255 and requireApprovedPlan at :354, the approved-contract gates resolveCodeReviewSubject reuses. | requireApprovedLld at src/workflow/gates.ts:255 and requireApprovedPlan at :354 confirmed — the approved-contract gates resolveCodeReviewSubject reuses exist as cited. | None; sc1's gate reuse is sound. |
| sc1/c2 | citation | LOW | manual | gitDiffTool is defined at src/daemon/tools/builtins/git/diff.ts:54 and returns GitDiffData whose files: GitDiffFileStat[] supplies subject.changedFiles. | gitDiffTool at src/daemon/tools/builtins/git/diff.ts:54, GitDiffData at :34, GitDiffFileStat at :24 — the git-diff mechanism supplying subject.changedFiles is real. | None; the git-derived changed-set basis holds. |
| sc3/c17 | citation | LOW | manual | Severity = 'HIGH'\|'MED'\|'LOW' is declared at src/workflow/review/types.ts:41 and is the type sc3's DimensionFinding reuses. | Severity = 'HIGH'\|'MED'\|'LOW' at src/workflow/review/types.ts:41 — the vocabulary sc3's DimensionFinding reuses exists exactly. | None; sc3 severity reuse is grounded. |
| sc1/c1 | semantic | LOW | manual | The build record (StandaloneBuildRecord in src/workflow/runners/build/standalone-record.ts) does NOT persist a changed-file set — its body is {focus, producesLld} — which is why sc1's changedFiles must be git-derived. | StandaloneBuildRecord at standalone-record.ts:22 confirmed; `changedFiles` appears in src/ only in gh/pr.ts + git/commit.ts, NEVER in a build record — confirming the build record persists no changed-file set, so sc1 correctly derives it from git. | None; the git-derivation refinement of the HLD sketch is correctly grounded. |
| sc1/c1 | citation | LOW | manual | BuildUpstream in src/workflow/gates.ts is {plan: PlanArtifact} and readBuildUpstream just wraps requireApprovedPlan — no changed-file set is available from the upstream reader. | BuildUpstream at gates.ts:443 (interface) + readBuildUpstream at :449 confirmed — the upstream reader carries only {plan}, no changed-file set, as the LLD states. | None; the migration stateBefore claim holds. |
| sc2/c16 | citation | LOW | manual | The LMDB graph traversal API assembleCodeReviewGrounding uses lives under src/db/graph/, and the daemon (src/daemon/index.ts) is where a new 'codeReview.grounding' IPC handler is registered. | The graph traversal API (outNeighbors/inNeighbors et al) lives in src/db/graph/edges.js and is imported across analyze explorers; src/daemon/index.ts exists as the IPC registry — so sc2's daemon-served grounding assembly is grounded in real infrastructure. | None; sc2's graph+IPC basis holds. |
