## insrc — front door (insrc MCP server)

### Hard gates — never skipped, whatever the host agent

These apply to every agent (Claude Code, Codex, Vibe, …) working in this repo.
If a gate cannot be satisfied, stop and ask the user — do not improvise around it.

1. **Approval is a human gate.** Never call `insrc_workflow_approve` unless the
   user gave an explicit in-chat yes in the same turn, for the specific artifact:
   the yes names the artifact id/path, or answers "yes" to the summary you just
   presented after `insrc_present`. A blanket "approve all" covers ONLY the
   artifacts you declared with `insrc_present` in that same turn — list them.
   Never batch-approve via `{ epicHash }` without naming each artifact and
   getting a yes for that batch. Never approve via raw daemon IPC/socket —
   only through the registered `insrc_workflow_approve` MCP tool.
2. **Present before you ask.** `insrc_present` must report every declared name
   as `presented` before you ask for approval. If it errors, or any name comes
   back `notPending`, correct the name and call again; if it cannot succeed,
   STOP and tell the user — do not approve anything that was not presented.
3. **Automated reviews are unavailable.** Design and code review endpoints raise an exception stating they are being rewritten. Validate changes and report self-check evidence; keep human artifact approval.
4. **Never patch off-ledger.** Every feature and every defect goes through
   triage → tracked artifact → approval → build → validate → approve. No direct
   commits that implement tracked work without the chain's records.
5. **Workflows run only via `insrc_workflow_step`**, turn-by-turn, preserving
   the opaque `state` token. Never `insrc_workflow_run`, never raw IPC.
6. **If `insrc_schema` / `insrc_guide` / `insrc_present` are unavailable or
   error, do not improvise their content from memory — say so and ask the user.**

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
<!-- insrc:analyze-request:start -->
  - **Send a structured `request`, not just the prompt.** Read the user's prompt
    yourself and decide what it is about, then call `insrc_analyze_step` (or
    `insrc_analyze`) with `request: { question, scopeRef: { kind, value },
    target?, sizeHint?, context? }`. `scopeRef` names what to analyse: a
    module or file as an ABSOLUTE path, a symbol as
    `<absolute file path>#<entity name>` (a bare name is not accepted), or the repo; use
    `workspace` only when the prompt names no area. Put background the user
    gave that bears on the answer in `context` (it never decides the scope).
    The daemon checks the scope against the repository and answers
    `scope-not-found` or `scope-repo-mismatch` rather than guessing. A
    `focus`-only call still works and analyses the whole workspace.
<!-- insrc:analyze-request:end -->
- **Draw / diagram / document / map the code** (a self-contained HTML doc from
  the graph) → `insrc_docgen`. For PROPOSED designs, use the workflow
  artifact definitions below; docgen describes existing code, not a future model.
- **Build / add / implement a feature** → do NOT hand-pick a stage and do NOT
  just start editing. Route it: `brainstorm` (if the idea is rough) →
  `insrc_triage` (sizes + routes) → the routed workflow → present → approve →
  build → validate → human approval → complete. Every feature, big or small, is tracked. See
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
| `insrc_review_step` | Retained endpoint; fails immediately: design review is being rewritten. |
| `insrc_code_review_step` | Retained endpoint; fails immediately: code review is being rewritten. |
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
Record which checks were actually performed and any unavailable evidence.

### Approval discipline (applies to every workflow artifact)

