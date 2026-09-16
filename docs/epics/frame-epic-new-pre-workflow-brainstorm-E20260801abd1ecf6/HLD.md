<!-- insrc:artifact HLD-abd1ecf6a5f5063e -->

# HLD: Brainstorm ships as a first-class workflow stage (alternative a1): a peer runner directory src/workflow/runners/brainstorm/ that self-registers through the existing executor registry and workflow/index

## Framework summary

Brainstorm ships as a first-class workflow stage (alternative a1): a peer runner directory src/workflow/runners/brainstorm/ that self-registers through the existing executor registry and workflow/index.ts registerWorkflowRunners; a new persisted SpecArtifact peer file in src/workflow/artifacts/ with a specArtifactPaths peer in storage.ts (hash-addressed, listed, approval-stamped identically to DEF/HLD/LLD/PLAN); and an additive elicitation phase on the existing insrc_workflow_step MCP surface that reuses state-store.ts and the questions-gate primitive and preserves the opaque state token verbatim. The single cross-cutting SpecArtifact shape (intent, scope boundary, non-goals, decisions-with-ruled-out-alternatives, open items) is read unchanged by both define (s8) and standalone design.story (s9). Nothing touches the shared/chat-agent brainstorm.addIdea stub.

## Architecture shape

Four shared contracts partition the Epic. sc2 (stage runner registration) and sc3 (MCP elicitation phase + state) are owned by the foundational stage story s1 and consumed by the elicitation-behaviour stories s2-s5, which add questioning/convergence/options/resume behaviour onto that scaffold. sc1 (the SpecArtifact record + persistence) is owned by s6 — the story that first persists a converged spec — and consumed downstream by s7 (review/approve), s8 (seed Epic) and s9 (seed standalone LLD). sc4 (approved-spec-as-focus consumption) is owned by s7 — where approval gating lives — and consumed by s8 and s9, guaranteeing only an approved spec is ever read as focus. This ownership fits the Epic Story DAG exactly: every consumer transitively depends on its contract's owner (cg2), the induced consumer→owner graph is acyclic (cg1), and each storyBoundary.depends is the exact inverse of the contracts' consumedByStories (cg3). The daemon owns all reads/writes; the MCP layer only exchanges typed messages over IPC (k11), and the controller drives every turn (k2).

## Shared contracts

### sc1: SpecArtifact record + hash-addressed persistence

**Owner Story:** `s6`
**Consumed by:** `s7`, `s8`, `s9`

**Purpose:** The one durable, structured spec both downstream stages read. A typed record (like define.ts/plan.ts) persisted hash-addressed with approval stamping via a storage.ts peer, so it is listed and approval-gated identically to every other workflow artifact and no consumer-specific variant exists (k1,k6,k7).

**Interface sketch (type-level):**

```
// src/workflow/artifacts/spec.ts (peer of define.ts / plan.ts)
import type { BrainstormCategory } from '../../shared/brainstorm-classes.js';
interface SpecDecision {
  readonly choice:   string;
  readonly ruledOut: readonly string[];   // alternatives explicitly excluded
  readonly reason:   string;
}
interface SpecArtifactBody {
  readonly category:      BrainstormCategory;      // 'spec' | 'architecture' | 'how-to-build' (reused vocab)
  readonly intent:        string;
  readonly scopeBoundary: string;
  readonly nonGoals:      readonly string[];
  readonly decisions:     readonly SpecDecision[];
  readonly openItems:     readonly string[];
}
interface SpecArtifact {
  readonly kind:     'spec';
  readonly specHash: string;                        // deterministic hash id
  readonly body:     SpecArtifactBody;
  readonly meta: {
    readonly createdAt:   string;
    readonly approvedAt?: string | undefined;       // set only by the approve gate (k12)
    readonly review?:     unknown;                  // stamped by insrc_review_step
  };
}
// src/workflow/storage.ts (peer of defineArtifactPaths/planArtifactPaths) — call-signature interface
interface SpecArtifactPathsResult {
  readonly md:   string;
  readonly json: string;
}
interface SpecArtifactPaths {
  (repoPath: string, specHash: string): SpecArtifactPathsResult;
}
```

