<!-- insrc:artifact DEF-abd1ecf6a5f5063e -->

# Epic: Today a user's idea enters the workflow chain as a raw one-line focus string: both `define` and standalone `design.story` begin work from whatever text the caller happened to type, and everything that actually determines whether the resulting Epic or LLD is correct — the real scope boundary, the directions the user has already ruled out, the tradeoffs they weighed and the option they picked, the constraints they know about but did not write down — stays in the user's head at the moment framing begins.

**Flavor:** new-capability

## Problem

Today a user's idea enters the workflow chain as a raw one-line focus string: both `define` and standalone `design.story` begin work from whatever text the caller happened to type, and everything that actually determines whether the resulting Epic or LLD is correct — the real scope boundary, the directions the user has already ruled out, the tradeoffs they weighed and the option they picked, the constraints they know about but did not write down — stays in the user's head at the moment framing begins. The downstream stages therefore infer intent rather than receive it: they must guess at scope from a sentence, and the first point at which the user can see whether their intent was understood is after a full artifact has been produced, when disagreement means re-running the stage or amending an artifact rather than correcting a misunderstanding cheaply. The gap compounds because two different stages consume that same under-specified input independently, so the same idea can be interpreted two different ways depending on which entry the user takes, and nothing durable records the intent the user actually converged on — there is no shared, inspectable statement of what was asked for that both entries read, and no record of the reasoning that narrowed a vague idea into a specific one. The cost lands on exactly the requests most in need of framing: large, ambiguous, new-capability asks, where a one-liner is the least adequate and the rework from a misframed Epic is the most expensive.

## Non-goals

- **Implementing or wiring up the existing chat-agent `brainstorm` runtime (`brainstorm.addIdea`), which is an offlineRpc stub in this backend.** — The real agent pipeline behind that stub lives in the IDE fork; this Epic shares only the category vocabulary with it, and conflating the two would scope in cross-repo work that does not serve the workflow chain.
- **A daemon-autonomous elicitation loop that reasons with the user without the MCP controller in the middle.** — The interaction model was decided with the user as in-chat and controller-driven, mirroring the existing step-loop + questions-gate pattern; a daemon-side loop would be a second, divergent interaction mechanism.
- **Changing the internal schemas, prompts, or output artifacts of `define`, `design.epic`, `design.story`, `plan`, or `build`.** — Those stages are downstream consumers here; the Epic adds an input to them, and redesigning their outputs would make the change unbounded and entangle it with already-shipped stage Epics.
- **Generalising the clarifying-question gate into shared, multi-stage elicitation infrastructure used by every runner.** — The gate has no indexed call sites today, so there is no evidence of a proven multi-stage extension point; generalising speculatively would build an abstraction on one example.
- **A TUI or IDE-side user interface for the elicitation conversation.** — The conversation happens in the MCP client's chat surface by decision; a separate UI would duplicate the interaction and add a second contract to keep in lock-step with the IDE fork.
- **Replacing or bypassing the triage router that decides which stage a request enters at.** — Triage's sizing/routing responsibility is orthogonal to eliciting a well-formed statement of the request, and folding them together would couple two independent decisions.
- **Making the new stage mandatory for every request that enters the chain.** — Small and trivial asks are routed straight to build or a standalone story precisely because they need no framing; forcing elicitation on them would add cost with no accuracy gain.

## Assumptions

