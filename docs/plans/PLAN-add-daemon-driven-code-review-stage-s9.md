<!-- insrc:artifact PLAN-761a43a6fa645815-s9 -->

# Plan: E20260805761a43a6:S009

**Epic:** `add-daemon-driven-code-review-stage`
**LLD run:** `wf-1785906598929-39vvjl`
**LLD effective hash:** `48d9de9916c6...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add the codeReview.freshnessTimeoutMs config key | S | — | integration: reconcileConfig carries codeReview.freshnessTimeoutMs with its baked-in default and honours a per-repo/global override | [[c4]] |
| 2 | **`t2`** Add the read-only codeReview.freshness daemon IPC handler + freshness compute | M | — | unit: freshness compute: a changed file whose per-file indexedAt predates its mtime -> in staleFiles; unit: freshness compute: a changed file whose watermark is >= mtime -> NOT in staleFiles; unit: freshness compute: a changed path with no indexable graph entity -> excluded from staleFiles (does not block forever); unit: freshness compute: a never-indexed changed file (watermark 0) -> stale; unit: freshness compute: isProcessing mirrors queue.isProcessing and the handler never triggers repo.reindex (assert no reindex call on the injected queue/graph fakes); unit: codeReview.freshness handler: missing repo/epicHash/storyId -> { error } (parity with codeReview.grounding validation); integration: the 'codeReview.freshness' IPC handler returns { isProcessing, staleFiles } over the Unix socket for a fixture repo (peer of the existing codeReview.grounding IPC integration test) | [[c1]] |
| 3 | **`t3`** Add the fetchCodeReviewFreshness controller IPC client | S | `t2` | unit: fetchCodeReviewFreshness: forwards params to the codeReview.freshness IPC and returns { isProcessing, staleFiles }; an { error }/socket failure propagates as a code-review-step error | [[c2]] |
| 4 | **`t4`** Add the groundingMode field to the code-review record + stamp 'full' | S | — | unit: runCodeReview stamps groundingMode:'full' on the persisted record body; a record without groundingMode still parses (no verdict-reader breaks) | [[c4]] |
| 5 | **`t5`** Extend the code-review-step protocol types for the confirm_wait handshake | S | — | unit: types compile: CodeReviewStepInputStart accepts optional proceed?/state?, the plain start call still typechecks, and the ConfirmWait output member is assignable (tsc over the code-review-step module) | [[c4]] |
| 6 | **`t6`** Insert the freshness gate + block-and-poll + re-prompt/abort into the start phase | M | `t3`, `t4`, `t5` | unit: start: stale (staleFiles non-empty) and no proceed -> returns next:'confirm_wait' carrying the stale-file list + state, and fetchGrounding is NEVER called; unit: start: isProcessing true (empty staleFiles) and no proceed -> also returns confirm_wait; unit: start: fresh (empty staleFiles AND not processing) -> no confirm_wait; calls fetchGrounding then returns emit_judgements; unit: proceed:true resume: fetchFreshness reports stale for 2 ticks then fresh -> the poll loops (asserts ≥N fetchFreshness calls via the fake), never calls a reindex seam, then continues to grounding; unit: proceed:true resume: freshness never becomes fresh before codeReview.freshnessTimeoutMs (fake clock) -> returns confirm_wait again (the re-prompt), not a unilateral proceed/abort; unit: abort resume (proceed:false + state) -> terminal fail-closed result: runReview is NEVER invoked and the write seam is NEVER called; unit: the fresh path stamps groundingMode:'full' on the persisted record (assert the write payload / runReview input carries groundingMode:'full'); unit: freshness IPC error on the initial check -> next:'error' (freshness-unavailable), no confirm_wait, no write; unit: proceed resume with a released/missing state token -> next:'error' state-not-found (retryable:false), nothing written | [[c3]] |
| 7 | **`t7`** Add the unit + integration tests and run the suites green | M | `t2`, `t6` | unit: full code-review + mcp sweep passes green (npx tsx --test), confirming no untouched conventions/quality/dimension behaviour regressed | [[c5]] |

### E20260805761a43a6:S009:T001 — Add the codeReview.freshnessTimeoutMs config key

Add an additive CONFIG_CATALOG entry { path:'codeReview.freshnessTimeoutMs', type:'number', default:120000, desc:'max ms the code-review freshness gate block-and-polls before re-prompting' } beside codeReview.enforce in src/config/config-catalog.ts. No existing config migrates; reconcileConfig carries it forward with the baked-in default.

**Acceptance checks:**
- config-catalog.ts has a codeReview.freshnessTimeoutMs entry (type number, sensible baked-in default) beside codeReview.enforce
- reconcileConfig surfaces the key with its default and honours a per-repo/global override, with no migration of existing config

### E20260805761a43a6:S009:T002 — Add the read-only codeReview.freshness daemon IPC handler + freshness compute

Register an additive 'codeReview.freshness' handler in the daemon handler map (src/daemon/index.ts) beside codeReview.grounding, validating repo/epicHash/storyId like its peer. It computes { isProcessing: queue.isProcessing, staleFiles } where staleFiles is the subset of changedFiles whose per-file indexedAt watermark (src/db/graph/codec.ts:159 / entities.ts:101) predates the file's mtime; a changed path with no indexable entity is excluded (repo-level lastIndexed fallback), a never-indexed indexable file is stale. Strictly read-only — never calls repo.reindex, mutates no store.

**Acceptance checks:**
- 'codeReview.freshness' is a registered daemon IPC handler beside codeReview.grounding; missing repo/epicHash/storyId returns { error }
- isProcessing mirrors queue.isProcessing; the handler never triggers repo.reindex and mutates no store
- a changed file whose per-file indexedAt predates its mtime is in staleFiles; watermark>=mtime is NOT; a non-indexable path is excluded; a never-indexed indexable file is stale

### E20260805761a43a6:S009:T003 — Add the fetchCodeReviewFreshness controller IPC client

Add fetchCodeReviewFreshness to src/mcp/daemon-stream.ts as an additive peer of fetchCodeReviewGrounding (daemon-stream.ts:301): it forwards { repo, epicHash, storyId, changedFiles } to the codeReview.freshness IPC and returns { isProcessing, staleFiles }, propagating an { error }/socket failure as a code-review-step error. No graph is opened controller-side (k5).

**Acceptance checks:**
- fetchCodeReviewFreshness calls the codeReview.freshness IPC and returns { isProcessing, staleFiles }
- an IPC { error } or socket failure is surfaced as a propagated error (parity with fetchCodeReviewGrounding), never a silent fall-through

### E20260805761a43a6:S009:T004 — Add the groundingMode field to the code-review record + stamp 'full'

Widen the code-review record body type in src/workflow/code-review/types.ts with an additive groundingMode field (this story only ever writes 'full'), and stamp groundingMode:'full' at the record-build/runCodeReview path (src/workflow/code-review/runner.ts) for the graph-grounded run. Existing records without the field remain readable; the completion gate + readers ignore the extra field.

**Acceptance checks:**
- the code-review record body type carries groundingMode and every record runCodeReview writes on the graph-grounded path is stamped groundingMode:'full'
- existing records without groundingMode still parse; no downstream verdict-reader breaks

### E20260805761a43a6:S009:T005 — Extend the code-review-step protocol types for the confirm_wait handshake

In src/mcp/code-review-step/types.ts: add optional proceed?/state? to CodeReviewStepInputStart (:31); add the CodeReviewStepConfirmWait member { next:'confirm_wait'; staleFiles; isProcessing; guidance; state } to the CodeReviewStepOutput union (:91); make CodeReviewStepStatePayload.grounding optional (:100) so the pre-grounding confirm_wait state is representable. All additive to the existing start/judgements envelope (k2).

**Acceptance checks:**
- CodeReviewStepInputStart accepts optional proceed?/state?; the plain { phase:'start', epicHash, storyId, repo? } call still typechecks
- CodeReviewStepOutput includes the ConfirmWait member; CodeReviewStepStatePayload.grounding is optional

### E20260805761a43a6:S009:T006 — Insert the freshness gate + block-and-poll + re-prompt/abort into the start phase

In src/mcp/code-review-step/handler.ts, before fetchCodeReviewGrounding: call fetchCodeReviewFreshness(subject.changedFiles). If stale (isProcessing OR staleFiles non-empty) and no proceed → saveState + return CodeReviewStepConfirmWait. On proceed:true → block-and-poll fetchCodeReviewFreshness at a fixed internal interval until fresh or codeReview.freshnessTimeoutMs, re-prompting (confirm_wait) on timeout; on abort → fail closed (no runReview, no write). On fresh → continue to fetchCodeReviewGrounding + emit_judgements unchanged, and thread groundingMode:'full' into the record path. Wire the fetchFreshness + sleep/now seams into DEFAULT_DEPS (handler.ts:62). Map freshness IPC errors + StateTokenNotFound to CodeReviewStepError.

**Acceptance checks:**
- stale + no proceed returns confirm_wait with the stale-file list and NEVER calls fetchGrounding; fresh proceeds to emit_judgements as today
- proceed:true block-and-polls until fresh (never repo.reindex) then continues; timeout returns confirm_wait again (re-prompt); abort fails closed with no judges + no record
- the fresh path stamps groundingMode:'full'; freshness IPC error → next:'error' (freshness-unavailable); missing/released state token → next:'error' state-not-found

### E20260805761a43a6:S009:T007 — Add the unit + integration tests and run the suites green

Wire the tests authored alongside t1-t6 into the suites and run them green: the handler unit tests + daemon freshness-compute unit tests (incl. non-indexable-path exclusion + never-indexed=stale as distinct assertions) + the gated integration tests (codeReview.freshness IPC socket round-trip + config reconcile). Confirm the code-review + mcp suites pass and no untouched dimension/conventions/quality behaviour regressed.

**Acceptance checks:**
- unit tests cover all ac1-ac5 handler behaviours + the daemon freshness compute cases (incl. non-indexable-path exclusion + never-indexed=stale as distinct assertions), using injected seams (no real daemon/wall-clock)
- the gated integration test exercises the codeReview.freshness IPC over the socket + config reconcile
- npx tsx --test over src/mcp/code-review-step/**/*.test.ts + the daemon freshness test passes green

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| start: stale (staleFiles non-empty) and no proceed -> returns next:'confirm_wait' carrying the stale-file list + state, and fetchGrounding is NEVER called | `t6` |
| start: isProcessing true (empty staleFiles) and no proceed -> also returns confirm_wait | `t6` |
| start: fresh (empty staleFiles AND not processing) -> no confirm_wait; calls fetchGrounding then returns emit_judgements | `t6` |
| proceed:true resume: fetchFreshness reports stale for 2 ticks then fresh -> the poll loops (asserts ≥N fetchFreshness calls via the fake), never calls a reindex seam, then continues to grounding | `t6` |
| proceed:true resume: freshness never becomes fresh before codeReview.freshnessTimeoutMs (fake clock) -> returns confirm_wait again (the re-prompt), not a unilateral proceed/abort | `t6` |
| abort resume (proceed:false + state) -> terminal fail-closed result: runReview is NEVER invoked and the write seam is NEVER called | `t6` |
| the fresh path stamps groundingMode:'full' on the persisted record (assert the write payload / runReview input carries groundingMode:'full') | `t6`, `t4` |
| freshness IPC error on the initial check -> next:'error' (freshness-unavailable), no confirm_wait, no write | `t6` |
| proceed resume with a released/missing state token -> next:'error' state-not-found (retryable:false), nothing written | `t6` |
| freshness compute: a changed file whose per-file indexedAt predates its mtime -> in staleFiles | `t2` |
| freshness compute: a changed file whose watermark is >= mtime -> NOT in staleFiles | `t2` |
| freshness compute: a changed path with no indexable graph entity -> excluded from staleFiles (does not block forever) | `t2` |
| freshness compute: a never-indexed changed file (watermark 0) -> stale | `t2` |
| freshness compute: isProcessing mirrors queue.isProcessing and the handler never triggers repo.reindex (assert no reindex call on the injected queue/graph fakes) | `t2` |
| codeReview.freshness handler: missing repo/epicHash/storyId -> { error } (parity with codeReview.grounding validation) | `t2` |
| the 'codeReview.freshness' IPC handler returns { isProcessing, staleFiles } over the Unix socket for a fixture repo (peer of the existing codeReview.grounding IPC integration test) | `t2` |
| reconcileConfig carries codeReview.freshnessTimeoutMs with its baked-in default and honours a per-repo/global override | `t1` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s9 contractDetails.codeReview.freshness — the new read-only daemon IPC computing { isProcessing, staleFiles } from queue.isProcessing + the per-file watermark, never repo.reindex` — "'codeReview.freshness': (params: { repo, epicHash, storyId, changedFiles }) => Promise<{ isProcessing, staleFiles } | { error }> — read-only, additive peer of codeReview.grounding."
- **[[c2]]** `prior-artifact` `LLD s9 contractDetails.fetchCodeReviewFreshness — the controller IPC client peer of fetchCodeReviewGrounding` — "fetchCodeReviewFreshness(deps, params) => Promise<{ isProcessing, staleFiles }> — the controller's only access to queue/graph freshness (k5); propagates { error }/socket failure."
- **[[c3]]** `prior-artifact` `LLD s9 contractDetails.handleCodeReviewStep (reshaped start phase) — the gate + confirm_wait/proceed handshake + bounded block-and-poll + re-prompt/abort` — "Before fetchCodeReviewGrounding: fetchCodeReviewFreshness; stale => confirm_wait; proceed => block-and-poll until fresh or codeReview.freshnessTimeoutMs then re-prompt; fresh => grounding + judges; ab"
- **[[c4]]** `prior-artifact` `LLD s9 dataModelChanges — CodeReviewStepInputStart proceed?/state?, the ConfirmWait output, optional state grounding, the record groundingMode field, and the codeReview.freshnessTimeoutMs config key` — "Additive: CodeReviewStepInputStart += proceed?/state?; CodeReviewStepOutput += ConfirmWait; state grounding optional; CodeReviewBody += groundingMode:'full'; CONFIG_CATALOG += codeReview.freshnessTime"
- **[[c5]]** `prior-artifact` `LLD s9 testStrategy — handler unit (gate/poll/timeout/abort/groundingMode/errors), daemon freshness-compute unit, and the gated IPC round-trip + config reconcile integration` — "node:test via npx tsx --test; injected fetchFreshness/fetchGrounding/runReview/write + fake sleep/now seams for the handler; fake queue+watermark for the compute; gated socket harness for the IPC."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 8 LOW** · model `client` · reviewed 2026-08-05T05:34:06.016Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| t1 | citation | LOW | manual | codeReview.enforce is a CONFIG_CATALOG entry at src/config/config-catalog.ts:84 — where t1's additive codeReview.freshnessTimeoutMs peer lands. | config-catalog.ts:84 resolves (codeReview.enforce CONFIG_CATALOG entry) — t1's peer key lands there. | None — verified. |
| t2 | citation | LOW | manual | The daemon handler map registers codeReview.grounding at src/daemon/index.ts:594 and queue.isProcessing is at src/daemon/queue.ts:154 — the peer + surfaces t2's codeReview.freshness handler registers beside and reads. | index.ts:594 (codeReview.grounding handler) + queue.ts:154 (isProcessing getter) both resolve — the peer + surfaces t2 registers beside/reads. | None — verified. |
| t2 | citation | LOW | manual | The per-file indexedAt watermark exists on EntityRow at src/db/graph/codec.ts:159 (parsed at src/db/entities.ts:101) — the granularity t2's freshness compute reads. | codec.ts:159 + entities.ts:101 (indexedAt) resolve — the per-file watermark t2's compute reads exists. | None — verified. |
| t3 | citation | LOW | manual | fetchCodeReviewGrounding is the controller IPC client at src/mcp/daemon-stream.ts:301 — the peer t3's fetchCodeReviewFreshness mirrors. | daemon-stream.ts:301 (export function fetchCodeReviewGrounding) resolves — the client peer t3 mirrors. | None — verified. |
| t4 | citation | LOW | manual | runCodeReview (src/workflow/code-review/runner.ts) + the record body types (src/workflow/code-review/types.ts) exist — where t4 stamps groundingMode:'full'. | runCodeReview + CodeReviewBody/CodeReviewArtifact resolve — the record-fold/persist path t4 stamps groundingMode:'full' on exists. | None — verified. |
| t5 | citation | LOW | manual | The code-review-step protocol types t5 extends exist: CodeReviewStepInputStart (types.ts:31), the output union (types.ts:91), CodeReviewStepStatePayload (types.ts:100). | types.ts:31 (CodeReviewStepInputStart) + :100 (CodeReviewStepStatePayload) + the output union resolve — the protocol types t5 extends exist. | None — verified. |
| t6 | citation | LOW | manual | handler.ts imports fetchCodeReviewGrounding (handler.ts:26) with DEFAULT_DEPS + DIMENSIONS + state-store seams — the start phase t6 inserts the gate before, and the state-store (StateTokenNotFound/loadState) the abort path uses. | handler.ts:26 (fetchCodeReviewGrounding import) + DEFAULT_DEPS + StateTokenNotFound/loadState resolve — the start-phase insertion point + state-store seams t6 uses exist. | None — verified. |
| tasks | ordering | LOW | manual | The task dependency graph (t3←t2; t6←{t3,t4,t5}; t7←{t2,t6}) is acyclic and order 1..7 is a valid topological order. | Edges t3←t2, t6←{t3,t4,t5}, t7←{t2,t6} form a DAG; order 1..7 places each task after its deps. Acyclic + valid topological order. | None — consistent. |
