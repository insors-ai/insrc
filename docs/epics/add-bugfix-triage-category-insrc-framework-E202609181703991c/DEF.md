<!-- insrc:artifact DEF-1703991c69967193 -->

# Epic: The insrc workflow sizes every request on one ladder — epic, feature, small, trivial — and routes each through the same design-first ceremony, but a defect fix has no path of its own.

**Flavor:** enhancement

## Problem

The insrc workflow sizes every request on one ladder — epic, feature, small, trivial — and routes each through the same design-first ceremony, but a defect fix has no path of its own. A defect fix is a change whose purpose is to correct existing behaviour against an already-approved design rather than to add a new capability, yet today it must either be forced through full design ceremony (a low-level design and a plan for a correction whose intent is already understood from the design it is fixing), which is disproportionate and in practice discourages tracking it at all, or it is done off the chain entirely as an untracked change on someone's working tree. Either way the defect, its root cause, and the fix leave no cited, reviewable, approvable record like every other stage produces, and the fix is never attached to the epic or story whose behaviour it corrects — there is no notion of which existing work item a fix belongs to, so even a tracked fix is orphaned from the design it amends. Because the fix is not sized on its own terms, a genuinely large correction and a one-line correction are treated identically. And where the repo has a tracker configured, the fix never surfaces as an external issue, so the team's outside record of defects stays disconnected from the internal record of the code and its design. The cost concentrates on the single most common kind of change — small corrections to shipped behaviour — where the choice between heavy ceremony and no record at all is starkest and the quiet loss of a durable, correlated history compounds with every fix.

## Non-goals

- **Building a general bug-tracking / issue-management product (labels, assignees, boards, triage queues, SLAs).** — The Epic captures a single defect fix as one cited 'issue' record and mirrors it to one GitHub issue; broader issue management remains the province of the external tracker, not insrc.
- **Changing the semantics or routes of the existing epic / feature / small / trivial categories.** — Bugfix is added ALONGSIDE the existing ladder; the current categories must keep classifying and routing exactly as they do, so no in-flight or historical work is disturbed.
- **Auto-detecting defects or inferring bugs from code, tests, or telemetry.** — A bugfix is user-initiated exactly like every other triage input; deciding something IS a bug is out of scope — the Epic only handles a fix the user has declared.
- **Repairing pre-existing gaps in the shared tracker ref-resolver (e.g. work items the resolver cannot currently key).** — The parent-location logic CONSUMES the existing resolver; hardening the resolver itself is a separate concern that must not be smuggled into this Epic's scope.

## Assumptions

- `high` The triage step already sizes a request and returns a route the caller follows; a new category slots into that same classify->route mechanism rather than needing a parallel entry point. [[c1]]
- `high` The tracker already resolves work-item references over the docs/ artifact tree and creates/links GitHub issues for epics/stories/tasks; the bugfix flow can reuse these rather than building a second issue path. [[c2]]
- `med` The indexed graph plus the artifact tree can map a file or entity a fix touches back to the work item whose approved artifacts reference it, making code-ownership location feasible. [[c3]]
- `high` A tracker is optional per repository; external GitHub-issue creation applies only when one is configured, and the flow must degrade cleanly to a purely local 'issue' record when it is not. [[c2]]

## Constraints

| ID | Type | Text | Source |
| :--- | :--- | :--- | :--- |
| `k1` | convention | Every change, a defect fix included, must be TRACKED: a bugfix must produce a cited, reviewable, approvable record on the chain — never an untracked side-effect — preserving the framework's core end-to-end guarantee. | [[c4]] |
| `k2` | invariant | A bugfix must still be SIZED. A fix sized M or L must follow the required HLD/LLD design process (issue -> design -> plan -> build); only a small fix may skip design and go issue -> build. Skipping design is permitted strictly on the small path. | [[c5]] |
| `k3` | contract | Parent-location must attempt, in this fixed order: (a) code-ownership over the artifact tree + graph, (b) semantic match against existing epic/story artifacts, (c) prompt the user for a reference, (d) fall back to a standalone bugfix. The order and the standalone fallback are load-bearing. | [[c5]] |
| `k4` | contract | The 'issue' doc is the single source of truth for the fix's record AND the GitHub issue body — the same content serves both, with no divergent second copy. | [[c5]] |
| `k5` | convention | The work is backend TypeScript within triage / workflow / tracker only (not the jetbrains-plugin), and introduces no direct cloud REST path — consistent with the project's boundaries. | [[c4]] |
| `k6` | invariant | Reuse the existing tracker ref-resolver, GitHub-issue surface, build stage, and code-review stage; the Epic adds a locate-parent resolver and an issue-from-doc create path on top of them rather than re-implementing them. | [[c2]] |

