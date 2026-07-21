<!-- insrc:artifact LLD-753e0ed64921d937-s1 -->

# LLD: E20260721753e0ed6:S001

**Epic:** `build-deployment-design-framework-project-analyze`
**HLD base run:** `wf-1784647600994-s00igj`
**HLD effective hash:** `a2de43f19a1d...`

## HLD context

**Framework:** A net-new `src/deploy/` subsystem that mirrors the workflow/analyze framework shape rather than extending either. It exposes a single `deploy-step` MCP loop (phase/state, paralleling `analyze-step` and `workflow-step`) and a per-story `index.ts` registrar + `schemas.ts` contract idiom, wired through its own `chain.ts` (discover → reuse → topology → {security, scale-HA}). All deployment understanding is emitted as graph-grounded, structured entity/relation bundles (never raw file dumps), sourced through the daemon graph via an additive `deploy-rpc.ts` — existing socket path, IPC method names, and payload shapes stay untouched (k3). Infra reach for discovery/topology/security routes exclusively through the existing k8s/cloud/ssh/http built-in tool domains (k6), and any LLM step inherits the CliProvider boundary — no direct cloud REST (k5).
**Rollout phase:** Phase A — Foundational framework contracts
**Owns:** `sc1` (DeployStepProtocol), `sc2` (DeploymentContextBundle)

## Contract details

**Surface level:** internal-shared

### `DeployPhase`

```typescript
export type DeployPhase = 'start' | 'discover' | 'reuse' | 'topology' | 'security' | 'scale' | 'done'
```

**Returns:** `DeployPhase` — Ordered stage discriminant that drives the deploy-step MCP loop; the union mirrors the chain order discover → reuse → topology → {security, scale-HA} plus the start/done terminals, paralleling WorkflowStepPhase.

**Postconditions:**
- Every stage runner and the DeployStageRegistrar.stage field is keyed off exactly this union — no phase string outside it is dispatchable.

### `DeployStepRequest`

```typescript
export interface DeployStepRequest { phase: DeployPhase; repo?: string; state?: string; focus?: string; payload?: unknown }
```

**Parameters:**
- `phase: DeployPhase` — Current loop phase the caller is driving; selects the phase handler under deploy-step/phases/.
- `repo: string` _(optional)_ — Registered, indexed repo path; falls back to $INSRC_REPO when omitted, as with analyze-step.
- `state: string` _(optional)_ — Opaque per-run state token echoed back verbatim; realized as a private state-store record, never persisted to LMDB/Lance/DuckDB.
- `focus: string` _(optional)_ — Free-text focus for the start phase (what deployment surface to explore).
- `payload: unknown` _(optional)_ — Phase-specific input JSON (plan/narrow/bundle body) the caller emits per the returned prompt+schema.

**Returns:** `DeployStepRequest` — Flat, string-discriminated request envelope consumed by handleDeployStep; ships field-for-field as the HLD sc1 interfaceSketch so s2–s6 consume it verbatim.

**Errors:**
- `UnregisteredRepoError` when resolved repo path is not registered with the daemon

**Preconditions:**
- repo (explicit or $INSRC_REPO) is registered and finished indexing

### `DeployStepResponse`

```typescript
export interface DeployStepResponse { next: DeployPhase | 'emit_bundle' | 'done'; guidance: string; prompt?: string; schema?: object; state: string; markdown?: string }
```

**Parameters:**
- `next: DeployPhase | 'emit_bundle' | 'done'` — The next call the caller must make; drives the deterministic loop exactly like WorkflowStepOutput.next.
- `guidance: string` — One-sentence explanation of the next call.
- `prompt: string` _(optional)_ — Authoritative instructions for the JSON the caller emits next (present on emit_* transitions).
- `schema: object` _(optional)_ — JSON Schema the emitted payload must satisfy (present alongside prompt).
- `state: string` — Opaque state token to echo back on the following call.
- `markdown: string` _(optional)_ — Final rendered report, present only when next==='done'.

**Returns:** `DeployStepResponse` — Flat response envelope returned by handleDeployStep; ships field-for-field as the HLD sc1 interfaceSketch. State carried out-of-band as an opaque token, matching the workflow-step precedent.

**Postconditions:**
- state is always populated and must be echoed verbatim on the next request
- when next==='done', markdown is populated and the run's state-store record may be discarded

### `DeployStageRegistrar`

```typescript
export interface DeployStageRegistrar { stage: DeployPhase; register(): void }
```

**Parameters:**
- `stage: DeployPhase` — The phase this registrar owns; the key chain.ts wires stage runners under.
- `register: () => void` — Registers the stage's phase handler into the deploy-step dispatch table (the per-story index.ts registrar idiom).

**Returns:** `DeployStageRegistrar` — The per-story registration seam s2–s6 implement to plug a stage into the s1-owned chain without touching chain internals.

**Postconditions:**
- after register() the stage's DeployPhase is dispatchable by handleDeployStep

### `handleDeployStep`

```typescript
export function handleDeployStep(req: DeployStepRequest): Promise<DeployStepResponse>
```

**Parameters:**
- `req: DeployStepRequest` — Incoming step request whose phase selects the registered stage handler.

**Returns:** `Promise<DeployStepResponse>` — The step dispatcher that drives DeployPhase over the registered stage runners; the deploy-step analogue of handleWorkflowStep. Name inferred from the sibling handler idiom (handle<Subsystem>Step) in s1 usage.example bundle.

**Errors:**
- `UnregisteredRepoError` when req.repo is not a registered/indexed repo

**Preconditions:**
- the stage for req.phase has been register()'d
- LLM/narrow steps run serial for...of (never Promise.all over a provider)

**Postconditions:**
- returns a DeployStepResponse whose next field advances or terminates the loop
- emits no raw file dumps — stage output is always a DeploymentContextBundle

### `DeploymentEntityRef`

```typescript
export interface DeploymentEntityRef { entityId: string; kind: string; name: string; path: string }
```

**Parameters:**
- `entityId: string` — Deterministic entity id from the daemon graph (SHA256(repo+file+kind+name)).
- `kind: string` — Entity kind as classified by the indexer.
- `name: string` — Entity name.
- `path: string` — Graph-sourced file path — never hallucinated.

**Returns:** `DeploymentEntityRef` — A single graph-grounded entity reference; ships verbatim as the HLD sc2 sketch, independent of AnalyzeContextBundle's internal shape.

### `DeploymentRelationRef`

```typescript
export interface DeploymentRelationRef { from: string; to: string; relation: string }
```

**Parameters:**
- `from: string` — Source entityId of the relation.
- `to: string` — Target entityId of the relation.
- `relation: string` — Relation kind between the two entities.

