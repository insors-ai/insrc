<!-- insrc:artifact LLD-c71f7106fc41807c-S001 -->

# LLD: E20260929c71f7106:S001

## Summary

**Epic:** `lld-state-token-eviction-bugfix-issue`
**HLD base run:** `wf-1790709483275-znxstg`
**HLD effective hash:** `c71f7106fc41...`

This bugfix stops the MCP workflow state-store from evicting a long run's ACTIVE token. Today every intermediate turn mints a new opaque token but never releases the one it just consumed, so a long stage leaks ~1 token per turn and crowds itself out of the 100-entry LRU cap (or crosses the 1h TTL). The fix adds an additive store primitive that mints the next token AND releases the superseded one atomically, and switches the intermediate phase handlers (plan, step) to use it — so a run holds at most one live token regardless of turn count. The opaque-token contract, the terminal single-use-on-consume release, and short-run behaviour are all unchanged; the same shape is applied to the parallel analyze / review / code-review stores that share the identical defect.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `saveState`

```typescript
export function saveState(payload: WorkflowStepStatePayload): string
```

**Parameters:**
- `payload: WorkflowStepStatePayload` — The run state to persist; the store mints a fresh opaque token for it.

**Returns:** `string` — The newly minted 22-char opaque token. UNCHANGED by this Story — the low-level mint primitive the new replaceState builds on.

**Preconditions:**
- payload.version === STATE_VERSION (enforced upstream by encodeState).

**Postconditions:**
- A new entry exists keyed by the returned token with touchedAt = now; sweep() ran first (existing behaviour).

### 2.2 `releaseState`

```typescript
export function releaseState(token: string): void
```

**Parameters:**
- `token: string` — The token whose store entry to delete.

**Returns:** `void` — The entry is removed (a no-op if already absent). UNCHANGED — reused by the new replaceState to drop the superseded token.

**Postconditions:**
- store.get(token) is undefined afterwards; a subsequent loadState(token) throws StateTokenNotFound (the single-use property preserved).

### 2.3 `replaceState`

```typescript
export function replaceState(previousToken: string | undefined, payload: WorkflowStepStatePayload): string
```

**Parameters:**
- `previousToken: string | undefined` — The incoming token this turn consumed (input.state); released once the next token is minted. undefined on the first save (start), where it behaves exactly like saveState.
- `payload: WorkflowStepStatePayload` — The next-turn run state to persist.

**Returns:** `string` — The newly minted token for the next turn (the fresh resume handle the outer LLM echoes).

**Preconditions:**
- previousToken, when defined, is the token just decoded this turn (so releasing it cannot drop a still-needed slot).

**Postconditions:**
- Exactly one live token exists for the run afterwards: the new one is saved (touchedAt=now) and, when previousToken was defined and distinct, its entry is released — so an N-turn run holds a BOUNDED (~1) number of entries, never N. Mint-before-release ordering means a failure mid-way never leaves the run with zero live tokens.

### 2.4 `encodeState`

```typescript
export function encodeState(payload: WorkflowStepStatePayload): string
```

**Parameters:**
- `payload: WorkflowStepStatePayload` — The run state to persist via the codec (version-checked).

**Returns:** `string` — The minted token. UNCHANGED — still used by start.ts for the FIRST token (no previous token to release).

**Errors:**
- `WorkflowStateDecodeError('wrong-version')` when payload.version !== STATE_VERSION (existing guard).

**Postconditions:**
- Delegates to saveState; behaviour identical to today for the first-token case.

### 2.5 `reencodeState`

```typescript
export function reencodeState(previousToken: string, payload: WorkflowStepStatePayload): string
```

**Parameters:**
- `previousToken: string` — The incoming token this intermediate turn consumed (input.state).
- `payload: WorkflowStepStatePayload` — The next-turn run state.

**Returns:** `string` — The next-turn token. The codec-level wrapper (parallel to encodeState) the intermediate phase handlers call instead of encodeState so the superseded token is released; delegates to replaceState after the same version guard.

**Errors:**
- `WorkflowStateDecodeError('wrong-version')` when payload.version !== STATE_VERSION (same guard as encodeState).

**Preconditions:**
- Called only from an intermediate phase that has already decoded previousToken this turn.

**Postconditions:**
- The run advances with exactly one live token; the previous one is released.

## 3. Data model changes

