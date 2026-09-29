<!-- insrc:artifact PLAN-c71f7106fc41807c-S001 -->

# Plan: E20260929c71f7106:S001

## Summary

**Epic:** `lld-state-token-eviction-bugfix-issue`
**LLD run:** `wf-1790709483275-znxstg`
**LLD effective hash:** `c71f7106fc41...`

Building this fix means adding one small store primitive — replaceState (mint-then-release the superseded token) plus a reencodeState codec wrapper — to the two MCP step stores that actually leak (workflow-step and analyze-step), and switching their intermediate phase handlers to call it instead of encodeState. The other two stores (review-step, code-review-step) already hold one token per run by other means and are left untouched, with regression assertions to pin that. Tests prove a >100-turn run keeps the store bounded (the active token never LRU-evicts), single-use-on-consume is preserved, and short runs are unchanged.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** workflow-step: add replaceState primitive + reencodeState codec wrapper | S | — | unit: state-store.test.ts — replaceState bounds live tokens (~1 across many calls), releases prev when defined+distinct, replaceState(undefined)===saveState, degenerate prev===next guard; unit: state-store.test.ts — after replaceState, loadState(prev) throws StateTokenNotFound while loadState(next) resolves; reencodeState version guard throws WorkflowStateDecodeError('wrong-version') | [[c1]] [[c2]] |
| 2 | **`t2`** workflow-step: switch intermediate phase handlers to reencodeState | S | `t1` | integration: workflow-step handler/e2e — a plan->step*N->synthesize run: superseded token stops loading each turn, only the fresh token loads, _workflowStateStoreSize stays bounded, terminal release at synthesize still fires; unit: state-store.test.ts — driving replaceState > MAX_ENTRIES (100) turns keeps the store bounded and the latest token loads (active token never LRU-evicted); existing eviction cases still pass | [[c2]] |
| 3 | **`t3`** analyze-step: add replaceState/reencodeState + switch its leaking intermediate phases | M | `t1` | unit: analyze-step-state.test.ts — analyze-step replaceState/reencodeState bound live tokens (~1) across a long run; single-use + version guard hold; _stateStoreSize stays bounded past MAX_ENTRIES turns | [[c3]] |
| 4 | **`t4`** Verify review-step + code-review-step stay leak-free (NO edit; regression assertions land in t5) | S | — | unit: peer regression — a multi-turn review-step run keeps _reviewStateStoreSize bounded (updateState in-place); code-review-step keeps _codeReviewStateStoreSize bounded and a resend of a consumed token still fails loadState (handler.ts:493 property intact) | [[c4]] [[c3]] |
| 5 | **`t5`** Tests: bounded-live-token + single-use + start/short-run unchanged + peer regression | M | `t2`, `t3`, `t4` | integration: workflow-step e2e — a stale/expired token still yields the unchanged WorkflowStateDecodeError('not-found') restart message; a short healthy run is byte-identical in outcome; unit: aggregate — the full mcp + workflow test sweep is green (0 failures) after the cross-store change | [[c1]] [[c2]] [[c3]] [[c4]] |

### 1.1 E20260929c71f7106:S001:T001 — workflow-step: add replaceState primitive + reencodeState codec wrapper

Add `replaceState(previousToken: string | undefined, payload): string` to src/mcp/workflow-step/state-store.ts — mint via the existing saveState, then releaseState(previousToken) only when previousToken is defined AND distinct from the new token (mint-before-release). Add `reencodeState(previousToken, payload): string` to state.ts (same STATE_VERSION guard as encodeState, delegating to replaceState). saveState/loadState/releaseState/encodeState signatures unchanged.

**Acceptance checks:**
- replaceState mints a new token, and when previousToken is defined+distinct releases it; _workflowStateStoreSize stays ~1 across many successive replaceState calls
- replaceState(undefined, payload) behaves exactly like saveState (mint only, nothing released)
- replaceState never releases the just-minted token in the degenerate previousToken===newToken case
- reencodeState throws WorkflowStateDecodeError('wrong-version') on a version mismatch then delegates to replaceState
- tsc --noEmit clean

### 1.2 E20260929c71f7106:S001:T002 — workflow-step: switch intermediate phase handlers to reencodeState

In src/mcp/workflow-step/phases/plan.ts and step.ts, replace `state: encodeState(next)` with `state: reencodeState(input.state, next)` so the incoming (now superseded) token is released as the next is minted. start.ts (first mint via encodeState) and synthesize.ts (terminal releaseState) are left unchanged.

**Acceptance checks:**
- plan.ts + step.ts advance the run via reencodeState(input.state, next); after each turn loadState(previous) throws StateTokenNotFound and loadState(next) resolves
- start.ts and synthesize.ts are unchanged (first mint + terminal release intact)
- a short healthy run still produces the same artifact and terminal release
- tsc --noEmit clean

### 1.3 E20260929c71f7106:S001:T003 — analyze-step: add replaceState/reencodeState + switch its leaking intermediate phases

Apply the identical fix to the OTHER leaking store: add replaceState to src/mcp/analyze-step/state-store.ts + reencodeState to analyze-step/state.ts, and switch the mint-without-release sites at phases/plan.ts:164/214 + phases/narrow.ts:213/257 to reencodeState(input.state, next). start.ts (first mint) + bundle.ts:122 (terminal release) unchanged. Keep analyze-step's own MAX_ENTRIES/TTL_MS constants (no store merge). Mirrors t1+t2 for the analyze-step store.

