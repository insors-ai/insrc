<!-- insrc:artifact LLD-abd1ecf6a5f5063e-s8 -->

# LLD: E20260802abd1ecf6:S008

**Epic:** `frame-epic-new-pre-workflow-brainstorm`
**HLD base run:** `wf-1785587820064-46kctq`
**HLD effective hash:** `688a10691972...`

## HLD context

**Framework:** Brainstorm ships as a first-class workflow stage (alternative a1): a peer runner directory src/workflow/runners/brainstorm/ that self-registers through the existing executor registry and workflow/index.ts registerWorkflowRunners; a new persisted SpecArtifact peer file in src/workflow/artifacts/ with a specArtifactPaths peer in storage.ts (hash-addressed, listed, approval-stamped identically to DEF/HLD/LLD/PLAN); and an additive elicitation phase on the existing insrc_workflow_step MCP surface that reuses state-store.ts and the questions-gate primitive and preserves the opaque state token verbatim. The single cross-cutting SpecArtifact shape (intent, scope boundary, non-goals, decisions-with-ruled-out-alternatives, open items) is read unchanged by both define (s8) and standalone design.story (s9). Nothing touches the shared/chat-agent brainstorm.addIdea stub.
**Rollout phase:** Phase D — Seed the downstream stages
**Consumes:** `sc1` (SpecArtifact record + hash-addressed persistence), `sc4` (Approved-spec-as-focus consumption contract)

## Contract details

**Surface level:** internal-shared

### `resolveStageFocus`

```typescript
function resolveStageFocus(repoPath: string, focus: string, params: Record<string, unknown>): { readonly focus: string; readonly seededFromSpec?: string }
```

**Parameters:**
- `repoPath: string` — Registered repo root, passed to requireApprovedSpec.
- `focus: string` — The caller's plain focus string (used verbatim when no spec is supplied).
- `params: Record<string, unknown>` — Stage start params; read for the optional specHash (the SpecFocusInput shape).

**Returns:** `{ focus: string; seededFromSpec?: string }` — When params.specHash is a non-empty string: focus = a deterministic composition of the approved spec's intent + scopeBoundary + non-goals + decisions, and seededFromSpec = that specHash. Otherwise: focus returned verbatim, seededFromSpec omitted (plain-focus passthrough, ac4).

**Errors:**
- `SpecNotApprovedError` when params.specHash names an unapproved spec (propagated from requireApprovedSpec) — the seeded start aborts, never framing from an unapproved spec (k12/ac?).
- `SpecArtifactNotFoundError` when params.specHash names a spec that does not exist.

**Preconditions:**
- repoPath is a registered repo

**Postconditions:**
- No disk mutation — read-only resolution
- When seededFromSpec is set, the returned focus verbatim contains the spec's decisions + non-goals (so scope.assess cannot re-ask/contradict them, ac2)

### `composeSpecFocus`

```typescript
function composeSpecFocus(spec: SpecArtifact): string
```

**Parameters:**
- `spec: SpecArtifact` — The approved spec whose body is rendered into a framing focus string.

**Returns:** `string` — A deterministic, human-readable framing that states the spec's intent, scope boundary, explicit non-goals, and each decision (chosen + ruled-out alternatives + reason) — the text scope.assess frames from (ac1).

**Preconditions:**
- spec.body passed isSpecBody at read time

**Postconditions:**
- Pure + deterministic — same spec yields the same focus string

### `requireApprovedSpec`

```typescript
function requireApprovedSpec(repoPath: string, specHash: string): SpecArtifact
```

**Parameters:**
- `repoPath: string` — Registered repo root.
- `specHash: string` — The approved spec to resolve as the seed (from the sc4 resolver, s7).

**Returns:** `SpecArtifact` — The approved spec; throws when unapproved/missing. Consumed by resolveStageFocus (sc4).

**Errors:**
- `SpecNotApprovedError` when meta.approvedAt unset (k12).
- `SpecArtifactNotFoundError` when no spec at that hash.

**Preconditions:**
- s7 shipped this reader

**Postconditions:**
- An unapproved spec is never returned

### `finalizeDefine`