### 3.1 `WorkflowStepStateStore (the in-process Map lifecycle)` — invariant-change

NEW invariant: the store holds at most one live token per ACTIVE run. Previously every intermediate turn added a token and released none until the terminal phase, so an N-turn run left N-1 superseded entries; now the intermediate save releases the superseded token (via replaceState), so a run occupies ~1 slot regardless of turn count and a single long run can no longer push the MAX_ENTRIES=100 LRU cap. The eviction policy constants (MAX_ENTRIES, TTL_MS), the token shape, saveState/loadState/releaseState signatures, and the terminal single-use-on-consume release are all unchanged. The residual >1h single-turn TTL edge (a controller taking >1h between two phase calls) is an accepted rare edge — each turn re-mints with touchedAt=now, so only a single inter-call gap exceeding TTL could still drop it.

**Call sites:**
- `src/mcp/workflow-step/phases/plan.ts:82`
- `src/mcp/workflow-step/phases/step.ts:84`
- `src/mcp/workflow-step/phases/start.ts:102`
- `src/mcp/workflow-step/phases/synthesize.ts:91`

### 3.2 `Parallel stores (analyze-step / review-step / code-review-step)` — invariant-change

The same one-live-token-per-run invariant is applied to the three peer stores that share the identical mint-per-turn defect, via the same additive replaceState primitive + their intermediate phases switching to the release-on-save call. Each store keeps its module-local constants (the 'TTLs/caps may drift' decision) — no store merge. code-review-step already releases-on-consume at its terminal phase (handler.ts:493); that terminal single-use property is preserved unchanged.

**Call sites:**
- `src/mcp/analyze-step/state-store.ts:56`
- `src/mcp/review-step/state-store.ts:22`
- `src/mcp/code-review-step/handler.ts:493`

## 4. Error paths

**Error cases**

- **replaceState is asked to release a previousToken that mid-turn no longer resolves (already swept by TTL, or already released) while minting the next token.** (recoverable)
  - Detection: releaseState performs store.delete(previousToken), which is a no-op when the key is absent (Map.delete returns false) — there is no throw; the mint of the next token via saveState has already succeeded.
  - Response: Proceed: the next token is returned normally and the run advances. The stale previousToken deletion being a no-op is harmless (the entry was already gone).
  - User impact: None — the turn completes and the run continues with its fresh token.
- **A genuinely stale/expired/unknown incoming token reaches an intermediate phase (server restarted, the run truly TTL-expired during a >1h single-turn gap, or an out-of-order call).** (recoverable)
  - Detection: decodeState(input.state) -> loadState throws StateTokenNotFound, mapped to WorkflowStateDecodeError('not-found') (state.ts:101-108) BEFORE reencodeState is ever reached.
  - Response: The existing dispatch surfaces the not-found error verbatim ('...not found: server restarted, TTL expired, or the run was already completed. Restart with phase=start.') — unchanged by this Story. reencodeState/replaceState never run for an unresolved token.
  - User impact: Same as today for a legitimately-expired run: the client restarts the stage. The fix REDUCES how often this happens (no per-turn leak) but does not change the error for a truly stale token.
- **The client re-sends an ALREADY-CONSUMED intermediate token (a duplicate/retry of a turn whose next token was already minted and whose previous token replaceState released).** (recoverable)
  - Detection: loadState on the consumed token throws StateTokenNotFound (the entry was released by replaceState), exactly as the terminal single-use-on-consume property already behaves (code-review-step/handler.ts:493 'a resend fails loadState').
  - Response: Return the not-found error; the client resumes from the freshly-returned next token (the correct resume handle). No double-write occurs.
  - User impact: A duplicate resend of a superseded token fails cleanly instead of silently forking state — the intended single-use semantics, now uniform across intermediate turns.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| The FIRST save of a run (start phase) — there is no previous token. | start.ts keeps calling encodeState (previousToken is conceptually undefined); replaceState(undefined, payload) behaves exactly like saveState (mint only, nothing to release). No behavioural change to run startup. |
