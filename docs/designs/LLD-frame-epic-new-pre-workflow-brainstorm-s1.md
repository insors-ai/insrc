<!-- insrc:artifact LLD-abd1ecf6a5f5063e-s1 -->

# LLD: E20260801abd1ecf6:S001

**Epic:** `frame-epic-new-pre-workflow-brainstorm`
**HLD base run:** `wf-1785587820064-46kctq`
**HLD effective hash:** `688a10691972...`

## HLD context

**Framework:** Brainstorm ships as a first-class workflow stage (alternative a1): a peer runner directory src/workflow/runners/brainstorm/ that self-registers through the existing executor registry and workflow/index.ts registerWorkflowRunners; a new persisted SpecArtifact peer file in src/workflow/artifacts/ with a specArtifactPaths peer in storage.ts (hash-addressed, listed, approval-stamped identically to DEF/HLD/LLD/PLAN); and an additive elicitation phase on the existing insrc_workflow_step MCP surface that reuses state-store.ts and the questions-gate primitive and preserves the opaque state token verbatim. The single cross-cutting SpecArtifact shape (intent, scope boundary, non-goals, decisions-with-ruled-out-alternatives, open items) is read unchanged by both define (s8) and standalone design.story (s9). Nothing touches the shared/chat-agent brainstorm.addIdea stub.
**Rollout phase:** Phase A — Foundational stage scaffold
**Owns:** `sc2` (Brainstorm stage runner registration), `sc3` (Brainstorm MCP elicitation phase + continuation state)

## Contract details

**Surface level:** internal-shared

### `registerBrainstormRunners`

```typescript
export function registerBrainstormRunners(): void
```

**Returns:** `void` — Idempotently registers the brainstorm stage's step runners with the executor registry. Owns sc2. Called once from registerWorkflowRunners() at daemon boot.

**Errors:**
- `Error 'registerRunner: duplicate runner'` when Only if invoked without the module-level `registered` guard and a runner key collides; the guard (if (registered) return) makes real re-invocation a no-op.

**Preconditions:**
- The executor registry (registerRunner) is importable — module load order matches design-story/design-epic.

**Postconditions:**
- Every brainstorm step runner is registered under workflow id 'brainstorm'; a second call returns immediately (registered guard).

### `registerRunner`

```typescript
registerRunner(r: StepRunner): void
```

**Parameters:**
- `r: StepRunner` — A brainstorm step runner (workflow:'brainstorm', a runnerId, and its run fn) to add to the single executor registry — reused, not a new registry (k5).

**Returns:** `void` — Adds the runner to the process-wide registry; getRunner('brainstorm', runnerId) then resolves it.

**Errors:**
- `Error 'registerRunner: duplicate runner'` when A runner key (workflow+runnerId) is registered twice — executor.ts:57 throws.

**Preconditions:**
- r.workflow === 'brainstorm' and r.runnerId is unique within the stage.

**Postconditions:**
- The brainstorm runner is dispatchable through the existing executor step loop.

### `registerWorkflowRunners`

```typescript
export function registerWorkflowRunners(): void
```

**Returns:** `void` — The central boot-time registration site (workflow/index.ts:23). This story ADDS a registerBrainstormRunners() call beside registerDesignEpicRunners()/registerDesignStoryRunners() — the only edit to this existing function.

**Preconditions:**
- Called once at daemon boot (existing behaviour).

**Postconditions:**
- The brainstorm stage is registered alongside the existing stages; no other stage's registration changes.

### `saveState`

```typescript
saveState(payload: WorkflowStepStatePayload): string
```

**Parameters:**
- `payload: WorkflowStepStatePayload` — Carries the brainstorm run's BrainstormElicitState between turns — reusing the existing workflow-step state store, NOT a new store (k9).

**Returns:** `string` — The opaque continuation token echoed back to the controller and preserved verbatim across turns (k8).

**Preconditions:**
- The brainstorm workflow run is in-flight.

**Postconditions:**
- The state is retrievable via loadState(token); releaseState(token) frees it on completion/abandonment.