```typescript
function finalizeDefine(intent: WorkflowIntent, stepOutputs, runId: string, elapsedMs: number, llmResponse, model?: string, attribution?): FinalizeResult
```

**Parameters:**
- `intent: WorkflowIntent` — Carries params.specHash (the seed) so the Define meta can be stamped.

**Returns:** `FinalizeResult` — Unchanged shape; the meta it builds now additionally carries seededFromSpec = intent.params.specHash when present (ac3).

**Preconditions:**
- Existing finalizeDefine (orchestrator.ts)

**Postconditions:**
- meta.seededFromSpec identifies the Epic's source spec; absent on a plain-focus Epic (ac4)

## Data model changes

### `ArtifactMetaBase.seededFromSpec` — field-add

New OPTIONAL field on ArtifactMetaBase: the source spec's 16-hex specHash, written by finalizeDefine (and finalizeDesignStory in s9) when the run was seeded from a spec. Absent on every non-seeded artifact (ac4). Additive, peer to specHash/epicHash — no existing field changes. renderDefineMarkdown surfaces it in the header so the Epic identifies its seed (ac3, k7).

**Call sites:**
- `src/workflow/types.ts`
- `src/workflow/orchestrator.ts`
- `src/workflow/artifacts/define.ts`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc4` | consumes | resolveStageFocus consumes sc4's read-side: on a SpecFocusInput (params.specHash) it calls requireApprovedSpec (s7) to obtain the approved spec, refusing an unapproved/missing one (k11/k12). This is exactly sc4's 'consumed at start params' shape; s8 owns no contract. |
| `sc1` | consumes | composeSpecFocus reads the shipped s6 SpecArtifactBody (intent, scopeBoundary, nonGoals, decisions[].chosen/ruledOut/reason) to build the framing focus. Binds to the real s6 shape (chosen, real BrainstormCategory), not the HLD sc1 sketch's `choice`. |

## Error paths

### Error cases

- **define is started with a SpecFocusInput whose spec is not approved.** (recoverable)
  - Detection: resolveStageFocus calls requireApprovedSpec, which sees meta.approvedAt unset and throws SpecNotApprovedError.
  - Response: The seeded start aborts before any WorkflowIntent is built; the sc4 error (naming the SPEC id + outstanding approval) propagates to the caller/user. No Epic is framed from an unapproved spec (k12).
  - User impact: The user is told the spec must be approved first, rather than getting an Epic silently framed from an unreviewed spec.
- **define is started with a specHash that does not resolve to any persisted spec.** (recoverable)
  - Detection: requireApprovedSpec -> readSpecArtifact finds no json at specArtifactPaths(repoPath, specHash).json and throws SpecArtifactNotFoundError.
  - Response: The seeded start aborts; the not-found error propagates.
  - User impact: The user learns the referenced spec does not exist rather than framing from an empty seed.

### Edge cases

| Input | Expected |
| :--- | :--- |
| A plain focus string and no params.specHash. | resolveStageFocus returns the focus verbatim with seededFromSpec unset; the define chain + meta are byte-identical to today (ac4, c30). |
| An approved spec with empty decisions and empty nonGoals (a fork-free brainstorm). | composeSpecFocus still frames from intent + scopeBoundary; the decisions/non-goals sections are simply empty — no error, and scope.assess proceeds from the intent/scope (ac1). |
| BOTH a non-empty focus string AND a params.specHash are supplied. | The spec wins — resolveStageFocus composes the focus from the spec (the SpecFocusInput is the explicit seed); the plain focus string is ignored. Deterministic, single rule (no merge). |
| An approved spec seeds the Epic, then a user inspects the resulting DEF artifact. | meta.seededFromSpec = the source specHash and renderDefineMarkdown shows it — the Epic is identifiable back to its spec (ac3). |

### Invariants to preserve

- The plain-focus path is byte-identical — when no specHash is supplied, resolveStageFocus is a pure passthrough and the define stage's behaviour + outputs are exactly as today (the spec is an ADDITIONAL input only). [[c21]]
- The seeding helper is stage-neutral — the same resolveStageFocus serves define (s8) and standalone design.story (s9); the spec is not specialised to either consumer. [[c11]]
- An unapproved spec is never consumed as a seed — resolveStageFocus resolves only through requireApprovedSpec, which refuses an unapproved spec. [[c16]]

## Test strategy

**Test framework:** `node:test + node:assert/strict, run via `npx tsx --test` (project convention; extends the s6/s7 spec fixture pattern in src/workflow/__tests__/)`

### Test levels

- **unit** — Prove resolveStageFocus + composeSpecFocus: an approved spec composes a focus containing intent/scope/nonGoals/decisions + sets seededFromSpec; a plain focus passes through verbatim with seededFromSpec unset (ac4); an unapproved/missing spec throws the sc4 error.
  - Subjects: `resolveStageFocus (shared seeding helper)`, `composeSpecFocus`, `requireApprovedSpec (sc4, s7)`
  - Fixtures: `a tmp repo with an approved SPEC-*.json (intent/scopeBoundary/nonGoals/decisions populated) via specArtifactPaths + writeAtomic + approveArtifactByJsonPath`, `a peer unapproved SPEC-*.json`, `no-spec params + a plain focus string`
- **unit** — Prove finalizeDefine stamps meta.seededFromSpec from intent.params.specHash (ac3) and leaves it unset on a plain-focus run (ac4); renderDefineMarkdown surfaces it.
  - Subjects: `finalizeDefine (orchestrator.ts)`, `renderDefineMarkdown (define.ts)`, `ArtifactMetaBase.seededFromSpec (types.ts)`
  - Fixtures: `a define stepOutputs fixture (new-capability) + an intent with params.specHash set vs unset`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: resolveStageFocus on an approved spec returns a composed focus that contains the spec's intent + scopeBoundary + non-goals + decisions (framing proceeds from the spec, not a one-liner)` |