**Assumptions cited:** [[c5]] [[c6]]

### sc2: Brainstorm stage runner registration

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`, `s5`

**Purpose:** The peer-runner scaffold that makes brainstorm a first-class stage: a registerBrainstormRunners entry point that self-registers the stage's step runners through the existing executor registry and is wired into workflow/index.ts registerWorkflowRunners, mirroring design-story/design-epic (k4,k5). The elicitation-behaviour stories attach their steps to this scaffold.

**Interface sketch (type-level):**

```
// src/workflow/runners/brainstorm/index.ts (peer of runners/design-story/index.ts)
// Self-registers via executor.registerRunner; added to workflow/index.ts registerWorkflowRunners().
interface RegisterBrainstormRunners {
  (): void;
}
// The stage identifier is distinct from the chat-agent 'brainstorm' concept (k10).
interface BrainstormStageRegistration {
  readonly workflow: 'brainstorm';
  readonly register: RegisterBrainstormRunners;
}
// Standalone context (peer of design-story/standalone.ts StandaloneStoryContext):
interface StandaloneBrainstormContext {
  readonly focus: string;                 // the rough one-line idea
}
```

**Assumptions cited:** [[c3]]

### sc3: Brainstorm MCP elicitation phase + continuation state

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`, `s5`

**Purpose:** The additive, controller-driven multi-turn surface on insrc_workflow_step: new request/response types dispatched from the existing handler through phases/, reusing state-store.ts for continuation and questions-gate to surface clarifying questions, with the opaque state token preserved verbatim (k3,k8,k9). Elicitation-behaviour stories emit/consume these turn messages.

**Interface sketch (type-level):**

```
// additive on src/mcp/workflow-step/types.ts + a phases/ handler dispatched from handler.ts
type BrainstormPhase = 'start' | 'answer';        // additive phases; existing phases untouched
interface BrainstormElicitState {                  // persisted via existing state-store.ts
  readonly workingStatement: string;               // current understanding shown each turn
  readonly answered:         readonly string[];
  readonly openQuestions:    readonly string[];
}
interface BrainstormTurnRequest {
  readonly phase:   BrainstormPhase;
  readonly answers?: readonly string[];
  readonly state?:   string;                        // opaque continuation token, preserved verbatim
}
interface BrainstormTurnResponse {
  readonly next:      'ask' | 'confirm' | 'done';
  readonly questions?: readonly string[];           // surfaced to the user in chat
  readonly workingStatement?: string;
  readonly state:     string;                       // opaque token echoed back
}
```

**Assumptions cited:** [[c1]] [[c14]]

### sc4: Approved-spec-as-focus consumption contract

**Owner Story:** `s7`
**Consumed by:** `s8`, `s9`

**Purpose:** The read-side contract by which define and standalone design.story accept an approved SpecArtifact as their focus instead of a raw string, gated on approval (k12) and leaving the plain-focus path byte-identical (k1). Owned where approval lives (s7); consumed by the two seeding stories.

**Interface sketch (type-level):**

```
// consumed by define (s8) + standalone design.story (s9) start params
interface SpecFocusInput {
  readonly specHash: string;                        // supplied instead of a plain focus string
}
// The two stages accept EITHER shape; plain-string behaviour is unchanged.
type StageFocus = string | SpecFocusInput;
// Resolution goes through daemon IPC (k11) and refuses an unapproved spec (k12):
interface ResolveApprovedSpec {
  (specHash: string): SpecArtifact;                 // rejects when meta.approvedAt is unset
}
```

**Assumptions cited:** [[c11]] [[c16]]

## Story boundaries

