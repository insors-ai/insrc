<!-- insrc:artifact LLD-abd1ecf6a5f5063e-s5 -->

# LLD: E20260802abd1ecf6:S005

**Epic:** `frame-epic-new-pre-workflow-brainstorm`
**HLD base run:** `wf-1785587820064-46kctq`
**HLD effective hash:** `688a10691972...`

## HLD context

**Framework:** Brainstorm ships as a first-class workflow stage (alternative a1): a peer runner directory src/workflow/runners/brainstorm/ that self-registers through the existing executor registry and workflow/index.ts registerWorkflowRunners; a new persisted SpecArtifact peer file in src/workflow/artifacts/ with a specArtifactPaths peer in storage.ts (hash-addressed, listed, approval-stamped identically to DEF/HLD/LLD/PLAN); and an additive elicitation phase on the existing insrc_workflow_step MCP surface that reuses state-store.ts and the questions-gate primitive and preserves the opaque state token verbatim. The single cross-cutting SpecArtifact shape (intent, scope boundary, non-goals, decisions-with-ruled-out-alternatives, open items) is read unchanged by both define (s8) and standalone design.story (s9). Nothing touches the shared/chat-agent brainstorm.addIdea stub.
**Rollout phase:** Phase B — In-chat elicitation behaviour
**Consumes:** `sc2` (Brainstorm stage runner registration), `sc3` (Brainstorm MCP elicitation phase + continuation state)

## Contract details

**Surface level:** internal

### `decodeState`

```typescript
export function decodeState(token: string): WorkflowStepStatePayload
```

