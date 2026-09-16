<!-- insrc:artifact PLAN-abd1ecf6a5f5063e-s5 -->

# Plan: E20260802abd1ecf6:S005

**Epic:** `frame-epic-new-pre-workflow-brainstorm`
**LLD run:** `wf-1785645522647-9j9b7g`
**LLD effective hash:** `688a10691972...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add a distinct 'not-found' WorkflowStateDecodeError code and map StateTokenNotFound to it | S | — | unit: decodeState on an unknown or released token throws WorkflowStateDecodeError with code 'not-found' (not 'malformed'), carrying the plain StateTokenNotFound message; unit: decodeState on a structurally-garbage token (too short/long/non-string) still throws code 'malformed' — distinct from 'not-found'; unit: decodeState on a valid token at the wrong stage still throws 'wrong-stage' (unchanged); unit: the WorkflowStateDecodeError code union includes 'not-found' and the existing three members are unchanged | [[c1]] [[c2]] [[c3]] |
| 2 | **`t2`** Add decode-error taxonomy + resume-parity tests | S | `t1` | unit: a brainstorm run paused mid-convergence (confirmed:false) is saved via encodeState, then decodeState rehydrates the identical WorkflowStepStatePayload (workingStatement/answered/openItems + executor stepOutputs intact); unit: resumeRun on the rehydrated executor state continues from the same openItems and finalizes correctly — no answer is dropped or re-asked; unit: running a brainstorm to convergence uninterrupted vs interrupting-then-resuming (via encodeState->decodeState->resumeRun) with the same answers yields a byte-identical converged step output; integration: insrc_workflow_step phase='step' with an unknown/expired token returns {next:'error', isError:true} carrying the plain not-found message and does NOT begin a fresh conversation (ac2) | [[c4]] |

### E20260802abd1ecf6:S005:T001 — Add a distinct 'not-found' WorkflowStateDecodeError code and map StateTokenNotFound to it

In src/mcp/workflow-step/state.ts, extend the WorkflowStateDecodeError code union from 'malformed' | 'wrong-version' | 'wrong-stage' to additionally include 'not-found', and change decodeState's catch arm so a caught StateTokenNotFound constructs WorkflowStateDecodeError('not-found', err.message) instead of ('malformed', ...). The plain StateTokenNotFound message is preserved verbatim. Additive only: 'malformed' still covers the structural shape-guard rejection, and 'wrong-version'/'wrong-stage' are untouched. No change to state-store.ts, phases/step.ts, or handler.ts (they already surface a thrown WorkflowStateDecodeError as {next:'error', isError:true} with no fresh-start fallback). No new store, opaque token unchanged.

**Acceptance checks:**
- the WorkflowStateDecodeError code union in state.ts includes 'not-found' alongside the existing 'malformed'/'wrong-version'/'wrong-stage'
- decodeState's catch arm constructs WorkflowStateDecodeError('not-found', err.message) for a caught StateTokenNotFound, preserving the message verbatim
- the shape-guard rejection (too short/long/non-string) still throws 'malformed'; assertStage still throws 'wrong-stage'
- no edit to state-store.ts / phases/step.ts / handler.ts; no new store; tsc clean

### E20260802abd1ecf6:S005:T002 — Add decode-error taxonomy + resume-parity tests

Extend src/mcp/workflow-step/__tests__/state-store.test.ts with the decodeState taxonomy cases (ac2): an unknown/released token -> 'not-found' with the plain message; a garbage-shaped token -> 'malformed'; a valid token at the wrong stage -> 'wrong-stage'. Extend src/workflow/runners/brainstorm/__tests__/elicit.test.ts with the resume-parity cases (ac1/ac3): a brainstorm run paused mid-convergence round-trips through encodeState/decodeState with the folded workingStatement/answered/openItems + stepOutputs intact and resumeRun continues from the same openItems; and an uninterrupted vs interrupted-then-resumed run with identical answers produces a byte-identical converged step output. node:test + assert/strict; no new harness.

**Acceptance checks:**
- state-store.test.ts asserts decodeState -> 'not-found' (distinct from 'malformed') for an unknown/released token, 'malformed' for a garbage-shaped token, and 'wrong-stage' for a valid token at the wrong stage
- elicit.test.ts asserts a paused mid-convergence run round-trips through encodeState/decodeState preserving workingStatement/answered/openItems + stepOutputs, and resumeRun continues from the same openItems
- elicit.test.ts asserts an uninterrupted run and an interrupted-then-resumed run with identical answers produce a byte-identical converged step output (ac3)
- the full brainstorm + workflow-step sweep passes and tsc is clean

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| decodeState on an unknown or released token throws WorkflowStateDecodeError with code 'not-found' (not 'malformed'), carrying the plain StateTokenNotFound message | `t1`, `t2` |
| decodeState on a structurally-garbage token (too short/long/non-string) still throws code 'malformed' — distinct from 'not-found' | `t1`, `t2` |
| decodeState on a valid token at the wrong stage still throws 'wrong-stage' (unchanged) | `t1`, `t2` |
| the WorkflowStateDecodeError code union includes 'not-found' and the existing three members are unchanged | `t1` |
| a brainstorm run paused mid-convergence (confirmed:false) is saved via encodeState, then decodeState rehydrates the identical WorkflowStepStatePayload (workingStatement/answered/openItems + executor stepOutputs intact) | `t2` |
| resumeRun on the rehydrated executor state continues from the same openItems and finalizes correctly — no answer is dropped or re-asked | `t2` |
| running a brainstorm to convergence uninterrupted vs interrupting-then-resuming (via encodeState->decodeState->resumeRun) with the same answers yields a byte-identical converged step output | `t2` |
| both paths apply the same s3/s4 finalize gates on the same accumulated state (no parallel/divergent rehydration path) | `t2` |
| insrc_workflow_step phase='step' with the token returned by the previous turn resumes the run and preserves state (the opaque token round-trips per turn, k8/k9) | `t2` |
| insrc_workflow_step phase='step' with an unknown/expired token returns {next:'error', isError:true} carrying the plain not-found message and does NOT begin a fresh conversation (ac2) | `t2` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s5 contractDetails.api: decodeState (resume rehydrates the full folded payload; maps StateTokenNotFound to 'not-found')`
- **[[c2]]** `prior-artifact` `LLD s5 dataModelChanges: WorkflowStateDecodeError.code field-modify (additive 'not-found' member + decodeState catch arm)`
- **[[c3]]** `prior-artifact` `LLD s5 contractDetails.api: WorkflowStateDecodeError (code union gains 'not-found'; handler surfaces {next:'error'}, no fresh-start fallback)`
- **[[c4]]** `prior-artifact` `LLD s5 testStrategy: decode-error taxonomy + resume-parity/convergence-parity suites under state-store.test.ts + brainstorm/elicit.test.ts`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 5 LOW** · model `client` · reviewed 2026-08-02T04:54:20.959Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| tasks | inventory | LOW | manual | The plan enumerates exactly two tasks t1/t2 with the linear DAG t1 -> t2. | The plan Tasks table enumerates t1, t2 with DAG t1<-t2. Confirmed. | none — verified sound |
| t1 | closed-union | LOW | manual | t1's target src/mcp/workflow-step/state.ts defines WorkflowStateDecodeError with code union 'malformed'\|'wrong-version'\|'wrong-stage' and decodeState catching StateTokenNotFound — the exact edit site for adding 'not-found'. | src/mcp/workflow-step/state.ts:72 `export class WorkflowStateDecodeError`; the code union ('wrong-stage' present), decodeState, and StateTokenNotFound handling live here — the exact edit site t1 targets. Confirmed. | none — verified sound |
| t1 | citation | LOW | manual | loadState throws StateTokenNotFound in src/mcp/workflow-step/state-store.ts (the throw site t1's catch arm re-maps). | src/mcp/workflow-step/state-store.ts exports loadState which throws StateTokenNotFound (the throw site t1's catch arm re-maps to 'not-found'). Confirmed. | none — verified sound |
| t2 | citation | LOW | manual | The two test suites t2 extends exist: src/mcp/workflow-step/__tests__/state-store.test.ts and src/workflow/runners/brainstorm/__tests__/elicit.test.ts. | src/mcp/workflow-step/__tests__/state-store.test.ts (imports _workflowStateStoreSize) and the brainstorm elicit.test.ts (startRun/resumeRun) both exist — the suites t2 extends. Confirmed. | none — verified sound |
| t2 | semantic | LOW | manual | encodeState + resumeRun exist (encodeState in workflow-step/state.ts, resumeRun in workflow/executor.ts) — the round-trip + resume entry points the parity tests drive. | encodeState is exported in workflow-step/state.ts and resumeRun at src/workflow/executor.ts:114 — the round-trip + resume entry points the parity tests drive. Confirmed. | none — verified sound |