- `high` No existing workflow stage performs interactive spec elicitation — capability discovery over the indexed graph returned only primitives whose concerns partially overlap, so the stage behaviour itself is net-new in this backend. [[c13]]
- `high` The clarifying-question gate is not yet a proven cross-stage extension point — `usage.example` for it reports zero indexed callers — so the new stage adapts that primitive rather than plugging into established shared infrastructure. [[c1]]
- `med` The `spec` / `architecture` / `how-to-build` categorisation vocabulary is directly reusable as-is; the new stage does not need to invent its own taxonomy. [[c2]]
- `high` A new stage follows the established per-stage runner template (a registration entry point plus its schemas, plus a standalone path where the stage runs outside an Epic), as the two existing design runners both do. [[c3]]
- `high` A new persisted artifact type is a peer file inside the existing artifacts module rather than a new subsystem — that module already holds one file per artifact type. [[c5]]
- `high` The MCP step surface already carries the state persistence, typing, and test scaffolding a multi-turn controller-driven loop needs, so this is a new phase on existing transport rather than new transport. [[c14]]
- `med` Both consumers can be seeded from the same artifact: `define` takes it as the seed for a full Epic and standalone `design.story` takes it as the seed for a feature LLD, so one artifact shape must satisfy two readers. [[c11]]
- `high` No shipped Epic in the catalog covers the chain's entry point — the existing stage Epics are downstream (`plan` 4th, `build` 5th) — so there is no overlap to reconcile or predecessor to extend. [[c9]]
- `med` The chain's tail is already closed out by the build Epic, confirming the remaining structural gap is upstream of `define` rather than after `plan`. [[c10]]
- `med` The produced artifact will be subject to the same review-then-explicit-approval discipline as other workflow artifacts before downstream stages consume it. [[c16]]

## Constraints

| ID | Type | Text | Source |
| :--- | :--- | :--- | :--- |
| `k1` | stakeholder | The artifact is a cross-cutting contract: it must be consumable as the input/focus by BOTH `define` and standalone `design.story`, not specialised to either one. | [[c11]] |
| `k2` | stakeholder | Elicitation is in-chat and controller-driven — the MCP client drives the multi-turn loop, surfaces questions to the user, and returns answers; the daemon must not run an autonomous convergence loop. | [[c12]] |
| `k3` | convention | The elicitation loop mirrors the existing clarifying-question gate pattern over the MCP step loop rather than introducing a second, differently-shaped question mechanism. | [[c1]] |
| `k4` | convention | The stage lands as a peer runner beside the existing design runners, following their registration + schemas (+ standalone context) structure. | [[c3]] |
| `k5` | contract | Runner registration wires into the existing executor/storage/hash layer the peer runners already depend on; the new stage does not introduce a parallel execution or persistence path. | [[c4]] |
| `k6` | convention | The persisted artifact is a peer file in the artifacts module, alongside the existing per-type artifact files. | [[c5]] |
| `k7` | contract | Artifact persistence follows the established shape of existing artifact modules (typed record, hash-addressed storage, approval stamping) rather than a bespoke on-disk format. | [[c6]] |
| `k8` | contract | The MCP surface change is an additive phase/loop on the existing step tool — its request/response types and handler dispatch extend rather than fork, and the opaque `state` token contract between turns is preserved verbatim. | [[c7]] |
| `k9` | contract | The new phase dispatches through the existing handler and phases directory, reusing the existing state store rather than adding separate session storage. | [[c8]] |
| `k10` | invariant | Naming collision guard: the stage must remain distinct from the shared/chat-agent `brainstorm` concept whose runtime is an offlineRpc stub here — no accidental coupling to, or apparent implementation of, that stub. | [[c13]] |
| `k11` | invariant | The MCP layer never touches LMDB or LanceDB directly; all artifact reads/writes go through daemon IPC. | [[c15]] |
| `k12` | convention | The artifact passes the independent review step and requires explicit user approval before a downstream stage consumes it; approval is never auto-granted by the controller. | [[c16]] |
| `k13` | convention | Accuracy governs this stage: it sits on the critical design path, so it must not trade correctness of the elicited spec for fewer or cheaper model calls. | [[c17]] |

## Stories

### E20260801abd1ecf6:S001 — Run the brainstorm stage as a first-class workflow stage

**User value:** `size: M`

A user reaches the new spec-elicitation stage through the same workflow surface, driving mechanics, and approval discipline they already use for every other stage, so nothing new has to be learned and an in-flight brainstorm behaves like any other in-flight stage.

**Extends:** [[c3]] [[c5]] [[c7]] [[c14]]

**Acceptance criteria:**