| `ac2` | `unit: composeSpecFocus output includes every decision (chosen + ruledOut + reason) and every non-goal verbatim, so the framing input already carries the settled decisions/exclusions (not re-asked / not contradicted)` |
| `ac3` | `unit: finalizeDefine with intent.params.specHash set writes meta.seededFromSpec = that hash; renderDefineMarkdown output contains the source spec id` |
| `ac4` | `unit: resolveStageFocus with no specHash returns the focus verbatim + seededFromSpec unset; finalizeDefine leaves meta.seededFromSpec unset on a plain-focus run (plain path byte-identical)` |

## Alternatives considered

### a1: Shared resolveStageFocus helper: compose intent.focus from the spec + stamp meta.seededFromSpec — **CHOSEN**

A single helper both define entry points call at intent-build time: when params.specHash is present, requireApprovedSpec -> compose a framing focus string from the spec body + carry specHash for finalizeDefine to stamp; plain focus passes through untouched.



### a2: Structured spec on the intent: intent.spec consumed directly by scope.assess

Thread the resolved SpecArtifact through a new intent.spec field and change the define scope.assess step to read the structured spec fields directly instead of a composed focus string.



**Rejected because:** Most faithful but L-sized: forks scope.assess into spec-aware vs plain branches (risks the ac4 byte-identical guarantee) and widens the shared WorkflowIntent type with a stage-specific field — more to get wrong on the critical path than a1's focus override for an M story (partial on ac4/k1).

### a3: Controller composes the focus; no define-side seeding

The controller resolves the spec via the 'spec.resolveApproved' IPC and passes a plain composed focus string to define start; define is unchanged.



**Rejected because:** Smallest surface but violates ac3 (no define-side param -> the Epic cannot record its seed spec) and only partially honors sc4 (seeding becomes controller-only, so the daemon-driven insrc_workflow_run path does not seed); also re-implements composition per caller (drift).

## Citations