### Story E20260801abd1ecf6:S001

**Owns:** `sc2`, `sc3`

The stage's registration wiring and the shape of the additive MCP phase dispatch: how registerBrainstormRunners hooks into registerWorkflowRunners, the stage's own step-runner ids, and the phase-dispatch branch in the workflow-step handler. The optionality/routing that keeps small and trivial requests from being forced through the stage (ac5) is internal to s1's registration + triage-untouched wiring and is not a contract other stories consume.

### Story E20260801abd1ecf6:S002

**Depends on:** `sc2`, `sc3`

How the first-turn questioning is generated: mapping the rough idea to a BrainstormCategory (via the reused vocabulary) and choosing which intent gaps (scope boundary, exclusions, success condition) to probe first, and the rule that no spec is produced on the first turn. Private to s2; other stories see only the sc3 turn messages.

### Story E20260801abd1ecf6:S003

**Depends on:** `sc2`, `sc3`

The convergence logic: folding answers into the working statement, deciding which gaps remain, presenting the current understanding each turn, detecting the no-material-gap point, requiring explicit user confirmation, and discarding a working statement on abandonment so nothing is persisted. All internal to s3's step behaviour over the sc3 state.

### Story E20260801abd1ecf6:S004

**Depends on:** `sc2`, `sc3`

Option/tradeoff handling: detecting a fork with more than one plausible scope, presenting options with tradeoffs, and recording the chosen direction, the ruled-out alternatives (as non-goals), and unanswered items (as open items) into the working statement. Private to s4; it writes into the sc1 body shape but the record type itself is owned by s6.

### Story E20260801abd1ecf6:S005

**Depends on:** `sc2`, `sc3`

Resume semantics: rehydrating BrainstormElicitState from the existing state store by continuation reference, reporting an unknown/expired reference plainly rather than silently starting fresh, and guaranteeing a resumed conversation converges indistinguishably from an uninterrupted one. Uses sc3's state contract; no new storage.

### Story E20260801abd1ecf6:S006

**Owns:** `sc1`

The concrete SpecArtifact serialization + markdown rendering and the specArtifactPaths hash-addressing + atomic write, plus how the spec is surfaced in the existing artifact listing. The field set is the sc1 contract; the on-disk format details and renderer are internal to s6.

### Story E20260801abd1ecf6:S007

**Owns:** `sc4`
**Depends on:** `sc1`

The review+approval wiring for the spec: running the independent review over the sc1 record, enforcing the block verdict, refusing approval without an explicit override, and stamping meta.approvedAt. How the approve gate marks a spec approved is internal; sc4 exposes only the approved-spec resolution other stages consume.

### Story E20260801abd1ecf6:S008

**Depends on:** `sc1`, `sc4`

How define's start/scope.assess consumes an approved spec: mapping the spec's intent/scope/non-goals/decisions into the framing inputs, not re-asking settled decisions, and recording provenance so the Epic identifies its seed spec. The plain-focus path is unchanged. Internal to define's runner.

### Story E20260801abd1ecf6:S009

**Depends on:** `sc1`, `sc4`

How standalone design.story consumes the same approved spec: seeding the LLD from the spec's recorded intent/scope/decisions and surfacing a scope-too-large mismatch rather than silently narrowing. The plain-focus path is unchanged. Internal to the design-story standalone runner.

## Non-functional targets

- **Performance:** Elicitation is interactive and controller-paced; there is no daemon-side latency SLA because the daemon runs no autonomous loop (k2). The stage sits on the critical design path and uses the core model tier — correctness of the elicited spec is never traded for fewer or cheaper model calls (k13).
- **Security:** No new external surface. The MCP layer never opens LMDB/LanceDB; the SpecArtifact is read/written only through daemon IPC (k11). The stage is namespaced distinctly from the shared/chat-agent brainstorm.addIdea offlineRpc stub and never invokes it (k10).
- **Observability:** The stage emits the same step-start/step-done/synthesize progress frames as the existing stages, and the SpecArtifact appears in the same artifact listing surfaces, so an in-flight or completed brainstorm is observable exactly like any other stage (ac3).
- **Durability:** The SpecArtifact is hash-addressed and written atomically via the existing storage writeAtomic path; reading it back returns identical content. Approval is a durable meta.approvedAt stamp; an abandoned conversation persists nothing (s3/ac5), and an unapproved spec cannot be consumed (k12).

