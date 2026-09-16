<!-- insrc:artifact LLD-761a43a6fa645815-s6 -->

# LLD: E20260804761a43a6:S006

**Epic:** `add-daemon-driven-code-review-stage`
**HLD base run:** `wf-1785741597494-lbzdo7`
**HLD effective hash:** `47535369867a...`

## HLD context

**Framework:** A hybrid code-review stage (winner a3): a code-review-specific orchestrator runs the four dimensions (adherence/conventions/coverage/quality) as an explicit SERIAL provider loop, reusing src/daemon/workflow-rpc.ts's proven machinery (buildShaperProvider resolution, synthesize-with-retry, writeAtomic, meta-stamping, optional boundary re-audit, the runStart StreamHandler shape) rather than cloning it, and mirroring the existing review vocabulary (ReviewVerdict / Severity / ReviewReport from src/workflow/review/types.ts) so the persisted CodeReviewArtifact carries a block/warn/pass verdict downstream approval already understands. The daemon-driven path and the controller-driven insrc_code_review_step (which mirrors insrc_review_step's start/emit/done/error/opaque-state envelope) share ONE orchestrator, differing only in who supplies each dimension's judgement. The stage runs after build, consumes the build record + approved LLD/PLAN as its fixed subject without re-deriving them, and never modifies the code it judges.
**Rollout phase:** Phase C — Aggregate record + runner
**Owns:** `sc4` (CodeReviewArtifact), `sc5` (CodeReviewRunner)
**Consumes:** `sc1` (CodeReviewSubject), `sc3` (DimensionFinding)

## Contract details

**Surface level:** internal-shared

### `runCodeReview`

```typescript
export async function runCodeReview(subject: CodeReviewSubject, provider: LLMProvider, opts: RunCodeReviewOpts, deps?: CodeReviewRunnerDeps): Promise<CodeReviewOutcome>
```

**Parameters:**
- `subject: CodeReviewSubject` — The fixed sc1 review subject (already resolved by the caller). subject.changedFiles scopes grounding + becomes the sc4 body.subject; epicHash/storyId key the persisted record. approvedLld/Plan/buildRecord are not re-derived.
- `provider: LLMProvider` — The resolved model provider pinned no lower than the high tier by the caller (k10/k3); passed through to each of the four judges in turn. The judge, not the runner, issues the completeStructured call.
- `opts: RunCodeReviewOpts` — { runId, modelLabel (the resolved high-tier label stamped on meta), signal?, onProgress? } — mirrors workflow-rpc's run opts; onProgress emits CodeReviewProgress frames (grounding / dimension-start / dimension-done / finalize / done / error).
- `deps: CodeReviewRunnerDeps` _(optional)_ — Injectable seams defaulting to the real implementations: { judges: readonly {dimension, judge}[] (the four shipped judge fns in fixed order), assembleGrounding, write } — tests substitute fakes so the runner is exercised without a live daemon/Ollama.

**Returns:** `Promise<CodeReviewOutcome>` — { ok:true, artifact } after the sc4 CodeReviewArtifact is validated in memory and written atomically at CR-<epic>-<story>; or { ok:false, error } when a dimension judge threw (structured-output exhaustion) or grounding/validation failed — in which case NO pass record is written (ac5).

**Errors:**
- `returned { ok:false, error } (not thrown)` when A dimension judge throws mid-loop (withStructuredRetry exhaustion), grounding assembly fails, or the built record fails in-memory validation — the runner converts these into the {ok:false} outcome BEFORE any writeAtomic, so no partial/pass record is persisted (ac5).

