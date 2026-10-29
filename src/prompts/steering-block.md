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

- **Finding things in the codebase — your own tools or the analyzer?** Ask:
  *could a text match alone give a wrong or incomplete answer?*
  - **No → use your own tools** (`Grep` / `Glob` / `Read`). The answer is
    whether or where some text occurs: "does this code use file IO?", "where is
    this config key read?", "which files mention X?", "show me this function".
  - **Yes → use the analyzer**: `insrc_analyze_step` (multi-turn, in-session,
    preferred) or `insrc_analyze` (one-shot, Ollama). The answer depends on
    relationships or meaning that text matching can't see: "where is this
    module used, and what depends on it?", "what breaks if I change this?",
    "does the code follow this documented rule?", "does the codebase already do
    X?", "how does X work?", "what are the conventions here?".
  - A task often needs both: analyze to understand the area, then search and
    read to work in it. Don't run the analyzer for a lookup, and don't answer a
    relationship question from a text match alone.
  - For "where is X used", also grep for the name and report any call site the
    analyzer missed — its call graph can be incomplete.
- **Draw / diagram / document / map the code** (a self-contained HTML doc from
  the graph) → `insrc_docgen`. For PROPOSED designs, use the workflow
  artifact definitions below; docgen describes existing code, not a future model.
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
| `insrc_review_step` | Review of a design artifact (DEF/HLD/LLD) by the party that did not author it, before approval. The tool routes it. |
| `insrc_code_review_step` | Post-build code review by the party that did not write the code (adherence / conventions / coverage / quality). The tool routes it. |
| `insrc_workflow_approve` | Approve a pending artifact by `artifactPath` (or `epicHash` to batch) — only on the user's explicit yes. |
| `insrc_present` | Declare the documents (artifact ids or repo-relative paths) you are asking the user to review, so the chat opens them — call it before asking for approval. |
| `insrc_schema` | Return any insrc_* tool's registered input shape + accepted phases. |
| `insrc_guide` | Return one workflow's full step-by-step procedure from the canonical steering source. |

`insrc_analyze` / `insrc_analyze_step` / `insrc_docgen`: **repo** falls back to
`$INSRC_REPO`; the repo must be registered with the daemon and finished
indexing. The multi-turn tools (`*_step`, `insrc_triage`) hand you a `next` /
`guidance` / `prompt` / `schema` each turn — follow `next` verbatim and preserve
the opaque `state` token between calls. Do NOT use analyze to edit files, run
tests/builds, answer non-context questions, or do a plain text lookup (see the
decision tree above); when a returned bundle is empty or off-topic, fall back
to `Read` / `Grep` / `Glob`.

`insrc_docgen` `docType` values (each single-sources from the code graph — no
hallucinated paths): `type-structure` (classes/interfaces + inheritance in a
scope, `path?`), `component-dependency` (module dependency topology, `path?`),
`call-sequence` (call flow from an entry point — needs `symbol`, `maxDepth?`),
`narrative` (a base diagram + a graph-grounded walkthrough — needs `base` +
`question`).

### Relevant design artifacts

Authors, builders and reviewers must judge relevance from the change, not its
size or whether a definition already exists. An isolated class implementation
change with no entity/relationship impact needs no ERD. Relationship changes,
even simple ones, MUST document endpoints, direction, cardinality/ownership and
compatibility where applicable. Clear prose or a small table may suffice; add
an ERD when it materially clarifies the model. Use sequence/component diagrams
for interaction/dependency boundaries and UX mocks for changed layout, states
or flows when those visuals materially aid assessment. No blanket diagram rule.

For proposed designs author `erDefinition` (LinkML), `sequenceDefinition`,
`componentDependencyDefinition`, or `uxDefinition` (Adaptive Cards subset).
These structured definitions are the source of truth; the framework generates
and attaches `companions`. Do not hand-author companion references. Describe
what each relevant visual explains and retain source/element descriptions.

Reviewers independently assess necessary artifacts even when no definitions
are supplied. Inspect linked files, generated content and rendering against
the design; a definition alone is not proof of a working visual. Request author
correction/regeneration for missing, broken or inconsistent artifacts. If
rendering is unavailable, inspect source where possible and report the limit;
never claim a visual was verified. Material inadequacy is `does-not-hold` with
MED/HIGH and blocks; genuinely unavailable evidence is `could-not-verify`.
Optional improvements to an otherwise adequate design are narrative advice,
not a `warn` verdict or a false failure/unverified finding. Builders maintain
relevant artifacts when implementation changes documented relationships or UX.
These checks stay within the existing three-round review limit.