## Rollout

### Phase A — Foundational stage scaffold

**Stories:** `s1`

s1 owns sc2 (runner registration) and sc3 (MCP elicitation phase + state) — the scaffold every elicitation-behaviour story attaches to. It must land first because s2-s5 all depend on it and consume both contracts. This phase makes brainstorm an invokable, peer, resumable stage with no elicitation behaviour yet.

**Backward compat:** Purely additive: a new workflow id and a new MCP phase branch; no existing stage, phase, or artifact type is touched. Small/trivial routes remain unforced through the stage (ac5).

### Phase B — In-chat elicitation behaviour

**Stories:** `s2`, `s3`, `s4`, `s5`

These stories add questioning (s2), convergence (s3), options/tradeoffs (s4), and resume (s5) onto the Phase A scaffold, each consuming sc2+sc3. They follow the Epic edges (s2→s1; s3→s2; s4→s3; s5→s2) and can be built in that internal order within the phase. No persisted artifact is produced yet — all work is over the in-flight state.

**Backward compat:** Additive turn behaviour on the new phase only; the opaque state token contract and questions-gate remain unchanged for existing stages.

### Phase C — Persist + review/approve the spec

**Stories:** `s6`, `s7`

s6 owns sc1 (the SpecArtifact record + persistence) and depends on s3+s4 (a converged statement with decisions/open-items must exist to persist); s7 owns sc4 and depends on s6 (it reviews/approves the persisted spec and exposes approved-spec resolution). Ordering s6 before s7 respects both the Epic edge and sc1's ownership landing before sc4.

**Backward compat:** The SpecArtifact rides the existing storage + listing + review + approve path; no change to how other artifacts are stored, listed, or approved.

### Phase D — Seed the downstream stages

**Stories:** `s8`, `s9`

s8 (define) and s9 (standalone design.story) both depend on s7 and consume sc1+sc4 — they accept an approved spec as focus. They land last because they require the approved-spec contract from Phase C. They are independent of each other and can be built in parallel.

**Backward compat:** CRITICAL: the plain-focus-string path of both define and standalone design.story must remain byte-identical (s8/ac4, s9/ac4); the spec input is strictly additive, and an unapproved spec must be refused (k12).

**Ordering rationale:** Phases follow the Epic Story DAG and shared-contract ownership: owners land before consumers. Phase A (s1) establishes the runner + MCP-phase contracts that Phase B (s2-s5) consumes; Phase C (s6 then s7) introduces the SpecArtifact contract that Phase C-approval and Phase D consume; Phase D (s8, s9) consumes the approved-spec contract owned in Phase C. Every one of the nine stories appears in exactly one phase, and no phase precedes a phase that owns a contract it depends on — matching cg1/cg2 (consumers strictly downstream of owners).