**Preconditions:**
- subject already resolved ok by the caller (sc1's no-approved-contract→no-verdict enforced upstream)
- provider.capabilities.structuredOutput available and pinned to the high tier (k10)

**Postconditions:**
- The four judges run in a SERIAL for-of loop — never Promise.all over the provider (k4/ac4)
- On success exactly one sc4 record is written atomically (writeAtomic tmp-then-rename) at CR-<epic>-<story>; validation precedes the write so a partway failure leaves no file (ac5)
- The persisted body carries all four DimensionResult[] + a folded ReviewVerdict (any HIGH→block, else any MED→warn, else pass) + counts (ac1); verdict+counts mirror ReviewReport verbatim (ac2)
- No source file is modified (read-only; S001 ac5)

### `codeReviewArtifactId`

```typescript
export function codeReviewArtifactId(epicHash: string, storyId: string): string
```

**Parameters:**
- `epicHash: string` — The Epic hash component of the id.
- `storyId: string` — The Story id component of the id.

**Returns:** `string` — `CR-${epicHash}-${storyId}` — the canonical .json basename id for the code-review record, a peer of buildArtifactId's `BUILD-...` in its own CR- namespace so it never collides with or overwrites the artifact review (ac3).

**Postconditions:**
- The CR- prefix is distinct from every existing artifact id prefix (DEF/HLD/LLD/PLAN/BUILD/EXT/SPEC), keeping the code review its own kind (ac3/c106)

### `codeReviewArtifactPaths`

```typescript
export function codeReviewArtifactPaths(repoPath: string, epicHash: string, storyId: string, epicSlug?: string): { readonly md: string; readonly json: string }
```

**Parameters:**
- `repoPath: string` — Absolute repo root the paths are joined under.
- `epicHash: string` — Epic hash — into the json id.
- `storyId: string` — Story id — into the json id.
- `epicSlug: string` _(optional)_ — Optional human slug for the .md filename segment (fileSeg), as in the sibling *ArtifactPaths.

**Returns:** `{ md: string; json: string }` — The rendered .md path and the canonical .json path (join(repoPath, ARTIFACTS_DIR, `${codeReviewArtifactId(...)}.json`)) — the peer of buildArtifactPaths, the two files writeAtomic targets.

**Postconditions:**
- json lands under ARTIFACTS_DIR ('.insrc/artifacts') exactly like every sibling artifact

## Data model changes

### `CodeReviewArtifact / CodeReviewBody (sc4)` — new

New persisted record type. CodeReviewBody = { kind:'code-review', epicHash, storyId, subject:{changedFiles}, dimensions: readonly DimensionResult[] (all four, sc3), verdict: ReviewVerdict (reused verbatim from src/workflow/review/types.ts), counts:{high,med,low} }. CodeReviewArtifact = { meta: CodeReviewMeta extends ArtifactMetaBase, body: CodeReviewBody } — the same WorkflowArtifact shape as LldArtifact/PlanArtifact so meta-stamping is reused. verdict+counts mirror ReviewReport (ac2); kind + subject keep it distinct from the artifact review (ac3).

```
+ CodeReviewBody { kind:'code-review'; epicHash; storyId; subject:{changedFiles}; dimensions: DimensionResult[]; verdict: ReviewVerdict; counts:{high,med,low} }
+ CodeReviewArtifact = { meta: CodeReviewMeta extends ArtifactMetaBase; body: CodeReviewBody }
```

**Call sites:**
- `src/workflow/code-review/types.ts (sc4 types, extended) or a peer artifact file`
- `src/workflow/review/types.ts (ReviewVerdict/Severity reused, unchanged)`
- `src/workflow/code-review/runner.ts (new producer)`

### `CodeReviewOutcome (sc4)` — new

The runner's return discriminated union { ok:true, artifact: CodeReviewArtifact } | { ok:false, error: string }. The {ok:false} arm is the ac5 no-pass-on-partial-failure signal — a run that fails partway returns it and writes nothing.

**Call sites:**
- `src/workflow/code-review/types.ts (sc4)`
- `src/workflow/code-review/runner.ts (returned)`

### `codeReviewArtifactId / codeReviewArtifactPaths (storage peers)` — new

Additive peers of buildArtifactId (storage.ts:161) + buildArtifactPaths (storage.ts:285): codeReviewArtifactId => 'CR-<epic>-<story>', codeReviewArtifactPaths => {md, json} under ARTIFACTS_DIR. No existing id/paths fn is changed; the CR- namespace is new.

```
+ storage.ts: codeReviewArtifactId(epicHash, storyId): string  // 'CR-<epic>-<story>'
+ storage.ts: codeReviewArtifactPaths(repoPath, epicHash, storyId, epicSlug?): {md, json}
```

**Call sites:**
- `src/workflow/storage.ts (new peers alongside buildArtifactId :161 / buildArtifactPaths :285 / ARTIFACTS_DIR :50 / writeAtomic :73)`

### `CodeReviewRunnerDeps + RunCodeReviewOpts + CodeReviewProgress (sc5)` — new

The runner's injectable seam type CodeReviewRunnerDeps = { judges: readonly {dimension: ReviewDimension; judge: (s,g,p)=>Promise<DimensionResult>}[]; assembleGrounding: (repoPath, changedFiles)=>Promise<CodeReviewGrounding>; write: (absPath, content)=>void } (DEFAULT_DEPS wires the four shipped judges + S001's assembler + writeAtomic). RunCodeReviewOpts + CodeReviewProgress per the sc5 sketch. Private to the runner module; injected for tests.

