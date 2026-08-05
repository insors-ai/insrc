<!-- insrc:artifact EXT-761a43a6fa645815-s9 -->

# Extend: add-daemon-driven-code-review-stage — Wait for a fresh index before grounding a Story's code review

> **Extends Epic `add-daemon-driven-code-review-stage`** — this builds on existing docs + code; no new Epic was created.

**Scope:** M   ·   **New Story:** `s9`

Extends Epic `add-daemon-driven-code-review-stage` (761a43a6) — building the freshness gate on the existing code-review stage (src/workflow/code-review/*, src/mcp/code-review-step/*, reading src/daemon/queue.ts). This is Story A of two; a follow-up extend adds the diff-only fallback pathway (Story B).

## Added Story

### s9: Wait for a fresh index before grounding a Story's code review

**User value:** insrc_code_review_step must never silently produce a hollow PASS when the daemon graph is stale for the Story's changed files (the S001 incident: empty grounding.symbols after an un-reindexed commit). This story adds an indexing-readiness gate to the start phase: it detects staleness with a combined signal (queue.isProcessing AND each changed file's lastIndexedAt watermark vs its mtime); on stale it returns an explicit confirm_wait turn carrying the stale-file list; on an explicit proceed:true resume it runs a bounded block-and-poll that waits for the queued files to drain (never calling repo.reindex — the file-watcher already enqueues them), bounded by a configurable codeReview.* timeout; on timeout it re-prompts (keep waiting longer / abort) rather than deciding unilaterally. Records produced by the fresh graph-grounded path are stamped groundingMode:'full'. On decline/abort the review fails closed with no verdict for now — the sibling Story B replaces that fail-closed exit with a diff-only degraded review. Scope reuses the daemon index-status surface (queue.isProcessing at src/daemon/queue.ts:154, the lastIndexedAt watermark, repo.reindex IPC) as-is and never triggers repo.reindex.

**Acceptance criteria:**
- **ac1:** Given the daemon index is stale for at least one file the Story changed (its lastIndexedAt predates the file mtime, or the queue is still processing it), when insrc_code_review_step's start phase runs, then it returns a confirm_wait result carrying the stale-file list instead of proceeding to grounding, so a hollow PASS against empty grounding.symbols is impossible.
- **ac2:** Given a confirm_wait result was returned, when the caller resumes start with proceed:true, then the tool block-and-polls the combined signal (queue.isProcessing AND per-file lastIndexedAt vs mtime) until the changed files are fresh, without ever calling repo.reindex, then serves grounding and runs the four dimension judges.
- **ac3:** Given the block-and-poll has run longer than the configurable codeReview.* timeout without the index becoming fresh, when the timeout fires, then the tool returns another confirm_wait-style turn offering keep-waiting-longer or abort, rather than unilaterally deciding to abort or proceed.
- **ac4:** Given the daemon index is already fresh for every changed file, when start runs, then it proceeds directly to grounding + the four judges with no confirm_wait turn, and the resulting code-review record is stamped groundingMode:'full'.
- **ac5:** Given the user declines to wait (aborts at the initial confirm_wait or a later timeout re-prompt), when the abort is received, then the review fails closed for now — no dimension judges run and no verdict/record is written (an interim behaviour that Story B's diff-only fallback supersedes).

## Building on

- `prior-artifact` docs/designs/HLD-add-daemon-driven-code-review-stage.md — Flag: insrc.codeReview.enforce — the completion-gate policy the freshness gate's groundingMode marking must interoperate with.
- `spec` docs/specs/SPEC-indexing-readiness-gate-insrc-code-review.md — Approved SpecArtifact SPEC-8b4be30d648eaeb8 — the converged brainstorm this story implements (combined signal, block-and-poll no-reindex, confirm_wait/proceed, re-prompt on timeout).
- `code` src/daemon/queue.ts:154 — isProcessing(): boolean — the queue-in-flight freshness signal reused as-is.

## Next

Proposed HLD amendment `AMD-761a43a6fa645815-1` (pending approval — it adds the new Story's boundary).

Approve the HLD amendment (`AMD-761a43a6fa645815-1`) and the updated Epic, then run `design.story` for the new Story `s9` to produce its LLD.

```
insrc_workflow_step phase=start workflow=design.story params={"epicHash":"761a43a6fa645815","storyId":"s9"}
```

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — define (define)

**0 HIGH · 0 MED · 6 LOW** · model `client` · reviewed 2026-08-05T04:48:48.836Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| s9 | citation | LOW | manual | queue.isProcessing(): boolean exists at src/daemon/queue.ts:154 — the queue-in-flight half of the combined freshness signal the story reads. | src/daemon/queue.ts:154 reads `get isProcessing(): boolean { return this.processing; }` verbatim — the queue-in-flight freshness signal exists exactly as cited. | None — verified. |
| s9 | external-contract | LOW | manual | insrc_code_review_step has a start phase (in src/mcp/code-review-step) whose grounding is built from the repo graph — the phase the freshness gate + confirm_wait turn plug into. | src/mcp/code-review-step resolves (27 hits) with handleStart + assembleCodeReviewGrounding wired — the start phase + graph grounding the gate plugs into is real. | None — verified. |
| s9 | semantic | LOW | manual | Code-review grounding is a graph-derived symbols set (grounding.symbols); an empty symbols set is the hollow-PASS the gate prevents, and the story adds a groundingMode marker onto the code-review record types. | assembleCodeReviewGrounding + grounding.symbols + CodeReviewGrounding all resolve — grounding is a graph-derived symbols set (empty symbols = the hollow PASS), and types.ts is where the new groundingMode marker lands. | None — verified. |
| s9 | inventory | LOW | manual | The code-review stage runs exactly four dimension judges (adherence/conventions/coverage/quality) that the fresh-path proceeds to; the story does not change their count. | The four judge symbols (judgeAdherence/Conventions/Coverage/Quality) + the dimension literal set resolve — the fresh path proceeds to exactly four judges; the story does not alter the count. | None — verified. |
| s9 | external-contract | LOW | manual | A repo.reindex IPC exists that the story deliberately never triggers (block-and-poll only); reused-as-is, not called. | reindex resolves in the daemon — the repo.reindex IPC the story deliberately never triggers exists and is reused-as-is. | None — verified. |
| extends | cross-artifact | LOW | manual | The story extends Epic add-daemon-driven-code-review-stage (761a43a6), whose HLD + the approved SpecArtifact SPEC-8b4be30d648eaeb8 exist as prior artifacts it builds on. | docs/designs/HLD-add-daemon-driven-code-review-stage.md:254 reads `**Flag:** `insrc.codeReview.enforce`` — the parent Epic's HLD + the codeReview.enforce completion-gate policy the story interoperates with exist; the approved SpecArtifact is the other prior artifact. | None — verified. |