**Acceptance checks:**
- analyze-step plan.ts + narrow.ts advance via reencodeState(input.state, next); _stateStoreSize stays ~1 across a long run
- analyze-step start.ts + bundle.ts terminal release unchanged
- analyze-step keeps its own module-local MAX_ENTRIES/TTL_MS (no shared module)
- tsc --noEmit clean

### 1.4 E20260929c71f7106:S001:T004 — Verify review-step + code-review-step stay leak-free (NO edit; regression assertions land in t5)

Confirm the two already-correct peer stores are LEFT UNCHANGED: review-step holds one token per run via updateState in-place (claims.ts:36); code-review-step releases the incoming token per transition (releaseState(step.state!) at handler.ts:228/276/283) + release-on-consume at :493. This is a verification/decision task — no source edit. The regression assertions that pin their bounded-store behaviour are IMPLEMENTED in t5 (which dependsOn t4).

**Acceptance checks:**
- review-step/state-store.ts + its phases remain unedited (confirmed by diff)
- code-review-step/handler.ts + state-store.ts remain unedited; its release-on-consume (handler.ts:493) semantics are unchanged
- the decision that these two stores are out-of-scope-for-edit is recorded for t5's regression coverage

### 1.5 E20260929c71f7106:S001:T005 — Tests: bounded-live-token + single-use + start/short-run unchanged + peer regression

Add unit tests to workflow-step/__tests__/state-store.test.ts (replaceState bounds live tokens across > MAX_ENTRIES turns; loadState(prev) throws while loadState(next) resolves; replaceState(undefined) === saveState; degenerate prev===next guard; reencodeState version guard) and analyze-step-state.test.ts (same for analyze-step); an integration assertion via the workflow-step handler/e2e suites that a plan->step*N->synthesize run keeps the store bounded and a stale token still yields WorkflowStateDecodeError('not-found'); and the review-step/code-review-step leak-free regression assertions specified by t4 (bounded _reviewStateStoreSize / _codeReviewStateStoreSize across a multi-turn run; code-review-step resend still fails).

**Acceptance checks:**
- new unit tests cover replaceState/reencodeState (bounded size across >100 turns, single-use, start-equivalence, degenerate guard, version guard) for workflow-step + analyze-step
- an integration/e2e assertion proves a multi-turn run keeps the store bounded with no StateTokenNotFound restart, and a stale token still errors as today
- peer regression assertions prove review-step + code-review-step keep bounded store size (leak-free) and code-review-step resend still fails
- the full mcp + workflow test sweep passes with 0 failures
- tsc --noEmit clean

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| replaceState(prev, payload): mints a NEW token, and when prev is defined+distinct releases it — _workflowStateStoreSize stays ~1 across many successive replaceState calls (no per-turn leak) | `t1` |
| replaceState(undefined, payload) behaves exactly like saveState (mint only, nothing released) | `t1` |
| after replaceState, loadState(prev) throws StateTokenNotFound (single-use) while loadState(next) resolves (mint-before-release ordering: the new token always exists) | `t1` |
| replaceState guards the degenerate prev===next case: the live token is never deleted | `t1` |
| reencodeState applies the STATE_VERSION guard (WorkflowStateDecodeError 'wrong-version') then delegates to replaceState | `t1` |
| driving replaceState for > MAX_ENTRIES (100) successive turns keeps _workflowStateStoreSize bounded (~1, not >100) and the latest token still loads — whereas the OLD mint-without-release path would have left the store at the cap and LRU-evicted the run | `t2` |
| the TTL + LRU sweep mechanism itself (MAX_ENTRIES/TTL_MS constants, StateTokenNotFound on a genuinely-absent token) is unchanged — existing state-store.test.ts eviction cases still pass | `t2` |
| a plan -> step*N -> synthesize run: after each intermediate turn the SUPERSEDED incoming token no longer loads and only the freshly-returned token does; _workflowStateStoreSize stays bounded across the whole run | `t2` |
| a short healthy run is byte-identical in outcome to today (same artifact, terminal releaseState at synthesize still fires) | `t5` |
| an out-of-order / stale token still yields the unchanged WorkflowStateDecodeError('not-found') restart message | `t5` |
| analyze-step + review-step replaceState/reencodeState bound live tokens the same way (extending analyze-step-state.test.ts) | `t3` |
| code-review-step's terminal release-on-consume (handler.ts:493 'a resend fails loadState') is unchanged — a resend of a consumed token still fails | `t4` |
| each store keeps its own MAX_ENTRIES/TTL_MS constants (no shared module) | `t3`, `t4` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD S001 contractDetails + dataModelChanges — the replaceState store primitive (mint-before-release) + the one-live-token-per-run invariant (src/mcp/workflow-step/state-store.ts)`
- **[[c2]]** `prior-artifact` `LLD S001 contractDetails + migration — reencodeState codec wrapper + switching the intermediate phase handlers plan.ts:82/step.ts:84 off the leaking encodeState(next)`
- **[[c3]]** `prior-artifact` `LLD S001 dataModelChanges (peer stores) + plan s1 refinement — analyze-step is the other leaking store (plan.ts:164/214, narrow.ts:213/257); each store keeps its own MAX_ENTRIES/TTL_MS (no merge)`
- **[[c4]]** `prior-artifact` `LLD S001 invariantsToPreserve — the terminal single-use-on-consume retry-safety (code-review-step/handler.ts:493) + plan s1 finding that review-step (updateState) and code-review-step (release-per-transition) are already leak-free`