- **ac1:** Given a user working through their MCP client who wants to shape a rough idea before design begins, when they invoke the brainstorm stage, then the stage is available as a peer of the existing stages and is driven turn-by-turn the same way they are, with the continuation reference passed between turns behaving exactly as it does for the other multi-turn stages. _(operationalizes `k4`, `k8`)_
- **ac2:** Given a brainstorm conversation that spans several turns, when the user takes the next turn, then the conversation's progress is carried forward by the same in-flight stage mechanics used by the other multi-turn stages, so the user sees one continuous conversation rather than a separately-tracked side session. _(operationalizes `k9`)_
- **ac3:** Given a brainstorm conversation that has produced an output, when that output is recorded and later approved, then it travels the same execution, persistence and approval path as the outputs of the existing stages, and appears wherever workflow artifacts are already listed. _(operationalizes `k5`, `k7`)_
- **ac4:** Given the separate chat-agent idea-capture concept that also carries the name brainstorm, when the user invokes this stage, then the two remain separately addressable, and invoking this stage neither triggers nor presents itself as an implementation of that concept. _(operationalizes `k10`)_
- **ac5:** Given a user whose request is small or trivial and is routed straight to a build or a standalone story, when they proceed with that route, then they are not required to pass through the brainstorm stage first, and the route they were given still works unchanged. _(operationalizes `k2`)_

**Local constraints:**

- `c31` (stakeholder) The stage is optional: requests small or trivial enough to be routed straight to build or a standalone story are never forced through elicitation. [[c20]]

### E20260801abd1ecf6:S002 — Start from a rough one-line idea and be asked what is missing

**User value:** `size: M`

A user who has only a vague sentence gets asked the questions that actually determine framing on the very first turn, instead of having their intent guessed at and only discovering the misunderstanding after a full artifact exists.

**Depends on:** `s1`

**Extends:** [[c1]] [[c2]]

**Acceptance criteria:**

- **ac1:** Given a user with a single rough sentence describing something they want built, when they start the brainstorm stage on that sentence, then the stage responds with clarifying questions surfaced to them in the chat conversation, and produces no spec on that first turn. _(operationalizes `k2`, `k3`)_
- **ac2:** Given a rough idea that leaves the scope boundary, the exclusions, and the success condition unstated, when the stage asks its first round of questions, then the questions target precisely those intent gaps that would change how the request is framed downstream, rather than restating the idea back to the user. _(operationalizes `k13`)_
- **ac3:** Given an idea that is recognisably a specification request, an architecture question, or a how-to-build request, when questioning begins, then the questions asked reflect that established categorisation of the request. _(operationalizes `k3`)_
- **ac4:** Given a user answering in the chat surface of their MCP client, when the stage needs information from them, then every question reaches them through that chat conversation and the stage waits for their answer, never converging on its own without them. _(operationalizes `k2`, `k3`)_

**Local constraints:**

- `c33` (convention) Questioning is shaped by the existing request-category vocabulary (a spec, an architecture question, or how-to-build guidance); the stage does not invent a competing taxonomy. [[c2]]

### E20260801abd1ecf6:S003 — Converge a vague idea into an agreed statement through in-chat iteration

**User value:** `size: L`

A user refines their idea in a back-and-forth conversation and can see the current understanding of their request on every turn, so a misreading costs one correction rather than a re-run of a whole design stage.

**Depends on:** `s2`

**Acceptance criteria:**

- **ac1:** Given clarifying questions the stage has just asked, when the user answers them in chat, then the answers are folded into the working statement of the request and the next turn asks only about gaps that are still unresolved, not about what has already been settled. _(operationalizes `k2`)_
- **ac2:** Given a working statement that has just absorbed the user's latest answers, when the stage takes its next turn, then the user is shown the current understanding of their request so they can correct a misreading on that turn. _(operationalizes `k13`, `k2`)_
- **ac3:** Given a conversation where no material gap in the request remains, when the stage reaches that point, then it presents the converged statement for the user's confirmation and does not treat the conversation as finished until the user confirms. _(operationalizes `k2`, `k12`)_
- **ac4:** Given a large, ambiguous, new-capability request, when elicitation runs, then the conversation keeps probing until intent is genuinely pinned down, and does not stop early to save turns or model calls. _(operationalizes `k13`)_
- **ac5:** Given a user who decides mid-conversation not to continue, when they abandon the brainstorm, then nothing is recorded as a converged statement of their request, and no downstream stage can pick up the half-elicited result. _(operationalizes `k12`)_

