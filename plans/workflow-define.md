# `define` workflow

Plan doc. Status: **design proposal**. Parent: [`plans/meta-workflow-framework.md`](meta-workflow-framework.md).

`define` is stage zero of the workflow chain. It takes a vague user
ask and produces:

- **1 Epic** — problem framing, non-goals, assumptions, constraints
  at the top level.
- **N Stories** under the Epic — each Story is a valuable slice
  with its own user value statement, acceptance criteria, local
  constraints, and dependencies on other Stories.

That Epic + Stories shape is the shared backbone of the whole
framework (meta doc §2). Everything downstream operates on it —
`design` picks a Story, `plan` produces Tasks for a Story, `build`
implements a Task, `test` verifies a Story. GitHub Issues gets
an artificial Epic / Story hierarchy imposed via labels + task
lists, so the framework can push the Epic + Stories out as
issues after approval (meta doc §7.4).

Pattern: **fine-grained recipe** (meta doc §3.10), four steps.

## 1. Motivation

Every downstream workflow has to answer three questions:

1. What problem are we solving? (**Epic**)
2. What are the discrete valuable slices? (**Stories**)
3. What does "done" look like for each slice? (**acceptance criteria**)

Without a persistent, cited answer to those three, `design`
invents its own framing, `plan` breaks the invented framing into
tasks, `build` implements against a phantom scope, and `test`
grades against criteria the author of the ask never confirmed.
`define` breaks that chain by producing the Epic + Stories once,
approved once, and read verbatim by every subsequent workflow.

The Epic + Stories shape maps cleanly onto GitHub Issues via the
artificial hierarchy conventions in `workflow-implementation.md`
§6.F.1, which is the second-order benefit: after approval, the
framework pushes the Epic as one issue and each Story as a
linked child issue, and pulls status back into the artifact meta
for the whole team to see progress without leaving GitHub.

## 2. Two flavors

Ask shape determines what `context.assemble` fires. Detected at
step s1 based on the ask + one initial analyze probe.

### 2.1 `enhancement`

The ask extends an existing capability. Examples:

- "Add filtering by tag to the todo panel."
- "Improve the query planner's cost estimation."
- "Migrate the LMDB reader-table sweep from polling to signal-driven."

`context.assemble` for this flavor needs to understand **what
already exists** so the Epic's constraints preserve current
behaviour, existing APIs stay stable, and the Stories describe
DELTAS rather than net-new surface.

s1 fires analyze bundles that:

- `structural-map` on the current capability's module — file tree,
  exports, top importers.
- `symbol.locate` on any API names the ask references — exact
  signatures the Stories will have to be compatible with.
- `data-model.trace` when the ask touches domain entities —
  current fields, subclasses, callers.
- `usage.example` on the top public functions — real callsites so
  the framework can identify who might break.
- `convention.detect` on the target module — the module's naming
  schema + base-class idioms the Stories should follow.

### 2.2 `new-capability`

The ask introduces something the codebase doesn't currently have.
Examples:

- "Support incremental rebuild for the indexer."
- "Add a review-mode workflow for PR triage."
- "Add real-time collaborative editing."

`context.assemble` for this flavor cares about **project shape**:
what stack are we building on, what conventions govern how new
things get added, what adjacent capabilities exist that the new
one should compose with.

s1 fires analyze bundles that:

- `structural-map` on the repo root or the target subsystem —
  where a new module would naturally live.