### Approval discipline (applies to every workflow artifact)

Never auto-approve and never send the user to the TUI. When a `done` response
carries a `pendingApproval` block (or a build or review step leaves a record to
approve), first DECLARE what you are about to show: call
`insrc_present({ documents: [...] })` with each document's artifact id (for
example `LLD-<hash>-s1`) or repo-relative path. Then PRESENT a concise summary
(give the document's path in your message too) and ASK the user; only on their
explicit in-chat yes call `insrc_workflow_approve({ artifactPath })` (or
`{ epicHash }` to batch). Review a DEF, HLD or LLD before you approve it — see
`insrc_guide({ workflow: 'review' })`.

### Review discipline (applies to every review)

**Only two reviews are mandatory:** a DEF, HLD or LLD before its approval
(`insrc_review_step`), and the code review that completes a Story's BUILD
(`insrc_code_review_step`). Do not review anything else — an ISSUE, SPEC or
PLAN, or any other stage — unless the user asks for it; present it and ask for
approval instead.

**At most three review rounds per cycle.** A round is one review call
(`insrc_review_step` or `insrc_code_review_step`), whatever its verdict. After
the third round on the same artifact or code, STOP: show the user the latest
review's findings and what the earlier rounds changed, and ASK whether to run
another cycle of up to three rounds, approve with an override reason, or change
course. Do not start a fourth review until the user says so.

The chat opens exactly the documents you declare with `insrc_present`; it does
not work out what to open from tool output, so a document you do not declare is
not opened for the user. The answer lists each name as `presented` or
`notPending` (misspelt, already approved, or with no document file yet): correct
a `notPending` name and call again. Declaring is steering-only for now, and a
missed call shows up as nothing opening; if that proves unreliable, revisit it
(a reminder from the daemon in tool responses, or detection of a missing call).

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

Then resume ONCE with `confirmed: true` and no open items. Present + approve the
resulting **SpecArtifact** (same present-ask-approve discipline; no review
unless the user asks), then seed
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
Apply the front-door **Relevant design artifacts** rule: assess relevance
independently, document relationship changes even when simple, and do not
require an ERD for isolated class edits. Use structured companion definitions only when the visual materially helps.
<!-- insrc:guide:design.epic:end -->

<!-- insrc:guide:design.story:start -->
## design.story — author a Story's LLD (`workflow: 'design.story'`)

Produces one Story's **LLD** (low-level design: interfaces, files, tasks,
citations). Requires an approved **HLD** for an epic Story; a **standalone**
`design.story` (from triage `feature` / `small`) skips the HLD/epic reads and
runs on its own. Pass the LOWERCASE story id (e.g. `s1`) — an uppercase story id
crashes with "Story not found".

Stay inside the Story's own scope — the LLD carries `adjacentBoundaries` and an
anti-overreach rule so authoring does not spill onto sibling Stories. Loop:
`phase:'start'` → `emit_plan` → `phase:'plan'` → `emit_step` (loop) →
`emit_synthesize` → `phase:'synthesize'` → `done`. Review (`insrc_review_step`),
present-ask-approve, then run `plan`.
Apply the front-door **Relevant design artifacts** rule: assess relevance
independently, document relationship changes even when simple, and do not
require an ERD for isolated class edits. Use structured companion definitions only when the visual materially helps.
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

**Tell the gate which tests carry each planned test.** At `phase:'validate'`
pass `tests`: one entry per test the Task names, with `name` the test's text
exactly as the plan states it and `cases` the test cases that carry it, each a
`file` (repo-relative `.test.ts` path) and a `title` (exactly as the file
declares it). The daemon runs each mapped file itself and writes a result per
case (pass / fail / skipped / not found) to the Story's **test record**,
`TESTS.md` beside `BUILD.md`. A case that fails, is skipped or is not found
fails the Task, as does a named test with no case. For a `live` or `smoke` test
the daemon cannot run, give `reported: { result, evidence }` instead; it is
recorded as reported by you, not run by the gate. Omit `tests` on a later turn
of the same Task to reuse the stored mapping. Without a mapping, only a test
name that begins with `<file>.test.ts:` can be run. A wrong mapping is refused
with `invalid-test-mapping` and nothing is run. The test record is a record:
it is never approved.

