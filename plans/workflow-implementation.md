# Workflow framework — implementation plan

Plan doc. Status: **implementation plan**. Parents:

- [`plans/meta-workflow-framework.md`](meta-workflow-framework.md) — architecture
- [`plans/workflow-define.md`](workflow-define.md) — `define` workflow
- [`plans/workflow-design.md`](workflow-design.md) — `design.epic` + `design.story`

This doc breaks the framework down into shippable phases. Each
phase is 2-4 days of work, produces something demonstrable
end-to-end, and gates the next phase. The plan covers `define`,
`design`, and their supporting infrastructure — `plan`, `build`,
`test` are deferred until their own design docs land.

## 1. Scope

**In scope (this plan):**

- Framework skeleton: intent classifier extension, executor, step
  runner registry, synthesizer scaffolding, multi-turn MCP tool
  (`insrc_workflow_step`), storage layout, CLI (`insrc workflow *`).
- `define` workflow end-to-end (context.assemble +
  epic.frame + stories.compose + checklist.verify).
- `design.epic` (HLD) end-to-end (alternatives.enumerate +
  alternatives.judge + framework.write + rollout.overview +
  checklist.verify).
- `design.story` (LLD) end-to-end (context.assemble +
  alternatives + contract.detail + error.paths + test.strategy +
  migration + checklist.verify).
- HLD amendments: proposal + approval + apply + staleness detection.
- GitHub tracker: artificial Epic / Story hierarchy imposed on top
  of GitHub Issues via labels + linked task lists + comments.
  Push, sync, and design-artifact posting only.
- Live tests through Claude Code and Codex CLI.

GitHub is the **only** tracker. There is no tracker abstraction
layer to be reused for Jira / Linear — the shape of the artificial
hierarchy is GitHub-specific (task-list back-references, label
conventions) and other trackers with native Epic / Story primitives
would be modelled differently. When / if we ever add another
tracker, we introduce the abstraction then, not now.

**Out of scope (later phases, own design docs first):**

- `plan` workflow.
- `build` workflow (coarse handoff — meta doc §3.10).
- `test` workflow.
- Any tracker other than GitHub Issues.
- Bidirectional tracker sync (artifact → tracker on update, beyond
  the initial `push` + design-comment posts).
- Web UI / IDE pane for artifact approval.
- Amendment support for artifacts other than HLD.
- Pushing Tasks to the tracker (Tasks live in the Story issue body
  as a checkbox list until `plan` workflow is designed).

## 2. Design principles (inherited)

Same non-negotiables the analyze framework operates under:

- **Accuracy is primary; cost is least priority.** Never skip
  steps to save turns.
- **No parallel LLM calls.** All step execution is sequential
  `for … of` with sequential awaits.
- **Structural reference goes trailing.** Every LLM prompt puts
  schemas / catalogs / prior outputs at the tail.
- **State tokens, not blobs.** Multi-turn state stays server-side
  keyed by a 22-char token; never round-trip payloads through the
  outer LLM.
- **Scope-boundary HARD RULE.** Every workflow's synthesizer +
  checklist enforces its own boundary.
- **Citation grounding.** Every claim in every artifact points at
  a step output or an analyze bundle.

## 3. Reusable infrastructure from `analyze/`

We do NOT rebuild these. The workflow framework consumes them:

| Reused | Source | How the workflow framework uses it |
| :--- | :--- | :--- |
| Multi-turn state store | [`mcp/analyze-step/state-store.ts`](../src/insrc/mcp/analyze-step/state-store.ts) | Copy the pattern (LRU + TTL + 22-char tokens) into `mcp/workflow-step/state-store.ts`. Same contract. |
| `stepPlan` executor pattern | [`analyze/explore/executor.ts`](../src/insrc/analyze/explore/executor.ts) | Copy the pause/resume shape for workflow step execution. Placeholder substitution (`$s1.<accessor>`) works the same way. |
| Structured-output retry + ajv | [`agent/providers/structured-output.ts`](../src/insrc/agent/providers/structured-output.ts) | Reuse `withStructuredRetry` and `validateAgainstSchema` verbatim for step output validation. |
| MCP server registration | [`mcp/server.ts`](../src/insrc/mcp/server.ts) | Add a second tool (`insrc_workflow_step`) alongside `insrc_analyze_step`. Same server, same subprocess. |
| Analyze framework | [`analyze/`](../src/insrc/analyze/) | Every workflow's `context.assemble` step calls `analyze.query` (a thin wrapper around `insrc_analyze_step`) to build the citation-grounded context bundle. |
| Repo ignore filter | [`analyze/context/repo-ignore-filter.ts`](../src/insrc/analyze/context/repo-ignore-filter.ts) | Any file-writing step reuses this to avoid writing under gitignored paths. |
| Config surface | [`config/analyze.ts`](../src/insrc/config/analyze.ts) | Extend for workflow-specific config (shaper choice, retry counts). |
| CLI framework (commander) | [`cli/index.ts`](../src/insrc/cli/index.ts) | Add `insrc workflow` command group. |

## 4. New infrastructure