### E20260801abd1ecf6:S004 — See the options and tradeoffs, and have the chosen direction recorded

**User value:** `size: M`

When a request could reasonably be read or scoped several ways, the user is shown the choices and their tradeoffs and picks one — and the choice, the alternatives ruled out, and the reason survive into the record instead of staying in their head.

**Depends on:** `s3`

**Acceptance criteria:**

- **ac1:** Given a point in the conversation where more than one plausible scope or approach is open, when the stage reaches that fork, then it presents the options with their tradeoffs and asks the user to choose, rather than silently picking one and moving on. _(operationalizes `k2`, `k13`)_
- **ac2:** Given a user who has chosen among presented options, when the conversation continues, then the chosen direction, the alternatives that were ruled out, and the reason for the choice are all carried into the converged statement of the request. _(operationalizes `k13`)_
- **ac3:** Given a direction the user explicitly ruled out during the conversation, when the converged statement is presented, then that exclusion appears as an explicit non-goal rather than being dropped as conversational noise. _(operationalizes `k13`)_
- **ac4:** Given a question the user could not answer and chose to leave open, when the converged statement is presented, then the unresolved item is recorded as open rather than being silently resolved by assumption. _(operationalizes `k13`, `k2`)_

**Local constraints:**

- `c32` (stakeholder) The reasoning that narrowed a vague idea — the directions ruled out, the tradeoffs weighed, and the option chosen — must be captured, not just the final wording. [[c22]]

### E20260801abd1ecf6:S005 — Resume an interrupted elicitation conversation without losing answers

**User value:** `size: S`

A user whose brainstorm is interrupted picks it back up where they left off, so a long framing conversation is not something they have to finish in one sitting or re-answer from scratch.

**Depends on:** `s2`

**Acceptance criteria:**

- **ac1:** Given a brainstorm conversation left part-way through, when the user resumes it using the continuation reference the stage returned on its previous turn, then the answers they already gave are preserved and questioning continues from where it stopped. _(operationalizes `k8`, `k9`)_
- **ac2:** Given a continuation reference that is unknown or no longer valid, when the user tries to resume with it, then the stage says so plainly instead of quietly starting a fresh conversation and discarding the earlier answers. _(operationalizes `k8`)_
- **ac3:** Given a conversation that was interrupted and resumed, when it converges, then the resulting statement of the request is indistinguishable from one converged without interruption. _(operationalizes `k9`)_

### E20260801abd1ecf6:S006 — Keep the converged spec as a durable, inspectable artifact

**User value:** `size: M`

The intent the user converged on becomes a lasting, readable record that they and anyone else can inspect later — one single statement of the request rather than something that evaporates with the chat session.

**Depends on:** `s3`, `s4`

**Extends:** [[c5]] [[c7]]

**Acceptance criteria:**

- **ac1:** Given a converged statement the user has confirmed, when it is recorded, then it is kept durably under a stable identifier, and reading it back later returns the same content. _(operationalizes `k6`, `k7`)_
- **ac2:** Given a recorded spec, when a user inspects it, then it reads as a structured statement of the request — intent, scope boundary, non-goals, decisions with their ruled-out alternatives, and any open items — not as a transcript of the conversation. _(operationalizes `k1`)_
- **ac3:** Given a recorded spec, when the user looks for it among their workflow artifacts, then it is found through the same listing and lookup surfaces as the other workflow artifacts, with no separate place to go looking. _(operationalizes `k6`, `k7`, `k11`)_
- **ac4:** Given one converged spec and two possible downstream entries, when either entry reads it, then the same single artifact serves both, and no consumer-specific variant of the spec is produced. _(operationalizes `k1`)_

### E20260801abd1ecf6:S007 — Review and explicitly approve a spec before anything consumes it

**User value:** `size: S`

A spec gets a second set of eyes and the user's explicit go-ahead before design work is built on top of it, so a misframed spec is caught at the cheapest point rather than propagated into an Epic or an LLD.

**Depends on:** `s6`

**Extends:** [[c16]]

**Acceptance criteria:**

