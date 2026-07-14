# `design` workflow — HLD + LLD

Plan doc. Status: **design proposal**. Parent: [`plans/meta-workflow-framework.md`](meta-workflow-framework.md). Sibling: [`plans/workflow-define.md`](workflow-define.md).

`design` produces design artifacts at two altitudes matching the
industry-standard **HLD** (High-Level Design) / **LLD** (Low-Level
Design) split, mapped 1:1 to the Epic / Story hierarchy `define`
established:

- **`design.epic` (HLD)** — one per Epic. Establishes the
  framework: architectural choices, shared contracts, cross-Story
  concerns (data flow, error propagation, observability),
  non-functional properties, and Story boundaries (what each
  Story owns vs what's shared).

- **`design.story` (LLD)** — one per Story. Fills in the
  detailed design WITHIN the framework HLD established: the
  Story's specific API, data model changes, algorithm choices,
  error paths, test strategy, and — for `enhancement`-flavor
  Epics — the migration steps.

Both modes are instances of the same fine-grained recipe (meta
doc §3.10). They share the synthesizer scaffolding + a common
`alternatives → judge → detail` pattern; they differ in scope, in
which analyze bundles they lean on, and in what their artifact
sections contain.

## 1. Motivation

Without an HLD, each Story invents its own framework choices. Two
Stories that need to talk to each other end up with incompatible
approaches, and the incompatibility surfaces during `build` when
it's expensive to fix. Without an LLD, `plan` can't produce Tasks
that name concrete surfaces — Tasks become vague ("add filter
support") instead of grounded ("add `filter: TagFilter | null`
parameter to `queryTodos` in `services/todos.ts` and its four
callers listed at LLD §3.2").

Splitting `design` into HLD + LLD forces the framework decisions
to happen once, be reviewed once, and constrain every subsequent
Story-level design that flows from them. It also matches how
engineering teams already write design docs — architecture
review boards read HLDs; individual engineers write LLDs against
their team's HLD.

## 2. Scope

### `design` IS

Both modes share:

- The place where **alternatives are enumerated + judged** against
  the constraints inherited from `define`. Decisions are cited to
  their rationale.
- The place where the **chosen approach is written out** in enough
  detail that `plan` can produce concrete Tasks against it.
- The place where **rollout / migration steps** are sketched (HLD
  covers the whole Epic; LLD covers just this Story's slice).

### `design` IS NOT (scope-boundary HARD RULE)

- **Never breaks scope from `define`.** If the design proposes
  meeting an unstated goal or ignores a stated constraint, that's
  a back-flow signal to `define`, not a design decision.
- **Never enumerates tasks.** No implementation ordering, no
  granular file-by-file changes. That's `plan`. Design lists WHAT
  to build and WHY; plan lists HOW to sequence the building.
- **Never writes code.** Contracts + data models are typed
  interfaces or schemas; no function bodies, no algorithms
  implemented (only chosen + described).
- **Never invents context.** Every design decision must cite the
  Epic constraint or `analyze` bundle it's satisfying / working
  around.

## 3. The two modes at a glance

| Aspect | `design.epic` (HLD) | `design.story` (LLD) |
| :--- | :--- | :--- |
| Input | Whole Epic + all Stories | ONE Story + approved HLD + Epic |
| Analyze focuses | Structural-map on repo/subsystem, capability-discovery on the domain, `import.graph` for the modules the Epic touches | Symbol-locate on named APIs from HLD's contracts, data-model.trace on Story's entities, usage.example on any callers the Story reshapes, `search.text` on distinctive constants |
| Alternatives dimension | Frameworks / patterns / integration approaches | Contract shapes / data models / error strategies |
| Artifact focus | Cross-Story choices, shared contracts, non-functional targets, Story boundaries, rollout overview | This Story's detailed API, data model changes, error paths, test strategy, migration |
| Gate before | Approved Epic | Approved HLD + approved Epic |
| Runs concurrently with | (nothing) — HLD is single-instance per Epic | Other LLDs (one per Story), once HLD is approved |
| Feeds into | Every LLD; also `plan` reads it for cross-cutting context | `plan` for this Story; `test` for verification-strategy inheritance |

## 4. Interface

### 4.1 HLD input

```typescript
interface HldIntent {
    workflow:  'design.epic';
    epicSlug:  string;                       // must match an approved Define artifact
    reasoning: string;
    priorHldRunId?: string;                  // set when re-running after back-flow
    backFlowNotes?: string;                  // human-authored redirect (if re-run)
}
```

### 4.2 LLD input

```typescript
interface LldIntent {
    workflow:  'design.story';
    epicSlug:  string;
    storyId:   string;                       // must be a story id in the Epic
    reasoning: string;
    priorLldRunId?: string;
    backFlowNotes?: string;
}
```

### 4.3 Output

HLD → `docs/designs/<epic-slug>/_hld.md` + `.json`.
LLD → `docs/designs/<epic-slug>/<story-id>.md` + `.json`.

Underscore prefix on `_hld` keeps the HLD visually distinct from
Story LLDs in a directory listing. See §8 for the full storage
layout.

## 5. Recipes

Both modes are fine-grained (§3.10 in meta). They share step
names for the common phases; the parameters + prompts differ.

### 5.1 HLD recipe

```
s1: context.assemble      [deterministic + analyze]   whole-Epic landscape
s2: alternatives.enumerate [LLM]                       2-4 framework choices
s3: alternatives.judge    [LLM]                       score against Epic constraints
s4: framework.write       [LLM]                       chosen framework + shared contracts + Story boundaries
s5: rollout.overview      [LLM]                       phases / migrations / feature flags at Epic scope
s6: checklist.verify      [LLM, forced]               HLD-specific checklist (§9)
```

Six steps. `framework.write` is the biggest — it writes the
chosen framework AND the shared contracts AND the Story
boundaries in one turn because those three are tightly coupled
(you can't describe a shared contract without saying which Story
owns it).

### 5.2 LLD recipe

```
s1: context.assemble       [deterministic + analyze]  Story-focused landscape + HLD extract
s2: alternatives.enumerate  [LLM]                     2-4 contract / data-model shapes
s3: alternatives.judge     [LLM]                      score against Story constraints + HLD
s4: contract.detail        [LLM]                      Story API + data model
s5: error.paths            [LLM]                      error handling + edge cases
s6: test.strategy          [LLM]                      test types + coverage plan for this Story
s7: migration.write        [LLM, conditional]         migration steps (enhancement flavor only)
s8: checklist.verify       [LLM, forced]              LLD-specific checklist (§9)
```

Eight steps but each is small. `migration.write` runs only when
the Epic's `flavor = 'enhancement'`. For `new-capability` Epics
s7 is skipped and there's no migration section in the artifact.

## 6. Step details

### 6.1 s1 `context.assemble` (deterministic + analyze)

Both modes gather context before the LLM sees anything.

**HLD:**

- Reads the approved Epic artifact (all Stories, constraints,
  flavor).
- Fires analyze bundles at the WHOLE-EPIC scope:
  - `structural-map` on the target subsystem (or repo root if
    Epic is workspace-wide).
  - `capability-discovery` on the Epic problem (last chance to
    catch "we're rebuilding something we already have").
  - `import.graph` on the modules the Epic touches — helps HLD
    decide where new modules land relative to existing dep-graph
    hotspots.
  - `convention.detect` on the parent module — HLD's framework
    choices should follow existing conventions unless it
    justifies departing.
  - `manifests.locate` when Epic has an infra dimension.
- If `priorHldRunId` is set: reads the prior HLD + back-flow
  notes.

**LLD:**

- Reads the approved Epic + approved HLD + the specific Story.
- Extracts a **HLD context slice**: which shared contracts THIS
  Story touches, which Story boundaries THIS Story sits within,
  which framework choices apply to it. Not verbatim HLD — a
  filtered projection.
- Fires analyze bundles at the STORY scope:
  - `symbol.locate` on any API names the HLD's shared contracts
    reference (LLD needs to know exact current signatures if
    those APIs already exist).
  - `data-model.trace` on domain entities the Story touches.
  - `usage.example` on functions the Story reshapes.
  - `search.text` on distinctive constants or string literals the
    Story deals with.
  - `test.locate` on the Story's subject — LLD's test strategy
    should extend existing test patterns.

Emits `HldContext` or `LldContext` — typed but similar in shape
(list of prior refs, analyze bundles, back-flow notes).

### 6.2 s2 / s3 `alternatives.enumerate` + `alternatives.judge`

Same pattern in both modes; different dimension of alternatives.

- **s2** enumerates 2-4 alternatives. Schema requires each
  alternative to have: `name`, `oneLineSummary`, `approach`
  (~2 paragraphs), `pros[]`, `cons[]`, `costEstimate`
  (`XS|S|M|L`), `assumptionsRelied` (list of assumption ids from
  Epic + confidence they hold).
- **s3** judges alternatives against constraints. Schema requires
  each judgment to have: `alternativeId`, `constraintScore`
  (per-constraint verdict), `winnerRank`, `rationale`. Framework
  cross-checks that every Epic (or Story) constraint appears in
  every alternative's judgment.

The `alternativesConsidered` section in the artifact preserves
the losers verbatim + why they lost. Auditability > brevity —
future readers should be able to see why the chosen path won.

### 6.3 HLD s4 `framework.write` (LLM)

Reads s1 + s2 + s3. Writes the chosen framework in one LLM turn:

```typescript
{
    frameworkSummary: string;               // one paragraph
    architectureShape: string;              // 2-4 paragraphs
    sharedContracts: {
        id:              string;            // 'sc1', 'sc2', ...
        name:            string;            // e.g. "TaskRegistry API"
        purpose:         string;
        interfaceSketch: string;            // TS interface or schema, TYPE-LEVEL only
        ownedByStory:    string;            // story id -- which Story implements it
        consumedByStories: string[];        // story ids that call it
        assumptions:     string[];          // ids from Epic
    }[];
    storyBoundaries: {
        storyId:  string;
        owns:     string[];                 // shared contract ids
        depends:  string[];                 // shared contract ids consumed
        internal: string;                   // paragraph -- what's private to this Story
    }[];
    nonFunctional: {
        performance?:  string;
        security?:     string;
        observability?:string;
        durability?:   string;
    };
}
```

`interfaceSketch` is TYPE-LEVEL only — TypeScript interface, JSON
schema, or protobuf definition. No function bodies. The
scope-boundary check rejects it if the sketch contains statements
that look like implementation.

### 6.4 HLD s5 `rollout.overview` (LLM)

Reads everything upstream. Writes:

```typescript
{
    phases: {
        name:          string;              // e.g. "Phase A -- foundational contracts"
        includesStories: string[];          // story ids landing in this phase
        rationale:     string;
        backwardCompat: string;             // '' if none needed
        featureFlag:   string | null;       // flag name or null
    }[];
    orderingRationale: string;              // why phases go in this order
    riskyBits: {
        area:       string;
        why:        string;
        mitigation: string;
    }[];
}
```

Framework verifies that every Story appears in exactly one phase.

### 6.5 LLD s4 `contract.detail` (LLM)

Reads s1 + HLD context slice + s2 + s3. Writes:

```typescript
{
    surfaceLevel: 'internal' | 'internal-shared' | 'public';
    api: {                                   // if the Story owns / extends a public API
        name:         string;                // exact identifier the code will use
        signature:    string;                // TypeScript signature or equivalent
        parameters:   {name: string; type: string; purpose: string; optional: boolean}[];
        returns:      {type: string; meaning: string};
        errors:       {type: string; condition: string}[];
        preconditions:  string[];
        postconditions: string[];
    }[];
    dataModel: {
        entity:   string;
        change:   'new' | 'field-add' | 'field-modify' | 'field-remove' | 'invariant-change';
        details:  string;                    // paragraph
        schemaDiff?: string;                 // if applicable, e.g. Prisma diff
        callSites:   string[];               // functions that touch this entity (from analyze bundles)
    }[];
    interactionWithShared: {
        contractId:  string;                 // sharedContract id from HLD
        role:        'implements' | 'consumes';
        howDetails:  string;                 // how THIS Story implements or uses it
    }[];
}
```

Every named API here comes from either s1's analyze bundles
(existing APIs the Story reshapes) or HLD's `sharedContracts`
(APIs the Story owns / consumes as part of the Epic framework).
Invented names are a citation-grounding violation.

### 6.6 LLD s5 `error.paths` (LLM)

Writes:

```typescript
{
    errorCases: {
        scenario:    string;
        detection:   string;                 // how the code notices
        response:    string;                 // what it does
        userImpact:  string;
        recoverable: boolean;
    }[];
    edgeCases: {
        input:    string;
        expected: string;
    }[];
    invariantsToPreserve: {
        text:   string;
        source: Citation;                    // where the invariant is asserted today
    }[];
}
```

For `enhancement` flavor Epics, `invariantsToPreserve` is
particularly load-bearing — it names the current-behaviour
invariants the Story is NOT allowed to break, cited to the
analyze bundles from HLD s1.

### 6.7 LLD s6 `test.strategy` (LLM)

Writes:

```typescript
{
    testLevels: {
        level:      'unit' | 'integration' | 'live' | 'smoke' | 'contract';
        purpose:    string;
        subjects:   string[];                // specific functions / flows to test
        fixturesNeeded?: string[];
    }[];
    acceptanceMapping: {
        criterionId:   string;               // from Epic's acceptance criteria for THIS Story
        provingTests:  string[];             // test level + subject that will prove it
    }[];
    testFramework: string;                   // detected from convention.detect in s1
}
```

The `acceptanceMapping` section is what `test` reads to know
which flows to exercise. Every Story acceptance criterion must
map to at least one proving test; unmatched criteria go into
`openQuestions`.

### 6.8 LLD s7 `migration.write` (LLM, conditional)

Runs only when Epic `flavor = 'enhancement'`. Writes:

```typescript
{
    stateBefore:   string;                  // paragraph -- current behaviour cited to analyze bundles
    stateAfter:    string;                  // paragraph -- post-Story behaviour
    migrationSteps: {
        order:   number;
        action:  string;                    // e.g. "add nullable field", "backfill", "flip default"
        rollbackable: boolean;
        prerequisiteFlags?: string[];
    }[];
    backwardCompat: string;                 // how existing callers keep working
    zeroDowntime:   boolean;
    dataRewriteRequired: boolean;
}
```

For `new-capability` Epics this step is skipped and the artifact
has no `migration` section.

### 6.9 s6/s8 `checklist.verify` (LLM, forced)

HLD's checklist: §9.1. LLD's checklist: §9.2. Both use the same
`{itemId, verdict, evidence, notes?}` result schema. Same rules
on `missed | ambiguous`: scope-boundary items are hard-fail;
others become `openQuestions`.

## 7. Artifact schemas

### 7.1 HLD artifact

```typescript
interface HldArtifact {
    workflow:  'design.epic';
    epicSlug:  string;

    system:  string;
    focus:   string;
    summary: string;

    body: {
        frameworkSummary:   string;
        architectureShape:  string;
        sharedContracts:    SharedContract[];
        storyBoundaries:    StoryBoundary[];
        nonFunctional:      NonFunctional;
        rolloutOverview:    RolloutOverview;
        alternativesConsidered: Alternative[];     // losers preserved
        chosenAlternative:  string;                // id
    };

    citations:     Citation[];
    openQuestions: string[];

    handoff: {
        // Every LLD reads this. Plan reads this too for cross-cutting context.
        frameworkSummary:  string;
        sharedContracts:   SharedContract[];
        storyBoundaries:   StoryBoundary[];
        rolloutOverview:   RolloutOverview;
    };

    meta: {
        workflow:          'design.epic';
        epicSlug:          string;
        runId:             string;
        model:             string;
        toolCalls:         number;
        elapsedMs:         number;
        repoLastIndexedAt: number;
        priorHldRunId?:    string;
        approvedAt?:       string;
        tracker?:          TrackerMeta;
        // Approved amendments applied on top of the base run, in
        // apply order. The effective HLD (what downstream reads)
        // is base + these amendments. See §11.
        amendments: {
            id:                  string;
            type:                string;            // Amendment type discriminator
            proposedByWorkflow:  string;            // 'design.story' | 'plan' | 'build' | 'test'
            proposedByRunId:     string;
            approvedAt:          string;
            summary:             string;            // one-liner for the changelog
        }[];
        schemaVersion:     1;
    };
}
```

### 7.2 LLD artifact

```typescript
interface LldArtifact {
    workflow:  'design.story';
    epicSlug:  string;
    storyId:   string;

    system:  string;
    focus:   string;
    summary: string;

    body: {
        hldContextSlice:      HldContextSlice;     // which HLD parts this Story leans on
        contractDetails:      ContractDetails;
        dataModelChanges:     DataModelChange[];
        interactionWithShared: SharedInteraction[];
        errorPaths:           ErrorPaths;
        testStrategy:         TestStrategy;
        migration?:           Migration;           // enhancement flavor only
        alternativesConsidered: Alternative[];
        chosenAlternative:    string;
    };

    citations:     Citation[];
    openQuestions: string[];

    handoff: {
        // Plan reads this to enumerate Tasks. Test reads this for
        // the acceptance mapping and error paths.
        contractDetails:  ContractDetails;
        dataModelChanges: DataModelChange[];
        errorPaths:       ErrorPaths;
        testStrategy:     TestStrategy;
        migration?:       Migration;
    };

    meta: {
        workflow:          'design.story';
        epicSlug:          string;
        storyId:           string;

        // Anchors this LLD to a specific effective HLD state.
        // hldEffectiveHash = sha256(baseRunId || approvedAmendmentIds...)
        // computed at read time. If the effective hash changes
        // (base HLD re-run OR any amendment approved), this LLD is
        // marked stale on `insrc workflow status`.
        hldBaseRunId:         string;
        hldEffectiveHash:     string;
        hldAmendmentsApplied: string[];             // amendment ids the LLD was authored against

        runId:             string;
        model:             string;
        toolCalls:         number;
        elapsedMs:         number;
        repoLastIndexedAt: number;
        priorLldRunId?:    string;
        approvedAt?:       string;
        tracker?:          TrackerMeta;
        staleReason?:      string;                 // set post-hoc when framework marks stale
        schemaVersion:     1;
    };
}
```

`hldEffectiveHash` is load-bearing: it's the hash of the base HLD
runId plus every approved amendment id, in apply order. When the
effective HLD changes (either the base was re-run OR a new
amendment was approved), the framework recomputes the hash and
compares against every LLD's stored hash. Mismatches get marked
**stale** with a specific `staleReason` — see §11 for the values.

## 8. Storage layout

Every workflow artifact carries a 16-char Epic hash (see
`workflow/hash.ts`). Filenames are typed by workflow (`DEF-`,
`HLD-`, `LLD-`, `AMD-`, `TRK-`) followed by the hash. The hash
is the same across every artifact belonging to one Epic, so
`grep -l a3f4b8c9d1e2f3a4 .insrc/artifacts/` returns every file
for that Epic.

Human-facing markdown lives under `docs/`; canonical JSON lives
under `.insrc/artifacts/` (hidden, git-tracked) so `docs/` stays
clean of machine-serialized content.

```
<repo>/
├── docs/                                # human-facing markdown only
│   ├── defines/
│   │   └── DEF-<h16>.md
│   └── designs/
│       ├── HLD-<h16>.md
│       ├── LLD-<h16>-s1.md
│       └── LLD-<h16>-s2.md
│
└── .insrc/artifacts/                    # canonical JSON, hidden, git-tracked
    ├── DEF-<h16>.json
    ├── HLD-<h16>.json
    ├── LLD-<h16>-s1.json
    ├── LLD-<h16>-s2.json
    ├── AMD-<h16>-1.json                 # amendments, one file each
    └── AMD-<h16>-2.json

~/.insrc/workflow-runs/<h16>/            # jsonl trace logs, OUTSIDE the repo
    ├── define-<runId>.jsonl
    ├── design.epic-<runId>.jsonl
    ├── design.story-<runId>.jsonl
    └── tracker.push-<runId>.jsonl
```

The Epic hash is derived from the Define workflow's runId
(`sha256(defineRunId).slice(0, 16)`) at start time. The
human-readable slug derived from the focus stays in
`meta.epicSlug` for display; it never appears in filenames.

## 9. Verification checklists

### 9.1 HLD checklist (s6)

| ID | Item |
| :--- | :--- |
| `f1` | Does `frameworkSummary` describe the CHOSEN approach, not competing options? |
| `f2` | Does `architectureShape` cite an analyze bundle from s1 for every module it names? |
| `sc1` | Does every `sharedContract` have a story that OWNS it? |
| `sc2` | Every consumer story listed in `consumedByStories` must actually depend on the owning Story per the Epic's `dependsOn` graph, OR the Epic's dependency graph needs an added edge (surfaced as an `openQuestion`). |
| `sc3` | Every `interfaceSketch` is TYPE-LEVEL only (no function bodies, no algorithms). |
| `sb1` | Do `storyBoundaries` cover every Story in the Epic (no orphans)? |
| `sb2` | Does every Story boundary list exactly one owner Story per shared contract it references? |
| `nf1` | Does at least one non-functional property have a specific target (not "fast", but "P50 < 100ms")? |
| `ro1` | Does `rolloutOverview` place every Story in exactly one phase? |
| `ro2` | Does the phase order respect Story `dependsOn` edges? |
| `alt1` | Are 2-4 alternatives considered? |
| `alt2` | Is every alternative scored against every Epic constraint? |
| `alt3` | Is the chosen alternative's rationale grounded in the constraint scores (not vibes)? |
| `sbdry1` | **[HARD]** No implementation (function bodies, algorithm code) anywhere in the artifact. |
| `sbdry2` | **[HARD]** No invented paths / references not in a step output. |
| `sbdry3` | **[HARD]** No task enumeration (that's `plan`). |
| `sbdry4` | **[HARD]** No goal or constraint that isn't in the approved Epic (back-flow instead). |

### 9.2 LLD checklist (s8)

| ID | Item |
| :--- | :--- |
| `cd1` | Does every `api[].signature` reference either an existing symbol (cited to analyze) or a shared contract from HLD? No invented APIs. |
| `cd2` | Are all `api[].parameters` typed (no `any` / `unknown` unless explicitly justified)? |
| `cd3` | Does every `api[].errors` entry have a concrete error type? |
| `dm1` | Does every `dataModel[].callSites` entry come from an analyze bundle in s1? |
| `dm2` | For `enhancement` flavor: every field-modify or invariant-change cites the current-behaviour invariant it might break. |
| `int1` | Every `interactionWithShared` entry references a real `sharedContract.id` from HLD. |
| `int2` | Every shared contract the LLD claims to `implement` matches HLD's `ownedByStory` for this Story. |
| `ep1` | Are `errorCases` distinct from `edgeCases`? |
| `ep2` | Does every `errorCases[].detection` describe HOW code notices (not "the caller passes bad data")? |
| `ep3` | For `enhancement`: every `invariantsToPreserve` is cited to an analyze bundle showing the invariant. |
| `ts1` | Every acceptance criterion for this Story has at least one entry in `acceptanceMapping.provingTests`. |
| `ts2` | `testFramework` matches what `convention.detect` in s1 reported. |
| `mg1` | (enhancement only) Every migration step names whether it's rollbackable. |
| `mg2` | (enhancement only) `backwardCompat` is non-empty for any change that affects an existing public API. |
| `alt1` | Are 2-4 alternatives considered? |
| `alt2` | Is every alternative scored against every Story + Epic constraint AND against the HLD's shared contracts? |
| `sbdry1` | **[HARD]** No implementation body anywhere. |
| `sbdry2` | **[HARD]** No task enumeration. |
| `sbdry3` | **[HARD]** No design decision that contradicts the HLD (back-flow HLD instead). |
| `sbdry4` | **[HARD]** No invented references. |

## 10. Interaction

### 10.1 Gates

- HLD requires **approved Epic**. Refuses if the Epic artifact
  meta has no `approvedAt`.
- LLD requires **approved HLD + approved Epic**. Records the
  HLD's runId in its meta as `hldRunId`.

### 10.2 Approval / rejection

```
insrc workflow approve docs/designs/<epic-slug>/_hld.md
insrc workflow approve docs/designs/<epic-slug>/<story-id>.md
```

Rejection: same as `define`. Downstream (plan / build / test)
treats an unapproved / rejected artifact as absent.

### 10.3 Back-flow vs amendment

Two mechanisms carry downstream discoveries about HLD or Epic:

- **Amendment** (§11): small localised change to HLD. Downstream
  step emits an amendment proposal alongside its normal output;
  human approves; effective HLD updates; existing LLDs mark stale
  by `hldEffectiveHash` mismatch. HLD does NOT re-run.
- **Back-flow**: fundamental change to HLD or Epic. Downstream
  step emits a back-flow signal instead of output; the target
  workflow (HLD or `define`) re-runs from scratch with
  `backFlowNotes`.

Concrete routing:

- LLD discovers HLD needs a small delta → **amendment**.
- LLD discovers HLD's framework choice was wrong → **back-flow to
  HLD** (full re-run).
- LLD discovers the Story itself was framed wrong → **back-flow
  to Epic**. HLD stays; Epic (and possibly other Stories) may
  need to be re-run.
- HLD discovers the Epic's constraints or Story boundaries were
  wrong → **back-flow to Epic**. All in-progress LLDs
  invalidated.

The amendment-vs-backflow heuristic (§11.5) tells downstream
steps which to reach for. Ambiguous cases become `openQuestions`
at the discovery point — human decides.

### 10.4 Concurrent LLDs

Once HLD is approved, multiple LLDs can run in parallel (one per
Story). Each records its `hldRunId` so future HLD changes can be
detected. LLD runs never contend on the same file — each writes
to `<story-id>.md`.

### 10.5 GitHub tracker integration

Coarse handoff to the LLM (meta doc §7.4). After an HLD is
approved, the framework hands the artifact + Epic issue ref to
the LLM with the post prompt; the LLM invokes `gh issue
comment` to attach the summary onto the Epic issue. After an
LLD is approved, the same pattern posts the summary onto the
corresponding Story issue. Design docs don't get their OWN
issue — they attach to the Epic / Story issue that `define`'s
push already created.

```
insrc workflow post <path-to-design-artifact>
```

No `--tracker` flag — GitHub is the only tracker. Read-only
from tracker to artifact stays out-of-scope for design (status
of a design doesn't map cleanly to issue state).

## 11. Amendments (HLD updates from downstream)

HLD is a live reference document. LLD, plan, build, and test all
read from it — and all of them can discover mid-flight that the
HLD needs a small change: a field to add to a shared contract, a
non-functional target to retune, a rollout phase to split. If
every such discovery required a full HLD re-run, the framework
would grind to a halt.

The framework supports **amendments** — small, typed, cited
proposals emitted by downstream workflows and applied to the base
HLD on approval. The **effective HLD** (what downstream reads) is
the base HLD plus every approved amendment applied in proposal-
approval order.

Amendment ≠ back-flow. Back-flow says "the HLD was fundamentally
wrong; re-run it". Amendment says "the HLD was right in spirit,
here's a specific delta". §11.5 documents when to reach for each.

### 11.1 Lifecycle

1. A downstream step (LLD's `contract.detail`, plan's
   `tasks.enumerate`, build's `context.assemble`, test's
   `acceptance.check`) discovers a needed HLD change.
2. Instead of failing or emitting a back-flow, the step **emits
   an amendment proposal**: a typed record with the proposed
   change, rationale, and citations.
3. Framework writes the proposal to
   `docs/designs/<epic-slug>/_hld-amendments/<amendmentId>.json`.
   Status: `pending`.
4. `insrc workflow status <epic-slug>` surfaces pending
   amendments. `insrc workflow amend --show <amendmentId>`
   displays the proposal in detail.
5. Human reviews. `--approve <amendmentId>` applies it,
   `--reject <amendmentId> --notes '<why>'` marks it rejected.
6. On approval: the amendment id is appended to HLD's
   `meta.amendments`. The effective HLD's hash changes. Every
   LLD anchored to the pre-amendment hash is marked stale with
   `staleReason = 'amendment-<amendmentId>'`.

### 11.2 Amendment types

Each type has its own schema. Adding a new type requires
updating the amendment applier + validator. Types are chosen so
each amendment is a self-contained delta the applier can apply
mechanically.

```typescript
type Amendment =
    | SharedContractFieldAdd
    | SharedContractFieldRemove
    | SharedContractRename
    | SharedContractMethodAdd
    | StoryBoundaryReassignOwnership
    | StoryBoundaryAddConsumer
    | NonFunctionalRetarget
    | RolloutReorder
    | RolloutSplitPhase
    | RolloutMergePhases;

interface SharedContractFieldAdd {
    type:        'sharedContract.fieldAdd';
    contractId:  string;
    field:       FieldSpec;
    breaking:    false;                             // additive only
}

interface SharedContractFieldRemove {
    type:        'sharedContract.fieldRemove';
    contractId:  string;
    fieldName:   string;
    breaking:    true;
    migrationCue: string;                           // required -- what LLDs need to do
}

interface SharedContractRename {
    type:        'sharedContract.rename';
    contractId:  string;
    oldName:     string;
    newName:     string;
    breaking:    true;
    migrationCue: string;
}

interface SharedContractMethodAdd {
    type:        'sharedContract.methodAdd';
    contractId:  string;
    method:      MethodSpec;                        // TYPE-level only, same rules as HLD
}

interface StoryBoundaryReassignOwnership {
    type:        'storyBoundary.reassignOwnership';
    contractId:  string;
    oldOwner:    string;                            // story id
    newOwner:    string;                            // story id
    rationale:   string;
}

interface StoryBoundaryAddConsumer {
    type:        'storyBoundary.addConsumer';
    contractId:  string;
    consumer:    string;                            // story id
    // Framework checks that consumer's story now has a dependsOn
    // edge to the owner; if not, this amendment implicitly adds
    // the edge (recorded in AmendmentRecord.sideEffects).
}

interface NonFunctionalRetarget {
    type:        'nonFunctional.retarget';
    property:    string;                            // e.g. 'performance', 'security'
    oldTarget:   string;
    newTarget:   string;
    rationale:   string;
}

interface RolloutReorder {
    type:        'rollout.reorder';
    newPhaseOrder: string[];                        // phase ids in new order
    // Framework verifies the new order still respects Story dependsOn edges.
}

interface RolloutSplitPhase {
    type:        'rollout.splitPhase';
    phase:       string;
    newPhases: {
        name:            string;
        includesStories: string[];                  // subset of the original phase's stories
    }[];
    // Framework verifies the union of includesStories equals the
    // original phase's stories.
}

interface RolloutMergePhases {
    type:        'rollout.mergePhases';
    phases:      string[];                          // phase ids to merge
    newPhase:    {name: string};
}
```

### 11.3 AmendmentRecord (on-disk shape)

```typescript
interface AmendmentRecord {
    id:           string;                           // 'amend-<epicSlug>-<n>' or ulid
    epicSlug:     string;
    hldBaseRunId: string;                           // base HLD this amendment applies to
    amendment:    Amendment;
    rationale:    string;
    citations:    Citation[];
    proposedBy: {
        workflow: string;                           // e.g. 'design.story'
        runId:    string;
        storyId?: string;
        stepId:   string;                           // which step in the workflow
    };
    sideEffects?: {
        addedStoryDependencies?: {from: string; to: string}[];
        // room for future implicit effects
    };
    proposedAt:  string;
    status:      'pending' | 'approved' | 'rejected';
    approvedAt?: string;
    approvedBy?: string;                            // human user id or 'auto' if policy allows
    rejectedAt?: string;
    rejectedReason?: string;
}
```

Amendments are IMMUTABLE once proposed. A rejected amendment
doesn't get resurrected — the downstream step must re-propose
with a new id. This keeps the audit trail clean.

### 11.4 Effective HLD

```typescript
async function getEffectiveHld(epicSlug: string): Promise<HldArtifact> {
    const base = readJson<HldArtifact>(`docs/designs/${epicSlug}/_hld.json`);
    const amendments = readAllAmendments(epicSlug)
        .filter(a => a.status === 'approved')
        .sort((a, b) => a.approvedAt!.localeCompare(b.approvedAt!));
    return applyAmendments(base, amendments);
}
```

Downstream workflows always read the effective HLD via
`getEffectiveHld`. There is no way to read the raw base
accidentally — the framework's HLD-fetch helper is the effective
one.

The `applyAmendments` function is pure and deterministic: same
base + same amendment set + same order → same effective HLD.
That's what lets us hash the effective state cheaply.

### 11.5 Amendment vs re-run heuristic

Rough rules (documented, not enforced):

- **Amend when**: the change touches one or two `sharedContracts`
  OR retunes a single non-functional target OR reorders /
  splits / merges rollout phases without changing what's in them.
- **Re-run when**: the change would affect > 30% of shared
  contracts, OR the `architectureShape` needs to change, OR the
  `frameworkSummary` no longer describes the chosen approach.

Downstream steps that discover an issue can propose either. Their
prompt gets the heuristic so the LLM picks reasonably. Ambiguous
cases become `openQuestions` at the discovery point.

### 11.6 Staleness

`hldEffectiveHash` on every LLD (and downstream artifact) is
sha256 of `(hldBaseRunId, sorted approvedAmendmentIds)`. Recomputed
on every `insrc workflow status`.

Staleness values:

- `hld-rerun`: the base HLD was re-run (different `hldBaseRunId`).
- `amendment-<id>`: a specific amendment landed (different set
  of approved amendment ids).
- `story-dependency-changed`: an upstream Story's LLD was itself
  invalidated by an amendment.

Downstream workflows (`plan`, `build`, `test`) refuse to consume
a stale LLD until it's either re-run or explicitly acknowledged
via `insrc workflow ack-stale <path> --reason '<why>'` (which
records an override in the artifact's meta).

### 11.7 CLI

```
insrc workflow status <epic-slug>
    # shows pending amendments + stale LLDs

insrc workflow amend <epic-slug> --list
    # every amendment for this Epic, any status

insrc workflow amend <epic-slug> --show <amendmentId>
    # full proposal + citations

insrc workflow amend <epic-slug> --approve <amendmentId>
    # applies to effective HLD; marks downstream artifacts stale

insrc workflow amend <epic-slug> --reject <amendmentId> --notes '<why>'

insrc workflow ack-stale <path> --reason '<why>'
    # explicitly override the staleness check; downstream can consume
```

Downstream workflows never call `--approve` / `--reject` — they
only EMIT proposals via their step outputs.

### 11.8 Amendment step in downstream recipes

Every downstream workflow's recipe gets an optional
`hld.amendmentProposal` output field on any step whose LLM turn
might discover an HLD issue:

- LLD s4 `contract.detail` → discovers a contract needs a field
- LLD s5 `error.paths` → discovers HLD's error-strategy is wrong
- plan `tasks.enumerate` → discovers HLD's rollout phase can't be
  built cleanly
- build `context.assemble` → discovers HLD's contract signature
  doesn't match a real callsite
- test `acceptance.check` → discovers HLD's non-functional target
  can't actually be measured

The step's output schema allows `hld.amendmentProposal?:
Amendment` as an optional field. When present, the framework
writes the amendment record. The step's normal output proceeds
(the LLM records the discovery + amendment in one turn instead
of blocking).

## 12. Non-negotiables

Same set as `define`. Emphasising two here because they matter
more for design:

- **Alternatives are load-bearing.** Never skip s2 / s3 to save
  turns. The `alternativesConsidered` section is what makes
  design auditable — future readers should be able to see the
  losers + why.
- **HLD is one per Epic; LLD is one per Story.** No "combined HLD
  for a family of Epics"; no "per-Task LLD". Match the Epic /
  Story boundaries strictly.

## 13. What we are NOT doing (yet)

- **Not shipping a HLD-first-review dashboard.** Approval is
  per-artifact via CLI + MCP tool call.
- **Not auto-invalidating LLDs when HLD is re-approved.** Marked
  as stale but not deleted; human decides which to re-run.
- **Not supporting multi-Epic HLDs.** If two Epics share a
  framework decision, each Epic's HLD documents it independently
  (cited to the shared context if needed).
- **Not shipping design-review LLM personas.** The synthesizer +
  s3 judge suffice for now; a "critical reviewer" second-pass is
  a follow-up.
- **Not integrating with existing ARBs / design docs already in
  the repo.** Future work — a `design.import <path>` command that
  ingests an existing markdown design as if it had been produced
  here, so downstream workflows can consume it.

## 14. Open questions

- **Staleness detection**: comparing `hldEffectiveHash` at
  `status`-check time is straightforward, but during an active
  `plan` or `build`, a stale LLD could silently mislead. Current
  lean: downstream workflows recompute the hash at their own
  `context.assemble` time and hard-block if it doesn't match the
  LLD's stored `hldEffectiveHash`. Alternative: warn only. §11.6
  documents hard-block.
- **When multiple LLDs disagree on how to consume a shared
  contract**: HLD's contract is the fixed target. If an LLD needs
  a change, it proposes an amendment (§11) — landing first
  wins if approved.
- **A "combined design" markdown for whole-Epic review**:
  deferred. Could be `insrc workflow render <epic-slug>` that
  concatenates HLD + all approved amendments (applied) + all
  LLDs into one document.
- **New Story added to an approved Epic post-back-flow**: current
  lean is that any new Story triggers a full HLD re-run (the
  existing HLD's Story boundaries no longer cover the Epic).
  Alternative: a `sharedContract.methodAdd` + `storyBoundary`
  amendment set could cover a "small" additional Story without
  re-running HLD. Deferred — probably worth an escape hatch.
- **`nonFunctional` targets — free-text or typed schema**: typed
  would let `test` verify them mechanically. Deferred until
  `test` needs it.

### Amendment-specific

- **Should amendments be composable in a single proposal?**
  Right now every amendment is one type + one payload. A
  `contract.fieldAdd` and a related `nonFunctional.retarget`
  from the same LLD would file two proposals. Alternative:
  atomic multi-amendment proposals (approve all or none).
  Deferred until we see it come up.
- **Auto-approve trivial amendments?** e.g. `contract.fieldAdd`
  with `breaking: false` that only adds an optional field.
  Removes human review overhead but weakens the audit trail.
  Deferred to Phase F.
- **How do we prevent amendment thrash?** If LLD proposes
  amendment A, human approves, then LLD proposes amendment B
  that undoes A, we've lost work. Framework detection: on
  proposal, diff against recent amendments; flag likely reversals.
  Deferred.
- **Does the LLD amendment step have a rollback path?** If an
  LLD emits an amendment proposal that later gets rejected, the
  LLD artifact was authored ASSUMING the amendment would land.
  Options: (a) LLD sits in a pending state until amendment
  resolves; (b) LLD lands but is stale from the start with a
  clear reason. Current lean: (b) — human sees the stale flag
  and knows to re-run LLD after the amendment is resolved.