**Returns:** `DeploymentRelationRef` — A single graph-grounded relation reference; ships verbatim as the HLD sc2 sketch.

### `DeploymentCitation`

```typescript
export interface DeploymentCitation { entityId?: string; path: string; note: string }
```

**Parameters:**
- `entityId: string` _(optional)_ — Optional grounding entity for the citation.
- `path: string` — Graph-sourced path the claim is grounded in.
- `note: string` — What this citation grounds.

**Returns:** `DeploymentCitation` — A single citation grounding a bundle claim in a real graph entity/path; ships verbatim as the HLD sc2 sketch (observability rule).

### `DeploymentContextBundle`

```typescript
export interface DeploymentContextBundle { stage: string; summary: string; entities: DeploymentEntityRef[]; relations: DeploymentRelationRef[]; citations: DeploymentCitation[] }
```

**Parameters:**
- `stage: string` — Which stage produced this bundle.
- `summary: string` — Structured prose summary of the stage finding.
- `entities: DeploymentEntityRef[]` — Graph-grounded entities the summary references.
- `relations: DeploymentRelationRef[]` — Graph-grounded relations among those entities.
- `citations: DeploymentCitation[]` — Grounding citations for every non-trivial claim.

**Returns:** `DeploymentContextBundle` — The single structured output shape all stages emit instead of raw file dumps; a flat, self-contained quartet independent of AnalyzeContextBundle's internal layers (satisfies ac2 with lowest coupling).

**Postconditions:**
- contains no raw file dumps — only structured entity/relation/citation references

## Data model changes

### `DeployStepProtocol envelope (DeployStepRequest / DeployStepResponse / DeployPhase / DeployStageRegistrar)` — new

New src/mcp/deploy-step/types.ts modeled on the workflow-step export enumeration (phase/next/state envelope). Chosen as the flat, string-discriminated a1 shape — ships the HLD sc1 interfaceSketch field-for-field rather than reshaping into a per-phase discriminated superset. Joins the analyze-step/build-step/workflow-step envelope family; PascalCase types, kebab-case file.

```
+ export type DeployPhase = 'start'|'discover'|'reuse'|'topology'|'security'|'scale'|'done'
+ export interface DeployStepRequest { phase; repo?; state?; focus?; payload? }
+ export interface DeployStepResponse { next; guidance; prompt?; schema?; state; markdown? }
+ export interface DeployStageRegistrar { stage; register(): void }
```

**Call sites:**
- `src/mcp/workflow-step/types.ts`
- `src/mcp/analyze-step/types.ts`
- `src/mcp/build-step/types.ts`
- `src/mcp/workflow-step/handler.ts`

### `DeploymentContextBundle quartet (DeploymentEntityRef / DeploymentRelationRef / DeploymentCitation / DeploymentContextBundle)` — new

New structured output shape emitted by every stage. Flat, self-contained graph-grounded quartet (entities/relations/citations) that parallels the analyze framework's structured context output but stays independent of AnalyzeContextBundle's internal layers so s2–s6 depend only on this promised shape.

```
+ export interface DeploymentEntityRef { entityId; kind; name; path }
+ export interface DeploymentRelationRef { from; to; relation }
+ export interface DeploymentCitation { entityId?; path; note }
+ export interface DeploymentContextBundle { stage; summary; entities[]; relations[]; citations[] }
```

**Call sites:**
- `src/daemon/analyze-rpc.ts`
- `src/mcp/workflow-step/types.ts`

### `Private deploy-step run state record` — new

Per-run state carried out-of-band behind the opaque DeployStepRequest.state / DeployStepResponse.state token, realized as a private server-side state-store record (with a test-clear hook), mirroring WorkflowStepStage + state-store.ts. Never persisted to LMDB/Lance/DuckDB — preserves the single-owner-of-storage rule (k4) and S001 durability non-functional.

```
+ src/mcp/deploy-step/state.ts (DeployStepStage)
+ src/mcp/deploy-step/state-store.ts (private run record + _clearDeployStateStoreForTests)
```

**Call sites:**
- `src/mcp/workflow-step/state.ts`
- `src/mcp/workflow-step/state-store.ts`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | implements | This Story OWNS sc1 (DeployStepProtocol). It ships DeployPhase + DeployStepRequest + DeployStepResponse + DeployStageRegistrar field-for-field as the HLD interfaceSketch in a new src/mcp/deploy-step/types.ts, driven by handleDeployStep — zero drift from what s2–s6 were promised and lowest lock-step risk against the IDE fork (k3, additive deploy-rpc only). |
| `sc2` | implements | This Story OWNS sc2 (DeploymentContextBundle). It ships the DeploymentEntityRef/RelationRef/Citation/ContextBundle quartet verbatim as the HLD sketch — a flat, graph-grounded structured shape (ac2) kept independent of AnalyzeContextBundle's internals so the five downstream consumers get exactly the promised shape with lowest coupling. |

## Error paths

### Error cases

- **Resolved repo path (explicit `repo`, or `$INSRC_REPO` fallback) is not registered or has not finished indexing when a DeployStepRequest arrives.** (recoverable)
  - Detection: During repo resolution handleDeployStep asks the daemon repo-registry for the row keyed by the resolved path; the lookup returns no registry row (or an incomplete-index marker), so the daemon seam raises UnregisteredRepoError before any stage runs.
  - Response: Surface UnregisteredRepoError back through the deploy-rpc seam / DeployStepResponse rather than fabricating an empty bundle; message names the unresolved path and points at `repo.add`.
  - User impact: Caller learns the repo is not part of the workspace registry and must add + index it; no partial or hallucinated deployment context is returned.
- **req.phase carries a value with no registered stage — either a string outside the DeployPhase union arriving over untyped MCP JSON, or a valid DeployPhase whose DeployStageRegistrar.register() has not run.** (recoverable)
  - Detection: handleDeployStep indexes the dispatch table with req.phase and gets `undefined` (no DeployStageRegistrar bound for that key); the missing-handler branch fires instead of dispatching.
  - Response: Return a terminal error response (DeployStepError-shaped) naming the unknown/unregistered phase and the set of dispatchable DeployPhase values; do not advance `next`.
  - User impact: Caller sees an explicit unsupported/unregistered-phase error instead of a silent no-op, and can correct the phase or wait until the stage is wired.