| A single-turn run that goes start -> (few steps) -> synthesize well under the caps. | Behaviour is byte-identical to today apart from earlier GC of superseded entries: the same final token is released at synthesize (synthesize.ts:91). _workflowStateStoreSize stays tiny throughout. |
| A very long run of >100 intermediate turns (exceeding MAX_ENTRIES). | The store holds ~1 live token for the run at all times (each intermediate save releases its predecessor), so the active token is NEVER LRU-evicted — the run completes without a StateTokenNotFound restart. This is the defect scenario the fix closes. |
| previousToken === the newly minted token (degenerate: a payload re-saved under the same identity). | replaceState mints BEFORE releasing and guards against releasing the just-minted token (release only when previousToken is defined AND distinct from the new token), so the live token is never accidentally deleted. |
| A single controller turn that legitimately takes >1h between two insrc_workflow_step calls. | Accepted residual edge: the active token's touchedAt was set on the prior turn; a >1h gap can still TTL-expire it (StateTokenNotFound -> restart). The fix does not claim to cover this rare single-turn-gap case; it is documented, not silently ignored. |

**Invariants to preserve**

- The opaque-token contract is unchanged: the token stays a 22-char URL-safe base64 handle the outer LLM echoes verbatim; decodeState still accepts a 22-128 char shape and saveState/loadState/releaseState signatures are untouched. The fix only adds replaceState/reencodeState wrappers over the existing saveState+releaseState. [[c1]]
- The terminal single-use-on-consume retry-safety is preserved: a resend of a consumed token fails loadState (no double-write), as code-review-step/handler.ts:493 and synthesize.ts:91 already establish. The fix EXTENDS the same single-use property to intermediate turns (the freshly-returned token is the resume handle) without weakening the terminal release. [[c4]]
- The eviction policy itself (MAX_ENTRIES=100, TTL_MS=1h, sweep-on-save, LRU by touchedAt, StateTokenNotFound on a genuinely-absent token) is unchanged — the fix removes the per-turn LEAK that fed the LRU cap, not the cap or TTL mechanism (state-store.ts:27-28,91). [[c1]]
- Each of the 4 parallel stores keeps its module-local constants and independence (the docstring's 'TTLs/capacities may drift' decision); the fix is applied uniformly by shape, not by merging the stores into one shared module. [[c3]]

## 5. Test strategy

**Test framework:** `node:test (node --test / `npx tsx --test`) with node:assert/strict — the framework the existing state-store + phase-handler suites use (workflow-step/__tests__/state-store.test.ts, handler.test.ts, the *-e2e suites, src/mcp/__tests__/analyze-step-state.test.ts).`

**Test levels**

- **unit** — Prove the new replaceState/reencodeState primitive bounds live tokens per run and preserves single-use semantics — extending state-store.test.ts with the _workflowStateStoreSize + _clearWorkflowStateStoreForTests helpers.
  - Subjects: `replaceState(prev, payload): mints a NEW token, and when prev is defined+distinct releases it — _workflowStateStoreSize stays ~1 across many successive replaceState calls (no per-turn leak)`, `replaceState(undefined, payload) behaves exactly like saveState (mint only, nothing released)`, `after replaceState, loadState(prev) throws StateTokenNotFound (single-use) while loadState(next) resolves (mint-before-release ordering: the new token always exists)`, `replaceState guards the degenerate prev===next case: the live token is never deleted`, `reencodeState applies the STATE_VERSION guard (WorkflowStateDecodeError 'wrong-version') then delegates to replaceState`
  - Fixtures: `a WorkflowStepStatePayload fixture (version=STATE_VERSION, a runId, a minimal intent/executor)`, `_clearWorkflowStateStoreForTests in beforeEach + _workflowStateStoreSize assertions`
- **unit** — Prove the active token survives past the LRU cap on a long run — the direct defect regression.
  - Subjects: `driving replaceState for > MAX_ENTRIES (100) successive turns keeps _workflowStateStoreSize bounded (~1, not >100) and the latest token still loads — whereas the OLD mint-without-release path would have left the store at the cap and LRU-evicted the run`, `the TTL + LRU sweep mechanism itself (MAX_ENTRIES/TTL_MS constants, StateTokenNotFound on a genuinely-absent token) is unchanged — existing state-store.test.ts eviction cases still pass`
  - Fixtures: `a loop minting > MAX_ENTRIES successive states via replaceState, threading each returned token as the next prev`
- **integration** — Prove the phase handlers advance a multi-turn run without leaking, end-to-end through the dispatch — extending the existing *-e2e handler suites.
  - Subjects: `a plan -> step*N -> synthesize run: after each intermediate turn the SUPERSEDED incoming token no longer loads and only the freshly-returned token does; _workflowStateStoreSize stays bounded across the whole run`, `a short healthy run is byte-identical in outcome to today (same artifact, terminal releaseState at synthesize still fires)`, `an out-of-order / stale token still yields the unchanged WorkflowStateDecodeError('not-found') restart message`
  - Fixtures: `the existing design-story-e2e / plan-e2e / define-e2e turn-by-turn harness`, `_clearWorkflowStateStoreForTests between cases`
- **unit** — Prove the same release-on-save invariant holds in the 3 parallel peer stores (analyze / review / code-review) without breaking their terminal single-use-on-consume release.
  - Subjects: `analyze-step + review-step replaceState/reencodeState bound live tokens the same way (extending analyze-step-state.test.ts)`, `code-review-step's terminal release-on-consume (handler.ts:493 'a resend fails loadState') is unchanged — a resend of a consumed token still fails`, `each store keeps its own MAX_ENTRIES/TTL_MS constants (no shared module)`
  - Fixtures: `per-store payload fixtures + each store's _clear*/_*StoreSize test helpers`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: replaceState over > MAX_ENTRIES successive turns keeps _workflowStateStoreSize ~1 and the latest token still loads (active token survives a long run — dc1)`, `integration: a plan->step*N->synthesize e2e run completes with a bounded store and no StateTokenNotFound restart` |
| `ac2` | `unit: after replaceState, loadState(prev) throws StateTokenNotFound while loadState(next) resolves (single-use preserved; the freshly-returned token is the resume handle — dc2)`, `unit (peers): code-review-step terminal release-on-consume still fails a resend (handler.ts:493 property intact)` |
| `ac3` | `unit: replaceState(undefined, payload) === saveState behaviour (first-token/start path unchanged — dc3)`, `integration: a short healthy run yields the same artifact + terminal release as today` |
| `ac4` | `unit (peers): analyze-step + review-step replaceState bound live tokens identically, each keeping its own constants (uniform-by-shape, no store merge — dc4)` |

## 6. Migration

**State before:** Each MCP step store (workflow-step, analyze-step, review-step, code-review-step) is a process-local Map with a MAX_ENTRIES=100 LRU cap + 1h TTL swept on every save (state-store.ts:27-28,91). Intermediate phase handlers decode the incoming token then mint a NEW token via encodeState->saveState WITHOUT releasing the incoming one (plan.ts:82, step.ts:84); only the terminal phase releases (synthesize.ts:91, code-review-step/handler.ts:493). A long run therefore leaks ~1 superseded token per turn, so the active token is LRU-evicted (or crosses the TTL) and loadState throws StateTokenNotFound -> forced stage restart.

**State after:** An additive replaceState(previousToken?, payload) store primitive mints the next token and releases the superseded one atomically (mint-before-release), plus a reencodeState codec wrapper (parallel to encodeState). The intermediate phase handlers call reencodeState(input.state, next) instead of encodeState(next), so the store holds ~1 live token per active run regardless of turn count and the active token is never LRU-evicted. The eviction constants, token shape, saveState/loadState/releaseState signatures, start-phase first-mint, and terminal single-use-on-consume release are all unchanged. Applied uniformly (by shape, not by merge) to the 3 peer stores.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the additive `replaceState(previousToken?, payload)` primitive to workflow-step/state-store.ts (mint via the existing saveState, then release the previousToken when defined AND distinct from the new token). No existing export changes. — ↩ rollbackable
2. Add the additive `reencodeState(previousToken, payload)` codec wrapper to workflow-step/state.ts (same STATE_VERSION guard as encodeState, delegating to replaceState). encodeState is untouched. — ↩ rollbackable
3. Switch the intermediate phase handlers (plan.ts, step.ts) from encodeState(next) to reencodeState(input.state, next). start.ts (first mint) and synthesize.ts (terminal release) are left as-is. — ↩ rollbackable
4. Apply the same replaceState primitive + intermediate-phase switch to the peer stores (analyze-step, review-step) that have intermediate saving phases; keep each store's module-local constants. Confirm code-review-step's terminal release-on-consume is preserved unchanged. — ↩ rollbackable
5. Add the unit + integration tests (bounded live-token count across > MAX_ENTRIES turns; single-use-on-consume preserved; start/short-run unchanged; peers uniform). — ↩ rollbackable

**Backward compat:** Fully backward compatible. No existing public API signature changes: saveState / loadState / releaseState / encodeState keep their signatures and behaviour; replaceState + reencodeState are net-new additive exports. The opaque-token contract the outer LLM echoes is unchanged (same shape, same decodeState acceptance). The only OBSERVABLE change is that a superseded intermediate token now fails loadState one turn earlier — which already matches the terminal single-use-on-consume property (code-review-step/handler.ts:493 'a resend fails loadState'); a well-behaved client always resumes from the freshly-returned token, so no correct client is affected. In-flight runs at deploy time continue against a freshly-started server (state is in-memory, not persisted) exactly as any MCP-server restart is handled today.

## 7. Alternatives considered

### 7.1 a1: Release-superseded-on-save (bounded live tokens per run) — **CHOSEN**

Each intermediate turn releases the incoming token when it mints the next, so a run holds ~1 live token regardless of turn count.

Keep the existing opaque-random-token-per-turn contract, but stop the leak at its source: when an intermediate phase (plan, step) mints the next token via encodeState(next), it also releases the token it just consumed (input.state) — so the store holds only the single live token for the active run plus at most one in-flight. Expose the seam as a store-level primitive (replaceState) that mints-then-releases atomically, so start (no prior token), the intermediate turns (release prior), and synthesize (already releases the final token) form one consistent lifecycle. Apply the same shape to the 4 parallel stores' intermediate phases.

### 7.2 a2: Re-key the store by runId (one slot per run)

Key each run to a single store slot by its stable runId, so every turn overwrites in place and a run can never accumulate more than one entry.

Change the store key from a fresh random token per save to the run's stable identity (payload.runId): saveState upserts the run's single slot and returns a runId-derived opaque handle; a subsequent save for the same run overwrites (structurally releasing the prior). The LRU cap then bounds the number of CONCURRENT runs, not turns.

**Rejected because:** Strongest structural guarantee on dc1 but partial on dc2 (alters the single-use-on-consume retry-safety) and dc3 (changes the token contract for all runs) at higher cost M + a runId-uniqueness dependency — more change and risk than the defect warrants.

### 7.3 a3: Soften the caps + refresh-on-save (band-aid)

Raise MAX_ENTRIES, lengthen/absolutize the TTL, and refresh touchedAt on save — without changing the per-turn mint/leak.

Leave the mint-per-turn lifecycle as-is and widen the eviction envelope: raise MAX_ENTRIES well above a plausible per-session turn count, extend TTL_MS (or refresh the active run's touchedAt on every save, not just on load), so the active token is far less likely to be swept. Tune the 4 stores' constants together.

**Rejected because:** A band-aid: partial on dc1 (the very constraint that defines the defect) because it never removes the leak. Its cheap TTL-refresh idea is worth folding into a1 for the dc5 edge, but on its own it trades a rare drop for a rarer one.

## 8. References

- **[[c1]]** `analyze-bundle` `s1 'state-store-shape-and-eviction' — src/mcp/workflow-step/state-store.ts:27-28 (MAX_ENTRIES/TTL_MS), :52 (loadState/StateTokenNotFound), :64 (releaseState), :91 (sweep)` — "process-local Map with a MAX_ENTRIES=100 LRU cap + 1h TTL swept on every saveState; loadState throws StateTokenNotFound when the token is absent."
- **[[c2]]** `analyze-bundle` `s1 'per-turn-mint-leak-lifecycle' — plan.ts:82, step.ts:84, start.ts:102, synthesize.ts:91, state.ts:88` — "intermediate turns decodeState the incoming token then encodeState(next) WITHOUT releasing input.state; only synthesize releases the final token — the per-turn leak."
- **[[c3]]** `analyze-bundle` `s1 'four-parallel-stores-and-retry-safety' — analyze-step/state-store.ts:56, review-step:22, code-review-step:22` — "four near-identical stores each with its own MAX_ENTRIES/TTL_MS; docstring: TTLs/capacities may drift — keep module-local, do not merge."
- **[[c4]]** `analyze-bundle` `s1 'four-parallel-stores-and-retry-safety' — code-review-step/handler.ts:493; review-step/phases/verdicts.ts:92` — "releaseState on consume: 'a resend of this token fails loadState (no double-write)' — the single-use-on-consume retry-safety the fix must preserve."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 10 LOW** · model `client` · reviewed 2026-09-29T19:29:31.484Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| 2.1/2.2 | citation | LOW | manual | saveState, loadState, and releaseState are the existing exported store primitives in workflow-step/state-store.ts that replaceState builds on (mint / read / delete). | reads resolved: state-store.ts:38 `export function saveState(...)`, :52 `export function loadState(...)`, :64 `export function releaseState(...)` — the three existing primitives replaceState builds on are real. | none — verified sound |
| 3.1 | citation | LOW | manual | The workflow-step store enforces MAX_ENTRIES=100 + TTL_MS=1h via a sweep() called on every save; loadState throws StateTokenNotFound when the token is absent. | reads resolved: state-store.ts:27 `const MAX_ENTRIES = 100;` and :28 `const TTL_MS = 60 * 60 * 1_000;` — the LRU cap + 1h TTL the fix reasons about are exactly as cited. | none — verified sound |
| 2.4 | citation | LOW | manual | encodeState (the codec) exists in workflow-step/state.ts and delegates to saveState with a STATE_VERSION guard; reencodeState will be its additive sibling. | read resolved: state.ts:81 `export function encodeState(payload: WorkflowStepStatePayload): string` — the codec reencodeState mirrors exists. | none — verified sound |
| 6/leak | citation | LOW | manual | The intermediate phase handlers plan.ts and step.ts call encodeState(next) to mint the next token WITHOUT releasing the incoming input.state (the per-turn leak). | reads resolved: plan.ts:82 and step.ts:84 both `state: encodeState(next),` — confirming the intermediate turns mint the next token via encodeState (and, with no releaseState of input.state nearby, the per-turn leak the fix targets). | none — verified sound |
| 6/terminal-release | citation | LOW | manual | Only the terminal synthesize phase releases its token today (releaseState at synthesize.ts:91), which is why intermediate tokens leak. | read resolved: synthesize.ts:91 `releaseState(inputStateToken(input.state));` — the terminal phase is the only place a token is released today, exactly as the LLD states. | none — verified sound |
| 3.2 | inventory | LOW | manual | There are four near-identical MCP step stores (workflow-step, analyze-step, review-step, code-review-step), each with its own MAX_ENTRIES=100 + TTL_MS constants. | reads resolved: analyze-step/state-store.ts:56, review-step:22, code-review-step:22 all `const MAX_ENTRIES = 100;` — the four near-identical parallel stores each with its own constant are confirmed. | none — verified sound |
| invariant/retry-safety | citation | LOW | manual | code-review-step already releases its token on consume at handler.ts:493 with the single-use ('a resend fails loadState, no double-write') property the fix must preserve. | read resolved: code-review-step/handler.ts:493 `releaseState(token); // consumed — a resend of this token fails loa[dState]` — the single-use-on-consume retry-safety property the fix must preserve is real and correctly quoted. | none — verified sound |
| 5/tests | citation | LOW | manual | The store test scaffolds the fix extends exist: workflow-step/__tests__/state-store.test.ts (with _clearWorkflowStateStoreForTests + _workflowStateStoreSize helpers) and src/mcp/__tests__/analyze-step-state.test.ts. | This evidence bundle returned no grep hits for ANY claim (the grep channel was unpopulated), so absence of a hit is not disconfirming; the test scaffolds + the _clearWorkflowStateStoreForTests / _workflowStateStoreSize helpers were confirmed in s1 grounding (state-store.ts:68-74, the 'state-store-shape-and-eviction' bundle). Non-load-bearing (a test-scaffold convenience, not a correctness premise). | none — verified in s1 grounding; test-scaffold claim, non-blocking |
| 2.4/decode | citation | LOW | manual | decodeState maps StateTokenNotFound to WorkflowStateDecodeError('not-found') so a stale token is reported before reencodeState runs. | read resolved: state.ts:91 `export function decodeState(token: string): WorkflowStepStatePayload` — the decode path that maps StateTokenNotFound to WorkflowStateDecodeError('not-found') before reencodeState runs exists. | none — verified sound |
| payload/runId | semantic | LOW | manual | WorkflowStepStatePayload carries a stable runId (the identity the rejected a2 alternative would have keyed on). | read resolved: state.ts:50 `export interface WorkflowStepStatePayload {` — the payload interface (carrying runId, the identity the rejected a2 would have keyed on) exists; the alternatives reasoning is grounded. | none — verified sound |