- `capability-discovery` — a safety check ("is there really
  nothing here already? if there's even something adjacent,
  the ask might actually be enhancement in disguise").
- `convention.detect` on the parent module — so the new
  capability's Stories follow existing conventions instead of
  inventing new ones.
- `manifests.locate` / `infra-inventory` if the ask has an infra
  dimension (deployment, k8s, CI).

### 2.3 Flavor detection

Two-pass detection to avoid brittle inference:

- The intent classifier's `reasoning` field carries a hint
  (`enhancement | new-capability | ambiguous`).
- `context.assemble` runs an initial `capability-discovery` probe.
  If a candidate module scores above a "clear-match" threshold,
  flavor flips to `enhancement` regardless of the classifier hint.
  If not, flavor is what the classifier said, defaulting to
  `new-capability` when the hint was `ambiguous`.

Flavor is recorded in the artifact meta so downstream workflows
can reason about the mode (a plan for an enhancement is a
migration plan; a plan for a new capability is a rollout plan).

## 3. Scope

### `define` IS

- The place where the **Epic** is framed: problem statement,
  non-goals, assumptions, constraints — cited to prior docs,
  code, conventions, or stakeholder statements.
- The place where the **Stories** are enumerated: each with a user
  value statement, acceptance criteria in Given/When/Then form,
  local constraints, dependency edges to other Stories, and a
  rough size estimate (S/M/L/XL) for planning.
- The place where **flavor** (enhancement vs new-capability) is
  determined and cited to the analyze bundles that support it.
- The place where **openQuestions** get surfaced for the human to
  resolve before approval.

### `define` IS NOT (scope-boundary HARD RULE)

- **Never proposes a solution.** No architecture, no API shapes,
  no data models, no algorithm choices, no library selections
  in either Epic or Stories. That's `design`. Stories describe
  BEHAVIOUR ("user can filter todos by tag"), not implementation
  ("add a `tag` column to the todos table").
- **Never enumerates tasks.** No implementation steps within a
  Story, no ordering, no dependencies at the task level. That's
  `plan`.
- **Never writes code.** Any code artifact appearing in a `define`
  output is a synthesizer-rejection condition.
- **Never invents context.** Every constraint must cite a source
  (a prior doc, a codebase convention, a stakeholder statement,
  an analyze bundle). Uncited constraints go to `openQuestions`.

## 4. Interface

### Input

```typescript
interface DefineIntent {
    workflow:  'define';
    focus:     string;                       // one-line restatement of the ask
    rawAsk:    string;                       // user's original words, verbatim
    context: {
        repoPath:      string;
        scope:         'XS' | 'S' | 'M' | 'L' | 'XL';
        openFiles?:    string[];
        recentCommits?: string[];
    };
    flavorHint?: 'enhancement' | 'new-capability' | 'ambiguous';
    priorEpicSlug?: string;                  // set when kicked by a back-flow signal
    reasoning: string;
}
```

### Output

`docs/defines/<epic-slug>.md` (human-readable) +
`docs/defines/<epic-slug>.json` (canonical). Schema in §7.

## 5. Recipe

Four typed steps. Same executor semantics as the analyze
framework's Phase B stepPlan — deterministic steps run inline,
LLM steps pause out to the outer client's model.

```
s1: context.assemble    [deterministic + analyze bundles]  flavor detection + landscape
s2: epic.frame          [LLM]                              Epic-level frame
s3: stories.compose     [LLM]                              N Stories under the Epic
s4: checklist.verify    [LLM]                              forced audit
```

Sub-minute end-to-end for small asks (~2 outer-LLM turns for
s2 + s3, one for s4, plus a few seconds of deterministic analyze
runs in s1). Large Epics with many Stories can push s3 to two or
three LLM turns; the framework handles this via the multi-turn
pause primitive.

## 6. Step details

### s1: `context.assemble` (deterministic, analyze-heavy)

Detects flavor, then fires the appropriate analyze bundles.

Emits `DefineContext`:

```typescript
interface DefineContext {
    flavor:  'enhancement' | 'new-capability';
    flavorEvidence: {                         // why we picked this flavor
        classifierHint: string;
        capabilityProbeVerdict?: 'clear-match' | 'partial-match' | 'unrelated' | 'none';
    };
    priorDefines: {                           // similar prior Epics
        slug: string; epicProblem: string; excerpt: string;
    }[];
    recentCommits: {sha: string; subject: string; date: string}[];
    analyzeBundles: {                         // varies by flavor -- see §2
        kind: string;                         // 'structural-map' | 'symbol.locate' | ...
        focus: string;
        bundle: AnalyzeContextBundle;
    }[];
    priorArtifact?: DefineArtifact;           // when priorEpicSlug is set
    backFlowNotes?: string;                   // human-authored redirect
}
```

Every bundle in `analyzeBundles` is captured verbatim and cited
by ID from s2 / s3 outputs.

### s2: `epic.frame` (LLM)

The outer client's model gets:

- Raw ask + focus.
- Full `DefineContext` (all analyze bundles inline).
- Scope-boundary block (no solutions / no tasks / no code).
- JSON schema:

```typescript
{
    problem: string;                          // one paragraph, describes the PROBLEM not the fix
    nonGoals: {text: string; rationale: string}[];
    assumptions: {
        text: string;
        confidence: 'low' | 'med' | 'high';
        citation: Citation;
    }[];
    constraints: {
        id:   string;                         // 'c1', 'c2', ...
        text: string;
        type: 'convention' | 'contract' | 'invariant' | 'stakeholder';
        source: Citation;                     // must resolve to a real ref
    }[];
}
```

Output surfaces in `outputsById['s2']`.

### s3: `stories.compose` (LLM)

Reads s1 + s2. Model gets everything upstream plus:

- Scope-boundary block (again).
- JSON schema:

```typescript
{
    stories: {
        id:        string;                    // 's1', 's2', ... scoped to the Epic
        title:     string;                    // "As a X I can Y so that Z" ideally
        userValue: string;                    // one paragraph -- WHY it matters
        acceptanceCriteria: {
            id: string;                       // 'ac1', 'ac2', ... scoped to the Story
            given: string;
            when:  string;
            then:  string;
            operationalizes: string[];        // constraint ids from Epic
        }[];
        localConstraints?: {                  // constraints ONLY this Story has
            id: string; text: string;
            type: string; source: Citation;
        }[];
        dependsOn?: string[];                 // other story ids in this Epic
        sizeEstimate?: 'S' | 'M' | 'L' | 'XL';   // rough hint for plan phase
        existingCapabilityRefs?: Citation[];  // FLAVOR=enhancement only: what this
                                              // extends -- cited to s1 analyze bundles
    }[];
}
```

The `existingCapabilityRefs` field is populated only for
`enhancement` flavors — points at the analyze bundle entries in
s1 that describe what each Story is extending. For
`new-capability` flavors that field is absent and Stories
describe purely-new behaviour.

Output surfaces in `outputsById['s3']`.

### s4: `checklist.verify` (LLM, forced)

Framework-driven audit. Model gets s1 / s2 / s3 outputs and the
fixed checklist (§9). Schema:

```typescript
{
    results: {
        itemId:   string;
        verdict:  'passed' | 'missed' | 'partial' | 'ambiguous';
        evidence: Citation;
        notes?:   string;
    }[];
}
```

Framework rules on the results:

- `missed | ambiguous` on any scope-boundary item (`sb1` / `sb2` /
  `sb3`) → **synthesizer hard-fail**; artifact not written.
- `missed | ambiguous` on other items → the item becomes an entry
  in `openQuestions` for human resolution.
- `partial` allowed to pass if the model provides a coherent
  rationale; else downgraded to `missed`.

## 7. Synthesizer

Reads `outputsById['s1'..'s4']` and emits the artifact JSON. HARD
RULES:

- No claim without a step output.
- Every path / doc reference has to appear in some step output.
- Verbatim preservation of `problem`, `assumptions`, `constraints`,
  Story `userValue`, and `acceptanceCriteria` text.
- Any `missed | ambiguous` from `s4` becomes an `openQuestions`
  entry.

## 8. Artifact schema

```typescript
interface DefineArtifact {
    workflow:  'define';
    epicSlug:  string;                        // derived from focus; §10
    system:    string;
    focus:     string;
    summary:   string;

    body: {
        flavor: 'enhancement' | 'new-capability';
        epic: {
            problem:     string;
            nonGoals:    {text: string; rationale: string}[];
            assumptions: {text: string; confidence: 'low'|'med'|'high';
                          citation: Citation}[];
            constraints: {id: string; text: string; type: string;
                          source: Citation}[];
        };
        stories: {
            id:        string;                // 's1', 's2', ...
            title:     string;
            userValue: string;
            acceptanceCriteria: {
                id: string; given: string; when: string; then: string;
                operationalizes: string[];
            }[];
            localConstraints?: {id: string; text: string; type: string;
                                source: Citation}[];
            dependsOn?: string[];
            sizeEstimate?: 'S'|'M'|'L'|'XL';
            existingCapabilityRefs?: Citation[];
        }[];
    };

    citations:      Citation[];               // flat, referenced from body
    openQuestions:  string[];

    handoff: {
        // design consumes ONE Story at a time; it needs both Epic
        // context (for the constraints it inherits) AND the specific
        // Story it's designing.
        epicSummary: {
            problem:    string;
            constraints: DefineArtifact['body']['epic']['constraints'];
            flavor:     'enhancement' | 'new-capability';
        };
        stories: DefineArtifact['body']['stories'];
    };

    meta: {
        workflow:          'define';
        runId:             string;
        model:             'client' | 'ollama' | string;
        toolCalls:         number;
        elapsedMs:         number;
        repoLastIndexedAt: number;
        priorEpicSlug?:    string;
        approvedAt?:       string;             // set by insrc workflow approve
        tracker?: {                            // set by insrc workflow push
            adapter: 'github';                 // GitHub only for now
            epicRef: string;                   // e.g. 'owner/repo#123'
            storyRefs: Record<string, string>; // storyId -> tracker ref
            milestoneRef?: string;             // set when useMilestones=true
            lastSyncedAt?: string;
        };
        schemaVersion: 1;
    };
}

interface Citation {
    kind: 'doc' | 'code' | 'convention' | 'prior-define' | 'stakeholder' | 'analyze-bundle';
    ref:  string;                             // path:line, doc slug, bundle id, etc.
    quotedText?: string;
}
```

## 9. Verification checklist (s4)

Every item is a yes/no question with a required evidence citation.

### Epic-level

| ID | Item |
| :--- | :--- |
| `p1` | Is `epic.problem` a single paragraph, no more? |
| `p2` | Does `epic.problem` state the problem without proposing a solution? |
| `ng1` | Are `nonGoals` distinct from things `epic.problem` already excludes? |
| `ng2` | Does each `nonGoal` have a rationale? |
| `a1` | Is every `assumption` explicitly named (not implied)? |
| `a2` | Does every `assumption.confidence = 'low'` map to an entry in `openQuestions`? |
| `a3` | Does every `assumption` cite what it's based on? |
| `c1` | Does every `constraint` cite a source? |

### Flavor consistency

| ID | Item |
| :--- | :--- |
| `f1` | Does `flavor` match the classifier hint + s1 evidence? Any override cited? |
| `f2` | FLAVOR=enhancement: does at least one Story reference existing capability via `existingCapabilityRefs`? |
| `f3` | FLAVOR=enhancement: do the constraints preserve existing behaviour (e.g. name a specific API or invariant not to break)? |
| `f4` | FLAVOR=new-capability: do the constraints reference project stack / conventions from s1's analyze bundles? |

### Story-level

| ID | Item |
| :--- | :--- |
| `s1a` | Does each Story have a `userValue` paragraph independent of the Epic problem? |
| `s1b` | Is each Story's `title` a real user-story shape ("As a X, I can Y, so that Z" or equivalent)? |
| `s1c` | Are Stories genuinely independent slices (each one deliverable / testable on its own)? |
| `s1d` | Are the Stories collectively sufficient to resolve `epic.problem`? |
| `ac1` | Is every `acceptanceCriteria` in strict Given/When/Then form? |
| `ac2` | Does every criterion's `operationalizes` list reference a real Epic `constraint.id` OR a Story `localConstraint.id`? |
| `ac3` | Does every element of the Story's `userValue` prose map to at least one acceptance criterion? |
| `dep1` | Do all `dependsOn` edges reference real Story ids in the Epic (no dangling refs)? |
| `dep2` | Is the Story dependency graph acyclic? |

### Scope-boundary (hard-fail on missed/ambiguous)

| ID | Item |
| :--- | :--- |
| `sb1` | Does any Story acceptance criterion leak solution language (API shapes, algorithm choices, library names)? |
| `sb2` | Does any Story enumerate tasks (implementation steps) rather than behavior? |
| `sb3` | Does the artifact contain any invented paths / references not in a step output? |

## 10. Slug + storage

### Slug derivation

- `epicSlug` is derived from `focus` at s1: tokenise, drop
  stopwords, keep the 3-4 most distinctive content words,
  hyphenate. Cap at 40 chars.
- Collision on the same slug: append `-2`, `-3` — never overwrite
  silently. The framework prompts the user to confirm the fork
  before proceeding.
- Re-run of the SAME slug (approved artifact exists) is refused
  unless `--reopen <epicSlug>` is passed. Re-run updates in place;
  diff recorded in `-runs/<runId>.jsonl`.

### Storage layout

```
docs/defines/
├── <epic-slug>.md              # human-readable
├── <epic-slug>.json            # canonical
└── <epic-slug>-runs/
    └── <runId>.jsonl           # ephemeral per-run log
```

Story ids (`s1`, `s2`, ...) are scoped to the Epic. When
downstream workflows write their own artifacts, they nest under
the epic-slug directory (meta doc §8), so a whole Epic's paper
trail lives at `docs/defines/<epic-slug>.md`,
`docs/designs/<epic-slug>/*.md`, `plans/<epic-slug>/*.md`,
`docs/test-runs/<epic-slug>/*.md`.

## 11. Interaction

### Approval

```
insrc workflow approve docs/defines/<epic-slug>.md
```

Sets `approvedAt` in the JSON meta. Optionally accepts inline
`--notes` that get attached to the artifact.

### Rejection

```
insrc workflow reject docs/defines/<epic-slug>.md --notes '<why>'
```

Marks rejected. Downstream workflows treat it as absent. User can
re-run `define --reopen <epicSlug>` to iterate.

### Tracker push (post-approval)

```
insrc workflow push <epic-slug>
```

Coarse handoff to the LLM (meta doc §7.4;
`workflow-implementation.md` §6.F.1 for the conventions the
LLM applies). The framework loads the approved artifact + the
resolved GitHub config and hands both to the LLM with the push
prompt; the LLM invokes `gh` directly to create:

- One parent Epic issue labelled `insrc:epic` + `epic:<slug>`
  containing the Epic body as its description. Body includes a
  GitHub task-list linking to each child Story issue.
- One child Story issue per Story labelled `insrc:story` +
  `epic:<slug>`, with `Epic: #<N>` back-reference in the body.
  Story's `userValue` + acceptance criteria become the issue body.

A `checklist.verify` step then re-reads the LLM's returned refs
against the conventions and reopens execute on drift. Updates
the artifact meta with the tracker refs so `insrc workflow sync
<epic-slug>` can pull status later. No `--tracker` flag — GitHub
is the only supported target.

### Tracker sync

```
insrc workflow sync <epic-slug>
```

Same coarse-handoff shape. The framework loads the artifact's
existing `meta.tracker` refs; the LLM reads current issue state
+ labels from GitHub via `gh issue view` and translates them
per the status-mapping table (§6.F.1). Result is written into
`meta.tracker.lastSyncedAt` and per-Story status fields.
Read-only — the sync prompt explicitly forbids the LLM from
editing GitHub issues (that would fight the team's tracker
workflow).

### Back-flow inbound

Downstream (`design`, `plan`, `build`, `test`) can emit a
back-flow signal targeting `define` when they discover the Epic
or a Story was framed wrong. The framework inserts
`priorEpicSlug` + `backFlowNotes` into the next `define` run's
intent. `s1` reads both, threads them into `s2` / `s3`'s prompts.

### Back-flow outbound

`define` has no upstream. If the raw ask itself is unclear, that's
an `openQuestions` entry for the human to resolve before approval.

## 12. Non-negotiables

Inherited from the meta framework:

- Accuracy is primary; cost is least priority.
- No parallel LLM calls (`s2` / `s3` / `s4` strictly sequential).
- Structural reference goes trailing in every prompt.
- 22-char server-side state tokens; no round-tripping blobs.
- Scope-boundary HARD RULE — enforced in prompts AND in the s4
  checklist.

## 13. What we are NOT doing (yet)

- **Not shipping a UI for approval / push / sync.** CLI + MCP
  tool calls in Phase F.
- **Not auto-forking slugs on collision.** Human confirms
  synchronously.
- **Not auto-inferring stakeholders.** If a constraint's source is
  a stakeholder, the human names them.
- **Not shipping any tracker other than GitHub.** No adapter
  interface; direct integration only.
- **Not implementing bidirectional tracker sync.** `push` and
  `sync` are one-way each. GitHub → artifact updates are pulled
  on demand; artifact → GitHub updates require an explicit
  `push --update` (deferred).

## 14. Open questions

- **When flavor is `ambiguous` after s1, do we ask the user or
  default to `new-capability`?** Current lean: default to
  `new-capability` and record the ambiguity in `openQuestions` so
  the human can override at approval.
- **Should we cap Stories per Epic?** Deferred — probably yes
  (~10) but let empirical use say. Very large Epics may want to
  be split at define time.
- **How do we handle a re-`define` that ADDS Stories to an
  approved Epic where some Stories are already `in-progress` in
  the tracker?** Migration story matters. Deferred to Phase B.
- **How does `insrc workflow push` handle a repo whose GitHub
  remote isn't the intended tracker target?** Config in
  `~/.insrc/github.json` per-repo. Details in Phase F.
