## insrc — front door (insrc MCP server)

This is the SKELETON. It names every insrc surface and routes an intent to the
right one; it does NOT inline each workflow's full procedure. Two on-demand
lookups carry the detail so this block can stay small:

- **`insrc_schema`** — the exact INPUT SHAPE of any insrc_* tool (and, for a
  multi-turn tool, its accepted `phase` set). Call it before you emit a call
  whose argument shape you are unsure of, instead of guessing.
- **`insrc_guide`** — a workflow's full STEP-BY-STEP PROCEDURE. Call
  `insrc_guide({ workflow })` before running a workflow you don't have fresh in
  context, with one of: `define`, `design.epic`, `design.story`, `plan`,
  `build`, `review`, `code-review`, `brainstorm`, `bugfix`, `tracker`, `triage`.
  Omit `workflow` to get the list of keys back.

**Schema-first rule:** call `insrc_schema` before emitting any insrc_* call whose
shape (fields, or the `phase` you're in) you are not certain of. Don't hand-shape
a call from memory when the contract is one lookup away.

### Front-door decision tree (intent → surface)

- **Question about the codebase** (structure, conventions, capabilities,
  adherence, design decisions) → `insrc_analyze_step` (multi-turn, in-session,
  preferred) or `insrc_analyze` (one-shot, Ollama). Do this BEFORE manual
  `Read`/`Grep`/`Glob`.
- **Draw / diagram / document / map the code** (a self-contained HTML doc from
  the graph) → `insrc_docgen`.
- **Build / add / implement a feature** → do NOT hand-pick a stage and do NOT
  just start editing. Route it: `brainstorm` (if the idea is rough) →
  `insrc_triage` (sizes + routes) → the routed workflow → review → approve →
  build → code-review → complete. Every feature, big or small, is tracked. See
  `insrc_guide({ workflow: 'triage' })` for the routing table.
- **Fix a bug / defect** → same front door: `insrc_triage` classifies it
  `bugfix` (magnitude `small` or `sized`) and routes to the `issue` stage — a
  defect gets tracked exactly like a feature, never patched off-ledger. Small →
  issue → build; sized → issue → design.story → plan → build. On the approval of
  the tracked `issue`, the bugfix chain auto-advances to its next stage. See
  `insrc_guide({ workflow: 'bugfix' })`.
- **Produce a design artifact / decision / tracker push** (Epic, HLD, LLD,
  GitHub) → drive the workflow chain turn-by-turn with `insrc_workflow_step`.
  See the matching `insrc_guide` key.
- **The exact shape of a call** → `insrc_schema`.
- **A workflow's full procedure** → `insrc_guide({ workflow })`.

### Tool catalog (all registered insrc_* MCP tools)

Call `insrc_schema({ tool })` for any tool's exact input shape (add `phase` for
a multi-turn tool). Call `insrc_guide({ workflow })` for a workflow's procedure.

| Tool | Purpose |
|------|---------|
| `insrc_analyze` | One-shot 7-layer context bundle for a codebase question (Ollama pipeline). |
| `insrc_analyze_step` | Multi-turn context bundle — same queries, reasoning stays in-session (preferred). |
| `insrc_docgen` | Generate a self-contained offline HTML doc/diagram from the code graph. |
| `insrc_triage` | Size a feature request and return a pre-filled `nextCall` routing it to a start stage. |
| `insrc_workflow_step` | Drive one tracked workflow turn (define / design.epic / design.story / plan / brainstorm / tracker). **This is the ONLY supported way to run a workflow — always drive it turn-by-turn in-session.** |
| `insrc_workflow_run` | Daemon-side async run (START → POLL). **NOT recommended — do not use.** The async poll/handoff can stall in a resolution loop and error out on completion; drive workflows with `insrc_workflow_step` instead. |
| `insrc_build_step` | Drive the build stage (`implement` → `validate`) that turns an approved LLD/plan into code. |
| `insrc_review_step` | Independent controller review of a design artifact (DEF/HLD/LLD) before approval. |
| `insrc_code_review_step` | Post-build code review over the changed code (adherence / conventions / coverage / quality). |
| `insrc_workflow_approve` | Approve a pending artifact by `artifactPath` (or `epicHash` to batch) — only on the user's explicit yes. |
| `insrc_schema` | Return any insrc_* tool's registered input shape + accepted phases. |
| `insrc_guide` | Return one workflow's full step-by-step procedure from the canonical steering source. |