## Stories

### E202609181703991c:S001 — Classify a declared defect fix as a sized bugfix

**User value:** `size: S`

A developer can hand the framework a defect fix and have it recognised as a first-class `bugfix` — sized on its own terms — so the fix is tracked from the outset without being forced onto the feature ladder.

**Extends:** [[c6]]

**Acceptance criteria:**

- **ac1:** Given a change the user has declared to be a defect fix, when triage classifies it, then it is categorised as `bugfix` (distinct from epic/feature/small/trivial) and the existing categories keep classifying exactly as before. _(operationalizes `k1`)_
- **ac2:** Given a request classified as `bugfix`, when triage sizes it, then it returns a size (a small fix vs an M/L fix) and the routed next step that matches that size, so downstream knows whether design is required. _(operationalizes `k2`)_

### E202609181703991c:S002 — Capture the defect as a single reviewable issue record

**User value:** `size: M`

A developer gets one durable, cited record of the defect — its reproduction, root cause, and fix intent — that is reviewed and approved like every other stage artifact, so the fix is never an untracked side-effect.

**Depends on:** `s1`

**Acceptance criteria:**

- **ac1:** Given a bugfix has been classified, when the bugfix flow runs its first stage, then it produces a single `issue` record capturing the reproduction, the root cause, and the intended fix, persisted as a cited artifact on the chain. _(operationalizes `k1`, `k4`)_
- **ac2:** Given an issue record has been produced, when it is presented for approval, then it can be reviewed and explicitly approved (or sent back) before anything downstream consumes it, in the same manner as the other stage artifacts. _(operationalizes `k1`)_

### E202609181703991c:S003 — Attach the fix to the work item it corrects, or fall back cleanly

**User value:** `size: M`

A developer's fix is automatically tied to the epic or story whose behaviour it corrects, so the fix is never orphaned from its design — and when no owner can be found the developer is asked, and can still proceed unattached.

**Depends on:** `s1`

**Extends:** [[c7]]

**Acceptance criteria:**

- **ac1:** Given a bugfix whose touched files or entities are covered by an existing story's approved design/plan/build artifacts, when the framework locates the parent, then the fix is attached to that owning epic/story by code ownership. _(operationalizes `k3`)_
- **ac2:** Given a bugfix with no owner found by code ownership, when the framework locates the parent, then it attempts a semantic match of the defect description against existing epic/story artifacts and attaches the fix to a confident match. _(operationalizes `k3`)_
- **ac3:** Given a bugfix where neither code ownership nor semantic match yields an owner, when the framework locates the parent, then it prompts the user for a reference, and if the user supplies none the fix continues as a standalone bugfix. _(operationalizes `k3`)_

**Local constraints:**

- `lc1` (contract) Location is deterministic-first: code ownership is tried before the fuzzy semantic step, and a low-confidence or ambiguous semantic match must defer to the user prompt rather than silently attaching to a wrong parent. [[c5]]

### E202609181703991c:S004 — Route a bugfix by its size — straight to build when small, through design when larger

**User value:** `size: M`

A small fix skips design ceremony and goes straight to implementation, while a genuinely large fix still gets the design it needs — so the amount of process always matches the size of the correction.

**Depends on:** `s2`, `s3`

**Acceptance criteria:**

- **ac1:** Given a bugfix sized as a small fix with an approved issue record, when it proceeds past the issue stage, then it goes directly to build with no low-level design and no plan. _(operationalizes `k2`)_
- **ac2:** Given a bugfix sized M or L with an approved issue record, when it proceeds past the issue stage, then it follows the required design process (high-/low-level design then plan) before build. _(operationalizes `k2`)_
- **ac3:** Given a bugfix whose build has produced changes, when it moves to complete, then a post-build code review gates completion exactly as for other built work. _(operationalizes `k1`)_

### E202609181703991c:S005 — Surface the fix as a linked GitHub issue when a tracker is configured