After the build has produced its changes, run `code-review` over the changed
code, DECLARE the BUILD record and the code review with `insrc_present`, PRESENT
the verdict, then COMPLETE the Story by approving its **BUILD**
artifact with `insrc_workflow_approve` on the BUILD md/path. BUILD approval is
the code-review-gated completion act. A Story with NO code review, or one
reviewed by the party that wrote the code, is always withheld into `skipped[]`.
A code review whose verdict is `block` withholds completion under
`codeReview.enforce` (config, off / advisory by default). Either is passed only
with an explicit `overrideReview`.
Apply the front-door **Relevant design artifacts** rule: assess relevance
independently, document relationship changes even when simple, and do not
require an ERD for isolated class edits. Builders keep affected artifacts aligned with the implementation.
<!-- insrc:guide:build:end -->

<!-- insrc:guide:review:start -->
## review — design-artifact review by the other party (`insrc_review_step`)

Run this on a written artifact (DEF / HLD / LLD) BEFORE approving it — two sets
of eyes. The rule runs in BOTH directions: **the party that did not author the
work reviews it.** There are two parties: the controller (you, this session)
and the daemon. An artifact you authored through `insrc_workflow_step` is
reviewed by the daemon; an artifact the daemon authored is reviewed by you. The
same model on both sides is fine: what matters is that the reviewer is the
other party, working from its own reading of the code. A subagent you spawn is
still you, so it is not a second party.

You do not choose the reviewer. Call `insrc_review_step` with `phase:'start'`
and the tool routes by who authored the artifact:

- **You authored it (or the author is not recorded):** the tool asks the daemon
  to review, waits, and returns `done` with the daemon's verdict in the same
  call. This can take several minutes (a DEF has measured about 13; the tool
  uses its configured outer execution ceiling). If the daemon is not running, is too old
  to know the request, fails, or passes the wait limit, the tool returns an
  error naming the cause. It does NOT fall back to a review by you: fix the
  cause and call again, or tell the user, who can approve with an override
  reason.
- **The daemon authored it:** you review it, through the loop below.

For a daemon-authored artifact, supply `reviewBudget` on start and every
continuation: `{ version: 1, profile, hostContextReserveTokens }`. Look up the
registered profile fields with `insrc_schema`; use an explicit
`controller-reserved` profile and refresh the estimate of the host conversation
every turn. The server owns and pins its cap/profile. These are estimates and
reserves, not measured host context or a verified hard native ceiling.

The tool returns one admitted assigned request, its versioned reply schema,
call metadata, timing and opaque state. Execute the complete request and send
`reply: { version: 1, generation, callId, answer }`, `state`, and a fresh
`reviewBudget`, using the indicated outer phase: `claims` after `emit_claims`,
`verdicts` after `emit_verdicts`, or `findings` after `emit_findings`. Continue
the same run until `done`. Extraction finishes before deterministic probes;
each verification call owns exactly its assigned claims and all their evidence.
An HLD/LLD uses its fixed template checklist. Every required claim/item must
validate before a review is persisted. The server measures the complete
response, never appends unmeasured whole grounding, and refuses unsupported
indivisible requests rather than truncating required material. Old raw final
arrays and stale tokens refuse; a final replay returns `already_completed`.

Either way the review is recorded on the lifecycle, and **approval requires it**: a
DEF, HLD or LLD with no review, or with a review done by the party that
authored it, is withheld, and so is one whose verdict is `block` (unresolved
HIGH/MED findings). Resolve the blocking findings (apply / accept-with-note /
override), THEN declare the document with `insrc_present`, present-ask-approve
with `insrc_workflow_approve({ artifactPath })`. A withheld artifact comes back from
approve in `skipped[]` with a reason (relay it); pass `overrideReview` only with
the user's explicit override reason. An ISSUE, SPEC or PLAN needs no review,
only the user's approval: do not review one unless the user asks.

**At most three review rounds per cycle.** A round is one review call
(`insrc_review_step` or `insrc_code_review_step`), whatever its verdict. After
the third round on the same artifact or code, STOP: show the user the latest
review's findings and what the earlier rounds changed, and ASK whether to run
another cycle of up to three rounds, approve with an override reason, or change
course. Do not start a fourth review until the user says so.
Apply the front-door **Relevant design artifacts** rule: assess relevance
independently, document relationship changes even when simple, and do not
require an ERD for isolated class edits. Reviewers inspect actual generated files/links/rendering and qualify unavailable evidence.
<!-- insrc:guide:review:end -->