- **ac1:** Given a recorded spec, when the independent review is run on it, then findings are returned for the user to resolve before approval is sought. _(operationalizes `k12`)_
- **ac2:** Given a spec the review has blocked, when approval is attempted without an explicit override from the user, then approval is refused and the blocking reason is relayed to the user. _(operationalizes `k12`)_
- **ac3:** Given a converged spec at the end of the conversation, when the stage finishes, then approval is never granted automatically — the user is asked, and only their explicit go-ahead approves it. _(operationalizes `k12`, `k2`)_
- **ac4:** Given a spec that has not been approved, when a downstream stage is pointed at it, then it is not consumed as an approved seed and the user is told the approval is still outstanding. _(operationalizes `k12`, `k1`)_

### E20260801abd1ecf6:S008 — Seed a full Epic from an approved spec

**User value:** `size: M`

A user who framed their idea in the brainstorm stage sees the Epic built on that framing — the scope, exclusions and decisions they already settled are carried in rather than re-derived from a sentence or re-asked.

**Depends on:** `s7`

**Acceptance criteria:**

- **ac1:** Given an approved spec, when the user starts the framing stage with that spec as its focus, then framing proceeds from the spec's intent, scope boundary, non-goals and recorded decisions instead of inferring them from a one-line description. _(operationalizes `k1`)_
- **ac2:** Given a spec that already records a decision or an exclusion, when framing runs from it, then the user is not asked for that decision again and the resulting framing does not contradict it. _(operationalizes `k1`, `k13`)_
- **ac3:** Given an Epic that was framed from a spec, when a user inspects the Epic, then the spec it was seeded from is identifiable from the Epic itself. _(operationalizes `k1`, `k7`)_
- **ac4:** Given a user who supplies a plain focus string and no spec, when they start the framing stage, then it behaves exactly as it does today. _(operationalizes `k1`)_

**Local constraints:**

- `c30` (contract) The spec is an additional input to the framing stage; the stage's own behaviour and outputs when given a plain focus string are unchanged. [[c21]]

### E20260801abd1ecf6:S009 — Seed a standalone feature design from the same approved spec

**User value:** `size: M`

A user taking the single-feature route gets a design grounded in the same agreed statement of intent as the Epic route, so the same idea is not interpreted two different ways depending on which entry they picked.

**Depends on:** `s7`

**Acceptance criteria:**

- **ac1:** Given an approved spec describing a single feature, when the user starts the standalone feature design with that spec as its focus, then the design proceeds from the spec's recorded intent, scope boundary and decisions rather than from a raw one-liner. _(operationalizes `k1`)_
- **ac2:** Given one approved spec read by the Epic-framing entry on one occasion and by the standalone feature-design entry on another, when each reads it, then both work from the same statement of intent and neither requires a differently-shaped spec to do so. _(operationalizes `k1`)_
- **ac3:** Given a spec whose agreed scope is plainly larger than a single feature, when the user starts a standalone feature design from it, then the mismatch is surfaced to the user rather than the scope being quietly narrowed to fit. _(operationalizes `k13`, `k1`)_
- **ac4:** Given a user who supplies a plain focus string and no spec, when they start a standalone feature design, then it behaves exactly as it does today. _(operationalizes `k1`)_

**Local constraints:**

- `c34` (contract) The spec is an additional input to the standalone feature-design stage; its behaviour and outputs when given a plain focus string are unchanged. [[c21]]

## Citations