Never auto-approve and never send the user to the TUI. When a `done` response
carries a `pendingApproval` block — or any step you drove leaves a record
pending (check `insrc_workflow_step`'s done response and the pending list) —
the gate is the same every time: first DECLARE what you are about to show by
calling `insrc_present({ documents: [...] })` with each document's artifact id
(for example `LLD-<hash>-s1`) or repo-relative path, and require every name
to come back `presented`; then PRESENT a concise summary (give the document's
path in your message too) and ASK the user. Only then, on the user's explicit
in-chat yes **for that artifact** (the message names its id/path, or answers
"yes" to the summary you just presented), call
`insrc_workflow_approve({ artifactPath })`. A blanket "approve all" authorizes
only the artifacts you presented in that same turn. Never batch via
`{ epicHash }` without listing each artifact and getting a yes for the batch.
Never call `insrc_workflow_approve` through raw daemon IPC or a socket — only
through the MCP tool. Automated reviews are unavailable; present the artifact and obtain explicit human approval.

### Review availability

Automated design and code review functionality has been removed while it is being rewritten. Retained endpoints fail immediately; do not start or poll them. Historical review records remain readable. Human approval, build validation, integrity, task accounting, upstream and team/signoff gates still apply.

The chat opens exactly the documents you declare with `insrc_present`; it does
not work out what to open from tool output, so a document you do not declare is
not opened for the user. The answer lists each name as `presented` or
`notPending` (misspelt, already approved, or with no document file yet): correct
a `notPending` name and call again, and require every declared name to be
`presented` before you ask for approval. If `insrc_present` itself is
unavailable or errors, do not approve anything that turn — report the tool
failure and ask the user instead.

### Keep the user informed during long work

Group long work into small batches rather than one long-running batch, and post
a short update to the chat after each batch: what finished and what comes next.

Do not chain activities such as reviews and test runs silently. Before starting
the next one, say in the chat what the last one found and what you are starting.

These updates need no answer. Carry on, and stop for the user only where the
rules above require it.

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
- **trivial** → `issue` stage as a change (`kind: 'change'`, no LLD) → `build`.
  The ISSUE records what was asked and why and heads the work item; the build
  runs under its hash.
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
`done` with the written artifact. Present the Define, then
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
`phase:'synthesize'` → `done`. Present the HLD for explicit human approval using the present-ask-approve gate. Next stage: `design.story` per Story.
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
`emit_synthesize` → `phase:'synthesize'` → `done`. Present the artifact,
present-ask-approve, then run `plan`.
Apply the front-door **Relevant design artifacts** rule: assess relevance
independently, document relationship changes even when simple, and do not
require an ERD for isolated class edits. Use structured companion definitions only when the visual materially helps.
<!-- insrc:guide:design.story:end -->

<!-- insrc:guide:amendment:start -->
## amendment — a mechanical delta to an approved HLD

An amendment is a small, typed, mechanically-appliable delta to an Epic's
**HLD** — never to an LLD (there is no LLD amendment kind; a Story's LLD is
corrected by re-running `design.story`, not amended). Eleven kinds across four
families: `sharedContract.fieldAdd` / `fieldRemove` / `rename` / `methodAdd`;
`storyBoundary.reassignOwnership` / `addConsumer` / `addStory`;
`nonFunctional.retarget`; `rollout.reorder` / `splitPhase` / `mergePhases`.

**You never construct an amendment directly** — there is no MCP call that
creates one. It is an emergent side effect of running a workflow you'd already
be running:
- `define`'s `scope.assess` step files a `storyBoundary.addStory` amendment
  automatically when it classifies an ask as "extend" (builds on an existing
  Epic) rather than "new".
- `design.story`'s own step sequence can carry a proposal at steps `s4` or
  `s5` only, nested as `hld.amendmentProposal: { amendment, rationale,
  citations? }` (any of the eleven kinds) — not a bare top-level `amendment`
  field, and not from any other step. At finalize this is validated against
  the current effective HLD and, if valid, persisted — an invalid proposal is
  dropped with a warning rather than failing the LLD. `plan` and `build` never
  propose amendments.

Each valid proposal is written as its own pending `AMD-<epicHash>-<seq>`
artifact. **Approval is the SAME generic gate as any other artifact** — no
separate amendment-approval call: `insrc_present` the AMD path, get the user's
explicit yes, then `insrc_workflow_approve({ artifactPath })`. Once approved,
it is folded into the Epic's *effective* HLD that downstream LLD/staleness
checks read, without a new `design.epic` run.
<!-- insrc:guide:amendment:end -->

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
`phase:'validate'`. A **trivial** change or a **small** bugfix comes here with no
LLD, after its ISSUE is approved: pass the ISSUE's hash as `standalone.epicHash`
(the advance's `nextCall` carries it). A no-LLD build without an approved ISSUE
is refused. Call
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

After the build passes validation, report self-check evidence and limitations, DECLARE the BUILD with `insrc_present`, PRESENT its summary and ASK for human approval. On explicit approval call `insrc_workflow_approve` for that BUILD. Completion still enforces current task/build, integrity, upstream and team/signoff requirements; no automated review or CR is required.
Apply the front-door **Relevant design artifacts** rule: assess relevance
independently, document relationship changes even when simple, and do not
require an ERD for isolated class edits. Builders keep affected artifacts aligned with the implementation.
<!-- insrc:guide:build:end -->

<!-- insrc:guide:review:start -->
## review — unavailable

Design review functionality is being rewritten. The retained endpoints fail immediately without running a review. Do not invoke or poll them. Existing records remain readable. Present artifacts for explicit human approval and record build/self-check evidence.
<!-- insrc:guide:review:end -->

<!-- insrc:guide:code-review:start -->
## code-review — unavailable

Code review functionality is being rewritten. The retained endpoints fail immediately without running a review. Do not invoke or poll them. Existing records remain readable. Present artifacts for explicit human approval and record build/self-check evidence.
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
   - **small** → `issue` → `build` (no LLD; the build runs under the ISSUE's
     hash).
   - **sized** → `issue` → `design.story` (LLD) → `plan` → `build`.
   Triage hands back a pre-filled `nextCall` that starts `insrc_workflow_step`
   with `workflow: 'issue'` — make exactly that call.
2. **Run the `issue` stage** with `insrc_workflow_step` (turn-by-turn, like every
   workflow). It writes an **IssueArtifact** — the single defect record (root
   cause, reproduction, fix intent) that also becomes the GitHub issue body.
   Present it and ask for human approval.
3. **Approve the issue** with `insrc_workflow_approve`. Approval AUTO-ADVANCES the
   bugfix chain: the daemon locates + stamps the fix's parent, checks the advance
   gate, and routes to the next stage (build for small, design.story for sized).
   The approval result carries a `followOn` entry describing what fired; relay a
   failed advance (`ok:false`) rather than assuming it advanced.
4. **Continue the routed chain** (build, or design.story → plan → build), each
   with its own present-ask-approve gate. Complete the bugfix BUILD after validation and explicit human approval, as for a feature story.

Do NOT patch a bug off-ledger. A change the user scoped as trivial still starts
with an ISSUE: triage routes trivial work to the `issue` stage too.
<!-- insrc:guide:bugfix:end -->