## Data model changes

### `BrainstormElicitState` — new

The per-run elicitation continuation state owned by sc3: { workingStatement: string; answered: readonly string[]; openQuestions: readonly string[] }. Persisted INSIDE the existing WorkflowStepStatePayload via state-store saveState/loadState (k9), so the opaque token is the only cross-turn handle. s1 defines the type + wiring; s2-s5 populate/interpret its fields.

```
+ interface BrainstormElicitState { readonly workingStatement: string; readonly answered: readonly string[]; readonly openQuestions: readonly string[]; }
```

**Call sites:**
- `src/mcp/workflow-step/state-store.ts`
- `src/mcp/workflow-step/state.ts`

### `BrainstormStageRegistration / StandaloneBrainstormContext` — new

sc2 types in the new src/workflow/runners/brainstorm/ module: BrainstormStageRegistration { workflow:'brainstorm'; register: RegisterBrainstormRunners } and StandaloneBrainstormContext { focus: string } (peer of design-story's StandaloneStoryContext at standalone.ts:23) for the outside-an-Epic invocation path.

```
+ interface StandaloneBrainstormContext { readonly focus: string; }
```

**Call sites:**
- `src/workflow/runners/design-story/standalone.ts`
- `src/workflow/index.ts`

### `workflow id 'brainstorm'` — new

A new value in the workflow-id space (peer of 'define'/'design.epic'/'design.story'/'plan'/'build'), distinct from the chat-agent brainstorm.addIdea offlineRpc method (k10). Recognized by the executor + the workflow-step start phase as a valid workflow to drive through the existing phase dispatch.

**Call sites:**
- `src/workflow/executor.ts`
- `src/mcp/workflow-step/phases/start.ts`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc2` | implements | s1 owns sc2: creates src/workflow/runners/brainstorm/index.ts exporting registerBrainstormRunners (idempotent `registered`-guarded, mirroring design-story/index.ts:541), a sibling schemas.ts for the stage's per-step JSON schemas, and standalone.ts holding StandaloneBrainstormContext. registerBrainstormRunners() is added to registerWorkflowRunners() (workflow/index.ts) and self-registers each runner via executor.registerRunner — the existing registry, no parallel path (k5). |
| `sc3` | implements | s1 owns sc3: defines BrainstormElicitState and realizes the 'additive elicitation phase' as the new 'brainstorm' workflow driven through the EXISTING workflow-step handler phases (start/plan/step/synthesize/resolve_question — handler.ts:58 is keyed on phase, not workflow), reusing state-store saveState/loadState/releaseState for continuation with the opaque token preserved verbatim (k8,k9) and the existing questions-gate for clarifying questions (k3). No new handler case, no new store. s1 ships only the scaffold + state type; the turn behaviour is s2-s5. |

## Error paths

### Error cases

- **A brainstorm step runner is registered under a runnerId that already exists for the 'brainstorm' workflow (e.g. a copy-paste duplicate in registerBrainstormRunners).** (terminal)
  - Detection: executor.registerRunner (executor.ts:57) computes the workflow+runnerId key and throws `registerRunner: duplicate runner '<key>'` when the key is already present.
  - Response: The Error propagates at daemon boot (registration is synchronous at startup), failing fast so the collision is fixed before any run; it is never swallowed.
  - User impact: Daemon fails to start until the duplicate runnerId is corrected — a build-time class of bug, not a user-facing runtime failure.
- **A brainstorm run resumes with a continuation token that is unknown or has expired.** (recoverable)
  - Detection: state-store.loadState(token) (state-store.ts:52) throws for an unknown/expired token — the same path every existing stage uses.
  - Response: The scaffold propagates that throw as a clear 'unknown or expired brainstorm session' error rather than silently minting a fresh run; the full plain-language message + preserved-answers guarantee is s5's responsibility, but s1 must not convert the throw into a silent new session.
  - User impact: The user is told the session reference is no longer valid instead of losing their answers to a silently restarted conversation.
- **The workflow-step start phase receives workflow:'brainstorm' but no runner is registered for the requested runnerId (a boot-wiring gap — registerBrainstormRunners not added to registerWorkflowRunners, or a missing runner).** (terminal)
  - Detection: executor.getRunner('brainstorm', runnerId) (executor.ts:65) throws when nothing is registered for the key.
  - Response: The run fails with a registry-miss error identifying the missing runner; it does not fall back to another stage.
  - User impact: The brainstorm stage is unavailable until the boot wiring is corrected — surfaced immediately, not as a wrong-stage silent success.

### Edge cases

| Input | Expected |
| :--- | :--- |
| registerWorkflowRunners() (hence registerBrainstormRunners()) is invoked more than once at boot. | The module-level `registered` guard (if (registered) return) makes every call after the first a no-op; no duplicate-runner throw, registration is idempotent. |
| Brainstorm is invoked standalone (outside an Epic) with just a rough one-line focus (StandaloneBrainstormContext { focus }). | The scaffold accepts the focus string and starts a brainstorm run through the standalone path, mirroring design-story's StandaloneStoryContext; no Epic context is required. |
| A small/trivial request that triage routes straight to build or a standalone story, never invoking brainstorm. | The brainstorm stage is simply not entered; triage is untouched and the given route works unchanged (ac5). No code forces the request through the stage. |
| A brainstorm run completes or is abandoned. | releaseState(token) frees the continuation state; a subsequent resume with that token hits the unknown-token path above. |

### Invariants to preserve

- The opaque state-token contract is preserved verbatim: existing stages' saveState->token->loadState round-trip and token shape are unchanged; brainstorm only ADDS BrainstormElicitState into the existing payload, never alters the token format or the existing phases' behaviour. [[c7]]
- The workflow-step handler phase dispatch (start/plan/step/synthesize/resolve_question/review_deferred) is unchanged for every existing workflow; brainstorm adds a new workflow value, not a new or modified phase case. [[c14]]
- The chat-agent brainstorm.addIdea offlineRpc remains separately addressable and is never imported or invoked by the new stage; the two 'brainstorm' concepts stay distinct. [[c13]]

## Test strategy

**Test framework:** `node:test + node:assert/strict, run via `npx tsx --test` (repo convention; workflow suites live under src/workflow/__tests__ and src/mcp/workflow-step/__tests__)`

### Test levels

- **unit** — Prove the registration scaffold + state type in isolation without a live daemon.
  - Subjects: `registerBrainstormRunners is idempotent — a second call is a no-op (registered guard), no duplicate-runner throw`, `after registerBrainstormRunners(), getRunner('brainstorm', <runnerId>) resolves each brainstorm step runner`, `BrainstormElicitState round-trips through state-store saveState->token->loadState unchanged, and releaseState frees it`, `StandaloneBrainstormContext accepts a bare focus string (peer of StandaloneStoryContext)`
  - Fixtures: `a minimal StepRunner stub for the brainstorm workflow`, `_clearWorkflowStateStoreForTests between cases`
- **integration** — Prove brainstorm behaves like any other multi-turn stage over the real workflow-step handler.
  - Subjects: `insrc_workflow_step start with workflow:'brainstorm' returns a continuation token whose shape matches the other stages' tokens (opaque, round-trippable)`, `a resume with an unknown/expired token surfaces a clear error rather than silently starting fresh`, `existing stages (design.story etc.) still start/step/synthesize unchanged after brainstorm is registered — no phase-dispatch regression`
  - Fixtures: `a temp repo registered with the daemon (mirrors define-e2e/design-story-e2e harness)`
- **contract** — Pin the invariants s1 must not break.
  - Subjects: `registerWorkflowRunners() calls registerBrainstormRunners() beside the existing register*Runners (source-level assertion)`, `the brainstorm runner module imports NOTHING from the chat-agent brainstorm.addIdea path — an import-guard test enforcing k10 separateness`, `the workflow-step handler phase switch gains NO new case (start/plan/step/synthesize/resolve_question/review_deferred unchanged) — source assertion that brainstorm is a new workflow value, not a new phase`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: getRunner('brainstorm', runnerId) resolves after registration (stage is a peer)`, `integration: start workflow:'brainstorm' returns a continuation token identical in shape/behaviour to other multi-turn stages`, `contract: registerWorkflowRunners() registers brainstorm beside the existing stages` |
| `ac2` | `unit: BrainstormElicitState persists + reloads via the shared state-store round-trip (no separate store)`, `integration: a two-turn brainstorm carries progress forward through the same in-flight state-store token — one continuous conversation` |
| `ac3` | `integration: a brainstorm run dispatches through the shared executor step loop (getRunner + run), the same path existing stages use`, `contract: no parallel execution/persistence path is introduced (registration wires only into executor/state-store)` |
| `ac4` | `contract: import-guard test — the brainstorm runner module never imports or references brainstorm.addIdea`, `unit: the workflow id 'brainstorm' and the offlineRpc 'brainstorm.addIdea' are independently addressable (distinct namespaces)` |
| `ac5` | `contract: triage route table is unchanged — a small/trivial classification still routes to build/standalone-story and never inserts the brainstorm stage`, `unit: nothing in registration forces a request through brainstorm — the stage is only entered on explicit workflow:'brainstorm' invocation` |

## Alternatives considered

### a1: Brainstorm as a new workflow over the existing phase dispatch + state-store — **CHOSEN**

Register 'brainstorm' as a workflow whose runners drive through the existing start/plan/step/synthesize handler phases, with BrainstormElicitState carried inside the existing state-store payload — no new handler case, no new store.

src/workflow/runners/brainstorm/index.ts exports registerBrainstormRunners (idempotent module-level `registered` guard, mirroring design-story/index.ts:541) that calls executor.registerRunner once per stage step, and is added to workflow/index.ts registerWorkflowRunners(). The stage is a workflow id 'brainstorm' — the workflow-step handler.ts:58 switch is keyed on `phase`, NOT on workflow, so brainstorm plugs into the SAME dispatch with zero new cases. BrainstormElicitState rides the existing state-store saveState/loadState/releaseState opaque-token machinery; clarifying questions reuse the questions-gate + resolve_question phase. This story ships only the scaffold; questioning/convergence is s2-s5.

### a2: New top-level MCP handler phase for brainstorm turns

Add a literal new `case` (e.g. 'answer') to the workflow-step handler switch with its own BrainstormTurnRequest/Response dispatch path, as the HLD interfaceSketch's BrainstormPhase suggested.

Extend src/mcp/workflow-step/handler.ts:58 with a new phase case dispatched to a new phases/brainstorm handler carrying BrainstormTurnRequest -> BrainstormTurnResponse, separate from the generic step loop. State still uses state-store, but the turn protocol is a distinct branch beside start/plan/step/synthesize.

**Rejected because:** Ranked 2. Forks the handler dispatch with a new case — sc3/k8 and ac1 only partially met (the turn protocol diverges from how other stages are driven), for no capability the generic loop lacks.

### a3: Dedicated brainstorm state store separate from workflow-step state-store

Persist BrainstormElicitState in its own session store keyed independently of the workflow-step state-store.

A parallel state store (own token namespace) holds the elicitation continuation state, decoupled from src/mcp/workflow-step/state-store.ts.

**Rejected because:** Ranked 3. A dedicated store directly violates k9 and IS the 'separately-tracked side session' ac2 forbids (sc3 violates).

## Citations

- **[[c1]]** `analyze-bundle` `s1 capability-discovery / symbol-locate — questions-gate primitive` — "src/mcp/workflow-step/questions-gate.ts is the clarifying-question gate the brainstorm elicitation reuses (k3); usage.example returned 0 callers so it is adapted, not a proven extension point."
- **[[c3]]** `analyze-bundle` `s1 module-profile — design-story runner template + executor registry` — "design-story/index.ts:541 registerDesignStoryRunners is idempotent (registered guard) and calls executor.registerRunner (executor.ts:57) per step — the exact template registerBrainstormRunners mirrors"
- **[[c7]]** `analyze-bundle` `s1 module-profile — workflow-step state-store` — "state-store.ts saveState(:38)/loadState(:52, throws on unknown/expired)/releaseState(:64) is the opaque-token machinery BrainstormElicitState persists through with the token preserved verbatim (k8,k9)"
- **[[c13]]** `code` `src/daemon/index.ts:1354` — "'brainstorm.addIdea': offlineRpc('brainstorm.addIdea') — the chat-agent stub the new stage must never import or invoke (k10)."
- **[[c14]]** `analyze-bundle` `s1 module-profile — workflow-step handler dispatch` — "handler.ts:58 dispatches a workflow-agnostic phase switch (start/plan/step/synthesize/resolve_question/review_deferred), so brainstorm plugs in as a new workflow value with no new case (k8)."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 7 LOW** · model `client` · reviewed 2026-08-01T13:46:00.509Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| sc2 | citation | LOW | manual | executor.ts exports registerRunner (throws on duplicate) + getRunner (throws on miss); the brainstorm stage reuses this single registry. | src/workflow/executor.ts:57 `export function registerRunner(r: StepRunner): void` and :65 `export function getRunner(workflow, runnerId): StepRunner` — the single registry the brainstorm stage reuses (k5). Confirmed. | none — verified sound |
| sc2 | citation | LOW | manual | registerDesignStoryRunners is an idempotent (registered-guarded) registration entry point at design-story/index.ts — the template registerBrainstormRunners mirrors. | src/workflow/runners/design-story/index.ts:541 registerDesignStoryRunners + :542 `if (registered) return` — the idempotent registered-guard template (shared by all 6 runner modules); registerBrainstormRunners mirrors it. Confirmed. | none — verified sound |
| sc2 | citation | LOW | manual | registerWorkflowRunners at workflow/index.ts is the central boot registration site (calls the design register*Runners); s1 adds registerBrainstormRunners there. | src/workflow/index.ts:23 `export function registerWorkflowRunners(): void` — the central boot registration site s1 adds registerBrainstormRunners to. Confirmed. | none — verified sound |
| sc3 | citation | LOW | manual | state-store.ts exposes saveState/loadState (throws on unknown/expired)/releaseState — the opaque-token continuation machinery BrainstormElicitState reuses (k9). | src/mcp/workflow-step/state-store.ts:38/52/64 saveState/loadState/releaseState (typed to WorkflowStepStatePayload, distinct from the analyze-step/review-step stores) — the opaque-token continuation machinery BrainstormElicitState reuses (k9). Confirmed. | none — verified sound |
| sc3 | closed-union | LOW | manual | The workflow-step handler dispatch is keyed on phase (start/plan/step/synthesize/resolve_question/review_deferred), NOT on workflow — so a new workflow 'brainstorm' needs no new handler case (k8). | src/mcp/workflow-step/handler.ts:58 `switch (step.phase)` with cases start(:59)/synthesize(:62)/resolve_question(:63)/review_deferred(:64) — dispatch is keyed on phase, not workflow, so a new 'brainstorm' workflow needs no new handler case (k8). Closed-union confirmed. | none — verified sound |
| k10 | citation | LOW | manual | The chat-agent brainstorm.addIdea is an offlineRpc stub at daemon/index.ts:1354 — the k10 collision the new stage stays distinct from. | src/daemon/index.ts:1354 `'brainstorm.addIdea': offlineRpc('brainstorm.addIdea')` — the chat-agent stub the new stage stays distinct from (k10). Confirmed. | none — verified sound |
| sc2 | citation | LOW | manual | StandaloneStoryContext is the design-story standalone-context interface StandaloneBrainstormContext peers. | src/workflow/runners/design-story/standalone.ts:23 `export interface StandaloneStoryContext` — the standalone-context interface StandaloneBrainstormContext peers. Confirmed. | none — verified sound |
