# Meta workflow framework

Plan doc. Status: **design proposal**. Target: a general framework
under `src/insrc/workflow/` that hosts five workflow instances —
`define` / `design` / `plan` / `build` / `test` — modelled after the
analyze framework's separation of intent → decomposer → executor →
synthesizer, but adapted for generative, stateful, file-backed work.

The individual workflow designs will be written after this document
lands. This doc establishes the shared primitives, storage contracts,
and interaction rules so each workflow instance is a small
specialisation rather than a from-scratch rebuild.

## 1. Motivation

The analyze framework changed how the assistant answers code-context
questions — bundles are cited to real graph outputs, plans are
typed, the multi-turn split keeps the outer LLM in the reasoning loop.
Everything that used to be "grep + read + guess" is now
"decomposer → executor → synthesizer → bundle" with a schema at
every boundary.

The next class of work the assistant does — turning a vague ask into
a spec, then a design, then a task plan, then code, then a
demonstrated feature — is structurally different:

- **Generative**, not read-only. Each stage *produces* an artifact.
- **Stateful**. A plan has open/done tasks. A build has commits + a
  diff. A test has a run log.
- **Persistent**. Artifacts are files the user reviews (`docs/`,
  `plans/`, code changes, run traces). They outlive the session.
- **Composed**. Design consumes define output; plan consumes design;
  build consumes plan; test consumes build. Failure signals travel
  backward — a failing test can force re-plan or re-design.
- **Human-gated**. Between every stage the user reads, edits, or
  redirects. The LLM never decides to jump stages on its own.

But the *skeleton* is the same as analyze: classify intent, emit a
typed step plan, run typed steps with deterministic runners where
possible and outer-LLM pauses where reasoning is needed, synthesize
an artifact whose every claim cites its inputs. If we build that
skeleton once as `workflow/`, each of the five becomes a small
specialisation (recipe library, step-runner registry, artifact
shape) rather than a bespoke pipeline.

## 2. Overview

Five workflows, each an instance of the same framework. Artifacts
follow a shared **Epic / Story / Task** hierarchy that maps 1:1 to
the standard software-engineering ladder every issue tracker
already understands.

| Workflow | Input | Produces | Storage | Primary consumer |
| :--- | :--- | :--- | :--- | :--- |
| `define` | Raw user ask + repo context | **1 Epic + N Stories** under it (problem framing at epic level, valuable slices at story level) | `docs/defines/<epic-slug>.md` | `design` |
| `design` | **ONE Story** from an approved Epic | Design doc: shape, alternatives, decisions, contracts, rollout | `docs/designs/<epic-slug>/<story-id>.md` | `plan` |
| `plan` | **ONE Design** | **N Tasks** for that Story, ordered + sized + dependency-labelled | `plans/<epic-slug>/<story-id>.md` | `build` |
| `build` | **ONE Task** | Code change (branch + commits + PR) + inline verification | git tree + PR | `test` |
| `test` | Built PR + Story's acceptance criteria | Verification bundle: exercised flows, observed behaviour, gaps | `docs/test-runs/<epic-slug>/<story-id>-<runId>.md` | Human review; may loop back |

Naming: `define` for "what problem are we solving and what
valuable slices does it break into", not for "define these names".
It's the shortest available synonym for *problem-framing + story
composition*.

The Epic / Story shape maps cleanly onto GitHub Issues (see §7.4
for the label + task-list conventions we use to impose the
hierarchy artificially). GitHub is the only tracker integrated
for now.

## 3. Shared primitives

Everything below is common infrastructure. Each workflow specialises
by registering its own recipes, step runners, and synthesizer prompt.

### 3.1 Intent

Same shape as analyze's `ClassifiedIntent`, extended with a workflow
selector:

```typescript
interface WorkflowIntent {
    workflow:   'define' | 'design' | 'plan' | 'build' | 'test';
    focus:      string;                    // one-line user framing
    context:    WorkflowContext;           // repo, prior artifact refs
    scope:      'XS' | 'S' | 'M' | 'L' | 'XL';
    reasoning:  string;                    // why this workflow, why this focus
    priorArtifacts?: PriorArtifactRef[];   // e.g. design.mdid a plan is being built from
}
```