**User value:** `size: M`

On a repo with a tracker, the defect shows up as a GitHub issue drawn from the same record and linked to the work item it belongs to (and closed on completion), so the team's external defect history stays in step with the internal record — and repos without a tracker keep a purely local record.

**Depends on:** `s2`, `s3`

**Extends:** [[c7]]

**Acceptance criteria:**

- **ac1:** Given a repository with a tracker configured and an approved issue record with a located parent (or standalone), when the bugfix flow reaches its tracker step, then a GitHub issue is created from the same issue-record content and linked to the located parent (or stands alone). _(operationalizes `k4`, `k6`)_
- **ac2:** Given a repository with NO tracker configured, when the bugfix flow runs, then no external issue is attempted and the local issue record stands on its own with no error. _(operationalizes `k6`)_
- **ac3:** Given a tracked bugfix that reaches completion, when the fix completes, then its GitHub issue is closed and linked to the resulting work. _(operationalizes `k4`)_

## Open questions

- Item a2 (design risk, resolve in HLD): how reliably can a fix's touched files/entities be mapped to an owning story via the existing artifact-tree ref-resolver + graph (code-ownership), and at what confidence threshold does the semantic match defer to the user prompt rather than attach to a wrong parent? The ownership-feasibility assumption is only med-confidence.

## Resolved questions

- `q31c9706c` — Item a2 (design risk, resolve in HLD): how reliably can a fix's touched files/entities be mapped to an owning story via the existing artifact-tree ref-resolver + graph (code-ownership), and at what confidence threshold does the semantic match defer to the user prompt rather than attach to a wrong parent? The ownership-feasibility assumption is only med-confidence.
  - **resolved**: Tiered resolver: deterministic → graph ownership → semantic → prompt, high auto-attach threshold — Preserves the k3 order exactly: (1) exact artifact-tree ref-resolver match on the touched files/entities, then (2) graph code-ownership scoring of candidate stories, then (3) semantic embedding match of the defect description against epic/story artifacts, then (4) user prompt, then (5) standalone. Auto-attach fires ONLY above a deliberately high confidence threshold at each automatic tier; any ambiguity or low score defers to the prompt (honouring lc1's deterministic-first, never-silently-wrong rule and the accuracy-first principle). Each attach records which tier decided it and its confidence/evidence, which is what retires the med-confidence ownership-feasibility assumption with real data rather than by assertion. Rejected: deterministic-only (drops the user-required semantic tier), always-prompt (defeats the auto-locate value the user asked for), and auto-attach-then-reparent (accepts silently-wrong parents, violating lc1). _(2026-09-18T10:09:35.926Z)_

## Citations

- **[[c1]]** `code` `src/workflow/triage/classify.ts — the size->route table classifying epic/feature/small/trivial and returning the next-stage route`
- **[[c2]]** `code` `src/workflow/tracker/ (resolve.ts, refs.ts, link.ts, github.ts, sync.ts, setup.ts) — work-item ref resolution over the docs/ artifact tree + GitHub issue create/link/sync, gated on a configured tracker`
- **[[c3]]** `code` `src/workflow/tracker/resolve.ts + the indexed graph — mapping a path/entity to the work item whose approved artifacts reference it (code-ownership basis)`
- **[[c4]]** `doc` `CLAUDE.md — 'the framework's core guarantee is that every feature, big or small, is tracked'; backend is TypeScript/ESM; no direct cloud REST from our process`
- **[[c5]]** `stakeholder` `User requirements (2026-09-18): bugfix as a sized triage category; an 'issue' doc that doubles as the GitHub issue body; parent-location order code-ownership -> semantic -> prompt -> standalone; small fix skips LLD/plan, M/L escalates to HLD/LLD`
- **[[c6]]** `analyze-bundle` `s1 capability-discovery — no bugfix category, no 'issue' doc-type, no scope-gated bugfix workflow exists; triage sizes epic/feature/small/trivial only (src/workflow/triage/classify.ts + types.ts; src/workflow/ runners/orchestrator/chain/types)`
- **[[c7]]** `analyze-bundle` `s1 boundary-scope — the tracker already resolves work-item refs over the docs/ artifact tree (resolve.ts) and creates/links GitHub issues (github.ts, sync.ts); the bugfix parent-location + issue-create reuse these`