- **[[c1]]** `code` `src/mcp/workflow-step/questions-gate.ts` — "usage.example for subject "questions-gate" returned totalCallers: 0 — no indexed call sites found for the elicitation primitive."
- **[[c2]]** `code` `src/shared/brainstorm-classes.ts:19-21` — "BrainstormCategoryClass (interface) — src/shared/brainstorm-classes.ts:19-21"
- **[[c3]]** `code` `src/workflow/runners/design-story/index.ts` — "module.profile: kind file, entityCount 6, totalBytes 20898, exports registerDesignStoryRunners; import.graph totalInDegree 0, totalOutDegree 4 (workflow/executor.ts, workflow/hash.ts, schemas.ts, work"
- **[[c4]]** `code` `src/workflow/runners/design-epic/index.ts` — "index.ts (registerDesignEpicRunners), schemas.ts"
- **[[c5]]** `code` `src/workflow/artifacts/define.ts` — "src/workflow/artifacts/ (dir, entityCount 109, totalBytes 87488) — define.ts (10222 bytes)"
- **[[c6]]** `code` `src/workflow/artifacts/plan.ts` — "plan.ts (typescript, file, 13635 bytes)"
- **[[c7]]** `code` `src/mcp/workflow-step/types.ts` — "src/mcp/workflow-step/ (dir, entityCount 108, totalBytes 180047) — types.ts (6398 bytes)"
- **[[c8]]** `code` `src/mcp/workflow-step/handler.ts` — "handler.ts (typescript, file, 2984 bytes)"
- **[[c9]]** `prior-artifact` `epic-catalog 1cd9a4c34f403a80 add-plan-workflow-insrc-framework-4th` — "there is no stage that turns an approved Story design into a persistent, reviewable breakdown — downstream of design, not upstream of define; no story overlap with spec elicitation."
- **[[c10]]** `prior-artifact` `epic-catalog 185807ba9a6b35d3 add-build-workflow-insrc-5th-stage` — "Once a Story's plan is approved, the chain stops — the 5th/terminal stage; the ask concerns the chain's entry point, not its tail."
- **[[c11]]** `stakeholder` `scoping decision with user — spec consumers` — "Spec consumers: BOTH `define` and standalone `design.story` — the spec artifact is a cross-cutting contract read by multiple downstream stages."
- **[[c12]]** `stakeholder` `scoping decision with user — interaction model` — "IN-CHAT, CONTROLLER-DRIVEN — the MCP client (Claude Code / Codex) drives the multi-turn elicitation loop, surfacing clarifying questions to the user and collecting answers in chat, converging the spec"
- **[[c13]]** `analyze-bundle` `capability-discovery — interactive spec elicitation upstream of define` — "No existing workflow STAGE delivers this — the chain today enters at define with whatever raw focus string the caller supplies... a `brainstorm` concept exists in the shared/chat-agent layer, but its "
- **[[c14]]** `analyze-bundle` `module-tree — src/workflow/artifacts/ and src/mcp/workflow-step/` — "src/mcp/workflow-step/ ... already carries the machinery a controller-driven loop needs: handler.ts, types.ts, state.ts, state-store.ts, questions-gate.ts, a phases/ subdirectory, and a __tests__/ sub"
- **[[c15]]** `convention` `CLAUDE.md — Key architectural rules` — "Daemon owns all DB access — CLI, MCP, and the IDE workbench communicate via IPC only."
- **[[c16]]** `convention` `CLAUDE.md — Building features via insrc: classify FIRST, review before approve` — "`insrc_review_step` before approve — the independent "two sets of eyes" review... Do NOT auto-approve... only on the user's explicit in-chat yes call `insrc_workflow_approve`."
- **[[c17]]** `convention` `CLAUDE.md — Project principles` — "Accuracy is primary; cost is the least priority... accuracy governs the **critical** roles (design, review, build, validate)."
- **[[c20]]** `step-output` `s2 Epic — nonGoals` — "Making the new stage mandatory for every request that enters the chain. ... Small and trivial asks are routed straight to build or a standalone story precisely because they need no framing; forcing el"
- **[[c21]]** `step-output` `s2 Epic — nonGoals` — "Changing the internal schemas, prompts, or output artifacts of `define`, `design.epic`, `design.story`, `plan`, or `build`. ... the Epic adds an input to them."
- **[[c22]]** `step-output` `s2 Epic — problem` — "the real scope boundary, the directions the user has already ruled out, the tradeoffs they weighed and the option they picked, the constraints they know about but did not write down — stays in the use"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — define (define)

