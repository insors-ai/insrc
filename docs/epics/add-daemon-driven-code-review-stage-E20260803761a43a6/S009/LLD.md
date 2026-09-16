<!-- insrc:artifact LLD-761a43a6fa645815-s9 -->

# LLD: E20260805761a43a6:S009

**Epic:** `add-daemon-driven-code-review-stage`
**HLD base run:** `wf-1785741597494-lbzdo7`
**HLD effective hash:** `48d9de9916c6...`

## HLD context

**Framework:** A hybrid code-review stage (winner a3): a code-review-specific orchestrator runs the four dimensions (adherence/conventions/coverage/quality) as an explicit SERIAL provider loop, reusing src/daemon/workflow-rpc.ts's proven machinery (buildShaperProvider resolution, synthesize-with-retry, writeAtomic, meta-stamping, optional boundary re-audit, the runStart StreamHandler shape) rather than cloning it, and mirroring the existing review vocabulary (ReviewVerdict / Severity / ReviewReport from src/workflow/review/types.ts) so the persisted CodeReviewArtifact carries a block/warn/pass verdict downstream approval already understands. The daemon-driven path and the controller-driven insrc_code_review_step (which mirrors insrc_review_step's start/emit/done/error/opaque-state envelope) share ONE orchestrator, differing only in who supplies each dimension's judgement. The stage runs after build, consumes the build record + approved LLD/PLAN as its fixed subject without re-deriving them, and never modifies the code it judges.
**Rollout phase:** <not in any phase>

## Contract details

**Surface level:** internal-shared

### `codeReview.freshness (daemon IPC handler)`

```typescript
'codeReview.freshness': (params: { repo: string; epicHash: string; storyId: string; changedFiles: readonly string[] }) => Promise<{ isProcessing: boolean; staleFiles: readonly string[] } | { error: string }>
```

**Parameters:**
- `repo: string` — Registered repo root (resolved like codeReview.grounding).
- `epicHash: string` — Epic hash (parity with codeReview.grounding params; may key repo resolution).
- `storyId: string` — Story id (parity with codeReview.grounding params).
- `changedFiles: readonly string[]` — The Story's changed-file set (repo-relative) whose freshness to check.

**Returns:** `Promise<{ isProcessing: boolean; staleFiles: readonly string[] } | { error: string }>` — isProcessing = queue.isProcessing (queue.ts:154); staleFiles = the subset of changedFiles whose per-file index watermark predates the file's mtime. Read-only; never triggers repo.reindex.

