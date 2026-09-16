<!-- insrc:artifact LLD-cd8f78588425e049-S001 -->

# LLD: S001

**Epic:** `wire-brainstorm-stage-post-build-code`
**HLD base run:** `wf-1785848454822-29opr5`
**HLD effective hash:** `cd8f78588425...`

## HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## Contract details

**Surface level:** public

### `readSteeringBlock`

```typescript
function readSteeringBlock(): string
```

**Returns:** `string` — The verbatim body of the shipped src/prompts/steering-block.md (src or out/ copy). This Story does NOT change the signature or the reader — it changes the ASSET CONTENT that flows through it: the returned body gains a brainstorm pre-workflow note (step 0) + a post-build code-review completion step in the 'Building features' section. Injected verbatim into each repo's CLAUDE.md/AGENTS.md by injectSteeringBlock/refreshSteeringAcrossRepos, so the content change propagates on repo.add / daemon-ctl.sh update with no code edit.

**Preconditions:**
- The reader + injector are unchanged (steering-inject.ts reads the asset verbatim); only the .md asset content changes.
- The tools the new content references already ship + are wired: brainstorm is workflow:'brainstorm' (registerBrainstormRunners), insrc_code_review_step is registered in server.ts, enforceCodeReviewGate is wired into approveWorkflowTarget.