`insrc_analyze` / `insrc_analyze_step` / `insrc_docgen`: **repo** falls back to
`$INSRC_REPO`; the repo must be registered with the daemon and finished
indexing. The multi-turn tools (`*_step`, `insrc_triage`) hand you a `next` /
`guidance` / `prompt` / `schema` each turn — follow `next` verbatim and preserve
the opaque `state` token between calls. Do NOT use analyze to edit files, run
tests/builds, or answer non-context questions; when a returned bundle is empty
or off-topic, fall back to `Read` / `Grep` / `Glob`.

`insrc_docgen` `docType` values (each single-sources from the code graph — no
hallucinated paths): `type-structure` (classes/interfaces + inheritance in a
scope, `path?`), `component-dependency` (module dependency topology, `path?`),
`call-sequence` (call flow from an entry point — needs `symbol`, `maxDepth?`),
`narrative` (a base diagram + a graph-grounded walkthrough — needs `base` +
`question`).

### Approval discipline (applies to every workflow artifact)

Never auto-approve and never send the user to the TUI. When a `done` response
carries a `pendingApproval` block, PRESENT a concise summary and ASK the user;
only on their explicit in-chat yes call
`insrc_workflow_approve({ artifactPath })` (or `{ epicHash }` to batch). Review
before you approve — see `insrc_guide({ workflow: 'review' })`.

<!-- insrc:guide:triage:start -->
## triage — size a feature request and route it (`insrc_triage`)

When the user asks you to **build / add / implement a feature** (not a question
— that's analyze), do NOT hand-pick `define` / `design.story` / `build`, and do
NOT just start editing. The framework's guarantee is that **every feature, big
or small, is tracked**. `insrc_triage` sizes the request (grounded on your own
`insrc_analyze_step` passes) and routes it to the right start stage:

- **epic** → `define` (full chain — new subsystem / many stories)
- **feature** → standalone `design.story` (LLD) → `plan` → `build`
- **small** → standalone `design.story` (LLD) → `build`
- **trivial** → `build` (no LLD; a standalone BUILD record is its ledger entry)
- **bugfix** → `issue` stage (carries a `magnitude`: `small` → issue → build;
  `sized` → issue → design.story → plan → build). A defect is tracked like a
  feature; see `insrc_guide({ workflow: 'bugfix' })`.

It returns a **pre-filled `nextCall`** — make exactly that call next. Two-turn
loop: `phase:'start'` with `{ focus, repo? }` → ground + emit the `TriageResult`
→ `phase:'classify'` with `{ result, state }` → `{ nextCall }`.

Skip triage only for a genuine one-liner the user explicitly scoped, or when
they name a specific stage. Everything else goes through the front door so it
lands on the ledger. If the idea is still rough, run `brainstorm` first.
<!-- insrc:guide:triage:end -->

<!-- insrc:guide:brainstorm:start -->
## brainstorm — converge a rough idea into a spec (`workflow: 'brainstorm'`)

Run this BEFORE triage when the request is a vague or ambiguous idea rather than
a crisp spec. It is a SINGLE paused `elicit` turn — YOU conduct the whole
clarify → fold → show → confirm convergence in chat:

- fold each answer into a running problem statement,
- show it back every turn,
- re-ask only the still-open gaps,
- at a fork, present the options and record the choice's `ruledOut`
  alternatives in `nonGoals`.

Then resume ONCE with `confirmed: true` and no open items. Review + approve the
resulting **SpecArtifact** (same present-ask-approve discipline), then seed
`insrc_triage` / `define` / `design.story` from the approved spec. Skip
brainstorm when the request is already a clear, scoped spec — go straight to
triage.
<!-- insrc:guide:brainstorm:end -->

<!-- insrc:guide:define:start -->
## define — frame an Epic + Stories (`workflow: 'define'`)

Runs when triage sizes the request as an **epic** (new subsystem / many
stories). Produces a persistent, citation-grounded **Define** (Epic + Stories +
constraints). Its FIRST step (`scope.assess`) is the scope classifier: it runs
`insrc_analyze_step` over the existing docs + code and decides **new** vs
**extend**:

- **new** — no existing Epic fits; it frames a fresh Epic (Stories etc.) as
  usual.
- **extend** — the ask builds on an existing Epic/design. The framework then
  SKIPS `epic.frame` / `stories.compose`, appends the new Story to that Epic's
  Define, files a pending `storyBoundary.addStory` HLD amendment, and writes an
  **ExtendArtifact** (`EXT-…`). Do NOT force a new Epic. Relay its `notify` line
  (what it builds on) to the user, then follow its `nextAction`: approve the
  amendment + updated Epic, then run `design.story` for the new Story.

Standard loop (mirrors analyze-step): `phase:'start'` → `emit_plan` →
`phase:'plan'` → `emit_step` (loop) → `emit_synthesize` → `phase:'synthesize'` →
`done` with the written artifact. Review the Define (`insrc_review_step`), then
present-ask-approve. Next stage: `design.epic` (HLD).
<!-- insrc:guide:define:end -->

<!-- insrc:guide:design.epic:start -->
## design.epic — author the HLD (`workflow: 'design.epic'`)

Produces the Epic's **HLD** (high-level design: story boundaries, cross-cutting
contracts, the winning architecture option). Requires an approved **Define**.
Cross-cutting contracts are guided to the nearest-common-ancestor owner so a
Story's LLD validates without amending the Epic.