A single classifier decides which of the five to enter. Same
`resolveIntent` funnel that already handles analyze — new answer
types added to its enum. **HARD RULE**: no per-workflow classifier
prompts. One funnel, many downstream branches. See
[[intent-classification-consolidation]] in memory.

### 3.2 Step plan (analog of `ExplorationPlan`)

Every workflow emits a typed step plan from its decomposer:

```typescript
interface WorkflowPlan<S extends WorkflowStep> {
    workflow:      'define' | 'design' | 'plan' | 'build' | 'test';
    outputSchema:  string;              // ref to the artifact schema id
    synthesisHint: string;              // 1-2 sentences for the synthesizer
    steps:         S[];                 // ordered; dependencies via `dependsOn`
}

interface WorkflowStep {
    id:         string;                 // `s1`, `s2`, ...
    type:       string;                 // step-type, drawn from the workflow's catalog
    purpose:    string;
    params:     Record<string, unknown>;
    dependsOn?: string[];
}
```

Steps are typed. Each workflow registers its own step catalog with
per-type parameter + output schemas. Placeholder substitution
(`$s1.<accessor>`) works exactly the way analyze's does — resolves
before dispatch.

### 3.3 Step runner registry (analog of `RUNNERS`)

```typescript
type StepRunner = (
    step: WorkflowStep,
    ctx:  StepRunnerContext,
) => Promise<StepOutput>;

interface StepRunnerContext {
    runId:              string;
    workflow:           WorkflowIntent['workflow'];
    repoPath:           string;
    priorSteps:         ReadonlyMap<string, StepOutput>;
    readAnalyzeBundle?: (focus: string, opts?: AnalyzeOpts) => Promise<AnalyzeContextBundle>;
    readArtifact?:      (ref: PriorArtifactRef) => Promise<string>;
    ignoreFilter:       RepoIgnoreFilter;
}
```

Every workflow's runner registry is populated by a `registerRunners`
call at boot, matching how `registerBuiltinTools()` works. Test
harnesses can register mocks.

Deterministic runners cover: analyze bundle fetches, doc excerpt
retrieval, git operations, tsc invocations, `daemon repo` calls,
file writes, symbol edits. LLM-shaped runners follow the same
prepare/finalize split analyze uses for narrow-LLM steps — the
outer client's model does the reasoning turn between the two halves.

### 3.4 Executor + multi-turn pause/resume

Reuse the exact executor pattern analyze got in Phase B — one
sequential loop over steps in dependency order:

- Deterministic step → runner produces `StepOutput` inline.
- LLM-shaped step → runner's `prepare` returns
  `{prompt, userTurn, schema, preparedBlob}`; executor pauses and
  hands the payload back to the multi-turn phase handler; on
  `phase='step'` resume, `finalize(preparedBlob, rawLlmOutput)`
  produces the typed output.

The state token → server-side store contract from
[[mcp-state-tokens-not-blobs]] applies here too. Never round-trip
step-outputs through the outer LLM as opaque payloads.

### 3.5 Artifact synthesizer

Each workflow ships its own synthesizer prompt + JSON schema. The
prompt reads the executed steps, respects the same **HARD RULES**
analyze uses — no claim without a step output, no path outside the
step outputs, preserve verbatim citations — and emits a typed
artifact.

Artifact shapes differ per workflow but each has:

- `system` — one-line framing.
- `focus` — restated intent, scope, and prior-artifact references.
- `summary` — 1-3 paragraph precis.
- `body` — sections whose shape is workflow-specific (see §5).
- `citations` — flat list of `{kind, ref, quotedText?}` — every
  claim in `body` points to an entry here.
- `openQuestions` — list of anything the run couldn't resolve; the
  human answers before the artifact is approved.
- `handoff` — the artifact ref + summary each subsequent workflow
  needs. E.g. a `design` artifact's handoff is what `plan` reads.
- `meta` — workflow, runId, model, toolCalls, elapsedMs,
  repoLastIndexedAt, schemaVersion.