| New | Where | Notes |
| :--- | :--- | :--- |
| Types | `workflow/types.ts` | `WorkflowIntent`, `WorkflowPlan`, `WorkflowStep`, `StepRunner`, `StepRunnerContext`, artifact base types. |
| Step runner registry | `workflow/runners/` | One subdir per workflow. Registered at boot via `registerWorkflowRunners()`. |
| Executor | `workflow/executor.ts` | Sequential loop; placeholder substitution; multi-turn pause. |
| Synthesizer scaffolding | `workflow/synthesizer.ts` | JSON → MD renderer; citation validator; scope-boundary check. |
| Slug derivation | `workflow/slug.ts` | Tokenise focus → keep distinctive words → hyphenate → collision handling. |
| Artifact validators | `workflow/artifacts/` | Per-workflow JSON schemas + ajv validators. |
| Storage | `workflow/storage.ts` | File I/O for `docs/defines`, `docs/designs`, `plans/`, `workflow-runs/`, `_hld-amendments/`. Atomic writes (write to temp + rename). |
| Amendment machinery | `workflow/amendments/` | Types, on-disk store, applier, effective-HLD computation, staleness detection. |
| Gate + approval | `workflow/gates.ts` | Approved-artifact reads, back-flow signal handling, ack-stale overrides. |
| GitHub prompts | `prompts/workflow/tracker/` | Prompt + schema files. The framework does NOT wrap `gh`; the LLM invokes `gh` directly. See §6.F. |
| Config surface | `workflow/config.ts` | `~/.insrc/github.json` loader, per-workflow retry limits, model overrides. |
| MCP tool | `mcp/workflow-step/` | `insrc_workflow_step` handler mirroring `insrc_analyze_step`. |
| CLI | `cli/commands/workflow.ts` | `insrc workflow start | approve | reject | list | status | amend | sync | push | ack-stale`. |
| Prompts | `prompts/workflow/` | Per-step-type LLM prompts. |
| Tests | `workflow/__tests__/`, `mcp/workflow-step/__tests__/` | Unit + integration + a live smoke test per phase. |
| Documentation | `docs/workflow.md` | User-facing guide once the framework is usable end-to-end (Phase E). |

## 5. Repository layout after Phase F

```
src/insrc/
├── workflow/
│   ├── types.ts                       # shared types
│   ├── executor.ts                    # sequential + pause/resume
│   ├── synthesizer.ts                 # JSON → MD, boundary check
│   ├── slug.ts                        # slug derivation
│   ├── storage.ts                     # file I/O, atomic writes
│   ├── gates.ts                       # approval + back-flow + ack-stale
│   ├── config.ts                      # github.json + workflow config
│   ├── runners/
│   │   ├── define/                    # define step runners
│   │   ├── design-epic/               # HLD step runners
│   │   ├── design-story/              # LLD step runners
│   │   └── shared/                    # analyze.query, checklist.verify
│   ├── artifacts/
│   │   ├── define.ts                  # DefineArtifact schema + validator
│   │   ├── hld.ts                     # HldArtifact schema + validator
│   │   ├── lld.ts                     # LldArtifact schema + validator
│   │   └── shared.ts                  # Citation, Alternative, etc.
│   ├── amendments/
│   │   ├── types.ts                   # Amendment union + type schemas
│   │   ├── store.ts                   # on-disk read/write of AmendmentRecord
│   │   ├── applier.ts                 # apply Amendment[] to HLD base
│   │   ├── effective.ts               # getEffectiveHld + hash
│   │   └── staleness.ts               # LLD staleness scan
│   ├── runners/
│   │   └── tracker/                   # thin coarse-handoff runners
│   │       ├── push.ts                # loads artifact + config, hands to LLM
│   │       ├── sync.ts
│   │       └── post.ts
│   └── __tests__/                     # unit + integration
├── mcp/
│   └── workflow-step/
│       ├── handler.ts                 # dispatch on phase
│       ├── phases/
│       │   ├── start.ts
│       │   ├── plan.ts                # produces the WorkflowPlan
│       │   ├── step.ts                # per-step LLM turn pause/resume
│       │   └── synthesize.ts          # final artifact emission
│       ├── state.ts                   # server-side state schema
│       ├── state-store.ts             # 22-char tokens + LRU + TTL
│       └── __tests__/
├── cli/
│   └── commands/
│       └── workflow.ts                # commander subcommands
└── prompts/
    └── workflow/
        ├── define/                    # per-step prompt files
        ├── design-epic/
        ├── design-story/
        └── tracker/                   # push / sync / post prompts + schemas

~/.insrc/
├── github.json                        # GitHub tracker config
└── workflow-runs/                     # per-run logs
    └── <epic-slug>/
        └── <workflow>-<runId>.jsonl
```

## 6. Phases

Each phase's deliverable is shippable in isolation. Each ends with
a live-test demonstration and a commit range on `release/1.96`.

### Phase A — Framework skeleton (~3-4 days)

**Goal**: prove the skeleton runs end-to-end with a stub workflow
so subsequent phases are pure implementations against a known-good
frame.

**Deliverables**:

- `workflow/types.ts` — full type surface (WorkflowIntent,
  WorkflowPlan, WorkflowStep, StepRunner, StepRunnerContext,
  ArtifactBase, Citation).