**Errors:**
- `{ error: string }` when missing repo/epicHash/storyId (mirrors codeReview.grounding's validation at index.ts:594-599).

**Preconditions:**
- The repo is registered with the daemon

**Postconditions:**
- Computed from queue.isProcessing + the graph watermark ONLY; no reindex is triggered and no store is mutated (additive read-only handler beside codeReview.grounding at index.ts:594).

### `fetchCodeReviewFreshness (controller IPC client)`

```typescript
(deps: DaemonStreamDeps, params: { repo: string; epicHash: string; storyId: string; changedFiles: readonly string[] }) => Promise<{ isProcessing: boolean; staleFiles: readonly string[] }>
```

**Parameters:**
- `deps: DaemonStreamDeps` — The daemon-stream request seam (same shape fetchCodeReviewGrounding uses).
- `params: { repo; epicHash; storyId; changedFiles }` — Forwarded to the codeReview.freshness IPC.

**Returns:** `Promise<{ isProcessing: boolean; staleFiles: readonly string[] }>` — The daemon's freshness verdict for the changed set; the controller's ONLY access to queue/graph freshness (k5).

**Errors:**
- `propagated` when the IPC returns { error } or the socket call fails — surfaced as a code-review-step error (parity with fetchCodeReviewGrounding).

**Postconditions:**
- Additive peer of fetchCodeReviewGrounding (src/mcp/daemon-stream.ts:301); no graph is opened controller-side.

### `handleCodeReviewStep (start phase, reshaped)`

```typescript
(input: CodeReviewStepInput, deps?: CodeReviewStepDeps) => Promise<CodeReviewStepOutput>
```

**Parameters:**
- `input: CodeReviewStepInput` — The start input now optionally carries proceed:true + state to resume past a confirm_wait.
- `deps: CodeReviewStepDeps` _(optional)_ — Injectable seams; gains a fetchFreshness seam (peer of fetchGrounding) + an optional sleep/now seam for the poll (testable).

**Returns:** `Promise<CodeReviewStepOutput>` — start now yields CodeReviewStepConfirmWait when stale (and not resuming), OR emit_judgements once fresh, OR error.

**Errors:**
- `CodeReviewStepError` when subject decline / grounding-unavailable / freshness IPC error (unchanged error envelope, k2).

**Preconditions:**
- A resolved sc1 subject (its changedFiles drive the freshness check)

**Postconditions:**
- Before fetchCodeReviewGrounding: call fetchCodeReviewFreshness(subject.changedFiles). If isProcessing OR staleFiles non-empty AND proceed is not set: saveState (subject, awaiting-proceed) and return { next:'confirm_wait', staleFiles, state }. If proceed:true: block-and-poll fetchCodeReviewFreshness at a fixed internal interval until fresh or codeReview.freshnessTimeoutMs elapses; on timeout return confirm_wait again (re-prompt). Once fresh: continue to fetchCodeReviewGrounding + emit_judgements exactly as today. Abort resume returns a terminal fail-closed result with no judges + no record (ac5). k4 not engaged (no LLM in the poll).

## Data model changes

### `CodeReviewStepInputStart` — field-add

Add optional `proceed?: boolean` and `state?: string` so a caller can resume the start phase past a confirm_wait (proceed:true begins the block-and-poll; state replays the saved subject). An 'abort' resume is expressed as proceed:false (or a distinct abort flag) carrying state. Additive — the plain { phase:'start', epicHash, storyId, repo? } call is unchanged.

```
CodeReviewStepInputStart += proceed?: boolean; += state?: string
```

**Call sites:**
- `src/mcp/code-review-step/types.ts:31`
- `src/mcp/code-review-step/handler.ts`

### `CodeReviewStepConfirmWait (new output)` — new

New member of the CodeReviewStepOutput union: { next:'confirm_wait'; staleFiles: readonly string[]; isProcessing: boolean; guidance: string; state: string }. Carries the stale-file list the controller relays to the user + the opaque state to resume. Added to CodeReviewStepPhase handling but does NOT add a new input phase (proceed rides on start).

```
CodeReviewStepOutput = EmitJudgements | ConfirmWait | Done | Error
```

**Call sites:**
- `src/mcp/code-review-step/types.ts:91`

### `CodeReviewStepStatePayload.grounding` — field-modify

At confirm_wait time grounding has NOT been fetched yet (the gate precedes fetchCodeReviewGrounding), so the saved payload carries the subject but no grounding. Make `grounding` optional (or add an `awaitingProceed:true` discriminator) so the pre-grounding confirm_wait state is representable; the post-poll path fetches grounding and saves the full payload exactly as today before emit_judgements.

```
CodeReviewStepStatePayload.grounding: CodeReviewGrounding -> CodeReviewGrounding | undefined
```

**Call sites:**
- `src/mcp/code-review-step/types.ts:100`

### `CodeReviewArtifact body.groundingMode` — field-add

Add `groundingMode: 'full'` to the persisted code-review record body, stamped by runCodeReview / the record-build path. This story ONLY ever writes 'full' (the graph-grounded path); Story B widens the field to 'full' | 'degraded'. Additive — existing readers ignore an unknown extra field, and the field is written on every record this story produces.

```
CodeReviewBody += groundingMode: 'full'  (Story B: -> 'full' | 'degraded')
```

**Call sites:**
- `src/workflow/code-review/types.ts`
- `src/workflow/code-review/runner.ts`

### `CONFIG_CATALOG codeReview.freshnessTimeoutMs` — field-add

Add an additive CONFIG_CATALOG entry { path:'codeReview.freshnessTimeoutMs', type:'number', default:<baked-in, e.g. 120000>, desc:'max ms the code-review freshness gate block-and-polls before re-prompting' } beside codeReview.enforce. Reconciled by the same reconcileConfig machinery; the poll interval is a fixed internal constant, not a config key.

```
CONFIG_CATALOG += { path:'codeReview.freshnessTimeoutMs', type:'number', default:120000 }
```

**Call sites:**
- `src/config/config-catalog.ts:84`

## Error paths

### Error cases

- **The codeReview.freshness IPC fails (socket error or returns { error }) on the initial pre-grounding check.** (recoverable)
  - Detection: fetchCodeReviewFreshness rejects or the daemon reply carries an `error` field (same shape fetchCodeReviewGrounding surfaces).
  - Response: Return a CodeReviewStepError (code e.g. 'freshness-unavailable', retryable:true); do NOT return confirm_wait, do NOT proceed to grounding, and write no record — an unknown freshness state must not silently fall through to a possibly-stale review.
  - User impact: The review declines with an actionable 'freshness check unavailable' message; the user reruns once the daemon is reachable.
- **The freshness IPC keeps erroring on consecutive poll ticks during a proceed:true block-and-poll (the daemon went away mid-wait).** (recoverable)
  - Detection: fetchCodeReviewFreshness rejects on a poll tick inside the bounded loop.
  - Response: Abort the poll immediately and return a CodeReviewStepError (retryable:true) rather than spinning to the timeout against a broken IPC; no judges run, no record is written.
  - User impact: The wait ends promptly with a clear failure instead of a silent hang until the timeout.
- **A proceed:true (or abort) resume arrives with a state token that is missing or already released.** (terminal)
  - Detection: loadState throws StateTokenNotFound (state-store.ts) — the same mechanism the judgements turn uses.
  - Response: Return a CodeReviewStepError (code 'state-not-found', retryable:false) instructing the caller to restart the review from a fresh start turn; nothing is written.
  - User impact: A stale/double-submitted resume fails cleanly and the user restarts the review, rather than resuming an ambiguous run.

### Edge cases

| Input | Expected |
| :--- | :--- |
| A changed file has NO entity in the graph (e.g. a non-indexed file type — a .md, a lockfile) so there is no per-file indexedAt watermark for it. | It is NOT treated as perpetually stale (that would block forever on a file the indexer never indexes): a changed path with no indexable entity is excluded from staleFiles (or compared against the repo-level lastIndexed as a fallback), so the gate can reach fresh. |
| The repo (or a changed file) has never been indexed at all (repo lastIndexed = 0 / no entity rows for the file). | The indexable changed file reads as STALE (its watermark 0 predates its mtime), so staleFiles is non-empty and the gate returns confirm_wait — an un-indexed changed file is exactly the hollow-PASS case the gate must catch. |
| queue.isProcessing is true because an UNRELATED repo is being indexed (the queue is process-global). | The combined signal conservatively reads not-fresh and waits (accuracy-first: better a brief over-wait than a false-fresh); when the unrelated job drains and the Story's files are current, the poll converges. Documented as an accepted conservative over-wait, not a correctness bug. |
| Between returning confirm_wait and the proceed:true resume, indexing already finished (the changed files are now fresh). | The first poll tick reads fresh (empty staleFiles AND not processing) and the tool continues immediately to grounding + the four judges — no further waiting, groundingMode:'full'. |
| start is called with empty changedFiles (a subject that somehow reaches the gate with nothing changed). | staleFiles is empty and isProcessing gates only briefly; the gate treats it as fresh and proceeds — consistent with the upstream no-build-record subject decline, never a confirm_wait loop over an empty set. |

### Invariants to preserve

- The freshness gate MUST run BEFORE fetchCodeReviewGrounding in the start phase — grounding is never assembled against a stale graph, because empty/partial grounding.symbols is precisely the hollow-PASS the gate exists to prevent. [[c1]]
- The freshness check + block-and-poll are strictly READ-ONLY: they reuse queue.isProcessing (queue.ts:154) + the graph watermark as-is and NEVER call repo.reindex or mutate any store. [[c2]]
- The daemon owns all DB access; the controller reaches the queue/graph freshness signal ONLY through the new additive read-only IPC (peer of codeReview.grounding), never opening LMDB/Lance directly (k5). [[c2]]
- Downstream of the gate the four-dimension serial loop, the record shape, and the write path are unchanged; the gate only decides whether/when to proceed and stamps groundingMode:'full' on the fresh-path record — it does not alter the dimension count/order or the verdict fold. [[c5]]

## Test strategy

**Test framework:** `node:test via npx tsx --test`

### Test levels

- **unit** — Prove the reshaped handleCodeReviewStep start phase gates on freshness, drives the confirm_wait/proceed handshake + bounded poll, and stamps groundingMode:'full' — all via injected seams (fetchFreshness, fetchGrounding, sleep/now), no daemon.
  - Subjects: `start: stale (staleFiles non-empty) and no proceed -> returns next:'confirm_wait' carrying the stale-file list + state, and fetchGrounding is NEVER called`, `start: isProcessing true (empty staleFiles) and no proceed -> also returns confirm_wait`, `start: fresh (empty staleFiles AND not processing) -> no confirm_wait; calls fetchGrounding then returns emit_judgements`, `proceed:true resume: fetchFreshness reports stale for 2 ticks then fresh -> the poll loops (asserts ≥N fetchFreshness calls via the fake), never calls a reindex seam, then continues to grounding`, `proceed:true resume: freshness never becomes fresh before codeReview.freshnessTimeoutMs (fake clock) -> returns confirm_wait again (the re-prompt), not a unilateral proceed/abort`, `abort resume (proceed:false + state) -> terminal fail-closed result: runReview is NEVER invoked and the write seam is NEVER called`, `the fresh path stamps groundingMode:'full' on the persisted record (assert the write payload / runReview input carries groundingMode:'full')`, `freshness IPC error on the initial check -> next:'error' (freshness-unavailable), no confirm_wait, no write`, `proceed resume with a released/missing state token -> next:'error' state-not-found (retryable:false), nothing written`
  - Fixtures: `A fake CodeReviewStepDeps with injectable fetchFreshness (scriptable per-tick isProcessing/staleFiles), fetchGrounding spy, runReview spy, write spy`, `A fake sleep/now seam so the bounded poll + timeout are deterministic without real wall-clock`, `A minimal resolved CodeReviewSubject fixture with a known changedFiles set`, `A config stub supplying codeReview.freshnessTimeoutMs`
- **unit** — Prove the daemon-side codeReview.freshness computation classifies each changed file against the per-file watermark + queue.isProcessing, reusing the surfaces read-only.
  - Subjects: `freshness compute: a changed file whose per-file indexedAt predates its mtime -> in staleFiles`, `freshness compute: a changed file whose watermark is >= mtime -> NOT in staleFiles`, `freshness compute: a changed path with no indexable graph entity -> excluded from staleFiles (does not block forever)`, `freshness compute: a never-indexed changed file (watermark 0) -> stale`, `freshness compute: isProcessing mirrors queue.isProcessing and the handler never triggers repo.reindex (assert no reindex call on the injected queue/graph fakes)`, `codeReview.freshness handler: missing repo/epicHash/storyId -> { error } (parity with codeReview.grounding validation)`
  - Fixtures: `A fake queue exposing a scriptable isProcessing`, `A fake graph/entity source returning per-file indexedAt watermarks (and absent entities) + a fake fs mtime source`, `A tiny params fixture`
- **integration** — Prove the codeReview.freshness IPC round-trips over the socket and the config key reconciles — gated like the existing daemon IPC integration tests.
  - Subjects: `the 'codeReview.freshness' IPC handler returns { isProcessing, staleFiles } over the Unix socket for a fixture repo (peer of the existing codeReview.grounding IPC integration test)`, `reconcileConfig carries codeReview.freshnessTimeoutMs with its baked-in default and honours a per-repo/global override`
  - Fixtures: `A tiny real indexed fixture repo with a known changed file + controllable mtime`, `The gated daemon-socket harness the codeReview.grounding integration test already uses`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `start: stale (staleFiles non-empty) and no proceed -> returns next:'confirm_wait' carrying the stale-file list + state, and fetchGrounding is NEVER called`, `start: isProcessing true (empty staleFiles) and no proceed -> also returns confirm_wait`, `freshness compute: a changed file whose per-file indexedAt predates its mtime -> in staleFiles` |
| `ac2` | `proceed:true resume: fetchFreshness reports stale for 2 ticks then fresh -> the poll loops (asserts ≥N fetchFreshness calls via the fake), never calls a reindex seam, then continues to grounding`, `freshness compute: isProcessing mirrors queue.isProcessing and the handler never triggers repo.reindex (assert no reindex call on the injected queue/graph fakes)` |
| `ac3` | `proceed:true resume: freshness never becomes fresh before codeReview.freshnessTimeoutMs (fake clock) -> returns confirm_wait again (the re-prompt), not a unilateral proceed/abort`, `reconcileConfig carries codeReview.freshnessTimeoutMs with its baked-in default and honours a per-repo/global override` |
| `ac4` | `start: fresh (empty staleFiles AND not processing) -> no confirm_wait; calls fetchGrounding then returns emit_judgements`, `the fresh path stamps groundingMode:'full' on the persisted record (assert the write payload / runReview input carries groundingMode:'full')` |
| `ac5` | `abort resume (proceed:false + state) -> terminal fail-closed result: runReview is NEVER invoked and the write seam is NEVER called` |

## Migration

**State before:** insrc_code_review_step's start phase (src/mcp/code-review-step/handler.ts) resolves the subject then immediately calls fetchCodeReviewGrounding over the daemon IPC and returns emit_judgements — with NO freshness check, so a stale graph yields empty grounding.symbols and a hollow PASS (the S001 incident). Phases are CodeReviewStepPhase='start'|'judgements' (types.ts:27); outputs are EmitJudgements|Done|Error (types.ts:91); the state payload always carries a fetched grounding (types.ts:100). queue.isProcessing (src/daemon/queue.ts:154) + the per-entity indexedAt watermark (src/db/graph/codec.ts:159) are daemon-internal and NOT reachable over IPC; daemon.status exposes only repo-level lastIndexed + queueDepth. The code-review record body has no groundingMode field. codeReview.enforce is the only codeReview.* CONFIG_CATALOG entry (config-catalog.ts:84).

**State after:** The start phase runs a freshness gate BEFORE fetchCodeReviewGrounding: it calls a new read-only daemon IPC codeReview.freshness (peer of codeReview.grounding) that returns { isProcessing, staleFiles } for the changed set, computed from queue.isProcessing + the per-file watermark, never triggering repo.reindex. On stale (and no proceed) it returns a new CodeReviewStepConfirmWait output carrying staleFiles + state; on proceed:true it block-and-polls the IPC at a fixed interval until fresh or codeReview.freshnessTimeoutMs (a new CONFIG_CATALOG peer key), re-prompting on timeout; on fresh it continues to grounding + the four judges unchanged and stamps groundingMode:'full' on the record; on abort it fails closed (no judges, no record). The plain start call with a fresh index is byte-identical to today plus the groundingMode:'full' stamp.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the additive CONFIG_CATALOG entry codeReview.freshnessTimeoutMs (type number, baked-in default) beside codeReview.enforce; reconcileConfig carries it forward on next boot/update with no migration of existing config. — ↩ rollbackable
2. Add the read-only daemon IPC handler codeReview.freshness beside codeReview.grounding in the daemon handler map, computing { isProcessing, staleFiles } from queue.isProcessing + the per-file watermark; purely additive — no existing handler changes. — ↩ rollbackable
3. Add the controller IPC client fetchCodeReviewFreshness as a peer of fetchCodeReviewGrounding in daemon-stream.ts; additive. — ↩ rollbackable
4. Widen the code-review record body type with an additive groundingMode field and stamp 'full' at the record-build/runCodeReview path for the graph-grounded run; existing records without the field remain readable. — ↩ rollbackable
5. Extend CodeReviewStepInputStart with optional proceed?/state? fields, add the CodeReviewStepConfirmWait output to the union, and make the state payload's grounding optional so the pre-grounding confirm_wait state is representable; all additive to the existing start/judgements envelope. — ↩ rollbackable
6. Insert the freshness gate + bounded block-and-poll + re-prompt/abort handling into handleCodeReviewStep's start phase BEFORE fetchCodeReviewGrounding, wiring the new fetchFreshness seam + a sleep/now seam into CodeReviewStepDeps; the fresh path falls through to the existing grounding + emit_judgements flow unchanged. — ↩ rollbackable
7. Add the unit + integration tests (handler gate/poll/timeout/abort/groundingMode, daemon freshness compute, the codeReview.freshness IPC round-trip, config reconcile) and run the code-review + mcp suites green. — ↩ rollbackable

**Backward compat:** All changes are additive and source-compatible. The existing insrc_code_review_step start call ({ phase:'start', epicHash, storyId, repo? }) keeps working: against a FRESH index it behaves exactly as today (straight to emit_judgements) plus a new groundingMode:'full' stamp on the record. proceed?/state? are optional inputs and confirm_wait is a new output-union member, so a caller that never sends proceed simply never sees confirm_wait unless the index is genuinely stale — a strict improvement over today's silent hollow PASS. The code-review record gains an additive groundingMode field; the completion gate + existing record readers ignore an unknown/extra field and continue to read the verdict vocabulary unchanged. The new codeReview.freshness IPC + fetchCodeReviewFreshness client + codeReview.freshnessTimeoutMs config key are all new surfaces with no prior clients. NOTE the intentional NEW behaviour: a stale index now yields confirm_wait instead of proceeding — by design, and the whole point of the story.

## Alternatives considered

### a1: New stateless daemon freshness IPC; controller owns the confirm_wait protocol + poll loop; per-file watermark — **CHOSEN**

A new read-only `codeReview.freshness({repo, changedFiles})` IPC returns { isProcessing, staleFiles[] } computed daemon-side (queue.isProcessing + per-changed-file lastIndexedAt vs mtime); the controller-side start phase calls it before fetchCodeReviewGrounding, returns next:'confirm_wait' on stale, and on proceed:true loops the IPC at a fixed interval until fresh or the configurable codeReview.* timeout, then re-prompts.



### a2: Daemon block-and-polls internally via one waitForFresh IPC

A new `codeReview.waitForFresh({repo, changedFiles, timeoutMs})` IPC runs the block-and-poll loop DAEMON-side and returns { fresh, staleFiles } once fresh or the timeout elapses; the controller calls it once per proceed and confirm_wait/proceed stays controller-side.



**Rejected because:** Functionally meets the criteria but scores partial on ac3 (the timeout is split across the IPC boundary and the re-prompt cadence + mid-wait abort are harder to express through one opaque blocking call) and k5 (a minute-long blocking IPC ties up a daemon request slot for the whole wait — an availability smell), where a1 keeps the wait controller-side and the daemon read trivial.

### a3: Reuse daemon.status only — repo-level watermark, no new IPC

The controller reads the existing daemon.status for queueDepth + each repo's repo-level lastIndexed and compares repo-level lastIndexed vs the max changed-file mtime, adding no new IPC.



**Rejected because:** Cheapest (no new IPC) but the coarse repo-level watermark + queueDepth proxy score partial on ac1/ac2/ac4: it cannot name WHICH changed files are stale, and a re-index of any unrelated file bumps repo lastIndexed so it can read 'fresh' (stamping groundingMode:'full') while the Story's files are still stale — reintroducing exactly the hollow PASS the gate exists to prevent. Accuracy-first (k10 + the S001 motivation) rules it out despite the smaller diff.

## Citations

- **[[c1]]** `analyze-bundle` `s1 symbol.locate — insrc_code_review_step start-phase flow (handler.ts + types.ts + state-store.ts)` — "start phase: resolveCodeReviewSubject -> fetchCodeReviewGrounding over the daemon IPC -> saveState -> emit_judgements. The freshness gate inserts BEFORE fetchCodeReviewGrounding; confirm_wait is a new"
- **[[c2]]** `analyze-bundle` `s1 symbol.locate — the daemon index-status surface + why a new read-only freshness IPC is needed` — "queue.isProcessing is daemon-internal (queue.ts:154), NOT over IPC; daemon.status exposes only repo-level lastIndexed + queueDepth; codeReview.grounding (index.ts:594) is the existing controller->daem"
- **[[c3]]** `analyze-bundle` `s1 data-model.trace — lastIndexedAt watermark granularity (repo-level RepoRow.lastIndexed vs per-entity EntityRow.indexedAt)` — "Repo-level RepoRow.lastIndexed (codec.ts:99) vs per-entity indexedAt (codec.ts:159, entities.ts:101) — the per-file signal the spec settled on needs the per-entity granularity."
- **[[c4]]** `analyze-bundle` `s1 config.trace — codeReview.enforce CONFIG_CATALOG entry the new timeout key sits beside` — "codeReview.enforce is a CONFIG_CATALOG entry at config-catalog.ts:84; codeReview.freshnessTimeoutMs is an additive peer under the same namespace, reconciled by reconcileConfig."
- **[[c5]]** `analyze-bundle` `s1 symbol.locate — the groundingMode stamp site on the code-review record + runner` — "runCodeReview (runner.ts) folds the four dimension judgements into the persisted record (types.ts); groundingMode:'full' is a new additive field on the record body; the gate does not change the four-d"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 9 LOW** · model `client` · reviewed 2026-08-05T05:20:58.827Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| contract/handleCodeReviewStep | citation | LOW | manual | The insrc_code_review_step start phase resolves the subject then calls fetchCodeReviewGrounding over the daemon IPC; the freshness gate inserts before that call. handler.ts imports fetchCodeReviewGrounding. | handler.ts:26 reads `import { fetchCodeReviewGrounding } from '../daemon-stream.js';` and resolveCodeReviewSubject/saveState resolve — the start-phase flow the gate inserts before exists as cited. | None — verified. |
| dataModel/types | citation | LOW | manual | The code-review-step types define CodeReviewStepPhase='start'\|'judgements' (types.ts:27), CodeReviewStepInputStart (types.ts:31), the output union (types.ts:91), and CodeReviewStepStatePayload with grounding (types.ts:100) — the shapes the story extends. | types.ts:31 is `export interface CodeReviewStepInputStart {` and types.ts:100 `export interface CodeReviewStepStatePayload {`; CodeReviewStepPhase/Output resolve — the shapes the story extends exist verbatim. | None — verified. |
| contract/codeReview.freshness | external-contract | LOW | manual | queue.isProcessing is a daemon-internal getter at queue.ts:154 and the codeReview.grounding IPC handler exists at daemon/index.ts:594 — the surfaces the new read-only codeReview.freshness IPC reuses/sits beside. | queue.ts:154 is `get isProcessing(): boolean { return this.processing; }` (daemon-internal getter) and index.ts:594 is `'codeReview.grounding': async (params) => {` — the reuse/peer surfaces for the new read-only freshness IPC exist as cited. | None — verified. |
| contract/fetchCodeReviewFreshness | citation | LOW | manual | fetchCodeReviewGrounding is the existing controller IPC client at daemon-stream.ts:301 — the peer the new fetchCodeReviewFreshness client mirrors. | daemon-stream.ts:301 is `export function fetchCodeReviewGrounding(` — the controller IPC client peer the new fetchCodeReviewFreshness mirrors exists as cited. | None — verified. |
| dataModel/watermark | semantic | LOW | manual | The graph carries a per-entity indexedAt watermark (codec.ts:159, parsed at entities.ts:101) in addition to the repo-level RepoRow.lastIndexed (codec.ts:99) — the per-file granularity the freshness compute needs. | codec.ts:159 is `indexedAt: number; // unix ms` and entities.ts:101 `indexedAt: parseTimestamp(e.indexedAt)` — the per-entity watermark granularity the freshness compute needs exists alongside the repo-level lastIndexed. | None — verified. |
| dataModel/config | citation | LOW | manual | codeReview.enforce is a CONFIG_CATALOG entry at config-catalog.ts:84 — where the additive codeReview.freshnessTimeoutMs peer key lands. | config-catalog.ts:84 reads the codeReview.enforce CONFIG_CATALOG entry — the additive codeReview.freshnessTimeoutMs peer key lands beside it as cited. | None — verified. |
| dataModel/groundingMode | citation | LOW | manual | runCodeReview (runner.ts) folds the four dimension judgements into the persisted code-review record whose body types live in code-review/types.ts — where the additive groundingMode field is stamped. | runCodeReview + CodeReviewBody/CodeReviewArtifact + writeAtomic all resolve — the record-fold/persist path where groundingMode:'full' is stamped exists as cited. | None — verified. |
| error/state-not-found | citation | LOW | manual | The state-store exposes StateTokenNotFound / loadState (the same mechanism the judgements turn uses) that the abort/resume error path relies on. | StateTokenNotFound + loadState + saveState/releaseState resolve in state-store — the state mechanism the abort/resume error path relies on exists as cited. | None — verified. |
| invariant/four-dimensions | inventory | LOW | manual | The code-review stage runs exactly four dimension judges (adherence/conventions/coverage/quality) in fixed order downstream of the gate; the gate does not change that count/order. | The 'adherence','conventions','coverage','quality' literal set (6 hits) + the four judge symbols resolve — the fixed four-dimension loop downstream of the gate is exactly as the LLD states; the gate does not alter it. | None — verified. |