### Risky bits

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| Contract-graph consistency across the LLDs (the cg1/cg2/cg3 invariants) | A daemon-driven HLD synth failed four times precisely on cg3 (storyBoundaries.depends not the exact inverse of consumedByStories) — the graph is easy to drift when nine stories share four contracts. | This HLD encodes owners at the nearest common ancestor every consumer already depends on (sc1@s6, sc2/sc3@s1, sc4@s7) and sets each depends[] as the exact inverse of consumedByStories; downstream LLDs must consume these contracts verbatim and never re-own them, and the design.story review re-checks the graph. |
| One SpecArtifact shape serving two different consumers (k1) | define (Epic framing) and standalone design.story (feature LLD) have different downstream needs; a field one requires and the other lacks would force a consumer-specific variant, defeating the cross-cutting-contract goal. | sc1 fixes a single neutral shape (intent, scopeBoundary, nonGoals, decisions-with-ruledOut, openItems) that is framing-agnostic; s9 surfaces a scope-too-large mismatch to the user rather than mutating the spec, so neither consumer needs its own variant. |
| Naming collision with the chat-agent brainstorm stub (k10) | A `brainstorm` concept already exists in the shared/chat-agent layer (brainstorm.addIdea, an offlineRpc stub); a new stage sharing the name risks appearing to implement or coupling to that stub. | The stage lives entirely in the workflow layer with its own workflow id and runner/artifact/phase names, never imports or invokes brainstorm.addIdea, and reuses only the pure BrainstormCategory vocabulary from shared/brainstorm-classes.ts; s1/ac4 explicitly asserts the two remain separately addressable. |

## Alternatives considered

### a1: First-class peer stage (runner + SpecArtifact + additive workflow-step phase) — **CHOSEN**

Brainstorm is a workflow stage exactly like the existing design stages: a peer runner, a peer persisted artifact, and an additive elicitation phase on the existing MCP step surface.

The stage lands as a peer runner directory under src/workflow/runners/brainstorm/ (index.ts exporting registerBrainstormRunners + schemas.ts + a standalone context), self-registering through executor.ts registerRunner and wired into workflow/index.ts registerWorkflowRunners exactly as design-epic/design-story do. Its output is a new SpecArtifact typed record as a peer file in src/workflow/artifacts/ (spec.ts) with a specArtifactPaths peer in storage.ts, so it is hash-addressed, listed, and approval-stamped identically to DEF/HLD/LLD/PLAN. The interactive elicitation is an ADDITIVE phase on the existing insrc_workflow_step MCP surface reusing state-store.ts + the questions-gate primitive with the opaque state token preserved verbatim; downstream, define (s8) and standalone design.story (s9) gain an approved-spec-as-focus input path while their plain-focus behaviour is byte-identical.

**Pros:**
- Every constraint k3-k9 is satisfied structurally by reuse: no new transport, no second question mechanism, no bespoke persistence — the stage IS the existing template instantiated once more.
- The spec travels the identical review+approval+listing path (k12), so s6/s7 are wiring, not new machinery.
- One SpecArtifact shape serves both consumers (k1) — s8 and s9 read the same file.
- Naming-collision guard (k10) is trivial because the stage lives entirely in the workflow layer, never touching the brainstorm.addIdea stub.

**Cons:**
- Touches the most seams (runner registry + artifacts module + workflow-step MCP surface + two downstream stages), so it is the largest of the three in raw file count.
- The SpecArtifact shape must be designed to satisfy two readers at once (k1).

**Cost estimate:** L

### a2: Analyze-framework recipe (elicitation as an analyze exploration)

Implement brainstorm inside the analyze framework as a new clarify/elicit recipe that emits a spec bundle, rather than as a workflow stage.

Rather than a workflow stage, the elicitation is added to the analyze framework, which already references a 'clarify step (between classify + plan)'. A new analyze recipe would ask clarifying questions and assemble a spec-shaped bundle as its answer type, reusing the analyze decomposer/synthesizer loop the controller already drives turn-by-turn. The converged spec would be an analyze bundle rendered to markdown; define/design.story would take that markdown as focus.

**Pros:**
- Reuses the analyze framework's existing controller-driven multi-turn loop and its 'clarify step' precedent.
- Smaller surface in the workflow layer — no new runner or artifact module.

**Cons:**
- analyze is read-only context-building: it produces no persisted, hash-addressed, approval-stamped artifact, so k6/k7/k12 cannot be met without rebuilding the workflow layer's artifact machinery.
- The spec would not appear among workflow artifacts (s6/ac3) and would not travel the workflow approval path (s7).
- Two subsystems would then own artifact production, contradicting k1 and k5.