- `workflow/executor.ts` — sequential loop + placeholder
  substitution + pause/resume. Ports the analyze `stepPlan`
  pattern; no analyze-specific code.
- `workflow/synthesizer.ts` — JSON → MD renderer, citation
  validator, scope-boundary check.
- `workflow/storage.ts` — atomic file writers under `docs/`,
  `plans/`, `~/.insrc/workflow-runs/`.
- `workflow/slug.ts` — slug derivation + collision detection
  (returns the collision info; caller decides to prompt).
- `mcp/workflow-step/` — `insrc_workflow_step` MCP tool with
  `start | plan | step | synthesize` phases. State store copies
  `mcp/analyze-step/state-store.ts` verbatim (module-local; do
  not share with analyze's store since state shape differs).
- `cli/commands/workflow.ts` — commander wiring; `insrc workflow
  start <workflow> --focus '<text>'` invokes the MCP tool via the
  daemon socket.
- **Stub workflow** `workflow/runners/stub/`: three steps
  (`echo.a`, `echo.b`, `echo.c`) that just echo their params and
  demonstrate placeholder substitution. Emits a `StubArtifact`
  with citations pointing to the echoed values.

**Acceptance criteria**:

- Unit tests: executor, storage, slug (round-trip + collision +
  ignore-filter), state-store round-trip, synthesizer boundary
  check.
- MCP tool test: full 4-phase loop with the stub workflow.
- Live smoke via Claude Code: `insrc_workflow_step` produces the
  `StubArtifact` and writes `docs/stub/<slug>.{md,json}`.
- The `insrc workflow` CLI is discoverable via `insrc --help`.

**Non-goals for Phase A**:

- No real workflow instances (define / design come next).
- No amendments.
- No tracker integration.
- No approval / rejection CLI (just the emit path).

---

### Phase B — `define` workflow (~3-4 days)

**Goal**: the first real workflow. Emits a valid Epic + Stories
artifact for a real user ask, cited to analyze bundles from the
current repo.

**Deliverables**:

- `workflow/runners/define/` — 4 step runners:
  - `context.assemble` (deterministic; wraps `insrc_analyze_step`
    calls with the right focuses per flavor).
  - `epic.frame` (LLM turn; ajv-validated schema).
  - `stories.compose` (LLM turn; ajv-validated schema).
  - `checklist.verify` (LLM turn; framework picks the checklist).
- `workflow/artifacts/define.ts` — DefineArtifact schema +
  validator; renders to `docs/defines/<epic-slug>.md`.
- `workflow/runners/shared/analyze-query.ts` — thin wrapper that
  fires an `insrc_analyze_step` from within a workflow step and
  captures the bundle verbatim.
- Flavor detection: `workflow/runners/define/flavor.ts` runs the
  two-pass detection (classifier hint + capability-discovery
  probe).
- Prompt files under `prompts/workflow/define/`.
- CLI: `insrc workflow start define --focus '<ask>'`,
  `insrc workflow approve`, `insrc workflow reject`,
  `insrc workflow list defines`.
- Slug collision handling (interactive prompt).

**Acceptance criteria**:

- Unit tests: each step's parseParams + schema validation +
  boundary checks.
- Integration test: full 4-step run against a fixture repo,
  produces a valid DefineArtifact.
- Live smoke via Claude Code on the insrc-ide repo itself
  (dogfooding): "Add a `daemon rebuild-vectors` CLI command"
  produces an Epic + 2-3 Stories with citations to real analyze
  bundles and passes all checklist items.
- Live smoke via Codex CLI on the same ask; verifies both
  clients drive the multi-turn loop.
- Approval flow: `insrc workflow approve
  docs/defines/<slug>.md` sets `approvedAt`; downstream would
  refuse without it.

**Non-goals for Phase B**:

- No HLD / LLD yet.
- No back-flow inbound handling (there IS no upstream).
- No tracker push.

---

### Phase C — HLD (`design.epic`) (~4-5 days)

**Goal**: emit an HLD for the Epic produced in Phase B.

**Deliverables**:

- `workflow/runners/design-epic/` — 6 step runners:
  - `context.assemble` (fires whole-Epic analyze bundles per §6.1
    of `workflow-design.md`).
  - `alternatives.enumerate` (LLM).
  - `alternatives.judge` (LLM).
  - `framework.write` (LLM; the big one — chosen framework +
    shared contracts + Story boundaries in one turn).
  - `rollout.overview` (LLM).
  - `checklist.verify` (LLM; HLD checklist §9.1).
- `workflow/artifacts/hld.ts` — HldArtifact schema + validator.
- Storage: `docs/designs/<epic-slug>/_hld.{md,json}` +
  `_hld-runs/<runId>.jsonl`.
- Gate: HLD refuses to run if Epic isn't approved.
- Prompt files under `prompts/workflow/design-epic/`.
- CLI: `insrc workflow start design.epic --epic <slug>`.

**Acceptance criteria**:

- Unit tests per step, plus the `sharedContracts.interfaceSketch`
  boundary check (no function bodies).
- Integration test: given the Phase B fixture Epic, produce a
  valid HldArtifact.
- Live smoke via Claude Code on the Phase B dogfood Epic:
  produces an HLD naming shared contracts, Story boundaries, and
  a rollout plan. All checklist items pass.
- Gate test: `insrc workflow start design.epic` refuses if the
  Epic isn't approved.

**Non-goals for Phase C**:

- No LLDs.
- No amendments.

---

### Phase D — LLD (`design.story`) (~4-5 days)

**Goal**: emit an LLD for one Story from the Phase C HLD.

**Deliverables**:

- `workflow/runners/design-story/` — 8 step runners (7 always +
  1 conditional):
  - `context.assemble` (Story-scoped analyze bundles + HLD
    context slice extraction).
  - `alternatives.enumerate`.
  - `alternatives.judge`.
  - `contract.detail`.
  - `error.paths`.
  - `test.strategy`.
  - `migration.write` (runs only when Epic's flavor is
    `enhancement`).
  - `checklist.verify` (LLD checklist §9.2).
- `workflow/artifacts/lld.ts` — LldArtifact schema + validator.
  `meta.hldBaseRunId` + `meta.hldEffectiveHash` +
  `meta.hldAmendmentsApplied` fields populated at synthesize
  time.
- HLD context slice extractor: `workflow/runners/design-story/
  hld-slice.ts`. Deterministic projection of HLD to just the
  Story-relevant pieces.
- Storage: `docs/designs/<epic-slug>/<story-id>.{md,json}` +
  `<story-id>-runs/<runId>.jsonl`.
- Gate: LLD refuses to run if HLD isn't approved.
- Prompt files.
- CLI: `insrc workflow start design.story --epic <slug> --story <id>`.

**Acceptance criteria**:

- Unit tests per step + hld-slice extractor + migration
  conditional.
- Integration test: given Phase C HLD, produce a valid LLD for
  one Story.
- Live smoke via Claude Code: an LLD for one Story from the
  dogfood Epic. Passes all checklist items. Every named API
  cites an analyze bundle or an HLD sharedContract.
- Concurrent LLDs: fire two `design.story` invocations for
  different Stories in parallel; both succeed; both anchored to
  the same `hldEffectiveHash`.
- Gate test: refuses without approved HLD.

**Non-goals for Phase D**:

- No amendments.
- No tracker integration.

---

### Phase E — Amendments (~3-4 days)

**Goal**: HLD is a live reference doc; downstream discoveries
land as typed amendments.

**Deliverables**:

- `workflow/amendments/` — types, store, applier, effective
  computation, staleness detection.
- Downstream step-output extension: LLD's `contract.detail`,
  `error.paths`, `test.strategy` schemas each get an optional
  `hld.amendmentProposal?: Amendment` field. When present, the
  framework writes an AmendmentRecord alongside the LLD output.
- Ten amendment type schemas + applier per type:
  `sharedContract.{fieldAdd,fieldRemove,rename,methodAdd}`,
  `storyBoundary.{reassignOwnership,addConsumer}`,
  `nonFunctional.retarget`,
  `rollout.{reorder,splitPhase,mergePhases}`.
- Applier invariants per type (e.g. `rollout.splitPhase`
  verifies union of new phases' stories == original phase's
  stories).
- `insrc workflow amend` subcommands: `--list`, `--show`,
  `--approve`, `--reject`, `--notes`.
- `insrc workflow ack-stale <path> --reason` for escape-hatch
  override.
- `insrc workflow status <epic-slug>`: shows pending amendments,
  stale LLDs with reasons.
- HldArtifact.meta.amendments append on approval.
- LldArtifact staleness marker: run scans on
  `insrc workflow status`.

**Acceptance criteria**:

- Unit tests: each amendment type applier + invariants; effective
  hash determinism (same inputs → same hash); staleness scan;
  reject/approve state transitions.
- Integration test: fire a Phase D LLD that emits an amendment
  proposal; approve it; verify the effective HLD reflects the
  change; verify the LLD is now stale until re-run.
- Live smoke: dogfood — during an LLD run for the Phase C Epic,
  the LLM discovers HLD's shared contract needs a field.
  Amendment proposal lands; human approves via CLI; effective
  HLD updates; a second LLD (for another Story) starts fresh
  with the updated effective HLD.
- Immutability test: approved amendments cannot be edited;
  rejected amendment ids cannot be reused.

**Non-goals for Phase E**:

- No tracker sync of amendments.
- No auto-approve trivial amendments.
- No amendments on artifacts other than HLD.

---

### Phase F — GitHub tracker (~1-2 days)

**Goal**: after Epic approval, push Epic + Stories to GitHub
Issues; sync status back; attach HLD / LLD as issue comments.

**The framework does NOT wrap `gh`.** Same coarse-handoff shape
as `build` (meta doc §3.10): the framework loads the artifact,
loads the GitHub config, hands both to the LLM with a prompt
that spells out the artificial Epic / Story conventions (see
§6.F.1), and lets the LLM do the actual `gh` invocations. The
LLM already knows `gh`. We supply intent, conventions, and a
verification checklist — nothing else.

Runners are three-step coarse handoffs:

1. **`context.assemble`** (deterministic) — reads the artifact +
   the resolved GitHub config for this repo (or auto-detects
   `owner/repo` from the git remote if no config entry exists) +
   any prior `tracker` meta already on the artifact. Emits a
   compact bundle for the LLM.
2. **`execute`** (LLM turn) — the LLM reads the bundle + the
   prompt + the artificial-hierarchy conventions, then calls
   `gh` however it sees fit. Its structured return value is the
   set of tracker refs to write back (epicRef, storyRefs,
   milestoneRef, commentIds, etc.) plus a `notes` field for
   anything the human should see.
3. **`checklist.verify`** (LLM turn) — a second LLM turn that
   reads the refs the execute step produced, re-checks against
   the conventions ("Is each Story labelled `insrc:story` and
   `epic:<slug>`? Does the Epic body's task list reference all
   Story issues?"). Failures reopen the execute step (up to N
   retries).

**Deliverables**:

- `workflow/runners/tracker/push.ts`, `sync.ts`, `post.ts` —
  the three coarse-handoff runners. Each is small (~50 lines);
  the real work is in the prompt.
- `prompts/workflow/tracker/push.md` — the push prompt.
  Documents the four conventions (labels, task-list, back-ref,
  optional milestone), the input artifact shape, the required
  output schema (refs to write back). Includes explicit
  scope-boundary lines: "only touch issues we create; never
  delete or rename existing labels; never fabricate issue
  numbers." Prompt is authoritative for the LLM's behaviour.
- `prompts/workflow/tracker/sync.md` — sync prompt. Documents
  the status-mapping table (§6.F.1) and how to translate issue
  state + labels into artifact status.
- `prompts/workflow/tracker/post.md` — comment posting prompt.
  Documents the required comment body shape for HLD / LLD /
  amendment types.
- `prompts/workflow/tracker/checklist.md` — verification
  checklist prompt used by step 3 of each runner.
- Output schemas: `workflow/artifacts/tracker.ts` — zod / ajv
  schemas for what the LLM must return from execute (refs +
  notes) and from verify (pass / fail + failed items).
- Config: `~/.insrc/github.json` with per-repo mappings +
  `default` fallback. Structure:
  ```json
  {
    "default": {
      "owner": "subhagho",
      "repo": "insrc-ide",
      "epicLabel": "insrc:epic",
      "storyLabel": "insrc:story",
      "useMilestones": true
    },
    "repos": {
      "/Users/subhagho/work/projects/insors/insrc-ide": { ... }
    }
  }
  ```
  Loader in `workflow/config.ts`. Auto-fallback to `git remote
  get-url origin` if no per-repo entry. `insrc workflow
  gh-config` prints the resolved config.
- CLI: `insrc workflow push <epic-slug>`,
  `insrc workflow sync <epic-slug>`,
  `insrc workflow post <path-to-design-artifact>`.
  No `--tracker` flag — GitHub is the only option. `--force`
  on push tells the LLM to overwrite (edit) existing issue
  bodies rather than warn.
- Cleanup: `insrc workflow unlink <epic-slug>` clears tracker
  meta from artifact locally. Does NOT touch GitHub issues —
  destructive tracker operations are never our job.

**We deliberately do NOT ship**:

- A `gh` wrapper module. The LLM invokes `gh` directly with
  whatever subcommands it deems appropriate.
- Auth handling. `gh` must be installed + authenticated
  (`gh auth login`). We never store tokens, never hit the REST
  API directly, never prompt for credentials. The prompt
  instructs the LLM to run `gh auth status` first and abort
  cleanly on any failure — that's where auth checking lives.
- Retry logic for rate-limits / partial failures. The LLM
  handles those the same way it handles them in any other
  workflow. The checklist step catches anything it missed.

**Acceptance criteria**:

- Unit tests on the deterministic bits: config resolution
  (per-repo entry vs git-remote fallback), prompt assembly,
  output schema validation, artifact-meta merge.
- Live smoke: push the Phase B dogfood Epic + Stories to a real
  GitHub repo via Claude Code:
  - LLM invokes `gh` via its own tool loop.
  - Epic issue exists with `insrc:epic` label + `epic:<slug>`
    label + task list referencing each Story issue.
  - Each Story issue has `insrc:story` + `epic:<slug>` labels
    and `Epic: #N` back-ref in body.
  - Artifact meta updated with the refs.
  - Checklist step passes.
- Live smoke via Codex CLI on the same push: verifies the
  prompt is client-agnostic.
- Live smoke: sync pulls a manually-applied `insrc:in-progress`
  label into artifact meta.
- Live smoke: post an HLD comment onto the Epic issue + an LLD
  comment onto a Story issue.
- Failure mode: run push in a workspace where `gh auth status`
  fails; the LLM aborts cleanly with a message pointing at
  `gh auth login`. Framework surfaces this as a user-visible
  error, not a crash.

**Non-goals for Phase F**:

- No bidirectional sync (local changes → tracker).
- No webhook / polling; sync is manual.
- No Task push (Tasks stay in Story issue body as checkbox
  list until the `plan` workflow lands).
- No auto-close: closing a Story issue via `gh` doesn't close
  the artifact and vice versa — status only reflects.

#### 6.F.1 GitHub mapping — the artificial Epic / Story hierarchy

This section is the source-of-truth for what the prompts under
`prompts/workflow/tracker/` tell the LLM. GitHub Issues only
knows `issue`, `comment`, `label`, `milestone` — there's no
native parent/child relationship, no Epic type, no Story type.
Everything is an Issue. Four conventions impose the hierarchy:

**Convention 1 — labels identify type + Epic membership**

Every issue the LLM creates gets exactly two structural labels:

| Label | Meaning | Applied to |
| :--- | :--- | :--- |
| `insrc:epic` | This issue is an Epic | Epic issue only |
| `insrc:story` | This issue is a Story | Story issues only |
| `epic:<slug>` | Belongs to Epic `<slug>` | Epic + all its Stories |

Two optional status labels:

| Label | Meaning |
| :--- | :--- |
| `insrc:in-progress` | Story is being worked (adds nuance over open) |
| `insrc:blocked` | Story is blocked (adds nuance over open) |

The push prompt tells the LLM to create these labels
idempotently on first push (`gh label create --force` or
equivalent) so users don't need to pre-create them.

**Convention 2 — task-list linkage on the Epic issue**

The Epic issue's body includes a GitHub task-list of Story
references:

```markdown
## Stories

- [ ] #123 Extract job queue into its own module
- [ ] #124 Wire dependency-closure lookups through queue
- [ ] #125 Migrate existing callers
```

GitHub renders this as clickable child links AND automatically
updates the checkboxes when the referenced issues close. This is
the closest GitHub gets to a native parent/child — we leverage it
for free progress tracking. The push prompt tells the LLM to
create Story issues FIRST, then rewrite the Epic body with the
task list (since it needs the Story issue numbers).

**Convention 3 — back-reference in Story body**

Every Story issue's body starts with:

```markdown
**Epic:** #N — <epic-title>
```

Which GitHub renders as a two-way cross-link (the Epic issue's
sidebar will show the Story as a "referenced by" entry).

**Convention 4 — milestone per Epic (optional)**

When `useMilestones: true` in config, the prompt instructs the
LLM to create a milestone named `<epic-slug>` and attach the
Epic issue + all its Story issues to it. This gives users the
GitHub milestone burndown UI for free. Off by default
(opinionated: milestones are user-workspace territory; we don't
want to auto-clutter their milestone list).

**Status mapping — GitHub → artifact**

The sync prompt tells the LLM to apply this translation:

| Issue state | Applied label | Artifact status |
| :--- | :--- | :--- |
| open | — | `open` |
| open | `insrc:in-progress` | `in-progress` |
| open | `insrc:blocked` | `blocked` |
| closed | — | `closed` |
| closed | any | `closed` (closed overrides) |

**Design docs → comments**

HLD and LLD artifacts don't become issues — they attach as
comments. The post prompt spells out the required comment
shape:

- HLD → comment on the Epic issue. Comment includes:
  - Effective HLD hash + timestamp
  - Chosen framework name (from HLD `chosenFramework.name`)
  - Bulleted rollout phases (from `rollout[]`)
  - Link to `docs/designs/<epic-slug>/_hld.md`
- LLD → comment on the corresponding Story issue. Includes:
  - `hldEffectiveHash` the LLD anchored to (so reviewers can
    check freshness)
  - Chosen alternative name
  - Test-strategy summary (from `testStrategy.summary`)
  - Link to `docs/designs/<epic-slug>/<story-id>.md`
- Amendment approval → comment on the Epic issue, one per
  approved amendment. Header: "Amendment approved: `<type>`".
  Body includes the diff summary + updated effective HLD hash
  + notes if any LLDs are now stale.

**What we deliberately tell the LLM NOT to use**

The push prompt explicitly forbids:

- **Sub-issues** (GitHub's newer sub-issue feature). Only
  available on Projects-enabled repos with a 100-child cap.
- **Projects (v2)**. Workspace-scoped, requires OAuth scopes
  many users won't have granted.
- **Issue types** (recently added "task/bug/feature/etc"). Not
  yet consistent across repos and orgs; labels are the portable
  primitive.
- **Cross-repo Epics** (Epic in one repo, Stories in another).
  Deferred as a scope-boundary; the LLM must fail cleanly if
  the artifact somehow references cross-repo work.

---

### Phase G — End-to-end integration + polish (~2-3 days)

**Goal**: everything wired together, dogfooded, documented.

**Deliverables**:

- End-to-end wiring: `insrc workflow chain <epic-slug>` runs
  define → design.epic → design.story for each Story
  sequentially, prompting for approval at each gate. Optional
  `--auto-approve` for scripted use in tests.
- `docs/workflow.md` — user guide. Prerequisites, install (no
  new deps beyond what's already there), CLI reference, MCP
  registration nudges (steering block additions for `CLAUDE.md`
  and `AGENTS.md`), example end-to-end run.
- Extension to the analyzer's steering block in
  `mcp/steering-template.md` telling clients when to reach for
  workflows vs analyze.
- Live tests:
  - Dogfood: run the whole chain on a plausible insrc-ide ask
    (e.g. "Add rate limiting to the RPC layer"). All artifacts
    produced; all approvals granted; tracker push succeeds.
  - Codex-mode smoke on AFM: same chain via Codex CLI.
- Metrics: extend the daemon's `daemon.status` output to include
  workflow-run counts (active / stale / total).
- Cleanup of any TODOs left in earlier phases.

**Acceptance criteria**:

- Full end-to-end dogfood run succeeds on the insrc-ide repo.
- Full end-to-end dogfood run succeeds on AFM.
- `docs/workflow.md` review — a fresh reader can install and run
  the workflow with just the doc.
- No unused code paths left over from stubs.

## 7. Cross-cutting concerns

### 7.1 Testing strategy

Every phase produces:

- **Unit tests** in `<module>/__tests__/`. Fast, no LLM. Cover
  parseParams, schema validation, applier invariants, hash
  determinism, gate enforcement.
- **Integration tests** using a fixture repo committed under
  `src/insrc/workflow/__tests__/fixtures/`. Run against a
  hermetic LMDB + Lance store in a tmp dir. LLM-shaped steps
  use a mock stepRunner registered by the test harness.
- **Live smoke tests** gated behind `INSRC_LIVE_TESTS=1`. Talk
  to a real Ollama / Claude Code MCP session; produce real
  artifacts under a scratch epicSlug.

No parallel LLM calls in any test — matches the framework rule.

### 7.2 Multi-turn MCP protocol

`insrc_workflow_step` mirrors `insrc_analyze_step`'s phases with
one addition:

- `start` — client emits the WorkflowIntent; server returns
  `emit_plan` with the decomposer prompt + schema.
- `plan` — client emits the WorkflowPlan; server pre-checks the
  plan against the workflow's step catalog + returns `emit_step`
  for the first LLM-shaped step (or `emit_synthesize` if all
  steps are deterministic).
- `step` — client emits the LLM step output; server dispatches
  the corresponding finalize + returns `emit_step` for the next
  LLM step or `emit_synthesize`.
- `synthesize` — client emits the synthesizer output; server
  validates against the artifact schema, writes the artifact
  to disk, returns `done` with the artifact path.

State token is server-side (22-char, LRU + TTL) — same store
shape as analyze, module-local per the design principle "no
shared mutable state between subsystems".

### 7.3 Artifact validation

Every artifact goes through three checks before being written:

1. **JSON schema** via ajv (workflow-specific).
2. **Citation grounding**: every claim in body references a
   citation id that exists in `citations[]`; every citation ref
   resolves to a step output.
3. **Scope-boundary**: workflow-specific boundary check
   (implemented in `synthesizer.ts` + fine-tuned per workflow).

Failure at any check aborts the write and re-emits `emit_step`
with a corrective note (same pattern as analyze's structured-
output retry, up to 3 attempts).

### 7.4 File I/O safety

Every write:

- Is atomic: write to `<path>.tmp` + `rename`.
- Respects `.gitignore` (via the repo ignore filter).
- Refuses to overwrite an approved artifact unless `--reopen` is
  passed or the caller is the amendment applier writing to a
  meta field.
- Records the write in the workflow-runs jsonl log with a
  timestamp + step id.

### 7.5 Observability

Extend the existing pino logger to add a workflow module. Each
step emits an `info` line with `{workflow, runId, stepId,
elapsedMs}`. The daemon's `daemon.status` output includes:

- Active workflow runs (count).
- Pending amendments (count).
- Stale artifacts (count) with the top 5 reasons.

Optional per-run trace file at `~/.insrc/workflow-runs/<epic-slug>/<workflow>-<runId>.jsonl` — one line per step,
input + output redacted for size (state tokens summarised).

### 7.6 LLM budget + failure modes

- Per-workflow retry limit (config-driven; default 3).
- Per-run wall-clock cap (config-driven; default 30 min).
- On a hard failure: emit `next: 'error'` with a structured code
  the CLI translates to a human-readable message.
- On a soft failure (retryable): emit `next: 'error'` with
  `retryable: true` and let the client re-emit the last step.

Cost accounting is out of scope for now — reuse the daemon's
existing trace hook if it becomes needed.

## 8. Risks + mitigations

| Risk | Mitigation |
| :--- | :--- |
| Multi-turn state token corruption via LLM transcription | Reuse the 22-char server-side store; analyze framework proved this at scale. |
| Artifact schemas drift from design docs | Every artifact schema references its parent design doc in a JSDoc comment. Design-doc change → PR must include schema update. |
| `analyze.query` step becomes a hot cache miss on every workflow run | Re-use analyze's exploration cache; the workflow's `context.assemble` step is idempotent per repo indexedAt watermark. |
| HLD amendment applier bugs corrupt the effective HLD | Applier is pure + deterministic; unit tests cover every type + composition. Amendments are IMMUTABLE once approved (can't retroactively break the trail). |
| `gh` missing / not authed / wrong scope | The push / sync / post prompts instruct the LLM to run `gh auth status` first and abort cleanly. Framework surfaces the LLM's abort as an actionable user error. We do NOT own the GitHub connection — never store tokens, never call REST directly. |
| LLM invents issue numbers or ignores the label conventions | The `checklist.verify` step of each tracker runner re-reads the LLM's returned refs and confirms every issue exists, has the required labels, and (for Epic) has the task list. Failures retry the execute step with the checklist diff appended to the prompt. |
| Concurrent LLD runs contend on the same file | Each LLD writes to `<story-id>.md` — different paths per Story. Storage layer uses atomic rename. |
| A workflow gets stuck mid-run and the state token expires | 60-minute TTL; re-run from `start`. Same failure mode as analyze. |
| Users can't easily see which artifacts need approval | `insrc workflow status` lists pending approvals + stale artifacts. Extend Phase G output to include suggested next actions. |

## 9. Milestone dependencies

```
A (skeleton) ──► B (define) ──► C (HLD) ──► D (LLD) ──► E (amendments)
                                     │
                                     ▼
                                     F (tracker) ─┐
                                                  ▼
                                                  G (integration + docs)
```

- A is required for everything.
- B depends only on A.
- C depends on A + B (needs an approved Epic to run against in
  live tests).
- D depends on A + B + C.
- E depends on A + B + C + D (needs a live LLD to emit amendments
  from).
- F depends on A + B (tracker push needs an Epic). Can run in
  parallel with C / D / E if resource allows.
- G ties everything together.

## 10. What we are NOT doing (yet)

- **Not implementing `plan`, `build`, `test` workflows.** Their
  design docs come first; this plan covers `define` +
  `design` only.
- **Not implementing any tracker other than GitHub.** No adapter
  abstraction; direct integration only. Other trackers would need
  a different Epic / Story mapping and would introduce the
  abstraction at that point.
- **Not wrapping `gh`.** The LLM invokes it directly. The
  framework supplies conventions (prompts) + verification
  (checklist), not orchestration.
- **Not building a web / IDE UI.** CLI + MCP tool calls only.
  IDE integration is a follow-up.
- **Not auto-approving anything.** Every gate + amendment
  requires an explicit human `insrc workflow approve`.
- **Not implementing bidirectional tracker sync.** Push is
  one-way; sync pulls status but never writes back.
- **Not supporting cross-Epic HLDs** (shared framework decisions
  across Epics). Each Epic's HLD is standalone.
- **Not implementing amendments on artifacts other than HLD.**
  Define / LLD amendments are open questions in their respective
  design docs; they'd be another phase.

## 11. Open questions to resolve during implementation

- **Slug collision UX.** Current design says "prompt user
  synchronously". In a CLI flow that's `readline`; in an MCP
  flow the tool would have to return an error with the
  collision-suffix suggestion and require the client to re-invoke
  with the resolved slug. Pick one. Lean: MCP returns error;
  CLI prompts locally.
- **How much of `context.assemble` should be cached vs re-run?**
  If the repo hasn't reindexed between two workflow runs on the
  same Epic, do we skip re-running the analyze bundles? Lean:
  yes, cache keyed on (epicSlug, repo lastIndexedAt).
- **Workflow versioning.** If we ship v1 of `define` and later
  add a step, existing DefineArtifact readers will see a schema
  they don't recognise. Do we version the schema (`schemaVersion`
  in meta) and bump on breaking changes? Lean: yes; every
  artifact has a `schemaVersion` from Phase A onward.
- **How does an artifact record which LLM was used?** Currently
  `meta.model: 'client' | 'ollama' | string`. For traceability
  we might want the specific client model id (`claude-opus-4-8`
  vs `claude-haiku-4-5`). Cheap to add — pass it in the intent.
- **Do we need a `--dry-run` mode?** Runs the whole workflow up
  through synthesize but doesn't write to disk. Useful for
  testing. Deferred until someone asks.
- **When `test` phase lands, how does it read the LLD's
  `acceptanceMapping` to actually exercise flows?** Deferred to
  the `test` design doc.
- **Should `insrc workflow push` auto-detect the GitHub
  owner/repo from the git remote?** The `context.assemble` step
  falls back to the remote if `~/.insrc/github.json` has no
  per-repo entry. Refuses if there are multiple remotes or no
  `origin`. Lean: yes; simplifies first-time UX considerably.
- **Partial-failure recovery** (rate-limited after 3 of 5 Story
  issues) is the LLM's problem, not the framework's — the
  `checklist.verify` step catches missed Stories and reopens
  execute. Only concern for us: make sure the LLM's returned
  refs schema allows partial success (LLM can list which
  Stories landed vs failed).
- **Label collisions** are the LLM's problem too. The push
  prompt tells it what to do: warn but don't touch existing
  labels; user can override the label prefix via
  `~/.insrc/github.json` if their repo already uses `epic:*`
  for something else.

## 12. First implementation step

If we start today:

1. Create the `src/insrc/workflow/` directory + skeleton files
   listed in §5.
2. Copy `mcp/analyze-step/state-store.ts` verbatim to
   `mcp/workflow-step/state-store.ts` (module-local; do not
   share).
3. Write `workflow/types.ts` — the type surface. Get it
   reviewed before writing runners.
4. Write the stub workflow runner (`workflow/runners/stub/`).
5. Wire up the MCP tool with just `start` + `plan` + `step` +
   `synthesize` phases.
6. Prove the stub workflow runs end-to-end via Claude Code.

That's Phase A.
