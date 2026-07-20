# Plan — Review-cycle completion + streaming-progress build

**Owner:** subhagho · **Drafted:** 2026-07-20 · **Status:** proposed

Consolidates every pending/identified change from the review-cycle + streaming
work into one sequenced plan. Three parts: **(1)** finish the review cycle so it
runs as a standard, gated, auto-fixing step after each stage; **(2)** unblock and
build the streaming-progress epic (now reviewable); **(3)** close the loose ends.

## Status snapshot (already committed on `main`)

- `fb84e5a` TUI docs site · `f600c84` `insrc tracker setup` · `1aa22de` CLAUDE.md fixes
- `b190d7c` review **engine** (extract → probe → judge) + apply + audit/dogfood docs
- `db65982` review **enforcement** — approve-block gate + `reviewArtifactFile` entry
- 37 streaming Tasks planned + pushed (#45–#81); plan-quality audit → 4 HIGH / 13 MED / 20 LOW
  (`docs/reviews/2026-07-20-plan-audit-streaming.md`)

Done & proven: grounded detection, fixability classification, auto-fix applier,
`approve` blocks HIGH/MED (with override), `reviewArtifactFile` (review → auto-fix
→ re-review → persist + stamp `meta.review`). Dogfooded on the real s2 plan.

---

## Part 1 — Complete the review loop

Goal: review runs **automatically at each stage's finalize**, blocks approval on
HIGH/MED, auto-fixes the fixable, and iterates the rest with the user — with the
report posted to the tracker.

### R1 · CLI + manual trigger  `[S · low risk]`
- **What:** `insrc workflow review <path>` → `reviewArtifactFile(...)`; `insrc workflow approve <path> --override "<reason>"` → `approve(path, tracker, reason)`.
- **Where:** `src/cli/command.ts` (async command dispatch — confirm it supports async; `review`/`approve` cases), `src/cli/services/workflow.ts` (add `reviewArtifact` service that builds a provider via `buildShaperProvider`/`CliProvider` and calls `reviewArtifactFile`). Render the report + verdict + pending gate items.
- **DoD:** run `insrc workflow review <plan>` → writes `meta.review`, applies auto-fixes, prints verdict; a blocked artifact refuses `approve` without `--override`. Unit test the service wiring.

### R2 · Finalize auto-run (daemon path)  `[M · med risk]`
- **What:** after `finalizeArtifact` writes an artifact in the **daemon** `workflow.run`, call `reviewArtifactFile` (provider already in scope), stream review progress as `stream:'progress'` frames, stamp `meta.review`.
- **Where:** `src/daemon/workflow-rpc.ts` (post-synthesize/finalize point), reuse the run's `provider` + `onProgress`. Gate behind a config/opt flag so a run can skip review if asked.
- **DoD:** a daemon-driven `plan` run ends with `meta.review` populated + a rendered review section in the `.md`; verdict visible in the run result. Calibrated per stage (PLAN = full inventory re-derivation; DEF/HLD/LLD = citation + consistency — pass `stage` through, already supported).
- **Note:** the **MCP client-driven** path (`insrc_workflow_step` synthesize, `meta.model:'client'`) can't run a provider server-side; it either (a) relies on R1's manual command, or (b) gets a client-driven review phase — deferred to R6.

### R3 · Interactive user-review gate  `[L · high effort]`
- **What:** iterate `assisted`/`manual` findings one at a time — present premise + real evidence + options → user resolves / edits / defers / overrides → apply → re-review until the verdict clears.
- **Where:** mirror the open-question machinery: a `recordReviewResolution` (like `questions.recordResolution`), a `review` phase in `insrc_workflow_step` (like `resolve-question`), and a TUI surface in the Workflows pane. `pendingUserFindings` already returns the ordered work-list.
- **DoD:** a blocked artifact can be walked to `pass` (or explicit override) entirely through the gate; resolutions recorded in `meta.review`. Reuse `questionsWithOptions` UX patterns.

### R4 · Tracker comment  `[S · low risk]`
- **What:** on approval, post `renderReviewReport(meta.review)` as an issue comment (+ any override reason), alongside the existing HLD/LLD summary comments.
- **Where:** `src/workflow/tracker-auto.ts` (the `tracker.post`/comment path). 
- **DoD:** approving a reviewed artifact leaves a review comment on its Epic/Story/Task issue.

### R5 · Severity calibration  `[M · med risk]`
- **What:** the engine flagged **5 HIGH vs the manual audit's 3** — tighten the rubric so non-material claims (e.g. a dormant-but-correct token variant) land MED, not HIGH.
- **Where:** `src/workflow/review/verify.ts` prompt + a rubric doc; validate by re-running the dogfood on s1/s2/s3 and diffing against `docs/reviews/2026-07-20-plan-audit-streaming.md` as ground truth (target: HIGH set ⊆ manual HIGH set, no missed manual HIGH).
- **DoD:** re-dogfood reproduces the manual HIGH set without over-blocking; recorded in `docs/reviews/`.

### R6 · (Optional) client-driven review + build-time review  `[L]`
- MCP client-driven review phase (client emits extract/verify turns) for the `meta.model:'client'` path.
- Generalize the build `t1` stop-and-widen into a review pass at `insrc_build_step implement` (re-verify a task's premises the moment code is written).

---

## Part 2 — Streaming-progress build (unblock → implement)

The 37 tasks are planned but the audit found defects. Fix the plans, then build —
each re-scoped artifact re-reviewed (Part 1) before approval.

### S1 · Re-design s2 → Option B: a streaming MCP tool over `workflow.run`  `[L · high value]`
- **Why the original s2 was void (review-cycle finding):** its plan forwards daemon
  `stream:'progress'` frames from the MCP tool boundary, but the MCP tools run
  **in-process** (`resumeRun`, `step.ts:51`), the streaming daemon op (`workflow.run`)
  is invoked **only over the socket** (`index.ts:1423`), and the SDK `progressToken`
  (on the `extra` arg) is discarded in every registration (`server.ts:157/300/419/471`).
  There were no frames at that boundary to forward.
- **DECISION (Option B):** give Claude/Codex live progress so a run going wrong can be
  **corrected mid-stream** instead of waiting for a 30–40 min black box. Add a NEW MCP
  tool (e.g. `insrc_workflow_run`) that: reads `progressToken` from the SDK `extra`;
  opens a socket stream to the daemon `workflow.run`; consumes its `stream:'progress'`
  / `'delta'` frames; maps each to a sc1 `ProgressEvent`; and forwards it as an MCP
  `notifications/progress`. Reuses the s2 LLD's sound `mcpProgressSink(server,
  progressToken) → ProgressSink` design — only the frame SOURCE changes (real daemon
  socket stream, not in-process). Threads the tool's `extra.signal` into `workflow.run`
  so the client can **abort** mid-run (observation + abort now; full redirect later).
- **Depends on s1** — it forwards the `ProgressEvent` frames s1's producers emit, so
  build s1 first. **Drop build-step** from the progress model (D2), and drop the
  `_meta`-on-envelope field-adds (wrong seam).
- **Action:** amend/re-run `design.story` for s2 with the Option-B architecture (auto-
  reviewed by the now-live cycle), re-plan, then build. Close the old #55–#65 wiring
  tasks as superseded.
- **DoD:** an MCP client run of a long `workflow.run` streams live `notifications/progress`
  and is abortable; re-scoped s2 artifacts pass the review cycle (no HIGH).

### S2 · Fix s1 defects  `[S]`
- **Defect:** s1 t9/t6/t7 cite a phantom "existing `stream` method at `workflow-rpc.test.ts:42`" (unused stub — graph resolved the wrong symbol); t3 has a token-mapping semantic gap (analyze's `preview` text tail has no count; `TokenProgressEvent` can't hold it).
- **Action:** amend s1 — replace the phantom anchor with a real `runStart`/`runWorkflowServerSide` capture harness; add an LLD note reconciling the token mapping (count vs. drop `preview`).
- **DoD:** re-reviewed s1 plan clears; #45–#54 updated.

### S3 · Honor s3 preconditions  `[S]`
- s3 is gated on s1 landing the four `sc1` types (`t4` HALTs until then); `cli/client.ts` is unary, so treat client-side attach + abnormal-close (t9/t12/t15) as fake-client/deferred, not an existing seam. 0 tasks are out-of-repo. No re-scope, just build-order + framing.

### S4 · Build sequence  `[L]`
- Order: **s1** (produces the `sc1` `ProgressEvent` contract) → **s3** (consumes it) + **s2** (after S1 re-scope). Drive each Task via `insrc_build_step implement`/`validate`; each stage's artifact gated by the review cycle.
- Re-run the **t1 stop-and-widen** with the corrected 5-producer inventory (`workflow-rpc.ts:206` = `workflow.run`, already in the union) — a confirmation, not a redesign.

---

## Part 3 — Loose ends

### L1 · HLD render regression  `[S · investigate first]`
- Two uncommitted files (`.insrc/artifacts/HLD-6d6cfaf9a9b14bd4.json`, `docs/designs/HLD-...md`) — the id/tracker backfill re-render **dropped the `## Resolved questions` + `## Citations` sections** while adding the `**Tracker:**` link.
- **Action:** confirm whether the renderer drops those sections (bug) or they moved into the JSON; fix the renderer if it's lossy; then either restore or commit the intended version.

### L2 · build-step MCP visibility  `[XS]`
- `insrc_build_step` isn't in the live MCP session (server predates the FF rebuild). Reconnect the MCP session, or document driving it via `handleBuildStep` directly (as used this session).

### L3 · GitHub Project hygiene  `[S · manual]`
- Two hand-named boards (#3 "workflow backlog", #4 "daemon build") — decide whether to consolidate. Configure the 4 drill-down views (UI-only). Optionally populate the `Size` field for items from artifacts.

---

## Recommended sequence

1. **R1 + R2** — make the review cycle usable + automatic (CLI + daemon finalize). *Highest leverage; everything else benefits.*
2. **R5** — calibrate severity before it gates real work (avoid over-blocking the re-scopes).
3. **S1 + S2** — fix the streaming plans; each re-scope auto-reviewed by the now-live cycle (dogfoods R1/R2/R5 on real work).
4. **R4** — tracker comment (small, high-visibility).
5. **S3 + S4** — build the streaming epic, gated end-to-end.
6. **R3** — interactive gate (largest; by now the loop is proven, so the UX investment is de-risked).
7. **L1–L3** — fold in opportunistically (L1 before any further HLD edits).

## Resolved decisions (2026-07-20)

- **Sequence** — proceed as recommended: **R1 + R2 + R5 first**, then the streaming build (S1/S2 …).
- **D1 (R2)** — daemon `workflow.run` **auto-reviews by default**, opt-out per run.
- **D2 (S1)** — **drop build-step from the progress model** (stateless: `implement` returns a prompt, `validate` is one await); revisit a `build.run` streaming op only if build-step later needs progress.
- **s2 direction (2026-07-21)** — **Option B**: re-design s2 as a streaming MCP tool that drives `workflow.run` and forwards live progress to Claude/Codex via `progressToken`, enabling **mid-stream correction** of a long run. Depends on s1. Supersedes the original in-process forwarding design (which had no substrate).
- **D4 (R5)** — **keep "block on HIGH+MED"**; R5 calibration keeps MED meaningful rather than relaxing the gate.
- **D3 (L3)** — still open (GitHub board consolidation) — minor; decide during L3.
