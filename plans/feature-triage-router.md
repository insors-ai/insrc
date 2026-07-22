# Feature: Triage router — classification-first workflow entry

**Status:** built (all 4 tiers) · **Size class:** Feature (self-classified) · **Author:** controller (Claude)

## As-built (2026-07-22)

All four tiers are functional end-to-end. 30 new tests green; tsc clean.

- **Classifier** — [`src/workflow/triage/`](../src/workflow/triage/): `routeForSizeClass` table, `CLASSIFY_SCHEMA`, grounded prompt.
- **Standalone `design.story`** — synthetic single-story `readUpstream` branch ([design-story/index.ts](../src/workflow/runners/design-story/index.ts)) + `finalizeStandaloneLld` ([orchestrator.ts](../src/workflow/orchestrator.ts)); stamps `meta.standalone` / `sizeClass` / `triageRationale`.
- **Keying** — `augmentStandaloneParams` (self-minted hash + `S001`) on both the MCP `insrc_workflow_step` and daemon `workflow.run` entries.
- **Gate** — `requireApprovedLld` skips HLD-staleness for a standalone LLD ([gates.ts](../src/workflow/gates.ts)).
- **No-plan build** — `admitStandaloneBuild` ([admission.ts](../src/workflow/runners/build/admission.ts)) + a standalone implement path ([build-step/phases/implement.ts](../src/mcp/build-step/phases/implement.ts)) sourcing the spec from the LLD (Small) or scope (Trivial); Trivial persists a `StandaloneBuildRecord` ([standalone-record.ts](../src/workflow/runners/build/standalone-record.ts)) as its sole ledger entry.
- **Front door** — [`insrc_triage`](../src/mcp/triage-step/) MCP tool (ground → classify → route), returns the pre-filled next call.

---

**Original design follows.**


**Motivation:** dogfood miss — features were built bypassing the tracked
`define → design.epic → design.story → plan → build` chain. The chain is a
hard ladder (`design.story` gates on an approved HLD + Epic), so there is no
lightweight door for a small change — which is exactly why tracking got
skipped. This feature adds the missing front door.

## Principle

> All features, big and small, are tracked.

A request is **classified by size first**, and the size decides where the
workflow *starts*. A large ask still earns the full `define` treatment; a
one-line change does not — but neither escapes the ledger.

## Taxonomy (locked with user)

| Tier        | Start stage            | Chain                                   | Artifact |
|-------------|------------------------|-----------------------------------------|----------|
| **Epic**    | `define`               | define → epic → story → plan → build    | DEF+HLD+LLD+… |
| **Feature** | `design.story` (standalone) | LLD → plan → build                 | LLD (standalone) |
| **Small**   | `design.story` (standalone) | LLD → build                        | LLD (standalone) |
| **Trivial** | `build` (standalone)   | build only                              | BUILD only (no LLD) |

`sizeClass → route`:
- `epic`    → `{ startStage: 'define',       standalone: false, needsPlan: true  }`
- `feature` → `{ startStage: 'design.story', standalone: true,  needsPlan: true  }`
- `small`   → `{ startStage: 'design.story', standalone: true,  needsPlan: false }`
- `trivial` → `{ startStage: 'build',        standalone: true,  needsPlan: false }`

## Components

### 1. Classifier — `src/workflow/triage/`
- `types.ts` — `SizeClass`, `TriageRoute`, `TriageResult { sizeClass, route, rationale, signals[] }`.
- `classify.ts` — `buildClassifyPrompt(input, groundingSummary)`, `CLASSIFY_SCHEMA`
  (ajv), `routeForSizeClass(sizeClass): TriageRoute` (the pure mapping table above).
- The classification is **grounded**: it sizes against the real graph
  (modules touched, caller count, new-vs-reuse) via an analyze bundle, so
  "touches 3 modules / 40 callers" cannot be mislabelled `small`. Rubric is
  materiality-gated like the review rubric — the class must cite concrete
  signals (files, entity counts, new subsystem?), not vibes.

### 2. Standalone `design.story` (runner variant)
The runner's `readUpstream(ctx)` today sources `story` from `epic.body.stories`
and `hldSlice` from the approved HLD — Epic-coupled. When
`ctx.intent.params.standalone === true`:
- **skip** `requireApprovedEpic` / `requireApprovedHld`;
- synthesize `story` from `params.storyTitle` + `params.storySpec` (the triage
  scope statement) — a single first-class standalone story, id `S001`;
- `hldSlice` → a minimal "no parent HLD; design directly against the repo" slice;
- `flavor` → neutral default.
Every downstream LLM step is unchanged — only the *source* of context differs.
Chosen over minting fake auto-approved 1-story Epics: a standalone LLD is a
first-class thing (`meta.standalone`), not Epic-space pollution.

### 3. Keying + meta
- `epicKeyFor` (mcp/workflow-step/phases/start.ts): `standalone` mints
  `computeEpicHash(runId)` (its own identity, like `define`) instead of reading
  `params.epicHash`.
- `ArtifactMetaBase` gains: `standalone?: boolean`, `sizeClass?: SizeClass`,
  `triageRationale?: string`. Stamped on the first artifact of the routed chain.

### 4. Standalone `build` + `plan`
- `requireApprovedLld` (gates.ts): **skip the HLD-staleness check** when
  `lld.meta.standalone` (there is no HLD to be stale against). Approval +
  rejection checks unchanged.

### 5. `insrc_triage` MCP tool — controller-driven
3-phase loop mirroring `insrc_review_step` (the "two sets of eyes" model — the
classifier is the *controller* LLM, grounded on the daemon's analyze bundle):
`start` (server grounds via `buildRun`) → `emit_classification` (controller
emits `TriageResult` over the evidence) → `route` (server returns the
`startStage` + the exact next `insrc_workflow_run` / `insrc_workflow_step` call
to make, with `standalone`/`storyTitle`/`storySpec` params pre-filled).

## Non-goals / deferred
- Auto-driving the whole Epic chain unattended (gates stay human).
- Re-classification / re-sizing mid-chain (a Small that grows → manual promote).
- Backfilling this session's already-committed features (user chose **go
  forward only**).

## Verification
- Unit: `routeForSizeClass` mapping table; `CLASSIFY_SCHEMA` validates a
  well-formed result and rejects an unknown `sizeClass`.
- Standalone LLD: a `design.story` run with `params.standalone` writes
  `LLD-<runIdHash>-S001.json` with `meta.standalone===true`, `meta.sizeClass`,
  no parent DEF/HLD on disk — and `plan`/`build` accept it (no staleness throw).
- Dogfood: this feature is itself **Feature** tier; once the standalone path
  exists, its own LLD is authored through it and controller-reviewed via
  `insrc_review_step`.