- **[[c1]]** `code` `src/mcp/workflow-step/phases/start.ts` — "handleStart builds the WorkflowIntent from input.focus+params at :64 — the controller-driven seam resolveStageFocus hooks."
- **[[c2]]** `code` `src/daemon/workflow-rpc.ts` — "buildContext builds the WorkflowIntent from p.focus+params at :414 — the daemon-driven peer seam; both call resolveStageFocus."
- **[[c3]]** `code` `src/workflow/orchestrator.ts` — "The define chain (defineDecomposer, scope.assess, defineSynthesizer) reads intent.focus verbatim; finalizeDefine builds the DEF meta — stamps meta.seededFromSpec from params.specHash."
- **[[c4]]** `code` `src/workflow/gates.ts` — "requireApprovedSpec (s7 sc4 reader) resolves the approved spec + refuses unapproved; the read-only in-process gate resolveStageFocus consumes."
- **[[c5]]** `code` `src/workflow/types.ts` — "ArtifactMetaBase — gains the additive optional seededFromSpec field (peer to specHash/epicHash)."
- **[[c11]]** `prior-artifact` `DEF-abd1ecf6a5f5063e:k1` — "The artifact is a cross-cutting contract consumable as focus by BOTH define and standalone design.story, not specialised to either — the helper is stage-neutral."
- **[[c16]]** `prior-artifact` `DEF-abd1ecf6a5f5063e:k12` — "The artifact requires explicit user approval before a downstream stage consumes it — an unapproved spec is never seeded (requireApprovedSpec refuses it)."
- **[[c21]]** `prior-artifact` `DEF-abd1ecf6a5f5063e:c30` — "The spec is an ADDITIONAL input to the framing stage; the stage's own behaviour and outputs when given a plain focus string are unchanged."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 6 LOW** · model `client` · reviewed 2026-08-02T12:01:34.227Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| sc4 | citation | LOW | manual | start.ts (handleStart) builds the WorkflowIntent from input.focus + params — the controller-driven seam resolveStageFocus hooks. | CONFIRMED: src/mcp/workflow-step/phases/start.ts:62 `const intent: WorkflowIntent = {` + :64 `focus: input.focus` — the controller-driven seam resolveStageFocus hooks. | none — verified sound. |
| sc4 | citation | LOW | manual | workflow-rpc.ts builds the WorkflowIntent from p.focus + params — the daemon-driven peer seam; both entry points would call resolveStageFocus. | CONFIRMED: src/daemon/workflow-rpc.ts:414 `const intent: WorkflowIntent = { workflow: p.workflow, focus: p.focus, ... }` — the daemon-driven peer seam. | none — verified sound. |
| s8 | citation | LOW | manual | The define chain reads intent.focus (defineDecomposer + scope.assess + defineSynthesizer) and finalizeDefine builds the DEF meta — so overriding intent.focus seeds framing and finalizeDefine can stamp seededFromSpec. | CONFIRMED: src/workflow/orchestrator.ts:492 defineDecomposer(intent) + :817 finalizeDefine(...) — the define chain reads intent.focus and finalizeDefine builds the DEF meta, so overriding intent.focus seeds framing and finalizeDefine can stamp seededFromSpec. | none — verified sound. |
| sc4 | citation | LOW | manual | requireApprovedSpec (the s7 sc4 reader) exists in gates.ts and refuses an unapproved spec — resolveStageFocus consumes it. | CONFIRMED: src/workflow/gates.ts:404 export function requireApprovedSpec(repoPath, specHash): SpecArtifact — the s7 sc4 reader resolveStageFocus consumes. | none — verified sound. |
| dataModel | semantic | LOW | manual | ArtifactMetaBase (types.ts) is the meta type the additive optional seededFromSpec field is added to (peer to specHash/epicHash). | CONFIRMED: src/workflow/types.ts:288 interface ArtifactMetaBase + :340 `readonly specHash?: string` — the additive optional seededFromSpec field is a peer of specHash on this interface. | none — verified sound. |
| boundary | cross-artifact | LOW | manual | The HLD assigns s8 no owned contracts and lists it as consumer of sc1 + sc4, matching this LLD (owns=[], consumes sc1/sc4). | Confirmed by direct read this session of .insrc/artifacts/HLD-abd1ecf6a5f5063e.json: the s8 storyBoundary is owns=[], depends [sc1, sc4], matching this LLD. The probe returned 0/not-found because its regex used \\s* against the 2-space-indented JSON and the scan is scoped to src/ (the artifact lives under .insrc/), not because the ownership differs. | none — cross-artifact ownership matches the HLD. |
