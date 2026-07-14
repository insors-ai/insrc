# Analyze framework — Plan Builder

## Purpose

Given the classified intent + run-level context bundle + the catalog of available task templates, emit a **Plan Task**: a flat, serially-ordered list of typed task invocations that, when executed, produces enough citation-backed task outputs for the aggregator to render the final report.

The Plan Task is the analyze framework's only piece of LLM-driven structure outside the per-task templates themselves. It carries the most demanding accuracy + format contract in the system — a malformed plan invalidates every downstream task — so it gets the high-class model, ajv-strict schema enforcement, an explicit invariant validator, and a corrective retry loop.

## The Plan tree

A Run contains one **root Plan**. Every Plan is a flat ordered list of typed tasks. A task may be a **leaf** (produces structured output) or a **planner-template** (its execution recursively invokes the Plan Builder to produce a **child Plan**, which itself is flat).

The framework therefore distinguishes:

- **A single Plan** — always flat. The Plan Builder emits one of these per invocation.
- **The Plan tree** — the full Run-level structure. Arbitrarily deep. Built incrementally as planner-template tasks execute.

Parent-child links are persisted on disk (see overall framework doc's working-folder layout) and reconstructable by walking `taskPath` strings (`t02.t05.t01` is rooted at the root Plan's `t02`, descends through `t02`'s child Plan's `t05`, and lands at that sub-plan's leaf `t01`).

## Plan Task contract

```ts
interface PlanTask {
  readonly planId:        string;            // 'p-root' or 'p-<parentTaskPath>'
  readonly parentTaskPath?: string;          // present on every Plan EXCEPT the root
  readonly goal:          string;            // ≤ 200 chars; one sentence
  readonly target:        'code' | 'data' | 'infrastructure';
  readonly scope:         'XS' | 'S' | 'M' | 'L' | 'XL';
                                              // scope can DIFFER from parent's scope
                                              // (an L-bucket Run's task may legitimately
                                              //  spawn an XS-bucket child Plan for one
                                              //  unit)
  readonly tasks:         readonly PlannedTask[];   // serial-execution order
  readonly reasoning:     string;            // ≤ 1000 chars; why this list, why this
                                              // order, what was deliberately omitted
}

interface PlannedTask {
  readonly taskId:           string;                  // 't01'..'tNN'; unique within
                                                      // THIS Plan
  readonly taskPath:         string;                  // fully-qualified path from the
                                                      // root Plan; persisted at exec
                                                      // time, not at plan time
  readonly template:         string;                  // catalog id
  readonly kind:             'leaf' | 'planner';      // mirrors the template's kind
  readonly params:           Record<string, unknown>; // validates vs template's
                                                      // inputSchema
  readonly produces:         readonly string[];       // outputs this task produces
                                                      // (a `kind: 'planner'` task always
                                                      //  declares a single `report`
                                                      //  output — its child Plan's
                                                      //  terminal aggregate)
  readonly consumes?:        readonly string[];       // names of upstream outputs it
                                                      // reads (within this Plan only;
                                                      // cross-Plan consumption goes
                                                      // through the parent task's
                                                      // output value)
  readonly rationale:        string;                  // ≤ 300 chars; why this task
}
```

**Notes**
- `PlannedTask.produces` is a redundant declaration — the template defines what it produces — but the planner must list them so output-dependency wiring stays explicit and checkable in the persisted plan.
- `taskPath` is computed by the executor (not by the planner) at the moment a task is scheduled. For root-plan tasks it equals the `taskId`. For child-plan tasks it equals `<parentTaskPath>.<taskId>`. The planner only needs to emit unique `taskId`s within its own Plan.
- A planner-template task's `consumes` is **scoped to its sibling tasks** in the parent Plan. Values from cousin Plans or grandparent Plans are not accessible; if a child Plan needs context from a different subtree, it goes through the Context Builder (which reads persisted task outputs from disk) rather than direct `consumes` references.

## Invariants the validator enforces

The Plan Validator runs after the LLM's schema check and before the plan is persisted. Failures bounce back to the LLM as a feedback note for retry.

1. **Non-empty tasks list.** `tasks.length >= 1`.
2. **Stable IDs.** `taskId` is `^t\d{2,3}$`, unique within the list, in monotonic order matching the array position (`t01`, `t02`, …).
3. **Templates exist.** Every `template` id is in the registered catalog.
4. **Templates are target-correct.** Every template's declared `target` matches the plan's `target`.
5. **Params validate.** Each `params` validates against the template's `inputSchema` (ajv).
6. **`produces` matches template.** Per task, `produces` is exactly the template's declared `produces`. For planner-template tasks, that's always exactly `['report']` (the child Plan's terminal aggregator output is materialized under that name).
7. **`consumes` references valid producers.** Every name in `consumes` is produced by a task earlier in **this** Plan. Cross-plan consumption isn't expressible here.
8. **Kind matches template.** `PlannedTask.kind === template.kind`. The planner can't recast a leaf template as a planner template or vice versa.
9. **Flat within the Plan.** No `PlannedTask.params` contains a sub-task list, sub-plan list, or any other nested-plan shape. The only way to extend the tree is by picking a planner-template task — and that recursion happens at execution time, not at plan time. Enforced by ajv (input schemas of planner templates do not accept nested task arrays).
10. **No cross-cycles.** The DAG over `(producer.produces, consumer.consumes)` within this Plan is acyclic.
11. **Serial linearization.** The list order is a valid topological sort of the output DAG.
12. **One aggregator task.** Exactly one task in the list uses the target's terminal aggregator template (e.g. `code.aggregate.report`). It must be the last entry. This holds for **every** Plan in the tree — each child Plan ends with its own aggregator.
13. **Scope policy adherence.** The list length is within the depth-policy band for **this Plan's** scope bucket (XS: 3-8, S: 10-20, M: 20-40, L: 30-60, XL: 40-80). The child Plan's scope is not constrained by the parent's — a child planner is free to classify its sub-target however it wants.
14. **Reasoning non-empty.** Every `PlannedTask.rationale` is ≥ 20 chars; `PlanTask.reasoning` is ≥ 50 chars. Catches the cargo-cult-prompt case where the model emits `""` for every field.
15. **`parentTaskPath` present iff not root.** The root Plan has `parentTaskPath: undefined`; every other Plan has `parentTaskPath` matching the task that spawned it. The Plan Builder stamps this from the call-site, not from the LLM's output.

## The plan-builder LLM call

### Routing

Always **high-class** model (Opus on claude-cli, GPT-5 / O3 on codex-cli). The plan is load-bearing; the cost-per-call is the same as one Phase-1 ask of the deleted meta-task pipeline (~$0.30 on Opus), one call per run, low absolute cost.

### Prompt structure

```
## System
You are the analyze planner. Given a classified analyze request and a context
bundle, you emit a Plan Task: a flat ordered list of typed tasks the executor
will run serially.

You MUST conform to the Plan Task JSON Schema. You MUST follow these invariants:
  - No task nests another task.
  - No cross-task dependencies beyond the explicit `consumes`/`produces` graph.
  - Serial list order must be a valid topological sort.
  - Exactly one terminal aggregator task; it is the last entry.
  - Task count within the scope-policy band.

The depth policy for this run's scope is inverted: bigger scope = more
structural / less per-unit; smaller scope = more detailed / more per-unit.

## User
[context bundle: system / focus / summary / structure / surface / artefacts]

## TASK CATALOG (emit task ids from here only)
[catalog summary -- one entry per template:
  - id, target, family, description
  - inputSchema -- compact JSON Schema shape
  - produces -- output names + outputSchema shape
  - consumes -- output names it reads, if any]

## DEPTH POLICY BAND (this run)
scope: <bucket>
expected task count: <low>-<high>
expected output focus: <depth policy reminder from the framework doc>

## OUTPUT SHAPE
[Plan Task JSON Schema, verbatim]

## TASK
Emit the JSON object now.
```

The catalog is the trailing structural reference per the project's prompt convention.

### Retry loop

Plan Builder retries up to `maxAttempts: 3` on:
- Wire-layer schema-conformance failure (the provider's structured-output retry handles this internally)
- Invariant validator failure (custom retry: validator's reason text is appended to the user message as a `## VALIDATOR FEEDBACK` block; the plan is re-issued)

A retry's `## VALIDATOR FEEDBACK` block uses the validator's failed-invariant ID (e.g. `INV-11: aggregator task must be last in the list; got it at position 14 of 20`) so the model can target the fix without re-reasoning the whole plan.

After 3 failures the run aborts with `plan-builder-exhausted`. The persisted `errors.json` records all three attempts' full plans + validator notes so the user can diagnose.

## Edge cases

### Focused intent → smaller-than-band plans

When `focused: true` with a very tight focus ("just the error handling"), the band's lower bound becomes advisory — the planner is allowed to emit below-band counts if the focus genuinely doesn't need more tasks. Concretely: focused intent reduces the lower bound by 50% (rounded down) but not the upper.

### XL → planner-template tasks

XL is not a special case in the framework — it's an emergent shape of the recursive-Plan model. An XL plan's task list typically consists of a partition pre-pass (a leaf task that declares the sub-targets) followed by **one planner-template task per sub-target**. Each planner-template task spawns its own child Plan (typically L-bucket) at execution time. The XL plan's final task is the cross-partition aggregator, which consumes each planner-template task's `report` output.

Concretely:

```jsonc
{
  "planId": "p-root",
  "target": "code",
  "scope": "XL",
  "tasks": [
    { "taskId": "t01", "template": "code.discovery.partition-multi-repo",
      "kind": "leaf",
      "params": { "scopeRef": ... },
      "produces": ["partitions"],
      "rationale": "enumerate sub-targets for the cross-repo run" },
    { "taskId": "t02", "template": "code.subrun.analyze-repo",
      "kind": "planner",
      "params": { "partitionId": "@t01.partitions[0]" },
      "consumes": ["partitions"],
      "produces": ["report"],
      "rationale": "deep analyze of repo A; child Plan classified as L" },
    { "taskId": "t03", "template": "code.subrun.analyze-repo",
      "kind": "planner",
      "params": { "partitionId": "@t01.partitions[1]" },
      "consumes": ["partitions"],
      "produces": ["report"],
      "rationale": "deep analyze of repo B; child Plan classified as L" },
    // ... one planner-template task per repo ...
    { "taskId": "tNN", "template": "code.aggregate.cross-partition",
      "kind": "leaf",
      "consumes": ["report"],            // every t02..tN-1 produces 'report'
      "produces": ["report"],
      "rationale": "stitch per-repo reports into the org-wide view" }
  ]
}
```

The executor runs these serially. When it reaches `t02`, it invokes the Plan Builder with the task's child-Plan context; the result is `t02`'s child Plan (target=code, scope=L, parentTaskPath=t02). That child Plan executes top-to-bottom; its terminal aggregator's output becomes the value materialized at `t02.json`'s `produces` slot. Then the executor moves on to `t03`, and so on.

**The same shape applies at every scope** — not just XL. An L plan analyzing a complex module might emit a planner-template task to deep-dive on a particularly opaque sub-component. An M plan might do the same for its central component. The cap on tree depth is **scope-contextual** and keyed on the root Run's classified scope (see overall framework doc's `models.analyze.maxPlanDepth`): XS → 2, S → 3, M → 4, L → 5, XL → 6 by default. The cap is the absolute ceiling across the whole tree; each Plan Builder invocation knows its `currentDepth` and refuses to invoke when `currentDepth + 1` would exceed the root's ceiling. The parent task then fails with `max-plan-depth-exceeded` and downstream consumers see it as `dependency-unavailable`.

### Param resolution from context

The catalog declares an input schema like `{ scopeRef: ScopeRef; depth: 'shallow' | 'deep' }`, but the planner's job is to fill `params` from what it knows about the context. To prevent the planner from inventing values that don't reference real graph entities, the catalog summary in the prompt includes a "valid param values" section per template:

```
template: code.summary.module
  inputSchema:
    scopeRef: ScopeRef
    depth: 'shallow' | 'deep'
  valid scopeRef values from this run's context:
    - { kind: 'module', value: 'src/insrc/indexer' }
    - { kind: 'module', value: 'src/insrc/daemon' }
    - { kind: 'module', value: 'src/insrc/db' }
```

The planner picks from the supplied set. The validator then asserts `params.scopeRef` is in the supplied set; values the planner invented get rejected with `INV-PARAM: scopeRef.value not in supplied options`.

For free-form params (e.g. `focus: string`) the validator only checks shape, not value.

## Persisted plan layout

Each Plan in the tree has its own attempts directory alongside its `plan.json`:

```
~/.insrc/analyze/<run-id>/
  plan.json                — root Plan (final accepted version)
  plan.attempts/
    01.plan.json           — root planner attempt 1 (if retried)
    01.feedback.json       — validator's response that triggered retry
    02.plan.json
    02.feedback.json
    03.plan.json           — final accepted (mirrored to plan.json)
  tasks/
    t02/                   — planner-template task t02's directory
      plan.json            — t02's child Plan (final accepted)
      plan.attempts/
        01.plan.json       — t02's child-planner attempt 1
        01.feedback.json
        ...
      tasks/
        t02.t05/           — t02.t05 is itself a planner-template task
          plan.json
          plan.attempts/
            ...
```

Useful for diagnosing planner drift at any depth: every Plan in the tree has its own audit trail.

## Resumability

On a daemon-restart mid-run, the executor walks the Plan tree depth-first to find where it left off:

1. Read `meta.json`. Status governs the high-level recovery mode (`planning` | `executing` | `aggregating` | `done`).
2. Walk from the root Plan: for each task in order, check if its `<task>.json` (or `<task>/task.json` for planner-template tasks) exists on disk.
3. **Leaf-task incomplete** → re-run it. (Bundle is rebuilt if missing; same params, same template.)
4. **Planner-task incomplete** → check if its `plan.json` exists. If not, re-run the planner. If yes, recurse into the child Plan and apply the same walk.
5. **Planner-task complete (terminal aggregator landed)** → skip it; its persisted output is the materialized value for downstream consumption.
6. On the way back up, each Plan's own aggregator is re-run if its `<aggregator-task>.json` is missing.

The Plan Builder call is the only operation that isn't deterministic across restarts (retry attempts differ even at `temperature: 0` because the LLM's pseudo-random sampling depends on internals we don't control). The framework runs every Plan Builder call with `temperature: 0` to maximize the determinism the provider supports, and pins the model version in `meta.json` so resumes use the same model. A child Plan re-built on resume is not guaranteed to be byte-identical to the original child Plan, but should be functionally equivalent — and the validator's invariants prevent any silently-different shape from sliding through.

## Failure surface

| Failure | Phase | Recoverable? |
|---|---|---|
| Wire-layer schema violation | Inside `completeStructured` retry | Yes (provider handles) |
| Invariant validation failure | Plan Builder retry | Yes (up to maxAttempts) |
| Invariant exhausted (maxAttempts) | Run abort | No — manual rerun |
| Catalog drift mid-run (template removed) | Plan validation | No — fail fast |
| Context bundle inconsistency (planner saw modules X,Y; one disappeared by execution time) | Per-task execution | Partially — task short-circuits with `dependency-unavailable`; downstream tasks adapt |
| Child-plan dispatch failure | Planner-template task execution | The parent task fails with `child-plan-build-failed` after that planner exhausts its retries; downstream sibling tasks see the failure via `dependency-unavailable` and adapt; the parent Plan's aggregator runs anyway and surfaces the partial completeness |

## What's deliberately deferred

- **Parallel planning + execution** — Phase 1 is strictly serial. The Plan Task's flat list structure permits parallelism trivially (any tasks not in each other's `consumes` chain can execute concurrently), but the framework runs them serially to keep failure isolation and resumability simple. Phase 2 adds an explicit `parallelism` knob.
- **Plan refinement mid-run** — if an early task discovers context the planner didn't have (e.g. discovery surfaces 40 modules instead of the planner's expected 5), Phase 1 just rolls forward with the plan as-is. Phase 2 adds a `replan` task family that lets a task emit "the rest of the plan needs revision; here's a new tail."
- **Cost projection** — Phase 1's plan persists what tasks it emits; Phase 2 stamps an estimated token-count per task so the user sees `≈ $X` before approving.

## See also

- `design/analyze-framework.md` — overall framework
- `design/analyze-context-builder.md` — what feeds this planner
- `design/analyze-framework-{code,data,infrastructure}.md` — the catalogs this planner picks from