**Parameters:**
- `token: string` — The opaque continuation reference the stage returned on the previous turn (sc3's `state`). Resume = re-invoking insrc_workflow_step phase='step' with this token.

**Returns:** `WorkflowStepStatePayload` — The rehydrated full run state (intent + executor state incl. the brainstorm working statement + stepOutputs), so questioning continues from where it stopped (ac1).

**Errors:**
- `WorkflowStateDecodeError('not-found')` when s5 change: the token is a valid shape but loadState throws StateTokenNotFound (unknown / TTL-expired / already-completed) — decodeState's catch arm now maps it to the DISTINCT 'not-found' code (was 'malformed'), preserving the plain message. Reported plainly; never a silent fresh start (ac2).
- `WorkflowStateDecodeError('malformed')` when The token is structurally invalid (wrong length/shape) — unchanged; now genuinely distinct from an expired-but-well-formed continuation reference.

**Preconditions:**
- The token was minted by a prior encodeState/saveState on this server instance and has not expired (TTL) or been released.

**Postconditions:**
- On success the returned payload is byte-identical to the one saved on the previous turn, so a resumed convergence runs the same s3/s4 gates and converges indistinguishably (ac3).

### `WorkflowStateDecodeError`

```typescript
class WorkflowStateDecodeError extends Error { readonly code: 'malformed' | 'wrong-version' | 'wrong-stage' | 'not-found' }
```

**Returns:** `WorkflowStateDecodeError` — The typed decode-error the workflow-step phases throw and the handler surfaces as {next:'error'}. s5 ADDS the 'not-found' code member so an unknown/expired continuation reference is machine-distinguishable from a malformed token.

**Postconditions:**
- The top-level dispatch (handler.ts) surfaces the error verbatim as {next:'error', isError:true} — it never falls back to phase='start', so earlier answers are never silently discarded (ac2).

## Data model changes

### `WorkflowStateDecodeError.code` — field-modify

Extend the WorkflowStateDecodeError code union in src/mcp/workflow-step/state.ts from 'malformed' | 'wrong-version' | 'wrong-stage' to additionally include 'not-found', and change decodeState's catch arm so a caught StateTokenNotFound constructs WorkflowStateDecodeError('not-found', err.message) instead of ('malformed', ...). Additive to the union (existing 'malformed' consumers keep working); the plain StateTokenNotFound message (server restarted / TTL expired / already completed / restart) is preserved verbatim. No storage change, opaque token unchanged.

```
- code: 'malformed' | 'wrong-version' | 'wrong-stage'
+ code: 'malformed' | 'wrong-version' | 'wrong-stage' | 'not-found'
// decodeState catch: StateTokenNotFound -> WorkflowStateDecodeError('not-found', err.message)  (was 'malformed')
```

**Call sites:**
- `src/mcp/workflow-step/state.ts`
- `src/mcp/workflow-step/state-store.ts`
- `src/mcp/workflow-step/phases/step.ts`
- `src/mcp/workflow-step/handler.ts`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc2` | consumes | s5 makes no change to the brainstorm runner registration/decomposer — registerBrainstormRunners and the elicit runner are untouched (boundary: owns [], depends [sc2]). Resume is a property of the shared step surface, not the runner. |
| `sc3` | consumes | s5 relies on sc3's opaque state token AS the continuation reference: saveState/loadState already rehydrate the full folded BrainstormElicitState + stepOutputs (ac1/ac3), the token is preserved verbatim (k8/k9), and no new store is added. The ONLY change is an additive refinement of sc3's existing StateTokenNotFound error taxonomy — a distinct 'not-found' decode-error code so an unknown/expired reference is reported plainly (ac2). Recorded as within sc3's error-handling intent (no HLD amendment; the shape of BrainstormTurnRequest/Response and the state contract are unchanged). |

## Error paths

### Error cases

- **The user resumes with a continuation reference that is unknown, TTL-expired, or already-completed.** (recoverable)
  - Detection: loadState (state-store.ts) finds no store entry for the token and throws StateTokenNotFound; decodeState's catch arm re-raises it as WorkflowStateDecodeError('not-found', <the plain message>).
  - Response: The handler dispatch surfaces {next:'error', code:'internal'/'not-found', isError:true} carrying the plain 'server restarted / TTL expired / already completed — restart with phase=start' text. The run does NOT fall back to phase='start'; no fresh conversation is begun and no earlier answers are touched.
  - User impact: The user is told plainly the reference is no longer usable and to restart — rather than being silently dropped into a blank brainstorm that discards their earlier answers (ac2).
- **The user resumes with a structurally-garbage token (wrong length/shape), e.g. truncated on copy-paste.** (recoverable)
  - Detection: decodeState's shape guard (length < 8 or > 128, or non-string) throws WorkflowStateDecodeError('malformed') BEFORE any store lookup — now genuinely distinct from the 'not-found' expired-reference case.
  - Response: Surfaced as {next:'error'} with the malformed-shape message; no store lookup, no fresh start.
  - User impact: A copy-paste error is reported as a malformed token (distinct from an expired one), so the user knows to re-copy rather than assume their conversation expired.
- **The user resumes a valid token but at the wrong phase (e.g. phase='step' on a run awaiting synthesize).** (recoverable)
  - Detection: assertStage (state.ts) compares payload.stage to the expected stage and throws WorkflowStateDecodeError('wrong-stage') — unchanged by s5.
  - Response: Surfaced plainly ('called out of order — restart with phase=start'); the stored state is not mutated.
  - User impact: An out-of-order resume is reported distinctly from an expired reference; earlier answers remain intact in the store until TTL.

### Edge cases

| Input | Expected |
| :--- | :--- |
| A conversation is interrupted mid-convergence (confirmed:false, several answers folded) and resumed with the last returned token. | decodeState rehydrates the exact WorkflowStepStatePayload; the folded workingStatement/answered/openItems are all present and questioning continues from the same open gaps — no answer is re-asked (ac1). |
| The same conversation is run once uninterrupted and once interrupted-then-resumed, with identical user answers in the same order. | Both produce a byte-identical converged step output — resume restores the same payload, so the same s3/s4 gates run on the same accumulated state (ac3). |
| A token is used to resume, then the SAME token is used again after the run has advanced (re-use of a superseded reference). | Each turn returns a NEW token for the next turn; the superseded token, once its entry is gone/expired, resolves to 'not-found' — reported plainly, not a silent fresh start (consistent with ac2). The opaque-token-per-turn contract (k8/k9) is unchanged. |

### Invariants to preserve

- The opaque continuation token is preserved verbatim and remains the ONLY continuation reference; s5 adds no second store and no new resume phase — resume stays the existing phase='step' with the returned token (k8/k9). [[c8]]
- The existing WorkflowStateDecodeError codes 'malformed'/'wrong-version'/'wrong-stage' keep their exact meaning and call sites; 'not-found' is purely additive, and the StateTokenNotFound message text is preserved verbatim. [[c7]]

## Test strategy

**Test framework:** `node:test + node:assert/strict via `npx tsx --test`, matching the existing src/mcp/workflow-step/__tests__/state-store.test.ts and src/workflow/runners/brainstorm/__tests__/elicit.test.ts suites`

### Test levels

- **unit** — Prove decodeState gives an unknown/expired continuation reference the distinct 'not-found' signal, keeps 'malformed'/'wrong-stage' distinct, and never silently starts fresh (ac2).
  - Subjects: `decodeState on an unknown or released token throws WorkflowStateDecodeError with code 'not-found' (not 'malformed'), carrying the plain StateTokenNotFound message`, `decodeState on a structurally-garbage token (too short/long/non-string) still throws code 'malformed' — distinct from 'not-found'`, `decodeState on a valid token at the wrong stage still throws 'wrong-stage' (unchanged)`, `the WorkflowStateDecodeError code union includes 'not-found' and the existing three members are unchanged`
  - Fixtures: `_clearWorkflowStateStoreForTests + a saved-then-released token`, `a freshly saved valid token`
- **unit** — Prove resume preserves the folded answers and continues from where it stopped (ac1) via the real executor.
  - Subjects: `a brainstorm run paused mid-convergence (confirmed:false) is saved via encodeState, then decodeState rehydrates the identical WorkflowStepStatePayload (workingStatement/answered/openItems + executor stepOutputs intact)`, `resumeRun on the rehydrated executor state continues from the same openItems and finalizes correctly — no answer is dropped or re-asked`
  - Fixtures: `a one-step brainstorm plan driven via startRun`, `encodeState/decodeState round-trip on the paused state`
- **unit** — Prove a resumed convergence is indistinguishable from an uninterrupted one (ac3).
  - Subjects: `running a brainstorm to convergence uninterrupted vs interrupting-then-resuming (via encodeState->decodeState->resumeRun) with the same answers yields a byte-identical converged step output`, `both paths apply the same s3/s4 finalize gates on the same accumulated state (no parallel/divergent rehydration path)`
  - Fixtures: `identical scripted answer sequence for both the uninterrupted and resumed runs`
- **integration** — Prove the end-to-end insrc_workflow_step resume + not-found surfacing through the real handler dispatch.
  - Subjects: `insrc_workflow_step phase='step' with the token returned by the previous turn resumes the run and preserves state (the opaque token round-trips per turn, k8/k9)`, `insrc_workflow_step phase='step' with an unknown/expired token returns {next:'error', isError:true} carrying the plain not-found message and does NOT begin a fresh conversation (ac2)`
  - Fixtures: `a temp repo intent`, `state-store helpers (_clearWorkflowStateStoreForTests)`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: a paused mid-convergence run round-trips through encodeState/decodeState with workingStatement/answered/openItems + stepOutputs intact`, `unit: resumeRun on the rehydrated state continues from the same openItems with no answer re-asked`, `integration: phase='step' with the returned token resumes and preserves state` |
| `ac2` | `unit: decodeState on an unknown/released token throws code 'not-found' with the plain message, distinct from 'malformed'`, `integration: phase='step' with an unknown/expired token returns {next:'error'} plainly and starts no fresh conversation` |
| `ac3` | `unit: uninterrupted vs interrupted-then-resumed runs with identical answers produce a byte-identical converged step output`, `unit: both paths apply the same s3/s4 finalize gates on the same accumulated state` |

## Alternatives considered

### a1: Distinct not-found decode-error code + resume-parity tests (reuse the existing opaque-token continuation) — **CHOSEN**

Add a dedicated 'not-found' code to WorkflowStateDecodeError, map StateTokenNotFound to it in decodeState (keeping the plain message), and prove ac1/ac3 with resume round-trip + convergence-parity tests. No new storage.

The resume mechanism already exists (sc3): the opaque `state` token is the continuation reference, saveState/loadState rehydrate the full folded WorkflowStepStatePayload, and the token round-trips byte-identical (ac1/ac3 hold structurally). s5's only code change is ac2's plainness: extend the WorkflowStateDecodeError code union from 'malformed'|'wrong-version'|'wrong-stage' to add 'not-found', and change decodeState's catch arm so a StateTokenNotFound maps to WorkflowStateDecodeError('not-found', <the existing plain message>) instead of 'malformed'. The handler already surfaces it as {next:'error'} with isError:true and never starts fresh; s5 just makes the signal distinct (an unknown/expired continuation reference vs a garbage-shaped token). Prove ac1 (resume preserves the folded answers and continues from the same openItems) and ac3 (a resumed convergence is byte-identical to an uninterrupted one) via startRun -> save/load -> resumeRun tests, and ac2 via a decodeState unit test on an unknown/released token. No new field, no new store, opaque token preserved verbatim (k8/k9).

### a2: Verification-only: keep the existing 'malformed' mapping, add tests only

Change no code; add ac1/ac2/ac3 tests relying on the current decodeState('malformed') + plain message for the unknown/expired case.

Leave decodeState as-is (StateTokenNotFound -> WorkflowStateDecodeError('malformed')). Add tests asserting resume preserves answers (ac1), convergence parity (ac3), and that an unknown token yields a non-silent error carrying the plain 'not found / expired / restart' message (ac2).

**Rejected because:** Under-delivers ac2: folding an unknown/expired continuation reference under 'malformed' (which also means a garbage-shaped token) is not plain — a user with a legitimate-but-expired token is mislabelled as sending junk. It also locks the conflation in as tested behaviour. Ranked 2nd.

### a3: A dedicated resume phase / separate resume store keyed by a user-facing reference id

Add a new insrc_workflow_step resume phase and a separate store mapping a user-facing reference to the saved conversation.

Introduce a distinct 'resume' phase and a second store keyed by a friendlier reference id, looking up + rehydrating the BrainstormElicitState separately from the opaque step token.

**Rejected because:** Duplicates the state-store and forks the multi-turn surface to say the same thing — violates sc3/k8/k9 (no new storage, opaque token preserved verbatim through the existing step phase) and is far over-scoped for a size-S story. Ranked lowest.

## Citations

- **[[c1]]** `analyze-bundle` `s1 symbol-locate — the resume mechanism: encodeState/saveState mint the opaque token; decodeState/loadState rehydrate; StateTokenNotFound currently maps to WorkflowStateDecodeError('malformed') (state.ts, state-store.ts)`
- **[[c3]]** `prior-artifact` `HLD sc2 — Brainstorm stage runner registration (owned by s1, consumed by s5)`
- **[[c7]]** `analyze-bundle` `s1 usage-example — the handler dispatch surfaces WorkflowStateDecodeError as {next:'error', isError:true} and never falls back to phase='start'; existing codes malformed/wrong-version/wrong-stage (phases/step.ts, handler.ts, state.ts)`
- **[[c8]]** `analyze-bundle` `s1 data-model-trace — the full folded BrainstormElicitState + stepOutputs ride inside the stored WorkflowStepStatePayload, so resume is byte-identical; opaque-token-per-turn continuation, no new store (k8/k9)`
- **[[c14]]** `prior-artifact` `HLD sc3 — Brainstorm MCP elicitation phase + continuation state (owned by s1, consumed by s5); StateTokenNotFound semantics preserved verbatim`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 6 LOW** · model `client` · reviewed 2026-08-02T04:46:22.858Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| contract/decodeState | citation | LOW | manual | decodeState(token): WorkflowStepStatePayload is exported from src/mcp/workflow-step/state.ts and calls loadState, catching StateTokenNotFound. | src/mcp/workflow-step/state.ts:91 `export function decodeState(token): WorkflowStepStatePayload` calls loadState and catches StateTokenNotFound (state.ts:103). Confirmed. | none — verified sound |
| dataModel/WorkflowStateDecodeError | closed-union | LOW | manual | WorkflowStateDecodeError in src/mcp/workflow-step/state.ts currently has code union 'malformed' \| 'wrong-version' \| 'wrong-stage' (s5 adds 'not-found'); it does not yet contain 'not-found'. | src/mcp/workflow-step/state.ts:72 `export class WorkflowStateDecodeError`; its code union is 'malformed'\|'wrong-version'\|'wrong-stage' and contains NO 'not-found' (all 'not-found' grep hits are in unrelated files) — exactly the additive change s5 makes. Confirmed. | none — verified sound |
| contract/state-store | citation | LOW | manual | loadState throws StateTokenNotFound on an unknown token, and the store exposes _clearWorkflowStateStoreForTests + releaseState, in src/mcp/workflow-step/state-store.ts. | src/mcp/workflow-step/state-store.ts exports loadState (throws StateTokenNotFound), releaseState, and _clearWorkflowStateStoreForTests. Confirmed. | none — verified sound |
| errorPaths | citation | LOW | manual | The step phase calls decodeState + assertStage, and the top-level dispatch (handler.ts) wraps phases in try/catch surfacing a thrown error as {next:'error', isError:true} without falling back to phase='start'. | phases/step.ts calls decodeState + assertStage; handler.ts wraps dispatch in try/catch returning errorResult with isError — no phase='start' fallback. Confirmed. | none — verified sound |
| contract/decodeState | semantic | LOW | manual | The full folded state (BrainstormElicitState + executor stepOutputs) rides inside WorkflowStepStatePayload, so decodeState rehydrates the identical payload saved by encodeState (ac1/ac3). | src/mcp/workflow-step/state.ts:50 interface WorkflowStepStatePayload with executor?: (:61), brainstorm?: BrainstormElicitState (:68), and stepOutputs — the full folded state rides inside, so decodeState rehydrates the identical saved payload. Confirmed. | none — verified sound |
| testStrategy | citation | LOW | manual | The test suites s5 extends exist: src/mcp/workflow-step/__tests__/state-store.test.ts and src/workflow/runners/brainstorm/__tests__/elicit.test.ts. | src/mcp/workflow-step/__tests__/state-store.test.ts (imports _workflowStateStoreSize) and the brainstorm elicit.test.ts (resumeRun) both exist — the suites s5 extends. Confirmed. | none — verified sound |