**Postconditions:**
- readSteeringBlock() returns a body that mentions the brainstorm stage AND insrc_code_review_step (asserted by the extended steering-inject.test.ts), in addition to the existing insrc_triage / insrc_review_step it already asserts.
- The block still starts/ends cleanly and stays non-empty + >200 chars (the injector's non-triviality contract is preserved).

## Data model changes

### `src/prompts/steering-block.md — 'Building features via insrc' section` — field-add

Fold two steps into the existing numbered build flow (winner a1): a BRAINSTORM step 0 (pre-workflow) — for a rough/ambiguous idea, run workflow='brainstorm' via insrc_workflow_step/insrc_workflow_run first: one paused 'elicit' convergence turn (clarify→fold→show→confirm; record forks in decisions[]/nonGoals; resume once confirmed) → review+approve the SpecArtifact → seed triage/define/design.story from the approved spec; and a CODE REVIEW completion step (post-build) — after the build, run insrc_code_review_step (start→judgements→done) over the changed code, present it, then complete the story via insrc_workflow_approve on the BUILD (enforceCodeReviewGate gates it; codeReview.enforce opt-in/advisory). The section reads as one ordered lifecycle: brainstorm→triage→run→review→approve→build→code-review→complete.

**Call sites:**
- `src/daemon/steering-inject.ts`

### `CLAUDE.md — 'Building features via insrc' section (this repo, dogfood mirror)` — field-add

Mirror the same two additions (brainstorm step 0 + post-build code-review completion step) into this repo's own hand-maintained 'Building features via insrc' section so the dogfood repo's authoritative instructions match the shipped steering. This section carries NO steering markers (it is not the injected block) and is edited directly.

**Call sites:**
- `CLAUDE.md`

### `src/daemon/__tests__/steering-inject.test.ts — readSteeringBlock content assertion` — invariant-change

Strengthen the existing 'readSteeringBlock resolves + is non-trivial' assertion to also require the shipped block mentions the two newly-wired stages: add assert.match(block, /brainstorm/i) and assert.match(block, /insrc_code_review_step/), alongside the existing /insrc_triage/ + /insrc_review_step/. Guards against a future edit silently dropping either stage from the steering.

**Call sites:**
- `src/daemon/__tests__/steering-inject.test.ts`

## Error paths

### Error cases

- **The content edit accidentally references a NON-EXISTENT surface (e.g. an 'insrc_brainstorm' MCP tool, or claims the code review auto-runs / that enforce is on by default) — steering that lies about the tools.** (recoverable)
  - Detection: Caught at review: the LLD's own grounding (s1 bundles c3/c4) pins the real surfaces — brainstorm is workflow:'brainstorm' via insrc_workflow_step/run (no standalone MCP tool), insrc_code_review_step is controller-driven start→judgements→done, codeReview.enforce defaults false. The steering-inject.test.ts assertions (/brainstorm/i, /insrc_code_review_step/) confirm the intended tokens are present but a human/review pass verifies they describe the real flow.
  - Response: Describe brainstorm as the workflow stage it is and code-review via insrc_code_review_step exactly, with enforce called out as opt-in/advisory; never invent a tool name or overstate automation.
  - User impact: An agent following accurate steering invokes the real tools; inaccurate steering would send it to a non-existent tool or wrong expectation.
- **The edit leaves the block empty, sub-200-char, or otherwise trivial (e.g. a bad find/replace nukes the section).** (recoverable)
  - Detection: src/daemon/__tests__/steering-inject.test.ts asserts readSteeringBlock().length > 200; runUpdateSteeringRefresh treats an empty asset as a failure (maintenance-steering-refresh.test.ts 'empty steering asset ... undefined').
  - Response: The additive edit only GROWS the build section; the non-triviality assertion + the empty-asset guard fail loudly in CI before ship.
  - User impact: A broken asset never silently ships — the refresh is best-effort and skips rather than injecting an empty block.
- **The asset content itself accidentally contains the injection markers (STEERING_MARKER_START/END) or a stray duplicate marker.** (recoverable)
  - Detection: injectSteeringBlock treats a file with duplicate/malformed markers as action:'unchanged' with a 'malformed'/'duplicate' note (steering-inject.test.ts). The ASSET must never carry the markers — the injector adds them around the body.
  - Response: The added content is plain markdown (## / numbered steps) with NO insrc:steering markers; markers stay the injector's responsibility.
  - User impact: Injection stays a clean marker-bounded upsert; surrounding repo content is never clobbered.

### Edge cases

| Input | Expected |
| :--- | :--- |
| copy-assets has not yet shipped the updated md to out/prompts/ (running from a stale build). | readSteeringBlock resolves the shipped asset (out/ copy preferred, src fallback); after npm run build the updated content is what injects. The content change takes effect on the next repo.add / daemon-ctl.sh update refresh (steering-refresh-on-update), not retroactively. |
| A repo opted out of the steering block (no markers, or user declined install). | Unchanged: injectSteeringBlock skips opted-out / marker-less files (action:'skipped'). The new content only reaches repos that already carry the block — replace-only, opt-out-safe. |
| The block already read as one ordered flow; brainstorm is inserted as step 0 and code-review as the completion step. | The numbered 'Building features' list stays a single coherent sequence (brainstorm→triage→run→review→approve→build→code-review→complete); the existing steps keep their meaning and order. |
| The test regex /insrc_code_review_step/ vs the prose wording. | The steering must spell the exact tool token insrc_code_review_step (not just 'code review') so the assertion + an agent's tool lookup both match. |

### Invariants to preserve

- steering-inject.ts reads the asset VERBATIM and upserts it between STEERING_MARKER_START/END markers; the asset itself must stay marker-free and non-empty (>200 chars). A content-only change needs NO edit to the reader/injector. [[c2]]
- The change is strictly ADDITIVE to the existing 'Building features' numbered flow — the four top-level sections and the triage→run→review→approve steps keep their content + order; brainstorm is prepended as step 0 and code-review appended as the completion step, nothing is restructured or removed. [[c1]]
- Brainstorm is documented as the workflow STAGE it is (workflow:'brainstorm' via insrc_workflow_step/insrc_workflow_run → SpecArtifact → seeds define/design.story), NOT as a standalone MCP tool that does not exist. [[c3]]
- The code-review step is documented exactly as insrc_code_review_step (start→judgements→done) completing via BUILD approval gated by enforceCodeReviewGate, with codeReview.enforce called out as opt-in/advisory-by-default — the steering must not overstate enforcement or automation. [[c4]]

## Test strategy

**Test framework:** `node:test + node:assert/strict via `npx tsx --test` (matching src/daemon/__tests__/steering-inject.test.ts)`

### Test levels

- **unit** — Prove the shipped steering asset (via readSteeringBlock) documents the two newly-wired stages while preserving the existing flow — by extending the existing 'readSteeringBlock resolves + is non-trivial' content assertion in steering-inject.test.ts. Pure in-process read of the shipped asset; no daemon/graph.
  - Subjects: `readSteeringBlock() body matches /brainstorm/i — the brainstorm stage is documented (ac1)`, `readSteeringBlock() body matches /insrc_code_review_step/ — the post-build code-review step is documented with its exact tool token (ac2)`, `readSteeringBlock() body still matches /insrc_triage/ + /insrc_review_step/ and stays length>200 — the change is additive, nothing removed, block stays non-trivial (ac3)`
  - Fixtures: `The existing steering-inject.test.ts 'readSteeringBlock' test (reads the shipped src/out prompts/steering-block.md in-process); node:test + node:assert/strict via npx tsx --test`
- **smoke** — Confirm the dogfood mirror + no regressions: this repo's CLAUDE.md 'Building features' section carries the same brainstorm + code-review additions, and the full sweep stays green (steering-inject.ts untouched, both tools already wired).
  - Subjects: `This repo's CLAUDE.md 'Building features via insrc' section documents the brainstorm step 0 + the post-build insrc_code_review_step completion step, matching the shipped steering (ac4)`, `npx tsx --test 'src/daemon/**/*.test.ts' + 'src/cli/**/*.test.ts' pass — maintenance-steering-refresh.test.ts (synthetic body) unaffected; no runtime code touched`
  - Fixtures: `A manual/review read of CLAUDE.md against the shipped steering-block.md; the daemon + cli test sweeps`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: 'readSteeringBlock ... mentions brainstorm' (assert.match(block, /brainstorm/i))` |
| `ac2` | `unit: 'readSteeringBlock ... mentions insrc_code_review_step' (assert.match(block, /insrc_code_review_step/))` |
| `ac3` | `unit: 'readSteeringBlock stays non-trivial + retains insrc_triage/insrc_review_step' (existing length>200 + /insrc_triage/ + /insrc_review_step/ assertions still pass)` |
| `ac4` | `smoke: 'CLAUDE.md dogfood mirror carries the brainstorm + code-review additions (review/manual verification) + full daemon/cli sweeps green'` |

## Migration

**State before:** src/prompts/steering-block.md documents analyze, docgen, the 'Building features via insrc' numbered flow (insrc_triage → insrc_workflow_run/step → insrc_review_step → insrc_workflow_approve), and workflow authoring — with NO brainstorm and NO post-build code-review guidance (s1 bundle c1). Both capabilities ship + are wired (brainstorm = workflow:'brainstorm' via registerBrainstormRunners, s1 c3; insrc_code_review_step registered in server.ts + enforceCodeReviewGate wired into approveWorkflowTarget, s1 c4) but are never invoked because the steering never mentions them. This repo's own CLAUDE.md carries the same build section, also missing both (s1 c6). steering-inject.ts reads the asset verbatim (s1 c2).

**State after:** The 'Building features' section (in both the shipped steering-block.md and this repo's CLAUDE.md) reads as one ordered lifecycle brainstorm→triage→run→review→approve→build→code-review→complete: a brainstorm step 0 (workflow='brainstorm' → SpecArtifact → seeds triage/define/design.story) and a post-build code-review completion step (insrc_code_review_step → present → complete via BUILD approval gated by enforceCodeReviewGate; enforce opt-in). The steering-inject.test.ts content assertion also requires /brainstorm/i + /insrc_code_review_step/. On the next repo.add / daemon-ctl.sh update, the refreshed block reaches every registered repo that carries the markers.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Edit the src/prompts/steering-block.md 'Building features via insrc' section: prepend a BRAINSTORM step 0 (pre-workflow) and append a CODE REVIEW completion step (post-build), additively — existing steps + the other three sections keep their content and order; asset stays marker-free + non-trivial. — ↩ rollbackable
2. Mirror the same two additions into this repo's hand-maintained CLAUDE.md 'Building features via insrc' section so the dogfood repo's authoritative instructions match the shipped steering. — ↩ rollbackable
3. Extend the steering-inject.test.ts 'readSteeringBlock' content assertion to also require /brainstorm/i + /insrc_code_review_step/ (keeping the existing >200 + /insrc_triage/ + /insrc_review_step/ checks). — ↩ rollbackable
4. Build (npm run build so copy-assets ships the updated md to out/prompts/) and run the daemon + cli test sweeps; the content reaches registered repos on the next repo.add / daemon-ctl.sh update steering refresh (replace-only, opt-out-safe) — no manual per-repo action. — ↩ rollbackable

**Backward compat:** Strictly additive + content-only. readSteeringBlock's signature and the injector are unchanged (steering-inject.ts untouched); only the .md asset body grows. The block stays marker-free and >200 chars, so the injector's non-triviality + marker-upsert contracts hold. Repos that opted out (no markers / declined install) are unaffected — the refresh is replace-only and skips them. The referenced tools already ship, so agents that follow the new steering hit real, wired surfaces. Nothing is removed or reordered, so an agent relying on the existing triage→review→approve steps sees them unchanged.

## Alternatives considered

### a1: Fold both into the 'Building features' pipeline (brainstorm = step 0, code-review = completion step) — **CHOSEN**

Extend the existing numbered build flow: brainstorm becomes a pre-triage step 0, code review + BUILD-approval become the post-approve completion step, so the section reads as one front-to-back tracked lifecycle.

In src/prompts/steering-block.md's 'Building features via insrc — classify FIRST, review before approve' section, add a step 0 (BRAINSTORM, pre-workflow): if the request is a rough/ambiguous idea, run workflow='brainstorm' via insrc_workflow_step/insrc_workflow_run FIRST — one paused 'elicit' convergence turn (clarify→fold→show→confirm, record forks in decisions[]/nonGoals, resume once confirmed) → review+approve the SpecArtifact → seed triage/define/design.story from the approved spec. Append a final step (CODE REVIEW, post-build): after the build completes, run insrc_code_review_step (start→judgements→done) over the changed code, present it, and complete the story via insrc_workflow_approve on the BUILD (enforceCodeReviewGate is the completion gate; codeReview.enforce opt-in). Mirror both into this repo's CLAUDE.md 'Building features' section. The pipeline stays a single ordered narrative: brainstorm → triage → run → review → approve → build → code-review → complete.

### a2: Two new standalone ## sections (peer to analyze / docgen)

Add a dedicated '## Brainstorm — converge a rough idea into a spec' section and a '## Code review — post-build' section as top-level peers, and reference them from the build flow.

Add two new ## sections to steering-block.md alongside the analyze/docgen/build/workflow sections, each self-contained (tool, loop shape, when-to-use), plus a one-line pointer from the 'Building features' flow ('if the idea is rough, brainstorm first — see below'; 'after build, code-review — see below'). Update the analyze-vs-workflow decision heuristic to mention both. Mirror the headings + gist into this repo's CLAUDE.md.

**Rejected because:** Winner-rank 3. VIOLATES k-coherent-lifecycle + k-coupling: fragments the ordered sequence across three sections and decouples code-review from the BUILD-approval step it gates — the two things that actually make steering get followed — in exchange for discoverability. Wrong trade for a behavior-inducing prompt.

### a3: Hybrid — brainstorm folded as step 0; code-review as its own ## section

Fold brainstorm into the build flow as the pre-triage step 0, but give code review its own top-level section (like analyze/docgen) since it's a distinct multi-turn tool with its own loop.

Add brainstorm as step 0 of the 'Building features' flow (as in a1). Add code review as a new '## Post-build code review via insrc_code_review_step' top-level section with its own start→judgements→done loop shape, referenced by a one-line pointer at the end of the build flow. Mirror into this repo's CLAUDE.md.

**Rejected because:** Winner-rank 2. A2-lite: brainstorm folding is right, but sectioning code-review still splits the completion coupling (k-coupling partial) + treats the two additions asymmetrically, for no real benefit at this size. The code-review loop is short enough to summarize inline. Strictly dominated by a1.

## Citations

- **[[c1]]** `analyze-bundle` `s1 search.text — src/prompts/steering-block.md current structure: four ## sections (analyze, docgen, 'Building features via insrc' numbered triage→run→review→approve flow, workflow authoring); no brainstorm + no post-build code-review; the build section is the additive insertion surface.`
- **[[c2]]** `analyze-bundle` `s1 symbol.locate — src/daemon/steering-inject.ts readSteeringBlock()/injectSteeringBlock()/refreshSteeringAcrossRepos(): reads the shipped asset VERBATIM + upserts between STEERING_MARKER_START/END markers; content-only change needs no code edit; asset must stay marker-free + non-trivial.`
- **[[c3]]** `analyze-bundle` `s1 symbol.locate — brainstorm is a workflow STAGE (workflow:'brainstorm', registerBrainstormRunners in src/workflow/runners/brainstorm/index.ts): a single paused 'elicit' convergence turn producing a SpecArtifact; seed-focus.ts consumes an approved spec as the framing focus for define/design.story. Not a standalone MCP tool.`
- **[[c4]]** `analyze-bundle` `s1 symbol.locate — insrc_code_review_step registered in src/mcp/server.ts (start→judgements→done); enforceCodeReviewGate (src/workflow/code-review/gate.ts) wired into approveWorkflowTarget (src/workflow/gates.ts) with BUILD as the code-review-gated completion target; codeReview.enforce defaults false (advisory).`
- **[[c5]]** `analyze-bundle` `s1 test.locate — src/daemon/__tests__/steering-inject.test.ts 'readSteeringBlock resolves + is non-trivial' asserts length>200 + /insrc_triage/ + /insrc_review_step/ (extend with /brainstorm/i + /insrc_code_review_step/); maintenance-steering-refresh.test.ts uses a synthetic body — no change.`
- **[[c6]]** `analyze-bundle` `s1 search.text — this repo's CLAUDE.md carries the same hand-maintained 'Building features via insrc' section (no steering markers), missing brainstorm + insrc_code_review_step; the dogfood mirror adds both here to match the shipped steering.`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 0 LOW** · model `client` · reviewed 2026-08-04T13:07:47.056Z

_No load-bearing premises were extracted._