Rendered as markdown for human review. The JSON blob is the
canonical form and stays alongside the markdown so downstream
workflows read structured input.

### 3.6 Persistence

Analyze bundles were ephemeral. Workflow artifacts must survive
sessions:

- **Markdown + JSON pair.** `docs/designs/foo.md` and
  `docs/designs/foo.json`. The `.md` is what humans open; the
  `.json` is what the next workflow parses.
- **Named by slug**, not by run ID. Slug is derived from the intent
  focus at define time and inherited down the chain. Multiple runs
  update in place unless the user forks a name.
- **Run history** stored under `~/.insrc/workflow-runs/<slug>/`:
  every step's input, output, and prompt. Debug + replay.
- **Cache** by (workflow, focus, prior-artifact hashes) so re-runs
  hit deterministic step results instantly.

The exploration cache from analyze already has the shape. Extend to
workflow-runs.

### 3.7 Gates

Between stages, the framework enforces a **gate contract**. Before
`plan` reads a `design` artifact, the gate checks:

- The `design` artifact exists on disk.
- Its `openQuestions` is empty (user resolved them).
- Its meta is stamped with `approvedAt` (user signed off — a CLI
  command or an IDE action sets this).

Same at every transition. The framework refuses to start `build`
against an un-approved `plan`. Users can force through with a
`--force-ungated` flag; the artifact records the override in its
meta.

### 3.8 Back-flow (loops backward)

Real workflows aren't linear. Two failure paths matter:

- **Build fails to satisfy a task** → the build workflow doesn't
  silently give up. It emits a **back-flow signal**: an artifact
  ref, the failing constraint (test error, missed acceptance
  check), and a suggested target (re-plan the task, re-design the
  contract). The user routes: accept + retry build, kick to plan,
  kick to design.
- **Test surfaces an unmet requirement** → same shape. Test's
  verification bundle marks each acceptance check as
  `met | unmet | ambiguous`. Any `unmet` triggers a back-flow
  signal.

Back-flow is a first-class primitive. It's never "the model decides
to loop"; it's "the workflow emits a signal and the human decides
how far to unwind."

### 3.9 Analyzer as a step type

Every workflow can invoke the analyze framework as a step. That's
what makes the whole thing citation-grounded — a `design` step
that asks "does the codebase already handle this?" fires
`insrc_analyze_step` with a capability-discovery focus, gets a real
bundle, and the design's synthesizer cites it.

The step catalog for each workflow includes an `analyze.query` step
that wraps a scoped analyze call. Cheap, deterministic, cached.

### 3.10 Two workflow patterns: fine-grained recipes vs. coarse
handoff

Analyze uses one pattern — many small typed exploration steps.
Workflows can pick from two:

- **Fine-grained recipes** (like analyze). Many small typed steps,
  some deterministic and some LLM-shaped, each with its own
  parameter and output schema. Good when the workflow is
  DECOMPOSABLE into small verifiable pieces — enumerate assumptions,
  score alternatives, list tasks. `define`, `design`, `plan`, `test`
  fit here.

- **Coarse handoff**. Three steps only: `context.assemble`,
  `execute`, `checklist.verify`. `context.assemble` is deterministic
  — gathers all prior artifacts, all relevant analyze bundles, all
  citations, into a single brief. `execute` is one big LLM step —
  the outer client's model does the whole task using its own tool
  surface (Read / Edit / Bash / MCP tools / whatever), no framework
  orchestration during the turn. `checklist.verify` is a final LLM
  step forced by the framework — hand the model a checklist derived
  from the prior artifacts' acceptance criteria + contracts, get
  back `{passed | missed | partial}` per item plus evidence
  citations. Good when the LLM is ALREADY perfectly capable of the
  work end-to-end (writing code, running builds, iterating on
  errors) and the framework's job is to SET UP THE BRIEF, HAND OFF,
  THEN AUDIT. `build` fits here.

Both patterns share the same runtime skeleton (executor, storage,
gates, back-flow). They differ only in how many typed steps they
register + how much of the reasoning happens inside the LLM's own
tool loop vs. between typed framework steps.