Loop: `phase:'start'` with `{ workflow:'design.epic', focus, params }` →
`emit_plan` → `phase:'plan'` → `emit_step` (loop) → `emit_synthesize` →
`phase:'synthesize'` → `done`. Review the HLD with `insrc_review_step` before
approving (a `block` verdict from unresolved HIGH/MED findings gates approval);
resolve, then present-ask-approve. Next stage: `design.story` per Story.
<!-- insrc:guide:design.epic:end -->

<!-- insrc:guide:design.story:start -->
## design.story — author a Story's LLD (`workflow: 'design.story'`)

Produces one Story's **LLD** (low-level design: interfaces, files, tasks,
citations). Requires an approved **HLD** for an epic Story; a **standalone**
`design.story` (from triage `feature` / `small`) skips the HLD/epic reads and
runs on its own. Pass the LOWERCASE story id (e.g. `s1`) — an uppercase `S001`
crashes with "Story not found".

Stay inside the Story's own scope — the LLD carries `adjacentBoundaries` and an
anti-overreach rule so authoring does not spill onto sibling Stories. Loop:
`phase:'start'` → `emit_plan` → `phase:'plan'` → `emit_step` (loop) →
`emit_synthesize` → `phase:'synthesize'` → `done`. Review (`insrc_review_step`),
present-ask-approve, then run `plan`.
<!-- insrc:guide:design.story:end -->

<!-- insrc:guide:plan:start -->
## plan — decompose an approved LLD into build tasks (`workflow: 'plan'`)

Turns an approved LLD into an ordered, citation-grounded **PLAN** (the task
breakdown the build follows). `readPlanUpstream` is scope-aware: a standalone
LLD's plan skips the HLD/epic reads, so `plan` runs without an HLD. Loop mirrors
the other workflows (`start` → `plan` → `step` loop → `synthesize` → `done`).
Present-ask-approve the PLAN, then run `build`.
<!-- insrc:guide:plan:end -->

<!-- insrc:guide:build:start -->
## build — implement an approved plan (`insrc_build_step`)

Turns an approved LLD/PLAN into code. Multi-turn: `phase:'implement'` →
`phase:'validate'`. A **trivial** triage result goes straight here with no LLD
(a standalone BUILD record is its ledger entry). Call
`insrc_schema({ tool:'insrc_build_step', phase })` for the exact shape of each
phase.

After the build has produced its changes, run `code-review` over the changed
code, PRESENT the verdict, then COMPLETE the Story by approving its **BUILD**
artifact with `insrc_workflow_approve` on the BUILD md/path. BUILD approval is
the code-review-gated completion act: under `codeReview.enforce` (config, off /
advisory by default) a `block` — or no review having run — withholds completion
into `skipped[]` unless you pass an explicit `overrideReview`.
<!-- insrc:guide:build:end -->

