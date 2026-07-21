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

**0 HIGH · 1 MED · 4 LOW** · model `client` · reviewed 2026-07-21T20:36:32.756Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| k4 | semantic | MED | manual | The daemon owns all DB access (CLIs/MCP/IDE go through IPC only), so deploy runners reading the graph over deploy-rpc rather than opening LMDB/Lance directly is consistent with the existing rule. | Both greps returned 0 matches, but the probe searches src/ only while this premise's anchor is CLAUDE.md (project-rules doc), outside the searched scope — so the evidence neither confirms nor refutes it. Unverifiable from the gathered evidence. | Re-probe against CLAUDE.md/docs; the daemon-owns-all-DB rule is stated in CLAUDE.md rule 1, so the claim is sound but the src-scoped probe cannot see it. |
| s1/test-strategy | citation | LOW | manual | The four existing test files the new deploy tests mirror all resolve in the source tree: analyze-step-handler.test.ts, build-step.test.ts, workflow-rpc.test.ts, and setup.test.ts. | All four cited test files are confirmed present on disk: analyze-step-handler.test.ts at src/mcp/__tests__/, build-step.test.ts at src/mcp/build-step/__tests__/, workflow-rpc.test.ts at src/daemon/__tests__/, and setup.test.ts at src/workflow/tracker/__tests__/ (each surfaced by the filename-existence check). The premise holds. | none — verified sound |
| sc1 | citation | LOW | manual | The analyze-step and workflow-step MCP multi-turn loops exist and are the envelope idiom sc1 DeployStepProtocol parallels. | handleAnalyzeStep exists at src/mcp/analyze-step/handler.ts:56 and handleWorkflowStep at src/mcp/workflow-step/handler.ts:31 — both multi-turn step loops present, confirming the envelope idiom sc1 parallels. | none — verified sound |
| sc1 | citation | LOW | manual | The workflow runners use an index.ts registrar + schemas.ts contract idiom that the deploy runner idiom mirrors, e.g. the design-epic runner. | src/workflow/runners/design-epic/schemas.ts exists (alongside build/define/design-story/plan runners) and runners/design-epic is registered via src/workflow/index.ts:13 (registerDesignEpicRunners). The index.ts + schemas.ts runner idiom is real. | none — verified sound |
| framework | inventory | LOW | manual | src/daemon/deploy-rpc.ts is net-new: no deploy-rpc handler exists in the daemon today, so the seam is additive and does not modify existing IPC. | Both greps (deploy-rpc, deployRpc) return 0 matches under src/ — no deploy-rpc handler exists in the daemon today, confirming the seam is genuinely net-new and additive to existing IPC. | none — verified sound |