The choice is per-workflow, not per-run. `build` is coarse; the
rest are fine-grained.

## 4. Analogy table

Every column is a 1:1 correspondence with an analyze concept the
reader already knows.

| Analyze concept | Workflow analog | Notes |
| :--- | :--- | :--- |
| `ClassifiedIntent` | `WorkflowIntent` | Same funnel through `resolveIntent`. |
| `ExplorationPlan` | `WorkflowPlan<Step>` | Typed steps, dependency edges. |
| `ExplorationRunner` | `StepRunner` | Same prepare/finalize split for LLM steps. |
| `RUNNERS` registry | Per-workflow runner registry | Populated at boot; testable. |
| `executePlan` | `executeWorkflow` | Sequential + placeholder substitution. |
| `stepPlan` (Phase B) | Same, per workflow | Multi-turn pause on LLM steps. |
| `AnalyzeContextBundle` | Per-workflow artifact schema | Different sections per workflow. |
| 7-layer bundle | Per-workflow section catalog | Design has "alternatives"; plan has "task list"; build has "diff summary"; etc. |
| Citation grounding | Same HARD RULE | Every claim points at a step output. |
| Exploration cache | Workflow-run cache | Extended keying (adds artifact hashes). |
| Recipe library | Per-workflow recipe library | Codified sequences for common intents. |

## 5. Per-workflow shape summary

Full designs come later. Sketching each so the meta framework's
generality is visible.

### define

- **Produces.** 1 **Epic** + N **Stories** under it.
- **Two flavors** (§4 of `workflow-define.md`):
  - `enhancement` — user is extending an existing capability. s1
    fires analyze bundles that map the current capability,
    schema, and API surface so the Epic's constraints preserve
    what already works.
  - `new-capability` — nothing comparable exists. s1 fires analyze
    bundles that describe the project's tech stack, conventions,
    and adjacent capabilities so the Epic aligns with the
    established shape.
- **Inputs.** User's raw ask; recent context (open files, current
  branch, recent commits).
- **Steps.**
  - `context.assemble` — deterministic (but heavily analyze-driven).
    Detects flavor and fires the appropriate analyze bundles.
  - `epic.frame` — LLM. Composes the Epic-level frame (problem,
    non-goals, assumptions, constraints).
  - `stories.compose` — LLM. Enumerates N valuable Stories under
    the Epic, each with its own acceptance criteria + local
    constraints.
  - `checklist.verify` — LLM, forced. Audits both Epic and Stories
    against the checklist in `workflow-define.md` §10.
- **Artifact.** `docs/defines/<epic-slug>.md` + `.json`. See
  `workflow-define.md` §7 for the full schema.
- **Handoff to design.** Whole Epic + list of approved Stories.
  Design consumes ONE Story at a time (see below).

### design (two tiers: HLD + LLD)

`design` splits into two modes matching the industry-standard
HLD / LLD (or *system design* / *component design*) split. Both
modes are the same fine-grained recipe pattern at different
altitudes; both use the same synthesizer scaffolding.

- **`design.epic` (HLD)** — one HLD per Epic. Framework choice,
  shared contracts, cross-Story concerns, non-functional
  properties, Story boundaries. Runs FIRST, before any LLD.
- **`design.story` (LLD)** — one LLD per Story. Detailed API,
  data model, error paths, test strategy for that Story
  operating WITHIN the framework the HLD established.

The gate contract enforces order: LLD requires an approved HLD +
approved Epic; HLD requires an approved Epic. Once HLD is
approved, LLDs for independent Stories can run in parallel.

- **Produces.**
  - HLD: `docs/designs/<epic-slug>/_hld.md` + `.json`.
  - LLD: `docs/designs/<epic-slug>/<story-id>.md` + `.json`.
- **Inputs.**
  - HLD: the whole Epic (all Stories, all constraints).
  - LLD: one Story + the approved HLD + the Epic.
- **Steps.** See `workflow-design.md` for the full recipe. Both
  modes share the alternatives → judge → detail pattern.