**0 HIGH · 0 MED · 12 LOW** · model `client` · reviewed 2026-08-01T11:58:23.295Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| c1/k3 | citation | LOW | manual | src/mcp/workflow-step/questions-gate.ts exists and implements the clarifying-question gate the Epic reuses as the elicitation primitive. | src/mcp/workflow-step/questions-gate.ts:1 found=True — the clarifying-question gate the Epic reuses as the elicitation primitive exists. | none |
| c2/k... vocab | citation | LOW | manual | src/shared/brainstorm-classes.ts defines the reusable BrainstormCategoryClass interface / BrainstormCategory vocabulary (spec / architecture / how-to-build). | src/shared/brainstorm-classes.ts:19 `export interface BrainstormCategoryClass extends ClassChoice` (exact), BrainstormCategory type at :12, BRAINSTORM_CATEGORY_CLASSES at :23 — reusable vocabulary grounded. | none |
| c3/k4 | citation | LOW | manual | src/workflow/runners/design-story/index.ts exports registerDesignStoryRunners and has a sibling schemas.ts (the per-stage runner template the new stage follows). | registerDesignStoryRunners resolves; src/workflow/runners/design-story/index.ts:1 found=True and schemas.ts confirmed present — the per-stage runner template is real. | none |
| c4/k4 | citation | LOW | manual | src/workflow/runners/design-epic/index.ts exports registerDesignEpicRunners with a sibling schemas.ts (the second peer runner confirming the template). | registerDesignEpicRunners resolves; src/workflow/runners/design-epic/index.ts:1 found=True and schemas.ts confirmed — second peer runner confirms the template. | none |
| c5/k6 | citation | LOW | manual | src/workflow/artifacts/define.ts exists — the artifacts module holds one file per artifact type, so a new spec artifact is a peer file there. | src/workflow/artifacts/define.ts:1 found=True — per-type artifact-file convention holds; a spec artifact is a peer file. | none |
| c6/k7 | citation | LOW | manual | src/workflow/artifacts/plan.ts exists as a second peer artifact file confirming the per-type artifact-file convention. | src/workflow/artifacts/plan.ts:1 found=True — second peer artifact confirms the convention. | none |
| c7/k8 | citation | LOW | manual | src/mcp/workflow-step/types.ts exists — the MCP step surface types the new additive phase extends. | src/mcp/workflow-step/types.ts:1 found=True — the MCP step surface types the additive phase extends. | none |
| c8/k9 | citation | LOW | manual | src/mcp/workflow-step/handler.ts exists — the handler dispatch the new phase routes through. | src/mcp/workflow-step/handler.ts:1 found=True — the handler dispatch the new phase routes through. | none |
| c14/k9 | inventory | LOW | manual | src/mcp/workflow-step carries the multi-turn loop machinery a controller-driven stage needs: state.ts, state-store.ts, and a phases/ directory (state persistence + phase dispatch reused, not re-invented). | Confirmed present in src/: state.ts, state-store.ts, and phases/ (start.ts, step.ts, synthesize.ts, plan.ts, resolve-question.ts, review-deferred.ts) — the multi-turn loop machinery is reused, not re-invented (k9 grounded). | none |
| k10 | semantic | LOW | manual | The chat-agent brainstorm runtime is an offlineRpc stub in this backend: brainstorm.addIdea is wired via offlineRpc in src/daemon/index.ts — the naming-collision guard (k10) is grounded, not invented. | src/daemon/index.ts:1354 `'brainstorm.addIdea': offlineRpc('brainstorm.addIdea')` (and comment at :1347) — the chat-agent brainstorm runtime is genuinely an offlineRpc stub here; the k10 naming-collision guard is grounded, not invented. | none |
| cl-stories | inventory | LOW | manual | The Epic enumerates exactly 9 stories, S001 through S009. | grep E20260801abd1ecf6:S00[1-9] → exactly 9 hits (S001–S009); story inventory matches. | none |
| cl-order | ordering | LOW | manual | The story dependency DAG is acyclic and every dependency precedes its dependent: s1(—); s2→s1; s3→s2; s4→s3; s5→s2; s6→s3,s4; s7→s6; s8→s7; s9→s7. | DAG per artifact: s1(—); s2→s1; s3→s2; s4→s3; s5→s2; s6→s3,s4; s7→s6; s8→s7; s9→s7. Acyclic; every dependency precedes its dependent; elicitation (s1–s5) precedes persistence (s6) precedes approval (s7) precedes consumption (s8,s9). Internally consistent. | none |