- **The opaque `state` token echoed on a follow-up call resolves to no run — token was fabricated, belongs to a run whose record was discarded after `next==='done'`, or was evicted from the private state-store.** (recoverable)
  - Detection: The phase handler looks up the private state-store record by the token and gets no record back, so the run context needed to continue the loop is absent.
  - Response: Return an error response indicating the run state is unknown/expired and instruct the caller to restart from `phase:'start'`; never silently mint a fresh run under the stale token.
  - User impact: Caller cannot resume a dead run by accident and is told to re-enter the loop from start; no cross-run state bleed.
- **Caller drives phases out of order — req.phase does not match the DeployStepStage the run record expects next (e.g. jumps to `security` before `topology` completed).** (recoverable)
  - Detection: The handler compares req.phase against the expected-next stage held in the state-store record and finds a mismatch (DeployStepStage != req.phase).
  - Response: Reject with an out-of-order error that reports the expected next phase from the run record; leave the run record unmutated so the correct call can still be made.
  - User impact: Loop invariants stay intact — a caller that skips a stage is corrected rather than producing a bundle built on missing upstream context.
- **The JSON the caller emits for a plan/narrow/bundle step does not satisfy the prompt+schema handed out in the previous DeployStepResponse.** (recoverable)
  - Detection: The handler runs the emitted `payload` through ajv against the schema it issued for that transition and validation returns false.
  - Response: Return the ajv validation errors with the offending fields and re-issue the same prompt+schema so the caller can re-emit; state-store record is not advanced.
  - User impact: Malformed emitted JSON is caught deterministically with actionable field errors instead of corrupting the run or reaching a stage runner with bad input.
- **A stage runner's LLM/narrow step fails mid-loop (provider error from the daemon-routed narrow call, or a stage runner throws).** (recoverable)
  - Detection: The `await` on the serial for...of narrow/LLM call inside the stage runner rejects (never a Promise.all — a single provider rejection surfaces directly), and the handler catches it around the stage dispatch.
  - Response: Return a stage-scoped error response preserving the run's `state` token so the caller can retry the same phase; the failed stage does not emit a partial DeploymentContextBundle.
  - User impact: Caller can retry the specific phase without losing prior stage progress; no half-formed bundle is presented as complete.

### Edge cases

| Input | Expected |
| :--- | :--- |
| DeployStepRequest{ phase:'start' } with `focus` omitted. | The start phase proceeds against a default whole-repo deployment surface (no focus filter) rather than erroring — focus is optional per sc1. |
| DeployStepRequest with `repo` omitted while `$INSRC_REPO` is set in the MCP server environment. | Repo resolves to `$INSRC_REPO` and the loop runs against it, matching the analyze-step fallback; only an unset/unregistered fallback becomes the UnregisteredRepoError path. |
| A stage runs against a repo whose deployment surface is genuinely empty (current layout is a local single-process daemon with no container/orchestration manifests in-repo). | The stage returns a well-formed DeploymentContextBundle with empty `entities`/`relations`/`citations` and a `summary` stating nothing was found — a valid result, not an error. |
| After `topology`, the loop enters the {security, scale-HA} fan-out branch. | security and scale stages are driven as serial DeployPhase transitions (never Promise.all over the provider), each emitting its own DeploymentContextBundle, and both converge to the `done` terminal. |
| A completed run (previous response had next==='done') is called once more with the same still-live `state` token. | The handler re-returns the already-rendered `markdown` for that run idempotently (or an explicit already-complete signal) rather than re-running stages, as long as the record has not yet been discarded. |
| A stage's graph-grounded output references a very large number of entities/relations. | The response stays a structured DeploymentContextBundle quartet (entity/relation/citation refs) — it is never downgraded to a raw file dump regardless of size. |

### Invariants to preserve

- The deploy-step surface reaches storage and infra only through the additive daemon seam (new deploy-rpc method names only); the existing socket path, method names, and payload shapes stay untouched so the two-repo IPC contract with the IDE fork remains in lock-step. [[c2]]
- Per-run deploy-step state lives solely in the private server-side state-store behind the opaque token and is never persisted to LMDB/Lance/DuckDB — the daemon remains the single owner of durable storage. [[c2]]
- Every stage returns a graph-grounded DeploymentContextBundle (structured entity/relation/citation refs with graph-sourced, non-hallucinated paths) — never a raw file dump — consistent with how the analyze framework produces context. [[c2]]
- No LLM/narrow call is ever issued via Promise.all across a provider; stage runners and the step loop invoke providers serially with sequential awaits. [[c2]]

## Test strategy

**Test framework:** `node:test (node's built-in test runner, run via `npx tsx --test 'src/**/__tests__/*.test.ts'`); tests are `*.test.ts` co-located under `__tests__/` dirs — as reported by test.locate in s1 (analyze-step-handler.test.ts, build-step.test.ts, workflow-rpc.test.ts, tracker setup.test.ts).`

### Test levels

- **unit** — Prove the DeployStepProtocol envelope + handleDeployStep dispatcher behave like their workflow-step/analyze-step siblings: phase discrimination, next/state advancement, missing/unregistered-phase and repo/state/schema error paths, and serial (never Promise.all) provider invocation — establishing ac1's framework-consistent interface at the handler seam.
  - Subjects: `src/mcp/deploy-step/handler.ts (handleDeployStep) — mirrors analyze-step-handler.test.ts`, `src/mcp/deploy-step/types.ts (DeployPhase / DeployStepRequest / DeployStepResponse / DeployStageRegistrar envelope shape)`, `src/mcp/deploy-step/state.ts + state-store.ts (opaque-token run record, _clearDeployStateStoreForTests) — mirrors analyze-step-state.test.ts`, `src/mcp/deploy-step/phases/* narrow-emit prompt+schema issuance — mirrors analyze-step-narrow.test.ts`
  - Fixtures: `_clearDeployStateStoreForTests() hook invoked in beforeEach to reset the private state-store between runs`, `a stubbed daemon repo-registry lookup returning registered / unregistered / incomplete-index rows to drive UnregisteredRepoError`, `a stubbed narrow/LLM provider seam (one that rejects on demand) to exercise stage-runner failure without a live provider`, `a minimal registered DeployStageRegistrar test-double per phase so dispatch can be asserted without wiring real stage runners`
- **unit** — Prove every stage emits a graph-grounded DeploymentContextBundle quartet (entities/relations/citations with graph-sourced paths) and never a raw file dump, including the empty-surface and very-large-surface edge cases — establishing ac2 at the output-shape seam.
  - Subjects: `src/mcp/deploy-step/types.ts (DeploymentContextBundle / DeploymentEntityRef / DeploymentRelationRef / DeploymentCitation)`, `the per-stage bundle-assembly path in src/deploy/ stage runners (discover → reuse → topology → {security, scale})`
  - Fixtures: `a graph-context test double returning canned entity/relation/citation refs (so bundle assembly is asserted without a live daemon graph)`, `an empty-surface fixture (no container/orchestration manifests) yielding empty entities/relations/citations arrays with a non-error summary`, `a large-surface fixture (many entity refs) to assert the response stays a structured quartet regardless of size`
