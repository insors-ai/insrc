<!-- insrc:artifact LLD-abd1ecf6a5f5063e-s10 -->

# LLD: E20260804abd1ecf6:S010

**Epic:** `frame-epic-new-pre-workflow-brainstorm`
**HLD base run:** `wf-1785587820064-46kctq`
**HLD effective hash:** `68bedb3a95b6...`

## HLD context

**Framework:** Brainstorm ships as a first-class workflow stage (alternative a1): a peer runner directory src/workflow/runners/brainstorm/ that self-registers through the existing executor registry and workflow/index.ts registerWorkflowRunners; a new persisted SpecArtifact peer file in src/workflow/artifacts/ with a specArtifactPaths peer in storage.ts (hash-addressed, listed, approval-stamped identically to DEF/HLD/LLD/PLAN); and an additive elicitation phase on the existing insrc_workflow_step MCP surface that reuses state-store.ts and the questions-gate primitive and preserves the opaque state token verbatim. The single cross-cutting SpecArtifact shape (intent, scope boundary, non-goals, decisions-with-ruled-out-alternatives, open items) is read unchanged by both define (s8) and standalone design.story (s9). Nothing touches the shared/chat-agent brainstorm.addIdea stub.
**Rollout phase:** <not in any phase>

## Contract details

**Surface level:** internal-shared

### `StepRunnerFinalize`

```typescript
type StepRunnerFinalize = (llmResponse: Record<string, unknown>, preparedBlob: unknown, ctx: StepRunnerContext) => Promise<StepFinalizeResult>; where StepFinalizeResult = { type: 'output'; output } | { type: 'error'; code; message; retryable } | { type: 'llm-pause'; prompt; userTurn; schema; preparedBlob }
```

**Parameters:**
- `llmResponse: Record<string, unknown>` — The controller's structured answer for the paused decision (the chosen option, or a reopen directive).
- `preparedBlob: unknown` — The runner's carried state (running spec + answered decisions + current decision id) from the pause it is resuming.
- `ctx: StepRunnerContext` — Execution context; now optionally carries the mid-tier draft seam.

**Returns:** `StepFinalizeResult` — ADDITIVE third variant `llm-pause`: finalize may now ask the executor to RE-PAUSE the same step instead of only advancing (output) or failing (error). Every existing runner keeps returning output|error, byte-identical.

**Preconditions:**
- Purely additive to the union; existing finalize implementations are unchanged and never emit the new variant.

**Postconditions:**
- A runner (the elicit runner) can drive a genuine multi-pause loop from finalize without any plan mutation.

### `resumeRun`

```typescript
function resumeRun(state: ExecutorState, llmResponse: Record<string, unknown>, epicKey: string): Promise<ExecutorTickResult>
```

**Parameters:**
- `state: ExecutorState` — The paused executor state.
- `llmResponse: Record<string, unknown>` — The controller's answer for the paused step.
- `epicKey: string` — Epic key (unchanged).

**Returns:** `ExecutorTickResult` — Handles the new finalize `llm-pause` variant by RE-PAUSING the same step: nextStepIndex UNCHANGED, a fresh ExecutorPause built from the finalize result, returning {type:'paused', state}. The existing output (advance + runFrom) and error paths are untouched.

**Errors:**
- `errorTick` when finalize returns {type:'error'} — unchanged (retryable stays paused).

**Preconditions:**
- The step being resumed is the one paused (existing stepId cross-check).

**Postconditions:**
- On the llm-pause variant the step stays current and the controller receives another emit_step for the next decision (ac2); on output the step completes and advances to synthesize (ac3).

### `StepRunnerContext`

```typescript
interface StepRunnerContext { intent; plan; runId; stepOutputs; params; readonly draftProvider?: LLMProvider | undefined }
```

**Returns:** `StepRunnerContext` — ADDITIVE optional `draftProvider` (a pre-resolved MID-tier LLMProvider for the decision-draft role, or undefined). The drive layer resolves it via the RoleRouter (role 'brainstorm.decision.draft') and injects it: the daemon in workflow-rpc for workflow.run, the MCP server for the in-process insrc_workflow_step. Every existing runner ignores it.