**Call sites:**
- `src/workflow/code-review/runner.ts (sc5)`
- `src/workflow/code-review/dimensions/*.ts (the four judge fns wired into DEFAULT_DEPS)`
- `src/workflow/code-review/subject.ts / grounding.ts (S001 assembler wired into DEFAULT_DEPS)`

### `daemon 'codeReview.run' StreamHandler` — new

A thin daemon IPC handler (peer of workflow.run's runStart) in a new src/daemon/code-review-rpc.ts + registered in daemon/index.ts: resolves the high-tier provider (buildShaperProvider, k10), assembles/receives the subject, calls runCodeReview streaming CodeReviewProgress frames through the existing StreamHandler, and returns the outcome. Wiring only — the load-bearing logic lives in runCodeReview.

```
+ daemon/index.ts stream-handlers map: 'codeReview.run': (params, send, signal) => codeReviewRunStart(...)
```

**Call sites:**
- `src/daemon/index.ts (handler registration, peer of the 'codeReview.grounding' handler + workflow.run)`
- `src/daemon/workflow-rpc.ts (runStart StreamHandler + WorkflowProgress :106 shape mirrored)`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc4` | implements | s6 owns sc4: defines CodeReviewArtifact/CodeReviewBody/CodeReviewOutcome and the codeReviewArtifactId/Paths persistence, produced by the runner and read by s7 (gate) + s8 (controller). verdict+counts mirror ReviewReport (ac2); kind+subject+CR- id keep it distinct (ac3). |
| `sc5` | implements | s6 owns sc5: runCodeReview(subject, provider, opts, deps?) is the serial orchestrator (the sketched runServerSide), and the thin daemon 'codeReview.run' StreamHandler is its IPC peer of workflow.run's runStart. s8 consumes this runner controller-side. |
| `sc1` | consumes | Reads subject.changedFiles (to scope grounding + populate body.subject) and epicHash/storyId (to key CR-<epic>-<story>); subject is treated read-only and its approvedLld/Plan/buildRecord are consumed for identity, never re-derived. |
| `sc3` | consumes | Collects the four DimensionResult[] (sc3) the judges return, stores them as body.dimensions, and folds their DimensionFinding severities into the ReviewVerdict + counts — sc3 is read as-is, no field added or changed. |

## Error paths

### Error cases

- **A dimension judge throws mid-loop (its withStructuredRetry exhausted 3 attempts on unvalidatable model output).** (recoverable)
  - Detection: The throw propagates out of the await inside the SERIAL for-of loop; the runner's try/catch around the loop catches it BEFORE the finalize/writeAtomic step is reached.
  - Response: The runner returns { ok:false, error } with the failing dimension named; it does NOT build or write a record, so no CR-<epic>-<story> file exists claiming a pass (ac5). onProgress emits an 'error' frame. The remaining dimensions are not run.
  - User impact: The run is reported as a failure, not a clean pass — the reviewer sees an error and re-runs, never a silently-empty 'no findings' record.
- **Grounding assembly fails (the graph/daemon cannot produce sc2 summaries for the changed files).** (recoverable)
  - Detection: deps.assembleGrounding rejects/throws before the judge loop starts; caught by the same guard.
  - Response: Returns { ok:false, error }; nothing is written. onProgress emits 'error' at the 'grounding' phase.
  - User impact: The reviewer sees a grounding failure rather than a spurious pass on un-grounded code.
- **The built record fails in-memory validation just before persistence (e.g. a mis-shaped DimensionResult, an out-of-range count, a verdict not in the ReviewVerdict union).** (recoverable)
  - Detection: The runner validates the assembled CodeReviewArtifact in memory (shape + counts consistency + verdict ∈ {'pass','warn','block'}) BEFORE calling writeAtomic — the same validate-then-write order as the existing finalize.
  - Response: Returns { ok:false, error }; writeAtomic is never called, so no partial/invalid file is left (ac5). The validation is the last gate before the irreversible write.
  - User impact: A corrupt record never lands on disk; the run reports the validation failure.
- **opts.signal is aborted between dimensions (a daemon-driven run is cancelled).** (recoverable)
  - Detection: The runner checks signal.aborted at each for-of iteration boundary (mirroring workflow-rpc's abort checks).
  - Response: The loop breaks and the runner returns { ok:false, error:'aborted' } without writing — an aborted run leaves no pass record, exactly like a failed one (ac5).
  - User impact: Cancelling a run mid-flight never leaves a stale pass record behind.

### Edge cases

| Input | Expected |
| :--- | :--- |
| All four dimensions return findings:[] (the changed code is clean on every dimension). | The fold yields verdict:'pass', counts:{high:0,med:0,low:0}; one sc4 record is written with dimensions:[four empty results] and verdict:'pass' (ac1). An empty review is still a persisted PASS record, not an absence. |
| The aggregated findings contain at least one HIGH severity (from any dimension). | verdict:'block' (any HIGH => block), regardless of how many MED/LOW exist; counts reflect the true totals (ac1/ac2). |
| The aggregated findings contain MED (but no HIGH). | verdict:'warn' (any MED, no HIGH => warn). |
| The aggregated findings contain only LOW severities. | verdict:'pass' (LOW does not warn or block) — consistent with the artifact-review verdict fold, so ac2 holds. |
| A code review is finalised for a Story that already has a design-artifact review on disk. | The code review is written at CR-<epic>-<story> (its own namespace) and the artifact review at its own id — neither overwrites the other; both are readable, each identifiable by kind (ac3/c106). |
| The subject's changedFiles is empty (a build that changed no indexed files). | Grounding yields no symbols; the judges each return findings:[] (nothing in scope); the fold yields verdict:'pass' and a record is still written — a vacuous but valid PASS. |

### Invariants to preserve

- Nothing that reaches an LLM provider is issued under Promise.all — the runner drives the four judges in a SERIAL for-of loop, each awaited before the next (the s1 symbol.locate bundle shows the four judges' uniform single-call signature the loop sequences). [[c17]]
- A run that fails partway persists NO pass record: the runner VALIDATES the assembled record in memory before calling writeAtomic, and a throwing judge / grounding failure / abort returns {ok:false} before that write — the same validate-then-writeAtomic order the existing finalize uses (the s1 storage.locate bundle establishes writeAtomic tmp-then-rename + the finalize order). [[c15]]
- The persisted verdict + counts mirror the existing review vocabulary (ReviewVerdict 'pass'|'warn'|'block' + counts) verbatim so no downstream reader needs a second interpretation (the s1 contract.trace bundle shows ReviewVerdict/ReviewReport at src/workflow/review/types.ts:43/:134). [[c2]]
- The code-review record stays distinct in kind from the artifact review: its own body.kind:'code-review', its own subject, and its own CR-<epic>-<story> id namespace, so neither overwrites the other and both coexist (the s1 storage.locate bundle shows the per-kind *ArtifactId namespaces the CR- prefix joins). [[c8]]
- The record is written through the existing writeAtomic (tmp-then-rename) under ARTIFACTS_DIR and stamped like every other artifact (meta extends ArtifactMetaBase) — the runner reuses the storage + meta machinery rather than reinventing it (the s1 storage.locate + data-model.trace bundles). [[c15]]

## Test strategy

**Test framework:** `node:test + node:assert/strict via `npx tsx --test` (matching the code-review dimension tests + the repo's existing __tests__ layout)`

### Test levels

- **unit** — Prove runCodeReview's serial loop + verdict fold + validate-then-write + no-pass-on-failure with a fake provider and INJECTED fake judges/assembler/write — no live daemon or Ollama.
  - Subjects: `runCodeReview (serial for-of over the four injected judges in order; fold verdict from aggregated severities; build sc4 record; validate-then-write; return CodeReviewOutcome)`, `verdict fold (any HIGH=>block, else any MED=>warn, else pass) over the aggregated DimensionFinding severities + counts`, `codeReviewArtifactId / codeReviewArtifactPaths ('CR-<epic>-<story>' id + {md,json} under ARTIFACTS_DIR)`, `the CodeReviewOutcome discriminated union (ok:true carries artifact; ok:false carries error and writes nothing)`
  - Fixtures: `A fake CodeReviewRunnerDeps: judges = an ordered list of stub judge fns that record call order + return scripted DimensionResults (one throwing, for ac5); assembleGrounding = a stub returning a canned CodeReviewGrounding; write = a spy capturing (path, content) instead of touching disk`, `A fake LLMProvider (unused by the stub judges but passed through to prove it reaches each judge)`, `A subject(changedFiles, epicHash, storyId) factory + a RunCodeReviewOpts with an onProgress spy collecting CodeReviewProgress frames`
- **live** — Optional end-to-end run against a real high-tier provider + real grounding on a fixture Story, asserting a real CR-<epic>-<story> record is written with a coherent verdict — gated behind INSRC_LIVE_TESTS.
  - Subjects: `runCodeReview with DEFAULT_DEPS (the four real judges + real assembler + writeAtomic) against a real buildShaperProvider-resolved provider`
  - Fixtures: `A registered+indexed fixture repo with an approved LLD/PLAN + a build for the subject Story`, `INSRC_LIVE_TESTS=1 gate (skips cleanly when unset)`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: 'a run with all four judges returning findings persists ONE record carrying dimensions:[all four] + a folded verdict' — stub judges return mixed findings; assert the written record's body.dimensions has 4 entries and body.verdict is set + counts match`, `unit: 'the four dimensions are all present in the persisted record' — assert body.dimensions maps to [adherence, conventions, coverage, quality]` |
| `ac2` | `unit: 'verdict fold matches the ReviewVerdict vocabulary' — table test: any-HIGH=>block, any-MED-no-HIGH=>warn, only-LOW-or-empty=>pass; assert body.verdict ∈ {'pass','warn','block'} and counts:{high,med,low} are the true totals`, `unit: 'the record's verdict + counts fields are shaped like ReviewReport' — assert body has verdict + counts (the artifact-review parity fields)` |
| `ac3` | `unit: 'the record is written at CR-<epic>-<story> (its own namespace) and carries kind:code-review' — assert the write spy's json path basename is codeReviewArtifactId(...) and body.kind==='code-review'`, `unit: 'codeReviewArtifactId prefix is CR- (distinct from BUILD-/LLD-/PLAN-...)' — assert the id starts with 'CR-' so it cannot overwrite the artifact review` |
| `ac4` | `unit: 'the four judges run SERIALLY in order, never concurrently' — stub judges push their dimension to a shared call-order array with an await tick; assert the array is exactly [adherence, conventions, coverage, quality] and no two overlapped (a judge that inspects a shared in-flight flag sees it clear)` |
| `ac5` | `unit: 'a throwing judge aborts the run with {ok:false} and writes NOTHING' — the 2nd stub judge throws; assert the outcome is {ok:false, error}, the write spy was NEVER called, and dimensions 3-4 did not run`, `unit: 'an in-memory validation failure returns {ok:false} before writeAtomic' — force a mis-shaped fold; assert write spy not called and outcome ok:false`, `unit: 'an aborted signal returns {ok:false} and writes nothing' — pre-abort opts.signal; assert no write + ok:false` |

## Migration

**State before:** The code-review stage has all four dimension judges shipped (adherence.ts S002, conventions.ts S003, coverage.ts S004, quality.ts S005 — the s1 symbol.locate bundle confirms judgeAdherence:119 / judgeConventions:148 / judgeCoverage:150 / judgeQuality:124, all uniform (subject, grounding, provider): Promise<DimensionResult>), plus the S001 sc1/sc2/sc3 contracts + the codeReview.grounding IPC. But NOTHING yet aggregates the four judges into one record: there is no runner, no persisted code-review artifact type, and no CR- storage id. The existing storage.ts (s1 storage.locate bundle) provides the reusable pattern — ARTIFACTS_DIR:50, writeAtomic:73, buildArtifactId:161, buildArtifactPaths:285 — and review/types.ts (s1 contract.trace bundle) provides ReviewVerdict:43 + ReviewReport:134 the record mirrors. This story is additive: a new runner module + sc4 record types + storage peers + a thin daemon handler, importing the already-shipped judges; no existing exported symbol changes behaviour.

**State after:** A new src/workflow/code-review/runner.ts exports runCodeReview (sc5) — the serial orchestrator that assembles grounding, loops the four judges, folds the block/warn/pass verdict, validates, and writeAtomic-persists a CodeReviewArtifact (sc4) at CR-<epic>-<story>. sc4 types (CodeReviewBody/CodeReviewArtifact/CodeReviewOutcome) live in src/workflow/code-review/types.ts (or a peer artifact file). storage.ts gains additive codeReviewArtifactId/codeReviewArtifactPaths peers (new CR- namespace). A thin 'codeReview.run' StreamHandler is registered in daemon/index.ts (peer of the existing codeReview.grounding handler + workflow.run). The four judge modules, the S001 contracts, and every existing storage id are untouched. Downstream (s7 gate, s8 controller) can now read the sc4 record + drive the sc5 runner.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the sc4 record types (CodeReviewBody, CodeReviewArtifact, CodeReviewOutcome) reusing ReviewVerdict/Severity from review/types.ts and the WorkflowArtifact/ArtifactMetaBase shape. Type-only; no runtime behaviour. — ↩ rollbackable
2. Add the additive storage peers codeReviewArtifactId (=> 'CR-<epic>-<story>') and codeReviewArtifactPaths to storage.ts, alongside the existing *ArtifactId/*ArtifactPaths. No existing id/paths function is edited; the CR- namespace is new. — ↩ rollbackable
3. Add the runner module src/workflow/code-review/runner.ts (runCodeReview + DEFAULT_DEPS wiring the four shipped judges + S001's assembler + writeAtomic): serial judge loop, verdict fold, validate-then-write. No existing file edited; inert until a caller invokes it. — ↩ rollbackable
4. Add the thin daemon 'codeReview.run' StreamHandler (new src/daemon/code-review-rpc.ts) and REGISTER it in daemon/index.ts's stream-handlers map next to the existing 'codeReview.grounding' handler. The registration is additive — a new key, no existing handler changed. — ↩ rollbackable
5. Add unit tests (runner.test.ts) exercising runCodeReview with injected fake judges/assembler/write + fake provider. Test-only; no runtime surface change. — ↩ rollbackable

**Backward compat:** No backward-compatibility concern for existing public APIs: every change is additive — new sc4 types, new storage peer functions in a fresh CR- id namespace (no existing *ArtifactId/*ArtifactPaths touched), a new runner module, and a new daemon handler key. The four dimension judges, the S001 sc1/sc2/sc3 contracts, ReviewVerdict/ReviewReport, and writeAtomic/ARTIFACTS_DIR are all consumed unchanged. The one thing to guard: the new daemon 'codeReview.run' handler key must not collide with an existing IPC method — it is distinct from 'codeReview.grounding' and 'workflow.run'. Reverting is clean: delete the new files + the two additive storage peers + the one handler registration and the prior state is restored.

## Alternatives considered

### a1: Full sc4+sc5 as sketched — dimensions[] record + injectable serial runner + thin daemon IPC — **CHOSEN**

Implement the HLD's sc4/sc5 verbatim: a CodeReviewArtifact carrying dimensions: DimensionResult[] + a ReviewVerdict + counts, and a runServerSide(subject, provider, opts) that assembles grounding internally, drives a fixed ordered DEFAULT_JUDGES registry in a SERIAL for-of loop, folds the verdict, validates, then writeAtomic; plus a thin daemon 'codeReview.run' StreamHandler.



### a2: Grounding-injected runner (caller supplies grounding)

Same sc4 record, but the runner signature is runCodeReview(subject, grounding, provider, opts) — grounding is assembled by the caller and passed in, so the runner never touches S001's assembler.



**Rejected because:** Partial on sc5: it amends the sketched runServerSide(subject, provider, opts) signature to take grounding, and pushes grounding-assembly to EVERY caller (duplicating it across the daemon handler + the s8 controller). a1 already gets the same pure-fold testability by INJECTING the assembler as a dep, so a2's only gain is available without changing the public contract.

### a3: Flat ReviewReport-identical record (findings[] not dimensions[])

Maximise ac2 shape-parity by making the sc4 body a flat findings[] exactly like ReviewReport, dropping the dimensions[] grouping.



**Rejected because:** Violates sc4: replaces the owned sketch's dimensions: DimensionResult[] with a flat findings[], amending my own contract and breaking the surface s7/s8 were promised — for a parity that is illusory (a flat DimensionFinding[] is NOT ReviewReport.findings, which is the artifact-review Finding shape). The parity that matters (verdict vocabulary + counts) a1 already has.

## Citations

- **[[c2]]** `prior-artifact` `DEF/HLD 761a43a6fa645815 — the persisted record mirrors the existing artifact-review report shape (ReviewVerdict/Severity/ReviewReport) so downstream reads one verdict vocabulary (source of k1); the assumption behind sc4 + the sc3 Severity reuse + the ac2 verdict-parity invariant`
- **[[c6]]** `prior-artifact` `DEF/HLD 761a43a6fa645815 — the daemon-driven runner is a peer of workflow-rpc.ts runStart (buildShaperProvider resolution, streaming StreamHandler); the assumption behind sc5's daemon entrypoint + the CodeReviewProgress frames`
- **[[c8]]** `prior-artifact` `DEF/HLD 761a43a6fa645815 — the code review stays distinct in kind from the artifact review, both coexisting (source of k8/c106); the assumption behind sc4's kind+subject+CR- namespace and the ac3 distinctness invariant`
- **[[c9]]** `prior-artifact` `DEF/HLD 761a43a6fa645815 — the stage runs after build and consumes the build record + approved LLD/PLAN as the fixed subject (source of k9); assumption behind sc1`
- **[[c10]]** `prior-artifact` `DEF/HLD 761a43a6fa645815 — no-approved-contract→no-verdict; the subject requires an approved LLD + PLAN; assumption behind sc1`
- **[[c15]]** `prior-artifact` `DEF/HLD 761a43a6fa645815 — the runner reuses the existing writeAtomic (tmp-then-rename) + meta-stamping + validate-then-write finalize order so a partway failure persists no pass record (source of the durability NFR); the assumption behind sc5 + the ac5 no-partial-pass invariant`
- **[[c17]]** `prior-artifact` `DEF/HLD 761a43a6fa645815 — nothing reaching an LLM provider runs under Promise.all (serial calls, k4) + repo TS conventions (k11); the assumption behind sc3 and the serial-for-of-loop invariant (ac4)`
- **[[c20]]** `analyze-bundle` `s1 symbol.locate — the four shipped judges (adherence.ts:119, conventions.ts:148, coverage.ts:150, quality.ts:124), uniform (subject, grounding, provider): Promise<DimensionResult>, the runner sequences`
- **[[c21]]** `analyze-bundle` `s1 symbol.locate + contract.trace — storage.ts (ARTIFACTS_DIR:50, writeAtomic:73, buildArtifactId:161, buildArtifactPaths:285) + review/types.ts (ReviewVerdict:43, ReviewReport:134) the record + persistence reuse`
- **[[c22]]** `analyze-bundle` `s1 data-model.trace — the WorkflowArtifact/ArtifactMetaBase shape (lld.ts:141, plan.ts:71) the sc4 CodeReviewArtifact meta mirrors`
- **[[c23]]** `analyze-bundle` `s1 test.locate — the code-review dimension fake-provider harness + workflow-rpc.ts (WorkflowProgress:106, onProgress:120, runStart StreamHandler) the runner tests + daemon handler mirror`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 8 LOW** · model `client` · reviewed 2026-08-04T06:54:43.076Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| sx1 | citation | LOW | auto | The four dimension judges the runner sequences exist and export judge<Dim>: judgeAdherence, judgeConventions, judgeCoverage, judgeQuality. | adherence.ts:119, conventions.ts:148, coverage.ts:150, quality.ts:124 all export their judge<Dim> — the four uniform judges the runner sequences exist as cited. | none — verified sound |
| sx2 | citation | LOW | auto | storage.ts provides the persistence pattern the runner reuses: ARTIFACTS_DIR, writeAtomic, buildArtifactId, and buildArtifactPaths (the *ArtifactId/*ArtifactPaths peers the CR- id joins). | storage.ts:50 ARTIFACTS_DIR, :73 writeAtomic, :161 buildArtifactId, :285 buildArtifactPaths — the exact persistence pattern the CR- id/paths peers join, at the cited lines. | none — verified sound |
| sx3 | semantic | LOW | auto | review/types.ts declares ReviewVerdict = 'pass'\|'warn'\|'block' and Severity = 'HIGH'\|'MED'\|'LOW' and interface ReviewReport (verdict + counts) — the vocabulary sc4 mirrors. | review/types.ts:43 ReviewVerdict='pass'\|'warn'\|'block', :41 Severity='HIGH'\|'MED'\|'LOW', :134 interface ReviewReport — the verdict/report vocabulary sc4 mirrors, verbatim. | none — verified sound |
| sx4 | semantic | LOW | auto | Persisted artifacts extend ArtifactMetaBase and are WorkflowArtifact-shaped {meta, body} — the shape the sc4 CodeReviewArtifact mirrors (LldMeta/PlanMeta extend ArtifactMetaBase). | lld.ts:141 LldMeta extends ArtifactMetaBase (and ExtendMeta at extend.ts:40); ArtifactMetaBase is the widely-used artifact meta base the sc4 CodeReviewMeta mirrors. | none — verified sound |
| sx5 | external-contract | LOW | auto | workflow-rpc.ts exposes the runStart StreamHandler + WorkflowProgress/onProgress shape the daemon 'codeReview.run' handler + CodeReviewProgress mirror. | workflow-rpc.ts:106 exports interface WorkflowProgress (the runStart StreamHandler's progress shape) — the peer the daemon 'codeReview.run' handler + CodeReviewProgress mirror. onProgress is a field of the run opts in the same module (corroborated). | none — verified sound |
| sx6 | citation | LOW | auto | S001's grounding assembler (assembleCodeReviewGrounding) and the 'codeReview.grounding' daemon handler exist — the assembler the runner's DEFAULT_DEPS wires and the IPC peer the new 'codeReview.run' handler sits beside. | grounding.ts:61 exports assembleCodeReviewGrounding (the S001 assembler DEFAULT_DEPS wires) and daemon/index.ts:594 registers the 'codeReview.grounding' handler — the IPC peer the new 'codeReview.run' handler sits beside. | none — verified sound |
| sx7 | external-contract | LOW | auto | buildShaperProvider exists (the daemon handler resolves the high-tier provider through it, k10). | shaper-provider.ts:277 exports buildShaperProvider — the high-tier provider resolver the daemon handler uses (k10). | none — verified sound |
| sx8 | inventory | LOW | auto | No runner / sc4 record / CR- storage id exists yet: runCodeReview, codeReviewArtifactId, and CodeReviewBody are new (purely additive; not in src/ before this Story). | runCodeReview / codeReviewArtifactId / interface CodeReviewBody have zero src/ matches (only the LLD doc) — the runner, sc4 record, and CR- storage id do not exist yet, so the Story is purely additive. | none — verified sound |