**Cost estimate:** M

**Rejected because:** Ranked 2. Violates k5/k6/k7/k12: analyze is read-only context-building with no persisted, approval-stamped artifact, so it would have to rebuild exactly the workflow-layer artifact machinery a1 gets for free, and the spec would neither be listed among workflow artifacts nor travel the shared approval gate.

### a3: Standalone brainstorm tool with a bespoke session store

A dedicated insrc_brainstorm MCP tool with its own session storage and its own on-disk spec format, separate from the workflow-step surface.

A new top-level MCP tool (insrc_brainstorm) owns the elicitation conversation end to end, with its own session-state store and a bespoke spec file format, independent of insrc_workflow_step. Downstream stages would be taught to read that bespoke format. This maximises separation at the cost of duplicating transport, state, and persistence that already exist.

**Pros:**
- Cleanest module isolation: no coupling to workflow-step request/response types.
- The elicitation UX can be shaped freely without fitting the existing step-loop schema.

**Cons:**
- Forks the MCP transport and adds a second, differently-shaped question mechanism — direct violations of k8, k9, and k3.
- Bespoke on-disk spec format violates k6/k7 and means the spec is NOT found among workflow artifacts (s6/ac3) and does NOT travel the shared approval path (k12/s7).
- A separately-named brainstorm tool with its own store sharply raises the k10 naming-collision risk.
- Highest cost: it rebuilds transport + state + persistence that a1 gets for free by reuse.

**Cost estimate:** L

**Rejected because:** Ranked 3 (most hard violations). Forks the MCP transport (k8/k9), adds a second question mechanism (k3), invents a bespoke store (k6/k7), bypasses the shared approval path (k12), and sharply raises the k10 collision risk — duplicating wholesale what a1 obtains by reuse.

## Citations

- **[[c1]]** `analyze-bundle` `s1 capability-discovery — questions-gate elicitation primitive` — "src/mcp/workflow-step/questions-gate.ts implements a clarifying-question gate over the MCP step loop; the new stage reuses it (k3)."
- **[[c3]]** `analyze-bundle` `s1 module-profile — design-story/design-epic runner template` — "src/workflow/runners/design-story/index.ts exports registerDesignStoryRunners + schemas.ts; the per-stage template a peer brainstorm runner follows (k4)."
- **[[c5]]** `analyze-bundle` `s1 module-tree — src/workflow/artifacts peer files` — "src/workflow/artifacts/ holds one file per artifact type (define.ts, plan.ts, hld.ts, lld.ts...); a SpecArtifact is a peer file there (k6)."
- **[[c6]]** `code` `src/workflow/storage.ts + src/workflow/artifacts/plan.ts` — "storage.ts writeAtomic + defineArtifactPaths/planArtifactPaths establish the hash-addressed, approval-stamped persistence a specArtifactPaths peer follows (k7)."
- **[[c11]]** `stakeholder` `scoping decision with user — spec consumers` — "Spec consumers: BOTH define and standalone design.story read the one cross-cutting SpecArtifact (k1)."
- **[[c14]]** `analyze-bundle` `s1 module-tree — workflow-step multi-turn machinery` — "src/mcp/workflow-step/ carries handler.ts, types.ts, state.ts, state-store.ts, questions-gate.ts, phases/ — the controller-driven loop machinery the additive phase reuses (k8,k9)."
- **[[c16]]** `convention` `CLAUDE.md — review before approve` — "insrc_review_step before approve; approval is never auto-granted — the spec passes the same gate before any downstream consumption (k12)."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.epic (design.epic)