- **Handoff to plan.**
  - Plan reads BOTH the HLD (for cross-cutting choices — libraries,
    patterns, shared infra) AND the specific Story's LLD (for
    what to task-ify). Task-level ordering respects the Story
    dependency graph from define.
- **Concurrent stories.** Multiple LLDs run in parallel once HLD
  is approved. The gate is per-Story.
- **Back-flow vs amendment.** LLD (and downstream `plan` / `build`
  / `test`) can discover HLD needs a change. Small localised
  changes → emit an **amendment proposal** (§7.5). Fundamental
  changes → back-flow signal targeting HLD (full re-run). The
  amendment-vs-back-flow heuristic is documented in
  [`workflow-design.md`](workflow-design.md) §11.5.

### plan

- **Produces.** N **Tasks** for a single Story.
- **Inputs.** The Story's `design` artifact.
- **Steps (illustrative).**
  - `tasks.enumerate` — LLM. Emits ordered Tasks with sizes
    (S/M/L), dependencies, and acceptance checks per Task.
  - `tasks.critique` — LLM. Judges the enumeration: missing Tasks,
    misordered dependencies, over-sized Tasks.
  - `tasks.finalize` — LLM. Applies critique fixes.
  - `test-strategy.write` — LLM. Names the tests the Tasks should
    produce (unit / integration / live / smoke).
  - `checklist.verify` — LLM, forced.
- **Artifact.** `plans/<epic-slug>/<story-id>.md` + `.json`. Also
  the natural place for existing hand-authored `plans/*.md`
  documents to migrate to over time.
- **Handoff to build.** Task list. `build` operates on ONE Task at
  a time.

### build

Coarse handoff pattern (§3.10). The LLM is already excellent at
writing code, running builds, and iterating on errors. The
framework's contribution is **not** to sequence those steps — it's
to assemble the brief perfectly and audit the outcome against a
checklist. Three steps total:

- **Produces.** Code change (branch + commits + PR) for one Task.
- **Inputs.** One **Task** from a Story's `plan` artifact.
- **Steps.**
  - `context.assemble` — deterministic. Reads the task's line from
    the `plan` artifact, the referenced sections of the `design`
    artifact (contracts, rollout, decisions), and re-runs the
    analyze bundles the design cites (or reads them from cache).
    Emits a single brief: what to build, why, what to preserve,
    what conventions the existing module uses, what the test
    strategy names, exact acceptance checks. Everything with
    citations to prior artifacts.
  - `execute` — LLM step. Hand the brief + the task-scoped tool
    allowlist to the outer client. **No further framework
    orchestration during the turn.** The LLM does its own
    Read / Edit / Bash / verify-tsc / verify-tests loop. When it
    declares done, it emits a compact `{filesChanged, commits,
    testCommandsRun, notes}` summary.
  - `checklist.verify` — LLM step, forced. The framework builds a
    checklist from the task's acceptance checks + the design's
    contracts + the plan's test-strategy names. Hands it to the
    LLM alongside the diff and `git log` for the branch. Requires
    the LLM to answer each item with `passed | missed | partial`
    plus an evidence citation (file:line for code changes; test
    output for verification). Failures don't retry inline — they
    become open questions in the artifact and, on any `missed`, a
    back-flow signal.
- **Artifact sections.** `taskRef`, `brief`, `diffSummary`,
  `filesChanged`, `commits`, `checklistResults`, `openQuestions`.
- **Handoff to test.** Branch name + commit range +
  `checklistResults`. `test` reads the checklist as the acceptance
  criteria to exercise through the product surface.

Why this shape works:

- The LLM's own tool loop is a first-class primitive — Claude Code
  and Codex already do the iteration well. Sequencing every edit
  through a framework step wastes turns and duplicates capability.
- The framework earns its keep at the two ends: the brief (which
  decides whether the LLM has enough context to do the task well)
  and the checklist (which forces the LLM to self-audit against
  the design + plan rather than declare victory on the diff alone).
- The `context.assemble` step is where prior work compounds. A
  well-shaped `design` + `plan` mean the brief is dense and
  unambiguous, and the checklist is a direct read of the plan's
  acceptance criteria.