**Preconditions:**
- Optional; absent for all existing runners + any process that did not resolve a draft provider.

**Postconditions:**
- The elicit runner reads ctx.draftProvider to draft each decision; when absent the runner FAILS CLOSED (retryable error), never downgrading to cheap/local (ac4, k13).

### `registerBrainstormRunners`

```typescript
function registerBrainstormRunners(): void  // registers the reworked `elicit` runner
```

**Returns:** `void` — Registers the reworked `elicit` runner (idempotent, unchanged signature). NEW behavior: run() drafts the FIRST decision via ctx.draftProvider.completeStructured(buildDraftPrompt(runningSpec), decisionDraftSchema) and returns {type:'llm-pause'} carrying the drafted decision + running-spec/answered-decisions state in preparedBlob. finalize() folds the controller's answer and either (a) drafts + re-pauses the NEXT decision, (b) on reopen re-pauses the named prior decision, (c) on convergence + FINAL confirm returns {type:'output'} with the assembled spec so synthesize writes the SpecArtifact, or (d) returns a retryable error if convergence is claimed without the final confirm. finalizeElicit's single-pass pass-through is REPLACED.

**Errors:**
- `retryable error 'draft-provider-unavailable'` when ctx.draftProvider is undefined — fail closed, never downgrade.
- `retryable error 'not-confirmed'` when convergence proposed but the user has not given the final confirm — run stays paused.

**Preconditions:**
- Wired into registerWorkflowRunners (unchanged); the drive layer supplies ctx.draftProvider.

**Postconditions:**
- The elicit stage is an adaptive per-decision loop; nothing is persisted until the final confirm (ac3); the SpecArtifact body + seed-focus seam are unchanged (ac4).

## Data model changes

### `StepFinalizeResult union (StepRunnerFinalize return)` — field-add

Add a third variant { type: 'llm-pause'; prompt; userTurn; schema; preparedBlob } alongside 'output' | 'error'. resumeRun gains a branch that re-pauses the same step on it. Additive: all existing runners' finalize keep returning output|error.

```
type StepFinalizeResult =
  | { type: 'output'; output: Record<string, unknown> }
  | { type: 'error'; code: string; message: string; retryable: boolean }
+ | { type: 'llm-pause'; prompt: string; userTurn: string; schema: Record<string, unknown>; preparedBlob: unknown }
```

**Call sites:**
- `src/workflow/types.ts`
- `src/workflow/executor.ts`

### `StepRunnerContext` — field-add

Add optional `draftProvider?: LLMProvider`. runFrom (executor.ts) threads it from an executor-level dep into the ctx it builds; the drive layer resolves it via createRoleRouter(...).resolveProviderForRole('brainstorm.decision.draft', cfg, repoPath). Optional + additive.

```
interface StepRunnerContext { intent; plan; runId; stepOutputs; params;
+  readonly draftProvider?: LLMProvider | undefined }
```

**Call sites:**
- `src/workflow/types.ts`
- `src/workflow/executor.ts`

### `role-taxonomy ROLES` — field-add

Add { id: 'brainstorm.decision.draft', criticality: 'peripheral', defaultTier: 'mid' } to the closed ROLES registry. Peripheral => NOT core-floor-clamped => resolves to the mid tier (the settled decision: not core, not cheap/local). RoleRouter + CoreFloorGuard read it with no code change.

```
+ { id: 'brainstorm.decision.draft', criticality: 'peripheral', defaultTier: 'mid' },
```

**Call sites:**
- `src/config/role-taxonomy.ts`
- `src/analyze/context/role-router.ts`

### `brainstorm elicit per-decision state + schemas` — new