<!-- insrc:guide:code-review:start -->
## code-review — post-build code review by the other party (`insrc_code_review_step`)

The default remains the legacy protocol below. For an explicitly enabled
`plan-investigation-v1` run, call `insrc_schema` for phase `investigation` and
use its versioned `engine`, `command` and client `capabilities` envelope. Start
with explicit approved commit/parent/scope selections and canonical BUILD;
never infer scope from HEAD or a Story trailer. The daemon derives the
independent reviewer. Controller turns require a fresh declared `reviewBudget`
on each scoped call. Follow the returned binding, turn, navigation references
and exact coverage IDs; use only scoped read/impact/progress/reply operations.
Checkpoint each block durably, retain unresolved evidence/coverage, and finish
with accepted receipt IDs and no new deltas. Status/detach is not a verdict or
a retry; resume the same run rather than starting another review. Unsupported
versions, stale pins or missing readiness refuse without legacy fallback.

Activation additionally requires independently qualified installed adapters,
approved version-pinned evaluation evidence and separately approved predecessor
code-only reconciliation. A config switch or scripted fixture alone is
insufficient. Rollback preserves status/cancel and frozen publication recovery
while disabling/draining new turns. See `docs/review-investigation.md`.


Run this over the changed code AFTER the build produces its changes. DISTINCT
from `insrc_review_step` (which reviews the design artifact). The same rule
applies: **the party that did not write the code reviews it**, and the tool
routes it. Call `phase:'start'` with `{ epicHash, storyId, repo? }`:

- **You wrote the code (a build you drove with `insrc_build_step`), or the
  author is not recorded:** the tool asks the daemon to review and returns
  `done` with its verdict. If the index is stale it first returns
  `confirm_wait`: ask the user, then call `start` again with that `state` and
  `proceed` (true = wait for a fresh index, false = review the diff instead). A
  review of the diff is recorded as `degraded` and can be `warn` at best. If the
  daemon review does not complete the tool returns an error naming the cause;
  it does NOT fall back to a review by you.
- **The daemon wrote the code:** declare a versioned `controller-reserved`
  profile and a fresh `hostContextReserveTokens` as `reviewBudget`. Each
  `emit_judgements` assigns one complete request and its answer schema. Execute
  only that request; resume with `reply={version:1,generation,callId,answer}`,
  the opaque state and a fresh declaration until `done`. Preserve all evidence;
  never submit an aggregate legacy answer or reuse an older generation. Host
  context is declared/reserved; external execution is not measured by the daemon.

Either way it writes a code-review record across four dimensions — **adherence /
conventions / coverage / quality** → block / warn / pass.

When you are the reviewer and the graph grounding comes back hollow on
just-created files (no symbol/test edges), judge coverage by RUNNING the suite
and flag the caveat honestly — never fabricate a HIGH from empty grounding.
PRESENT the verdict, then COMPLETE the Story by approving its **BUILD** artifact
(see the `build` guide — BUILD approval is the code-review-gated completion act,
and a Story with no code review is always withheld).

**At most three review rounds per cycle.** A round is one review call
(`insrc_review_step` or `insrc_code_review_step`), whatever its verdict. After
the third round on the same artifact or code, STOP: show the user the latest
review's findings and what the earlier rounds changed, and ASK whether to run
another cycle of up to three rounds, approve with an override reason, or change
course. Do not start a fourth review until the user says so.
Apply the front-door **Relevant design artifacts** rule: assess relevance
independently, document relationship changes even when simple, and do not
require an ERD for isolated class edits. Reviewers inspect actual generated files/links/rendering and qualify unavailable evidence.
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
   It needs no review (only a DEF, HLD or LLD and the code review are
   mandatory): present-ask-approve.
3. **Approve the issue** with `insrc_workflow_approve`. Approval AUTO-ADVANCES the
   bugfix chain: the daemon locates + stamps the fix's parent, checks the advance
   gate, and routes to the next stage (build for small, design.story for sized).
   The approval result carries a `followOn` entry describing what fired; relay a
   failed advance (`ok:false`) rather than assuming it advanced.
4. **Continue the routed chain** (build, or design.story → plan → build), each
   with its own present-ask-approve gate and a review only where one is
   mandatory (the LLD, and the code review of the build). Completing the bugfix BUILD
   is the code-review-gated completion act, exactly as for a feature story.

Do NOT patch a bug off-ledger. Skip triage only for a one-liner the user
explicitly scoped as trivial.
<!-- insrc:guide:bugfix:end -->