### test

- **Produces.** Verification bundle for one Story (a Story is
  "done" when all of its acceptance criteria are `met`).
- **Inputs.** `build` artifacts for every Task under the Story +
  the Story's acceptance criteria (from the original `define`
  Epic).
- **Steps (illustrative).**
  - `flows.enumerate` — LLM step. From the acceptance criteria,
    enumerate the flows to exercise.
  - `flow.exercise` — deterministic per flow. Drives the actual
    product: HTTP call, CLI invocation, IDE integration test, live
    daemon call.
  - `flow.observe` — deterministic. Captures the observed
    behaviour: status codes, file diffs, logs, screenshots.
  - `acceptance.check` — LLM step. Compares observed vs expected;
    marks each criterion `met | unmet | ambiguous`.
- **Artifact sections.** `flowsExercised`, `observations`,
  `acceptanceResults`, `openQuestions`.
- **Handoff to human.** Verification bundle. On `unmet` /
  `ambiguous`, emit a back-flow signal.

## 6. What each workflow is NOT

Each workflow has a firm scope-boundary rule (matches the analyze
framework's scope-boundary HARD RULE from memory).

- `define` never designs. It emits problem + criteria, not shapes.
- `design` never plans. It emits shape + rationale, not tasks.
- `plan` never builds. It emits tasks + dependencies, not code.
- `build` never tests through the product surface. It compiles +
  runs the test suite the task names. Behavioural verification is
  `test`'s job.
- `test` never edits code. If it observes a failure, it emits a
  back-flow signal; it does not attempt to fix.

The scope-boundary is enforced in the synthesizer prompt (as
analyze does) AND in a boundary-check step that runs before
artifact emission and rejects out-of-scope content.

## 7. Interaction rules

### 7.1 Composition

Composition is always forward + explicit. `plan` reads `design`; it
does not read `define` (that's `design`'s job to surface). Every
prior-artifact ref is stored in the current artifact's meta so the
chain is auditable.

### 7.2 Approval + gates

Between every workflow the human runs:

- `insrc workflow approve <artifact-path>` — sets `approvedAt` in
  the artifact meta, closes `openQuestions`. Optional inline notes.
- `insrc workflow reject <artifact-path> --to <workflow>` — emits a
  back-flow signal targeting an earlier workflow.
- `insrc workflow status` — shows the current chain, per-artifact
  approval state, back-flow signals in flight.

The MCP client (Claude Code / Codex) exposes these as tool calls
via a new `insrc_workflow` MCP tool.

### 7.3 Analyzer integration

Every workflow's step catalog includes `analyze.query`. This is the
one place the analyze framework's read-only bundle contract meets
the workflow's write-side generation. Analyze bundles are cached
per-run; workflow re-runs reuse them.

### 7.4 Tracker integration (GitHub only)

GitHub Issues is the only tracker the framework integrates with.
GitHub has no native Epic / Story concept — everything is an
Issue — so the framework imposes the hierarchy artificially on
top of Issues via label + task-list conventions. See
`plans/workflow-implementation.md` §6.F.1 for the full mapping;
the summary:

- **Epic** → issue labeled `insrc:epic` + `epic:<slug>`. Its body
  carries a GitHub task list linking to each child Story issue,
  giving free progress tracking.
- **Story** → issue labeled `insrc:story` + `epic:<slug>`. Body
  starts with `Epic: #<N>` back-reference.
- **Tasks** are NOT pushed as issues; they stay in the Story
  issue body as a checkbox list until the `plan` workflow lands.
- **Design docs** attach as comments — HLD on the Epic issue,
  LLD on the corresponding Story issue.
- **Status** = issue state + optional `insrc:in-progress` /
  `insrc:blocked` labels.
- **Auth is not ours to own.** `gh` must be installed and
  authenticated (`gh auth login`). We never store tokens,
  never call the GitHub REST API directly, never prompt for
  credentials. Same principle as `CliProvider` for Claude /
  Codex — the CLI owns its session, we invoke it.

There is no `TrackerAdapter` interface, and there is no `gh`
wrapper module either. Tracker integration is a **coarse
handoff** (same shape as `build` — meta doc §3.10): the
framework loads the artifact + resolved GitHub config, hands
both to the LLM with prompts spelling out the conventions
above, and lets the LLM invoke `gh` directly. Every LLM the
framework talks to (Claude, Codex, local qwen3-coder) already
knows how to use `gh` — wrapping it would just re-implement
what the LLM does natively. A `checklist.verify` step re-reads
what the LLM did against the conventions and reopens execute
on drift.

If we ever add another tracker with a different native shape
(Jira epics, Linear projects, whatever), we introduce the
abstraction at that point — the artificial hierarchy for GitHub
wouldn't generalise cleanly anyway.

Configuration lives at `~/.insrc/github.json` — one entry per
repo, plus a default. See `plans/workflow-implementation.md`
§6.F for the structure.

Push direction is opt-in per Epic: after `define` approval, the
user runs `insrc workflow push <epic-slug>` to create the GitHub
issues. The artifact's `meta.tracker` records the issue refs,
so subsequent `sync` calls know which issues to watch.

Pull direction is manual for v1: `insrc workflow sync <epic-slug>`
reads current status from GitHub and updates the artifact meta.
No polling, no webhooks — those are follow-ups.

The tracker runners are pure coarse handoffs — the framework
loads inputs + emits a prompt, the LLM does the work + returns
structured refs, the framework verifies against the conventions.

### 7.5 Amendments

Reference documents get consumed by many downstream workflows.
When a downstream discovery would only change a small piece of an
upstream artifact — a shared contract needs one more field, a
rollout phase needs splitting, a non-functional target needs
retuning — re-running the whole upstream artifact from scratch is
wasteful.

The framework's answer: **amendments**. A typed, cited, small
delta emitted by a downstream step, applied to the base artifact
on human approval. The **effective** artifact (what downstream
reads) is `base + approved amendments applied in order`.

Key invariants:

- Every amendment has a **type discriminator** and a **schema** for
  that type. The applier is pure and deterministic.
- Amendments are IMMUTABLE once proposed. Rejected → new id if
  reproposed. Approved → cannot be modified.
- Downstream reads always go through `getEffective<X>` — no way
  to accidentally read the raw base.
- Downstream artifacts store an `<upstream>EffectiveHash` in
  their meta so staleness detection works across amendments too,
  not just re-runs.
- Amendment ≠ back-flow. Amendment says "small delta"; back-flow
  says "wrong at the roots, re-run". Every workflow that
  supports amendments documents an amendment-vs-back-flow
  heuristic.

Today, **HLD is the only artifact that uses amendments** — see
[`workflow-design.md`](workflow-design.md) §11 for the concrete
implementation including amendment types, on-disk shape, CLI,
staleness handling, and the amendment-vs-back-flow heuristic.

The pattern generalises. If `define`'s Epic + Stories artifact
ever needs the same treatment (e.g., adding a Story to an
approved Epic without a full re-run), that workflow will adopt
the same primitives. Same for `plan`'s Task list. No workflow is
required to support amendments; each opts in when the
re-run-from-scratch cost gets too high.

## 8. Storage layout

Two roots. `docs/` and `plans/` hold artifacts the team reviews +
PRs. `~/.insrc/` holds ephemeral run logs + framework state.

```
docs/
├── defines/
│   ├── <epic-slug>.md            # 1 Epic + all its Stories, human-readable
│   └── <epic-slug>.json          # canonical, parsed by design
├── designs/
│   └── <epic-slug>/
│       ├── <story-id>.md         # 1 Design per Story
│       └── <story-id>.json
├── test-runs/
│   └── <epic-slug>/
│       └── <story-id>-<runId>.md # verification bundle per test run

plans/
└── <epic-slug>/
    ├── <story-id>.md             # N Tasks for the Story
    └── <story-id>.json           # canonical, parsed by build

~/.insrc/
├── github.json                   # GitHub tracker config (§7.4)
└── workflow-runs/
    └── <epic-slug>/
        └── <workflow>-<runId>.jsonl   # full step log per run
```

Story ids follow the pattern `s1`, `s2`, ... scoped to the Epic.
The whole hierarchy is addressable as `<epic-slug>/<story-id>[/<task-id>]`
end to end.

## 9. Phased rollout

Same shape as analyze's Phase A / B / C.

- **Phase A** — framework skeleton. Types, executor, cache, gates,
  storage, MCP tool (`insrc_workflow_step`, matches
  `insrc_analyze_step`'s shape). No workflow instance yet. Runs
  end-to-end on a stub workflow (`echo` — one step that echoes its
  input).
- **Phase B** — implement `define` + `design` end-to-end. First real
  artifacts. Prove the multi-turn pause/resume works for LLM steps
  and prove the analyze integration works. Live-test via Claude
  Code and Codex.
- **Phase C** — implement `plan`. Reuse a lot of `design`'s
  scaffolding.
- **Phase D** — implement `build`. Structurally the simplest of the
  four (coarse handoff, three steps: assemble / execute / verify).
  Proves the framework's audit story — a well-shaped brief +
  checklist forces higher-quality output than an unstructured
  handoff. First workflow that produces mutable side effects (git
  commits) so also proves the gate + back-flow plumbing.
- **Phase E** — implement `test`. Live-drive flows through the
  daemon / MCP / IDE surface. Reuse the verify skill contract.
- **Phase F** — back-flow + gates + `insrc workflow` CLI. Ties
  everything together.

Each phase ends with a doc + a live test + a commit range. Same
discipline analyze followed.

## 10. Design non-negotiables

Carried over from analyze:

- **Accuracy is primary; cost is least priority.** Never trim
  reasoning steps to save tokens.
- **No parallel LLM calls.** All step execution is serial `for … of`
  with sequential awaits. Same rule as the analyze framework's
  narrow-LLM path.
- **Prompt structure: structural reference goes trailing.** Every
  step-runner's LLM prompt puts schemas / catalogs / prior outputs
  at the tail. Recency-weighted attention rule.
- **No parallel LLM calls for verification** either. Back-flow
  signals fire one at a time.
- **Scope-boundary HARD RULE.** Every workflow's synthesizer
  prompt includes an explicit scope-boundary block. Rejected on
  boundary breach.
- **State tokens, not blobs.** Multi-turn state stays server-side
  with a 22-char token, per the analyze framework fix.

## 11. Open questions

- **Where does the human sit inside `build`?** Auto-approve trivial
  edits, prompt on non-trivial? Or hand every diff to the human?
- **How does `test` drive UI features?** The `run` skill already
  starts + drives apps; the framework wraps it in a `flow.exercise`
  runner. What about tests that need a running daemon + IDE +
  browser?
- **Do we store artifacts in-repo or under `~/.insrc/`?** In-repo
  gives PR review + git history; `~/.insrc/` avoids cluttering the
  working tree. Current lean: `docs/defines/` and `docs/designs/`
  are in-repo (they *are* the design record); `test-runs/` is
  ephemeral so goes under `~/.insrc/`. Reconsider per workflow.
- **How do back-flow signals surface in the IDE?** New pane? Status
  bar item? Notification? Deferred.
- **Cost budgeting.** Long-running workflows (build with many
  iterations, test with many flows) could rack up LLM turns. Do we
  cap by turn count? By wall clock? By explicit budget in the
  intent? Deferred to Phase F.

## 12. What we are NOT doing (yet)

- Not shipping all five workflows at once. Phase A alone is the
  framework skeleton. Each subsequent workflow lands with its own
  live test.
- Not attempting to unify the artifact schema across all five. Each
  workflow's synthesizer emits its own shape. The framework only
  enforces the `system / focus / summary / body / citations /
  openQuestions / handoff / meta` skeleton.
- Not automating the back-flow decision. The human decides how far
  to unwind. The framework only emits the signal and preserves the
  chain.
- Not shipping a UI for approval / rejection. CLI + MCP tool calls
  in Phase F. IDE UI later if it turns out to bite.