NEW schemas in src/workflow/runners/brainstorm/schemas.ts: decisionDraftSchema (the daemon's drafted decision: { decisionId, question, options[]{label, tradeoff, recommended?}, groundingNote? }) riding the pause, and decisionAnswerSchema (the resume payload: { decisionId, chosenOption | reopen | proposeConverge/finalConfirm }). The pause preparedBlob carries { runningSpec, answeredDecisions[], currentDecisionId, convergenceProposed }. The FINAL SpecArtifact body shape is UNCHANGED — only the intermediate per-decision turn shapes are new.

```
// new: decisionDraftSchema (pause payload), decisionAnswerSchema (resume payload)
// unchanged: SpecArtifact body + seed-focus composeSpecFocus
```

**Call sites:**
- `src/workflow/runners/brainstorm/index.ts`
- `src/workflow/runners/brainstorm/schemas.ts`

## Error paths

### Error cases

- **The mid-tier draft provider is unavailable (ctx.draftProvider undefined — the drive layer resolved no mid tier, or the process built no RoleRouter).** (recoverable)
  - Detection: The elicit runner's run()/finalize checks `ctx.draftProvider === undefined` before attempting a draft.
  - Response: Return a retryable error 'draft-provider-unavailable'; the run STAYS PAUSED. Never fall back to a cheap/local model (fail closed).
  - User impact: The stage refuses to proceed rather than silently drafting with a weaker model; the operator resolves a mid tier and re-sends. Accuracy never traded (k13/ac4).
- **The mid-tier draft LLM returns a decision that fails decisionDraftSchema after the structured-retry budget.** (recoverable)
  - Detection: provider.completeStructured's withStructuredRetry exhausts its attempts and ajv validation still fails.
  - Response: Propagate a retryable error 'draft-failed' — do NOT fabricate a decision or emit an empty fork; the run stays paused.
  - User impact: A bad draft never becomes a presented decision; the user is not shown a hallucinated or empty fork.
- **The controller resumes claiming convergence but the daemon has not proposed it, or a decision is still open, or no explicit final confirm.** (recoverable)
  - Detection: finalize inspects the resume payload: convergenceProposed + finalConfirm===true + no open decision in preparedBlob.answeredDecisions.
  - Response: Return a retryable error 'not-confirmed' (mirrors today's convergence-incomplete guard); the run stays paused, nothing written.
  - User impact: The SpecArtifact is never written from an unconfirmed/premature convergence — preserves 'nothing persisted until the user explicitly confirms' (ac3).
- **A reopen directive names a decisionId not among the answered decisions.** (recoverable)
  - Detection: finalize looks the decisionId up in preparedBlob.answeredDecisions and finds no match.
  - Response: Return a retryable error 'unknown-decision'; re-prompt; run stays paused.
  - User impact: A typo'd reopen doesn't corrupt the running spec; the user re-sends a valid decisionId.

### Edge cases

| Input | Expected |
| :--- | :--- |
| The idea is already crisp and the daemon proposes convergence on the FIRST decision (or with zero forks). | Valid: the controller presents the assembled minimal spec and, on final confirm, finalize returns {output}. A fork-free run is allowed (decisions/nonGoals may be empty), exactly as today. |
| The user overrides a proposed convergence to raise ANOTHER decision (or asks to stop early). | Honored: 'raise another' drafts an additional decision and re-pauses; 'stop early' goes to the final-confirm gate. Controller/user retains final say (ac3). |
| The user reopens a prior decision and changes the choice, invalidating later decisions. | The changed answer re-folds into the running spec; subsequent decisions are re-drafted grounded on the updated spec (adaptive); post-reopen decisions may be re-surfaced for reconfirmation rather than silently kept. |
| The conversation is abandoned — the controller never resumes / never final-confirms. | Nothing is persisted: no SpecArtifact is written (synthesize only runs on finalize {output}); byte-consistent with today's abandon-persists-nothing guarantee. |
| The run is driven by the daemon (workflow.run) vs the controller (insrc_workflow_step). | Identical loop behavior: both drive layers resolve ctx.draftProvider via the RoleRouter and inject it; the runner logic is the single source, so the paths never diverge (k4/k5). |

### Invariants to preserve

- The executor change is strictly ADDITIVE: existing runners' finalize keeps returning output|error and the single-pass runFrom pause path is unchanged; only a new 'llm-pause' finalize variant + an optional draftProvider on StepRunnerContext are added. [[c2]]
- The SpecArtifact body shape and the seed-focus.ts composeSpecFocus/resolveStageFocus seam stay BYTE-IDENTICAL — define and standalone design.story consume the approved spec exactly as before; only the intermediate per-decision turn shapes are new (ac4). [[c6]]
- Nothing is persisted until the user's explicit FINAL confirm: the synthesize step (spec write) fires only when finalize returns {output}; a premature convergence stays a retryable pause; an abandoned conversation writes nothing (ac3). [[c1]]
- The decision draft runs at the MID tier via the RoleRouter (peripheral role 'brainstorm.decision.draft', NOT core-floor-clamped), built through CliProvider/Ollama only — never REST (k1) — and FAILS CLOSED rather than downgrading to cheap/local (k13/ac4). [[c3]]
- The per-decision pause reuses the existing emit_step delivery and preserves the opaque state token verbatim between turns (k8); it adds no second question mechanism or session store (k9). [[c5]]

## Test strategy

**Test framework:** `node:test + node:assert/strict via `npx tsx --test` (matching src/workflow/runners/brainstorm/__tests__ and src/workflow/__tests__ executor suites)`

### Test levels

- **unit** — Prove the additive executor re-pause contract + the adaptive elicit runner state machine in isolation, driving the runner with a FAKE mid-tier draftProvider that returns canned decisions (no real LLM/daemon). Same node:test fake-provider harness the brainstorm + executor suites already use.
  - Subjects: `executor resumeRun: on a finalize {type:'llm-pause'} result, the SAME step is re-paused (nextStepIndex UNCHANGED, a fresh pause returned) — and the existing {output} (advance) + {error} (retryable stays paused) paths are byte-unchanged (regression)`, `elicit run(): with a fake ctx.draftProvider it drafts exactly ONE decision (decisionDraftSchema) and returns {llm-pause} carrying running-spec state in preparedBlob (ac1)`, `elicit finalize(): a chosenOption answer folds into the running spec and RE-PAUSES the next decision grounded on all prior answers (ac2); a reopen re-pauses the named prior decision; an unknown decisionId => retryable 'unknown-decision'`, `elicit finalize(): convergence + user finalConfirm => {type:'output'} with the assembled spec; convergence WITHOUT final confirm (or an open decision) => retryable 'not-confirmed' (nothing written); an abandoned run writes nothing (ac3)`, `role-taxonomy: resolveRole('brainstorm.decision.draft', cfg) => tier 'mid', clampedByFloor=false; ctx.draftProvider===undefined => elicit fails closed with retryable 'draft-provider-unavailable', never cheap/local (ac4, k13)`, `SpecArtifact invariance: the assembled spec on final confirm matches the UNCHANGED SpecArtifact body, seed-focus composeSpecFocus consumes it byte-identically; existing non-brainstorm runners unaffected by the additive StepFinalizeResult variant (ac4)`
  - Fixtures: `A fake LLMProvider whose completeStructured returns canned decisionDraft JSON (+ one malformed variant for draft-failed); injected as ctx.draftProvider`, `node:test + node:assert/strict via npx tsx --test; the src/workflow/runners/brainstorm/__tests__ + src/workflow/__tests__ (executor) layout`, `A canned running-spec + answered-decisions preparedBlob to drive finalize across re-pause / reopen / converge branches`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: 'elicit run() drafts exactly one decision via the fake mid provider and pauses (decisionDraftSchema)'`, `unit: 'role brainstorm.decision.draft resolves to tier mid (peripheral, not core-floor-clamped)'` |
| `ac2` | `unit: 'finalize folds the chosen option and re-pauses the NEXT decision (executor re-pauses same step on the llm-pause finalize variant)'` |
| `ac3` | `unit: 'convergence + final confirm => finalize {output} => spec written; not-confirmed/open => retryable stays paused; reopen re-pauses prior; abandoned run persists nothing'` |
| `ac4` | `unit: 'assembled spec matches unchanged SpecArtifact body + seed-focus consumes it; draftProvider undefined => fail-closed retryable (never cheap/local); existing runners unaffected by the additive finalize variant (regression)'` |

## Alternatives considered

### a1: Runner-owned loop: additive re-pause finalize + RoleRouter threaded into StepRunnerContext — **CHOSEN**

The elicit runner owns the per-decision loop — finalize gains an additive 'llm-pause' variant so resumeRun re-pauses the same step, and an optional draft-provider on StepRunnerContext lets the runner draft each mid-tier decision.

Two additive contract changes: (1) StepRunnerFinalize may return {type:'llm-pause'} in addition to output|error; resumeRun re-pauses the SAME step. (2) StepRunnerContext gains an OPTIONAL draftProvider populated by the drive layer. The elicit runner becomes a small state machine over a running-spec + answered-decisions in preparedBlob: run() drafts the FIRST decision (role 'brainstorm.decision.draft', new peripheral/mid role) and pauses; finalize folds the answer and drafts+re-pauses the next, or on convergence+final-confirm returns {output}. Fails closed if no draftProvider. SpecArtifact shape + seed-focus unchanged.

### a2: Dynamic plan expansion: each decision is an appended plan step

Dynamically APPEND a new decision step to the plan after each answer, reusing the executor's per-step pause path.

Leave finalize's output|error alone; append a fresh elicit.decision step per answer so runFrom emits the next decision. Provider-reach still via a RoleRouter. Convergence stops appending.

**Rejected because:** Winner-rank 3. VIOLATES k5: a growable plan is a large cross-cutting rework, and it still needs a1's provider coupling anyway — heavier + riskier (L).

### a3: Drive-layer loop: the MCP/daemon drive layer owns the decision loop + generation

Keep the elicit runner a thin single pass; the MCP handler and the daemon workflow.run runner each own the per-decision draft loop.

No executor change. The DRIVE layer builds the RoleRouter, drafts each decision, emits the pause, folds the answer on resume, and invokes synthesize once converged. The runner stays a pass-through.

**Rejected because:** Winner-rank 2. VIOLATES k4 + k5: the stage logic is duplicated across two drive layers instead of one self-contained runner — drifts + tested twice, higher real surface than a1.

## Citations

- **[[c1]]** `analyze-bundle` `s1 symbol.locate — src/workflow/runners/brainstorm/index.ts elicit + finalizeElicit (single-pause; finalize returns output|error, never re-pauses) + schemas.ts brainstormElicitSchema. The redesign replaces this.`
- **[[c2]]** `analyze-bundle` `s1 symbol.locate — src/workflow/executor.ts resumeRun/runFrom (finalize output advances; runFrom is the only pause emitter) + src/workflow/types.ts StepRunnerFinalize returns output|error only; StepRunnerContext has no provider.`
- **[[c3]]** `analyze-bundle` `s1 symbol.locate — src/analyze/context/role-router.ts createRoleRouter/resolveProviderForRole (RoleId→tier, core-floor clamps CRITICAL only, CliProvider/Ollama no-REST) + src/config/role-taxonomy.ts tiers cheap<mid<core; new peripheral 'brainstorm.decision.draft'@mid.`
- **[[c4]]** `analyze-bundle` `s1 usage.example — src/daemon/workflow-rpc.ts + src/workflow/code-review/runner.ts: the reuse precedent for daemon-side structured generation.`
- **[[c5]]** `analyze-bundle` `s1 usage.example — src/mcp/workflow-step/phases/step.ts: resumeRun's paused tick re-emits emit_step + preserves the state token.`
- **[[c6]]** `analyze-bundle` `s1 data-model.trace — src/workflow/seed-focus.ts composeSpecFocus/resolveStageFocus + the SpecArtifact body: the downstream contract that must stay byte-identical (ac4).`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 0 LOW** · model `client` · reviewed 2026-08-04T14:57:07.556Z

_No load-bearing premises were extracted._