<!-- insrc:guide:review:start -->
## review — independent design-artifact review (`insrc_review_step`)

Run this on a written artifact (DEF / HLD / LLD) BEFORE approving it — two sets
of eyes. A daemon self-review runs the SAME model that authored the artifact
(no independent perspective); `insrc_review_step` moves the review's reasoning
into YOU, the controller, and the reviewer must be a DIFFERENT actor than the
author. It extracts the artifact's load-bearing premises, the server re-runs
deterministic probes against real source, and you judge the verdicts against
that evidence.

Loop: `phase:'start'` → `claims` → `verdicts`. It stamps `meta.review`; a
`block` verdict (unresolved HIGH/MED findings) then gates approval. Resolve the
blocking findings (apply / accept-with-note / override), THEN present-ask-approve
with `insrc_workflow_approve({ artifactPath })`. A review-blocked artifact comes
back from approve in `skipped[]` with a reason (relay it); pass `overrideReview`
only with the user's explicit override reason.
<!-- insrc:guide:review:end -->

<!-- insrc:guide:code-review:start -->
## code-review — post-build code review (`insrc_code_review_step`)

Run this over the changed code AFTER the build produces its changes. DISTINCT
from `insrc_review_step` (which reviews the design artifact). Multi-turn:
`phase:'start'` with `{ epicHash, storyId, repo? }` → `emit_judgements` hands you
the four dimension prompts + grounding → emit the `{ judgements }` JSON →
`done`. It writes a code-review record across four dimensions — **adherence /
conventions / coverage / quality** → block / warn / pass.

If the graph grounding comes back hollow on just-created files (no symbol/test
edges), judge coverage by RUNNING the suite and flag the caveat honestly —
never fabricate a HIGH from empty grounding. PRESENT the verdict, then COMPLETE
the Story by approving its **BUILD** artifact (see the `build` guide — BUILD
approval is the code-review-gated completion act).
<!-- insrc:guide:code-review:end -->

<!-- insrc:guide:tracker:start -->
## tracker — sync the Epic to GitHub (`workflow: 'tracker.push' / '.sync' / '.post'`)

Push an Epic to GitHub, sync tracker status, or post an update. YOU invoke `gh`
directly; the framework supplies the labels + task-list conventions. The repo's
GitHub tracker target comes only from per-repo config or its own git remote,
never a global default. Loop mirrors the other workflows. Present-ask-approve
any artifact it writes.
<!-- insrc:guide:tracker:end -->

<!-- insrc:guide:bugfix:start -->
## bugfix — fix a defect on the ledger (triage `bugfix` → `issue` stage)

There is no hand-picked "bugfix workflow" — a bug enters through the SAME front
door as a feature and is tracked the same way. The only difference is triage
classifies it `bugfix` and routes it to the `issue` stage.

1. **`insrc_triage` FIRST** (as for any change). It sizes the defect and, for a
   `bugfix`, returns a `magnitude`:
   - **small** → `issue` → `build` (no LLD; the standalone BUILD is the ledger
     entry).
   - **sized** → `issue` → `design.story` (LLD) → `plan` → `build`.
   Triage hands back a pre-filled `nextCall` that starts `insrc_workflow_step`
   with `workflow: 'issue'` — make exactly that call.
2. **Run the `issue` stage** with `insrc_workflow_step` (turn-by-turn, like every
   workflow). It writes an **IssueArtifact** — the single defect record (root
   cause, reproduction, fix intent) that also becomes the GitHub issue body.
   Review it (`insrc_review_step`), then present-ask-approve.
3. **Approve the issue** with `insrc_workflow_approve`. Approval AUTO-ADVANCES the
   bugfix chain: the daemon locates + stamps the fix's parent, checks the advance
   gate, and routes to the next stage (build for small, design.story for sized).
   The approval result carries a `followOn` entry describing what fired; relay a
   failed advance (`ok:false`) rather than assuming it advanced.
4. **Continue the routed chain** (build, or design.story → plan → build), each
   with its usual review + present-ask-approve gate. Completing the bugfix BUILD
   is the code-review-gated completion act, exactly as for a feature story.

Do NOT patch a bug off-ledger. Skip triage only for a one-liner the user
explicitly scoped as trivial.
<!-- insrc:guide:bugfix:end -->