- **integration** — Prove the additive daemon RPC seam registers the new deploy method without disturbing existing socket path / method names / payload shapes (lock-step invariant), and that src/deploy/chain.ts drives the stage order discover → reuse → topology → {security, scale} → done through handleDeployStep end-to-end — jointly closing ac1 (framework-consistent, additive interface) and ac2 (each driven stage yields a bundle).
  - Subjects: `src/daemon/deploy-rpc.ts additive registration — mirrors workflow-rpc.test.ts`, `src/deploy/chain.ts stage-order driver — mirrors tracker/__tests__/setup.test.ts stepFor harness`, `handleDeployStep full-loop transition (start → … → done, markdown populated) over stubbed stage runners`
  - Fixtures: `a stepFor-style helper that drives the loop phase-by-phase, echoing the opaque state token each call (per tracker setup.test.ts pattern)`, `a snapshot/assertion of the pre-existing daemon RPC method set to prove deploy-rpc adds only new method names`, `stubbed stage runners returning deterministic DeploymentContextBundles so chain ordering and the security/scale fan-out can be asserted serially`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `src/mcp/deploy-step/__tests__/deploy-step-handler.test.ts › handleDeployStep dispatches each DeployPhase over its registered DeployStageRegistrar and advances response.next like handleWorkflowStep`, `src/mcp/deploy-step/__tests__/deploy-step-handler.test.ts › DeployStepResponse envelope parallels WorkflowStepOutput (next / guidance / prompt / schema / state) and echoes state verbatim`, `src/mcp/deploy-step/__tests__/deploy-step-handler.test.ts › a phase with no registered stage returns a terminal DeployStepError listing dispatchable DeployPhase values (does not advance next)`, `src/mcp/deploy-step/__tests__/deploy-step-handler.test.ts › unresolved/unregistered repo raises UnregisteredRepoError pointing at repo.add instead of an empty bundle`, `src/mcp/deploy-step/__tests__/deploy-step-state.test.ts › unknown/expired state token is rejected with restart-from-start guidance and never mints a fresh run under a stale token`, `src/mcp/deploy-step/__tests__/deploy-step-handler.test.ts › out-of-order phase (e.g. security before topology) is rejected reporting the expected next stage and leaves the run record unmutated`, `src/daemon/__tests__/deploy-rpc.test.ts › registers the additive deploy method only, leaving existing socket path / method names / payload shapes untouched`, `src/deploy/__tests__/chain.test.ts › drives stage order discover → reuse → topology → {security, scale} → done via handleDeployStep, with the security/scale fan-out run as serial DeployPhase transitions (never Promise.all over a provider)` |
| `ac2` | `src/mcp/deploy-step/__tests__/deploy-step-bundle.test.ts › every stage emits a DeploymentContextBundle quartet (entities/relations/citations) and never a raw file dump`, `src/mcp/deploy-step/__tests__/deploy-step-bundle.test.ts › bundle entity/citation paths are graph-sourced DeploymentEntityRef values (SHA256 entityId, non-hallucinated path), not free-text file references`, `src/mcp/deploy-step/__tests__/deploy-step-bundle.test.ts › an empty deployment surface returns a well-formed bundle with empty entities/relations/citations and an explanatory summary (valid result, not an error)`, `src/mcp/deploy-step/__tests__/deploy-step-bundle.test.ts › a stage referencing a very large entity set stays a structured quartet and is never downgraded to a raw dump` |

## Alternatives considered

### a1: Flat literal envelope (HLD sketch verbatim) — **CHOSEN**

Ship sc1/sc2 exactly as the HLD interfaceSketch: flat DeployStepRequest/Response with string phase/next, and a flat DeploymentContextBundle of entities/relations/citations.

sc1 = two flat interfaces (DeployStepRequest{phase,repo?,state?,focus?,payload?}, DeployStepResponse{next,guidance,prompt?,schema?,state,markdown?}) plus the DeployPhase string-union and DeployStageRegistrar, all in src/mcp/deploy-step/types.ts. sc2 = the flat DeploymentEntityRef/RelationRef/Citation/ContextBundle quartet in the same file. Discrimination is by reading the `phase`/`next` string at runtime; no per-phase types. This is the literal HLD sketch with zero elaboration — the DeployStepMcpEnvelope/DeployStepPhase names join the analyze-step/build-step sibling family under a new deploy-step/types.ts.

### a2: Per-phase discriminated union (workflow-step parity)

Model sc1 as a discriminated input/output/emit/terminal family mirroring src/mcp/workflow-step/types.ts's 19-type envelope, so each DeployPhase has its own typed request/emit variant.

sc1 becomes a family: DeployStepInput as a discriminated union over `phase` (DeployStepInputStart, DeployStepInputDiscover, DeployStepInputReuse, DeployStepInputTopology, DeployStepInputSecurity, DeployStepInputScale), plus emit/terminal variants (DeployStepEmitBundle, DeployStepReady, DeployStepDone, DeployStepError) — the same shape idiom as WorkflowStepEmitPlan/WorkflowStepDone/WorkflowStepError. DeployStepMcpEnvelope wraps them. sc2's DeploymentContextBundle stays the structured entity/relation/citation shape but is referenced by DeployStepEmitBundle. The opaque `state` token remains a private state-store record (mirroring workflow-step/state-store.ts), never persisted.

**Rejected because:** Ranked second (a1 > a2 > a3). Best ac1 score (native workflow-step parity, compile-time per-phase safety) and satisfies ac2/sc2 — but only partially satisfies sc1: it reshapes the promised flat sketch into a ~15–19-type superset that must re-prove the promised envelope fields, carries guesswork risk on variant fields (symbol.locate returned zero bodies for the workflow-step envelope types), and enlarges the lock-step surface with the IDE fork (k3, M cost). Strong second, but the sc1 divergence is the wrong risk to take on a contract five stories consume verbatim.

### a3: Generic envelope + AnalyzeContextBundle-aligned output

Parameterize the loop with a single generic DeployStepEnvelope<P> and align DeploymentContextBundle field-for-field with AnalyzeContextBundle so deploy reuses analyze's renderers/citation validation.