**0 HIGH · 0 MED · 8 LOW** · model `client` · reviewed 2026-08-01T13:25:36.307Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| sc3/c1 | citation | LOW | manual | src/mcp/workflow-step/questions-gate.ts exists (the clarifying-question primitive sc3 reuses). | src/mcp/workflow-step/questions-gate.ts:1 found=True; also imported by phases/resolve-question.ts — the elicitation primitive sc3 reuses is real. | none |
| sc2/c3 | citation | LOW | manual | src/workflow/runners/design-story/index.ts exports registerDesignStoryRunners with a sibling schemas.ts — the per-stage runner template sc2 mirrors. | registerDesignStoryRunners defined at src/workflow/runners/design-story/index.ts:541 and imported/called in workflow/index.ts — the per-stage runner template sc2 mirrors is real. | none |
| sc2/framework | citation | LOW | manual | src/workflow/index.ts registerWorkflowRunners() is the central registration site (calls registerDesignEpicRunners/registerDesignStoryRunners) that a registerBrainstormRunners would be added to. | src/workflow/index.ts:23 `export function registerWorkflowRunners()` calls registerDesignStoryRunners()/registerDesignEpicRunners() — the central registration site a registerBrainstormRunners is added to. | none |
| sc1/c5 | inventory | LOW | manual | src/workflow/artifacts/ holds one file per artifact type (define.ts, plan.ts, hld.ts, lld.ts), so a SpecArtifact spec.ts is a peer file there. | The s1 module-tree bundle enumerated src/workflow/artifacts/ as one file per artifact type (define.ts, plan.ts, hld.ts, lld.ts, extend.ts, stub.ts, tracker.ts); a spec.ts peer fits the established convention (k6). | none |
| sc1/c6 | citation | LOW | manual | src/workflow/storage.ts exports writeAtomic + per-type path builders defineArtifactPaths/planArtifactPaths — the hash-addressed persistence a specArtifactPaths peer follows. | src/workflow/storage.ts:71 writeAtomic, :194 defineArtifactPaths, :240 planArtifactPaths — the hash-addressed persistence a specArtifactPaths peer follows is real. | none |
| sc3/c14 | inventory | LOW | manual | src/mcp/workflow-step/ carries the multi-turn loop machinery the additive phase reuses: handler.ts, types.ts, state.ts, state-store.ts, questions-gate.ts, and a phases/ directory. | src/mcp/workflow-step/ carries handler.ts, types.ts, state.ts, state-store.ts, questions-gate.ts and phases/ (confirmed present this session; mirrored by build-step/review-step which cite it as their template) — the multi-turn machinery the additive phase reuses (k8,k9). | none |
| sc1/k10 | citation | LOW | manual | src/shared/brainstorm-classes.ts defines the reusable BrainstormCategory vocabulary, and the chat-agent brainstorm.addIdea is an offlineRpc stub in src/daemon/index.ts — grounding the k10 naming-collision guard (the stage reuses the vocab, never the stub). | src/shared/brainstorm-classes.ts:12 `export type BrainstormCategory`; src/daemon/index.ts:1354 `'brainstorm.addIdea': offlineRpc('brainstorm.addIdea')` — the reusable vocabulary AND the stub are both real, so the k10 guard (reuse vocab, never the stub) is grounded. | none |
| h-graph | ordering | LOW | manual | The HLD contract graph is internally consistent with the Epic Story DAG: owners sc1@s6, sc2/sc3@s1, sc4@s7; every consumer transitively depends on its owner (cg2); the induced graph is acyclic (cg1); and each storyBoundary.depends is the exact inverse of consumedByStories (cg3). | The framework's own checkContractDependencyGraph (hld.ts:447, cg1/cg2/cg3) + checkOwnershipConsistency + checkStoryCoverage + checkRolloutCoverage all PASSED at synthesize — the artifact is only written when the graph is consistent. Owners sc1@s6/sc2,sc3@s1/sc4@s7 with depends as the exact inverse of consumedByStories; acyclic; all consumers downstream of owners. | none |