sc1 = one generic DeployStepEnvelope<Phase, Payload> plus the DeployPhase union and DeployStageRegistrar; request/response are two instantiations of the generic rather than a per-phase union or two hand-written flats. sc2 = DeploymentContextBundle defined as a structural mirror of AnalyzeContextBundle's entity/relation/citation layers (same field names, same citation-grounding contract) so the existing structured-bundle renderer and 'no hallucinated paths' validation carry over verbatim. Both live in deploy-step/types.ts; bundle is sourced through the additive deploy-rpc.ts seam.

**Rejected because:** Ranked last. Although it gives the strongest ac2 alignment (shared renderers/citation validation with analyze), it partially misses ac1 (non-native generic idiom no sibling uses, awkward under strict mode + exactOptionalPropertyTypes), sc1 (generic reshape of the flat sketch, clumsier per-phase narrowing, added consumption friction for s2–s6), and sc2 (aligning DeploymentContextBundle to AnalyzeContextBundle's internal layers couples the consumed contract to analyze's internals, dragging s2–s6 along and contradicting sc2's independent, self-contained shape). Two partial shared-contract scores plus a partial ac1 put it behind both a1 (two contracts verbatim) and a2 (better ac1).

## Citations

- **[[c1]]** `step-output` `s1.analyzeBundles[0] (symbol.locate — envelope type surface sc1 must parallel)` — "The canonical template for sc1 is src/mcp/workflow-step/types.ts — a ~6 KB file exporting 19 types that form a phase/next/state envelope"
- **[[c2]]** `step-output` `s4 (contract details: api, dataModel, interactionWithShared, surfaceLevel=internal-shared) and s5 invariant source` — "Ships DeployStepRequest/DeployStepResponse + DeployPhase + DeployStageRegistrar field-for-field as the HLD interfaceSketch"
- **[[c3]]** `step-output` `s5.errorCases / edgeCases / invariantsToPreserve` — "Resolved repo path ... is not registered or has not finished indexing when a DeployStepRequest arrives"
- **[[c4]]** `step-output` `s6.testLevels / acceptanceMapping` — "node:test (node's built-in test runner, run via `npx tsx --test 'src/**/__tests__/*.test.ts'`); tests are `*.test.ts` co-located under `__tests__/` dirs"
- **[[c5]]** `step-output` `s2.alternatives (a1/a2/a3)` — "Ship sc1/sc2 exactly as the HLD interfaceSketch: flat DeployStepRequest/Response with string phase/next"
- **[[c6]]** `step-output` `s3.winnerId + judgments` — "a1 is the only alternative that satisfies both shared contracts verbatim (sc1=satisfies, sc2=satisfies)"
- **[[c7]]** `step-output` `s8.results (all verdicts passed; no missed/ambiguous, sbdry1-4 clear)` — "All 9 api[].signature entries ... map to HLD shared contracts sc1 (DeployStepProtocol) and sc2 (DeploymentContextBundle)"
- **[[c8]]** `prior-artifact` `HLD context slice for Story s1 (Epic 753e0ed64921d937) — ownedContracts sc1/sc2, boundary, nonFunctional` — "A net-new `src/deploy/` subsystem that mirrors the workflow/analyze framework shape rather than extending either."

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.story (design.story)

**1 HIGH · 6 MED · 12 LOW** · model `claude` · reviewed 2026-07-21T16:07:18.294Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| citations/c4 | cross-artifact | HIGH | manual | The test files s1 test.locate reports (analyze-step-handler.test.ts, build-step.test.ts, workflow-rpc.test.ts, tracker setup.test.ts) resolve in the source tree and the new deploy tests mirror them. | The premise asserts all four cited test files resolve in the source tree. Three do: `src/mcp/build-step/__tests__/build-step.test.ts:13`, `src/daemon/__tests__/workflow-rpc.test.ts:16`, and `src/workflow/tracker/__tests__/setup.test.ts:12`. But `grep /analyze-step-handler\\.test\\.ts/` → 0 matches — no file by that name exists anywhere in the tree. (The other workflow-rpc.test.ts hits at calibration.ts:62-66 are literal strings in the calibration fixture, not a second real file.) So one of the four anchors the premise claims resolves does not, and the "new deploy tests mirror them" clause has no mirror source for the analyze-step case. | Determine the real analyze-step test file the s1 locate intended (the surviving MCP test lives at src/mcp/build-step/__tests__/build-step.test.ts, so an analyze-step handler test would plausibly sit under src/mcp/analyze-step/__tests__/ — but the evidence does not confirm any such file exists), and either correct the anchor to that verified path or drop analyze-step-handler.test.ts from the mirror set. Do not build a deploy test that mirrors a nonexistent template. |
| citations/c1 | citation | MED | manual | src/mcp/workflow-step/types.ts is the canonical sc1 template: a ~6 KB file exporting the phase/next/state envelope types that DeployStepProtocol parallels. | The anchor file resolves: `read src/mcp/workflow-step/types.ts:1 → FOUND` (a license-header comment block), so the cited path is real, not hallucinated. However, the export grep was TRUNCATED at its 50-match cap while still inside `src/agent/` and `src/analyze/` — it never reached `src/mcp/workflow-step/`. So the evidence does NOT show the file's actual exports, and nothing was gathered on file size. The premise's specific descriptors — "~6 KB", "exporting the phase/next/state envelope types", and the DeployStepProtocol parallel — are therefore neither confirmed nor contradicted by the handed evidence. No contradiction exists (nothing says the file is empty, differently-scoped, or absent), so this is not a build-breaking defect; the anchor points at the intended real file. | none required to build — the citation anchor is a real, resolvable file pointing at the right concept. To fully verify the descriptive claims, re-run the probe scoped to the anchor: `rg '^export (type\|interface\|function)' src/mcp/workflow-step/types.ts` plus a byte-size read to confirm the "~6 KB" and the phase/next/state envelope exports before relying on them. |
| workflow-step-output-next-field | semantic | MED | assisted | A WorkflowStepOutput type exists carrying a `next` field, the precedent DeployStepResponse.next mirrors. | The build target is real: `src/mcp/workflow-step/types.ts:171` defines `export type WorkflowStepOutput =` (a union), and `handler.ts:48` returns `Promise<WorkflowStepOutput>` — consistent with the established discriminated-union pattern where each variant carries a `next` field (`build-step/types.ts:53,62,68,74` → `next: 'implement'\|'refused'\|'done'\|'error'`; `analyze-step/types.ts:77,93,108,118,125` → `next: 'emit_plan'\|'emit_narrow'\|'emit_bundle'\|'done'\|'error'`). However, the named precedent `DeployStepResponse` appears NOWHERE in the gathered evidence — no `deploy-step` type, file, or symbol was matched. The nearest real precedents with a `.next` discriminant are the build-step and analyze-step response unions. | Reword the precedent reference: `DeployStepResponse` does not exist. Point instead to a verified precedent — the build-step response union (`src/mcp/build-step/types.ts`) or analyze-step response union (`src/mcp/analyze-step/types.ts`), both of which carry the `next` discriminant WorkflowStepOutput mirrors. The prescribed change (WorkflowStepOutput carries `next`) is unaffected, so this is a grounding correction, not a redesign. |
| test-mirror-analyze-state-narrow | citation | MED | manual | analyze-step-state.test.ts and analyze-step-narrow.test.ts exist (the state-store and narrow-emit tests the deploy-step unit tests mirror). | The premise cites two files as existing exemplars the deploy-step unit tests mirror. Re-running the premise's own probes contradicts existence: grep `/analyze-step-state\\.test\\.ts/` → 0 matches, and grep `/analyze-step-narrow\\.test\\.ts/` → 0 matches. So neither filename appears anywhere in the source tree as written. However, the probes only tested these two exact filenames — they do not prove that no state-store / narrow-emit tests exist under different names. The evidence therefore contradicts the literal anchors but does not resolve whether the underlying concept (analyze-step tests to mirror) exists elsewhere, and the prescribed change (author deploy-step unit tests analogously) still holds regardless of the exact filename. | Locate the real analyze-step test files (the state-store and narrow-emit suites) and correct the two anchors to their actual paths, or drop the specific filenames if no direct analogue exists. Do not treat the current names as valid — they resolve to nothing. |
| tracker-setup-stepfor-harness | citation | MED | assisted | tracker/__tests__/setup.test.ts contains a stepFor-style loop-driving harness that chain.test.ts is modeled on. | The anchor `stepFor` resolves in `setup.test.ts` — defined at line 85 as `const stepFor = (report, key) => ...`, a pure step-lookup helper used across lines 102–173 to fetch a step by key and assert `.status`/`.action`. So the citation's load-bearing fact (setup.test.ts contains a `stepFor` helper reusable by chain.test.ts) is confirmed. Two imprecisions: (1) `stepFor` is a lookup helper, NOT a "loop-driving harness" — it drives no loop, it indexes into `report.steps`; (2) no evidence about `chain.test.ts` was gathered, so the "modeled on" relationship is unverifiable. Neither alters what gets built: the anchor points at a real, correctly-located helper embodying the right concept. | Reword the premise to describe `stepFor` as a per-step lookup/assertion helper rather than a "loop-driving harness," and soften the unverified "chain.test.ts is modeled on it" to reflect that it's a reusable pattern. The citation itself is sound and needs no anchor change. |
| deploy-phase-closed-union-order | closed-union | MED | manual | DeployPhase is exactly the 7-member ordered union 'start'\|'discover'\|'reuse'\|'topology'\|'security'\|'scale'\|'done', mirroring the chain order discover → reuse → topology → {security, scale-HA}; no phase outside it is dispatchable. | The single gathered probe — a regex for the literal ordered union `'start' \| 'discover' \| 'reuse' \| 'topology' \| 'security' \| 'scale' \| 'done'` — returned 0 matches. No `path:line` read of a `DeployPhase` declaration was handed over. The evidence therefore neither confirms the 7 members, their order, nor the "no phase outside it is dispatchable" claim. A 0-match grep is not a contradiction: the type may be declared with different member spacing, ordering, line-wrapping, or split across lines that this one rigid pattern cannot see. The premise is unverifiable from the evidence provided. | Re-probe DeployPhase directly before trusting or rejecting the closed-union claim: locate the `DeployPhase` type declaration (e.g. `rg 'type DeployPhase'` and read the surrounding lines), then confirm the member set, the ordering, and that dispatch is gated on exactly these members. The current single literal-string grep is too brittle to ground the premise. |
| no-promise-all-provider | external-contract | MED | manual | The project rule that LLM/narrow provider calls run serial for...of and never Promise.all holds in the sibling handler deploy-step mirrors. | The gathered evidence does not surface any "deploy-step" sibling handler at all. The `Promise.all` grep (26 matches) hits only DB drivers (`rdbms-common.ts`, `pg.ts`, `mysql.ts`, `oracle.ts`, `mssql.ts`), test files, `template-loader.ts`, `daemon/index.ts:1146`, `cloud/gcp/iam.ts`, `file/read.ts`, `git/diff.ts`/`show.ts`, graph/lance tests, and `mcp/server.ts:583` — none are provider calls and none live in a `deploy-step` handler. The only workflow-step handler read, `src/mcp/workflow-step/handler.ts:1`, returned just the license-header comment, verifying nothing about serial provider iteration. The rule-affirming comments that DO appear (`review-deferred.ts:67`, `questions.ts:202`, `review.ts:10`, `calibration.ts:168`, `probe.ts:108`) belong to review/question phases, not a deploy-step mirror. The `for...of` grep was truncated at its 50-match cap and shows no deploy-step file either. Thus the premise's subject — a "deploy-step mirror" handler and whether the serial rule holds in it — is neither confirmed nor contradicted by the evidence handed over. | Re-run the probe against the actual deploy-step handler path (the premise names none — anchor is only `handler.ts`). Confirm a `deploy-step` sibling exists and grep it specifically for `Promise.all` over provider calls vs. serial `for...of`. Until that file is surfaced, the premise cannot be judged; the general grep shows no `Promise.all` provider-call violation anywhere, which is consistent with the rule but does not verify the specific mirror. |
| citations/c1 | inventory | LOW | manual | src/mcp/workflow-step/types.ts exports exactly 19 types forming the workflow-step envelope (the count sc1/a2 leans on). | The `grep /export (type\|interface) WorkflowStep\\w+/` returned 21 matches; 2 belong to `src/mcp/workflow-step/state.ts:25,30` (WorkflowStepStage, WorkflowStepStatePayload). The remaining 19 all live in `src/mcp/workflow-step/types.ts`: WorkflowStepPhase (:18), WorkflowStepInputStart (:26), WorkflowStepInputPlan (:34), WorkflowStepInputStep (:40), WorkflowStepInputSynthesize (:47), WorkflowStepInputResolveQuestion (:56), WorkflowStepInputReviewDeferred (:70), WorkflowStepInput (:76), WorkflowStepEmitPlan (:88), WorkflowStepEmitStep (:97), WorkflowStepEmitSynthesize (:108), WorkflowStepDone (:117), WorkflowStepQuestion (:129), WorkflowStepResolveQuestions (:139), WorkflowStepReady (:146), WorkflowStepDeferred (:153), WorkflowStepError (:162), WorkflowStepOutput (:171), WorkflowStepMcpEnvelope (:185). Count = 21 − 2 = exactly 19 in types.ts, matching the premise. | none — verified sound |
| workflow-step-phase-symbol | citation | LOW | manual | A WorkflowStepPhase type exists in workflow-step, which DeployPhase is claimed to parallel. | grep for /WorkflowStepPhase/ returned exactly 1 match at src/mcp/workflow-step/types.ts:18: `export type WorkflowStepPhase =`, and the read of src/mcp/workflow-step/types.ts:1 confirmed the file exists. Both anchors (the `WorkflowStepPhase` symbol and the `src/mcp/workflow-step/types.ts` path) resolve exactly as the premise claims — a `WorkflowStepPhase` type is declared in workflow-step. | none — verified sound |
| handle-workflow-step-symbol | citation | LOW | manual | A handleWorkflowStep function exists (the sibling handle<Subsystem>Step idiom) that handleDeployStep is the analogue of. | The premise claims a `handleWorkflowStep` function exists as the sibling `handle<Subsystem>Step` idiom. Evidence confirms it directly: `src/mcp/workflow-step/handler.ts:31` — `export async function handleWorkflowStep(input: unknown): Promise<WorkflowStepMcpEnvelope>`. It is exported and wired into the MCP server (`src/mcp/server.ts:46` import, `:422` `async (rawArgs, _extra) => handleWorkflowStep(rawArgs)`) and exercised by numerous e2e tests (define/design-epic/design-story/amendments). The anchor `src/mcp/workflow-step/handler.ts` resolves exactly to the named function, establishing the real `handle<Subsystem>Step` idiom that `handleDeployStep` is the analogue of. | none — verified sound |
| callsite-analyze-step-types | citation | LOW | manual | src/mcp/analyze-step/types.ts exists (listed DeployStepProtocol call site / sibling envelope). | The probe `read src/mcp/analyze-step/types.ts:1 → FOUND` resolved and returned real content (a license/header comment banner `/*----...`), confirming the file exists at the cited path. The premise claims only existence of `src/mcp/analyze-step/types.ts`, which the read directly verifies. | none — verified sound |
| callsite-build-step-types | citation | LOW | manual | src/mcp/build-step/types.ts exists (listed DeployStepProtocol call site / sibling envelope). | The probe `read src/mcp/build-step/types.ts:1` returned FOUND with real file content (a license header block `/*----...`), confirming the file exists on the source tree. The premise claims only that `src/mcp/build-step/types.ts` exists, and the read directly verifies it. The truncated ripgrep listing (50 matches, all under `src/agent` and `src/analyze`, capped before reaching `src/mcp`) neither confirms nor contradicts — its absence is a truncation artifact, not evidence the file is missing. The successful direct read is dispositive. | none — verified sound |
| callsite-workflow-step-handler | citation | LOW | manual | src/mcp/workflow-step/handler.ts exists (listed DeployStepProtocol call site). | The premise claims only that `src/mcp/workflow-step/handler.ts` exists as a listed DeployStepProtocol call site. The read probe confirms this: `read src/mcp/workflow-step/handler.ts:1 → FOUND` returns the file's license/comment header, so the file is present on disk at the cited anchor. The companion grep `/export function handle/ → 0 matches` does not contradict the premise — the premise makes no claim about an `export function handle` symbol; it asserts file existence only, which the read verifies. | none — verified sound. The anchor `src/mcp/workflow-step/handler.ts` resolves to a real file, confirming the citation. |
| callsite-daemon-analyze-rpc | citation | LOW | manual | src/daemon/analyze-rpc.ts exists (listed DeploymentContextBundle call site; additive deploy-rpc.ts mirrors it). | The read probe `src/daemon/analyze-rpc.ts:1` resolved successfully — FOUND the file header (`/*----...` license banner) at line 1. This is the exact anchor the citation asserts. The file exists on the real source tree; the citation's load-bearing claim is confirmed. | none — verified sound |
| workflow-step-state-files | citation | LOW | manual | src/mcp/workflow-step/state.ts and state-store.ts exist (the WorkflowStepStage + state-store precedent the private deploy-step run record mirrors). | Both anchor files exist and were read successfully: `src/mcp/workflow-step/state.ts:1` and `src/mcp/workflow-step/state-store.ts:1` each returned FOUND (license-header opening). `WorkflowStepStage` is confirmed as a real exported type — grep returned 3 matches including `state.ts:25:export type WorkflowStepStage =`, plus its use as a field type (`state.ts:45: readonly stage: WorkflowStepStage;`) and a parameter (`state.ts:88: expected: WorkflowStepStage`). The premise's cited precedent (WorkflowStepStage + state-store pair) is real and correctly located. | none — verified sound |
| workflow-clear-state-store-hook | citation | LOW | manual | A _clearWorkflowStateStoreForTests-style test-clear hook exists in workflow-step state-store (the pattern _clearDeployStateStoreForTests mirrors). | The gathered grep for `_clear\\w*StateStoreForTests` returns numerous hits confirming `_clearWorkflowStateStoreForTests` is a real symbol in workflow-step: every workflow-step test file imports it from the anchored module — e.g. `src/mcp/workflow-step/__tests__/handler.test.ts:24: import { _clearWorkflowStateStoreForTests } from '../state-store.js';` (also amendments-e2e.test.ts:36, define-e2e.test.ts:29, define-extend-e2e.test.ts:30, design-epic-e2e.test.ts:34, design-story-e2e.test.ts:39, plan-e2e.test.ts:27, questions-gate-e2e.test.ts:36) and each calls it in setup (handler.test.ts:38, plan-e2e.test.ts:165, etc.). Those imports resolve against `../state-store.js`, i.e. the anchor `src/mcp/workflow-step/state-store.ts`, which the read confirms exists (line 1 FOUND). The premise's load-bearing claim — a test-clear hook of this name exists in workflow-step state-store — is confirmed. | none — verified sound |
| envelope-family-siblings | closed-union | LOW | manual | The deploy-step envelope joins an existing sibling family of exactly analyze-step, build-step, and workflow-step step-envelopes, each with its own types.ts. | All three cited anchors resolve to real files, each opening with its own file header at line 1: `src/mcp/analyze-step/types.ts:1`, `src/mcp/build-step/types.ts:1`, and `src/mcp/workflow-step/types.ts:1` all read FOUND. This confirms the sibling family of step-envelopes, each carrying its own `types.ts`, that the deploy-step envelope is described as joining. (The `grep → 0 match` line is a regex-escaping artifact — the alternation pattern was matched literally — and is superseded by the three direct reads.) The only unproven fragment is the word "exactly": the evidence did not enumerate all `src/mcp/*-step/` directories, so it neither confirms nor denies a fourth sibling — but that does not bear on the prescribed change, since adding a deploy-step envelope alongside the existing three holds whether the family has three members or more. | none — verified sound. The three named sibling envelopes each exist with their own types.ts, confirming the pattern the deploy-step envelope follows. |
| test-mirror-workflow-rpc | citation | LOW | manual | src/daemon/__tests__/workflow-rpc.test.ts exists (the additive-RPC-registration test deploy-rpc.test.ts mirrors). | The grep for `workflow-rpc.test.ts` returns a match originating from inside the file itself — `src/daemon/__tests__/workflow-rpc.test.ts:16: * Run: npx tsx --test src/daemon/__tests__/workflow-rpc.test.ts` — which proves the anchored file exists on disk with real content. The remaining three matches (calibration.ts:62-66) are references TO this test from other source, further confirming it is a real, cited artifact. The citation anchor (`src/daemon/__tests__/workflow-rpc.test.ts`) resolves to an existing file. | none — verified sound |
| entity-id-sha256-formula | semantic | LOW | manual | Daemon graph entity ids are deterministic SHA256(repo+file+kind+name) hex — the formula DeploymentEntityRef.entityId claims to carry. | The canonical formula is confirmed by the type-level doc and by production code. src/shared/types.ts:540 documents `Stable deterministic ID: SHA256(repo + file + kind + name), hex-32`. Production id-derivation sites materialize exactly that formula with a null-byte separator and a 32-hex slice: src/daemon/tools/builtins/code/__tests__/orm-scan.test.ts:125 and the makeEntityId helpers at src/db/graph/migrations.ts:363-365, src/db/relations.ts:90, and src/indexer/parser/base.ts:18 all compute `createHash('sha256').update(`${repo}\\x00${file}\\x00${kind}\\x00${name}`).digest('hex')` sliced to 32. src/db/entities.ts:197 further corroborates that `(repo, file, kind, name)` is the uniqueness tuple. The premise's `hex` is precisely `hex-32` in the source, and the composed key uses `\\x00` separators — an implementation detail that does not alter the stated formula. | none — verified sound. The SHA256(repo+file+kind+name) deterministic-id formula the premise relies on is real and consistently applied; DeploymentEntityRef.entityId can safely carry it (canonical output is the 32-char hex slice). |

#### Proposed fixes

- **citations/c4** (manual) — The evidence proves analyze-step-handler.test.ts does not exist but supplies no verified replacement path, so no safe auto-edit is derivable — a human must locate the intended file or decide to drop the anchor.
  - option: Locate the actual analyze-step handler test (e.g. under src/mcp/analyze-step/__tests__/) and correct the anchor + citation to its real path:line
  - option: Drop analyze-step-handler.test.ts from the four cited mirror sources and generate its deploy test from one of the three confirmed patterns instead
  - option: Remove the analyze-step deploy-test mirror entirely if no analyze-step handler test exists to model it on

- **workflow-step-output-next-field** (assisted) — The load-bearing claim (WorkflowStepOutput exists and carries a `next` field) is corroborated by the type definition plus the family-wide discriminated-union pattern, so what gets built still holds. Only the analogy anchor `DeployStepResponse` is wrong — it matches nothing in the tree. Because two real precedents (build-step, analyze-step) both fit, a human should pick which to cite rather than an auto-edit guessing.
  - option: Replace `DeployStepResponse.next` with `BuildStepResponse.next` (src/mcp/build-step/types.ts) — the structurally closest precedent: a returned discriminated union with a `next` tag.
  - option: Replace `DeployStepResponse.next` with the analyze-step response union's `next` (src/mcp/analyze-step/types.ts:77/93/108/118/125), the other established `next`-carrying precedent.
  - option: Drop the specific precedent name and generalize to 'mirrors the established mcp step-response `next` discriminated-union pattern' to avoid citing a single anchor.

- **test-mirror-analyze-state-narrow** (manual) — The evidence positively contradicts both cited filenames (0 grep matches each) but supplies no correct replacement path, so no safe auto-edit is derivable — a human must confirm the real exemplar test names.
  - option: Search the analyze test directory for the actual state-store / narrow-emit suites (e.g. by different naming such as step-state / step-narrow or a nested __tests__ path) and update both anchors to the verified paths.
  - option: If no direct analogue exists, reword the premise to drop the two specific filenames and instead describe the pattern being mirrored, so the citation no longer points at nonexistent files.
  - option: Confirm whether these tests were planned but not yet written; if so, mark the citation as forward-looking rather than an existing-file reference.

- **tracker-setup-stepfor-harness** (assisted) — The cited helper exists and is correctly located; only the characterization ('loop-driving harness') and the unverified 'modeled on' claim are imprecise. A reword is safe but is a judgment call, so offer options.
  - option: Reword to: 'setup.test.ts contains a stepFor(report, key) per-step lookup helper (line 85) used to assert individual step statuses — a reusable pattern chain.test.ts can follow.'
  - option: Keep the citation but drop the 'loop-driving harness' phrasing, replacing it with 'step-lookup helper'.
  - option: Leave as-is (accept the imprecise characterization) since the anchor resolves correctly and does not change the prescribed change.

- **deploy-phase-closed-union-order** (manual) — The evidence is empty (0 matches on one brittle literal pattern), so no evidence-derived text correction is safe. Resolving this requires re-running a real probe against the DeployPhase declaration — a semantic/verification gap, not a mechanical edit.
  - option: Re-run a looser probe (`rg 'type DeployPhase'` + read the declaration) and re-judge the premise against the actual member list and ordering
  - option: If the declaration is confirmed to hold the 7 ordered members exactly, downgrade to LOW (verified sound)
  - option: If the declaration differs (extra/missing member, different order, or dispatch not gated on the union), escalate to HIGH with the concrete build-breaking discrepancy named

- **no-promise-all-provider** (manual) — The premise asserts a property of a specific 'deploy-step mirror' handler that the evidence never surfaces — no file under a deploy-step path appears in either grep, and the sole handler read returned only a license header. This is a semantic/scoping gap requiring the probe to target the actual file, not a mechanical text fix.
  - option: Narrow the premise to a concrete file path for the deploy-step handler and re-probe it directly for provider-call iteration.
  - option: Drop the 'deploy-step mirrors' claim if no such sibling handler exists in the tree (the evidence surfaces none).
  - option: Rescope the premise to the verified serial-rule sites actually present (review-deferred.ts:67, questions.ts:202, review.ts:10) rather than an unshown deploy-step mirror.
