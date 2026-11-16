<!-- insrc:do-not-index -->

# Critical analysis of the review framework

**Date:** 2026-11-12
**Scope:** the review framework end to end — designs, stories, code, tests, on-disk records
**Tree:** branch `v2`, working tree as of 2026-11-12 (design-review and task-review engines landed; legacy review routes retired)

## Method

The component map was grounded through `insrc_analyze_step` (8 explorations over the
code graph and docs), then verified by direct reading of the load-bearing code:

- `src/workflow/gates.ts` (approval gates, `approveOne`, `otherPartyReviewGap`)
- `src/workflow/code-review/gate.ts` and `src/workflow/code-review/task-review/completion.ts`
- `src/workflow/review/party.ts`, `src/workflow/review-unavailable.ts`, `src/workflow/review-decision.ts`
- `src/workflow/review/design-review/coordinator.ts` (sampled) and the publication/approval chain
- `src/mcp/design-review/handler.ts`, `src/mcp/code-review/handler.ts`, `src/daemon/steps/host.ts`

Measured on this tree:

- The seven workflow gate suites (`approve-codereview-gate`, `approve-build-completion`,
  `approve-build-record-completion`, `gate-approve`, `gates-lifecycle-guard`,
  `gates-lifecycle-service`, `gate-guarded-entry-points`): **22 of 32 tests fail**.
- The full `src/workflow` + `src/mcp` sweep: **2793 tests, 2684 pass, 106 fail**, of which
  ~70 cluster in review/gate code (`review-stream` 16, `other-party-review-gate` 11,
  `approve-codereview-gate` 10, `plan-gate` 7, `approve-build-completion` 6,
  `approve-build-freshness` 5, `review-decision` 5, `gates` 4, …).
- On-disk CR record census: **383 `CR-*.json`, 327 schemaVersion 1 (legacy), 56 schemaVersion 2**.

Docs read: the two-sets-of-eyes story (E202610051716f77b/S001 LLD+PLAN), the
build-approval-gating story (E20260804a131994e/S001), the daemon-driven code-review
epic HLD (E20260803761a43a6), the review-committed-work epic (E20261030e6ddcdcb),
the design-review SPEC (E2026110316f49beb), `docs/design-review-execution.md`,
`docs/task-review-execution.md`, the rolled-back `docs/review-investigation.md`,
and the 2026-11-03 SWEEP record (E20261103a84e610b/S001). No live review was run
against the daemon; smoke scripts exist (`scripts/smoke-design-review*.mjs`,
`scripts/smoke-task-review.mjs`) but were not exercised.

## The architecture as it stands

Two engines, one verdict vocabulary, one gate:

- **Design review** (`insrc_review_step` → `src/workflow/review/design-review/`,
  27 files / ~2.7k LOC): chunk-planned, checkpointed, background review of the latest
  DEF/HLD/LLD. The coordinator owns bounded per-chunk retries (1 + 3), a 30-minute
  inactivity grace with separately tracked tools, subject invalidation, a recovery
  state machine (`resume` / `restart_full` with recorded user decisions), and
  publication into the artifact change log as a `design-chunk-review` record —
  which `approveArtifactByJsonPath` reads at `gates.ts:648-665`. Wired end to end.
- **Task review** (`insrc_code_review_step` → `src/workflow/code-review/task-review/`,
  40 files / ~3.4k LOC): reviews the committed change set pinned to an explicit
  `reviewRevision`; per-task attribution; whole-story signoff that must cover every
  current BUILD task id; BUILD fingerprint binding
  (`src/workflow/code-review/task-review/completion.ts`); published as
  schemaVersion-2/3 `CR-<epic>-<story>` records.
- **The gate** (`gates.ts:approveOne` → `enforceCodeReviewGate` →
  `approveArtifactByJsonPath` → `otherPartyReviewGap`): approval of a DEF/HLD/LLD/BUILD
  requires an other-party, non-blocking review; overrides are recorded on the artifact.
- **Party model** (`src/workflow/review/party.ts`): explicit
  `authoredBy`/`reviewedBy` with model-label fallback (`client` ⇒ controller) —
  a clean, migration-aware design.

The protocol depth in the two new engines is real and good: idempotent admission by
request signature, serial checkpoint writers, activity-supervised native sessions
(`timingProtocol: "activity-v1"`), previous-round feedback projection, bounded
duplicate-event windows, write-once range base, non-lossy
`skipped[]`/`codeReview[]`/`followOn[]` approval results. The task-review record's
binding of review to exact task ids plus BUILD fingerprint is a strong anti-drift
guarantee the old engine never had.

## Critical findings (ranked)

### 1. The approval gate — the system's most safety-critical enforcement point — is broken mid-migration, and it fails by crashing

`enforceCodeReviewGate` (`src/workflow/code-review/gate.ts:14-28`):

- does a bare `JSON.parse` of the CR record at line 17 with no try/catch — a corrupt
  record throws a raw `SyntaxError`;
- routes every legacy-format CR record to `reviewUnavailable()`, which is
  `throw new Error("PENDING REVIEW RE-IMPLEMENTATION")`
  (`src/workflow/review-unavailable.ts:1-3`).

Both throws escape `approveOne` **before** its try block (`gates.ts:1018` call site
vs the try at line 1034), so one bad record kills the entire `approveWorkflowTarget`
call — batch approval included. Measured on this tree: the documented
"corrupt CR record → no-review fail-open, approved" test now fails with a raw
`SyntaxError` from `gate.ts:17`.

The S007 LLD explicitly pinned the contract as fail-open
("absent/malformed/unknown-verdict → no-review"); the rewrite silently reversed it to
fail-**crash**. Worse: 327 of the 383 CR records on disk are schemaVersion 1, so any
re-approval or cleanup retry touching an old story — the exact procedure
`docs/task-review-execution.md` instructs operators to run ("explicitly repeat
approval of the already-approved S2 BUILD to retry its cleanup") — throws a message
that names neither cause nor remedy.

### 2. The enforcement layer is the least-verified code in the repo

Direct measurements on this tree: 22 of 32 gate-suite tests fail; ~70 of the 106
workflow+MCP sweep failures cluster in review/gate code. The 2026-11-03 SWEEP record
(`docs/standalone/make-code-review-s-documents-review-E20261103a84e610b/S001/SWEEP.md`)
documented 17 of 32 failing "byte-identical to the base checkout" and the story
accepted them as pre-existing. Nine days and five more failures later, no tracked
issue reconciles them.

The failing tests are not noise — they assert the *old published contract*
(fail-open on malformed records, `codeReview.enforce` advisory demotion, `warn`
verdicts), which the new gate deliberately removed. The tests are the spec of the
enforcement layer, and the spec and the code now disagree with nobody adjudicating.

### 3. Documentation and steering describe a framework that no longer exists

CLAUDE.md / AGENTS.md still tell every agent that a block verdict "withholds
completion under `codeReview.enforce` (config, off / advisory by default)" and that
code review runs "four dimensions (adherence / conventions / coverage / quality)".
In the code:

- the enforce flag is gone from the gate entirely (only stale comments reference it,
  `src/workflow/artifacts/companion/adherence.ts:15`, `src/workflow/delivery/gate.ts:24`);
- the `warn` arm of `CodeReviewGateResult` is unreachable — any non-`passed`
  task-review status maps to `blocked` (`completion.ts:16` → `gate.ts:25-27`);
- the four dimensions died with the investigation-engine rollback
  (`docs/review-investigation.md:3-8`).

A host agent following steering forms exactly the wrong expectations about what a
review will do and what will withhold approval.

### 4. The central guarantee — two sets of eyes — is de facto suspended, and the ledger is normalizing the override

The retired daemon-review routes are stubbed with `reviewUnavailable()`
(`src/daemon/steps/daemon-client.ts:127-130`,
`src/daemon/team-review-handlers.ts:84-87`), and the recent stories carry
`CODE-SELF-REVIEW.md` / `SELF-REVIEW.md` beside their BUILDs, with completions
passing via `overrideReview`. That is a defensible interim — but the framework's
credibility rests on the independence rule, and right now the override escape hatch
is the *routine* path, not the exception.

Two additional inconsistencies compound it:

- The new design-review engine **refuses unknown provenance** (steering-block and
  the SPEC say so), while the gate's `otherPartyReviewGap` still holds that "an
  unknown author or an unknown reviewer never withholds approval" (`gates.ts:747`).
  A daemon-authored artifact with no party stamp is refused at the tool but
  approvable at the gate.
- `insrc_review_step`'s MCP envelope closes its persistent connection on terminal
  statuses only; mid-review daemon errors return a generic
  `review-request-failed` envelope. Fine in isolation — but combined with the
  stubbed legacy routes, a controller has no fallback other than an override.

### 5. The gate decides the same question twice from the same files

`approveOne` runs `enforceCodeReviewGate` (`gates.ts:1018`), then
`approveArtifactByJsonPath` → `otherPartyReviewGap` runs it *again* (`gates.ts:770`)
— two disk reads and parses of the CR and BUILD json for one decision, with no lock;
the two calls can in principle disagree. The second call's message for any non-`pass`
status ("code review is out of date or does not cover the BUILD", `gates.ts:772`)
conflates stale fingerprint, foreign story, missing whole-story signoff and unknown
version into one undiagnosable sentence.

### 6. Churn and patch pressure are visible in the code itself

This is the third review engine in three months (legacy dimensions → investigation
engine, rolled back 2026-10-30 → task-based + design-chunk), with 67 task-review
commits since 2026-11-01 alone. `gates.ts` (1,240 lines) shows the strain: mixed
indentation and compressed patched blocks at lines 650-660 and 1014-1031. The newest
engines are written in a minified style (1-space indents, multi-statement lines,
5-deep ternaries — `coordinator.ts:101`, `completion.ts`) markedly less readable than
the surrounding codebase — in the one subsystem whose entire purpose is to be
reviewed.

### 7. What is only steering, not code

The three-round review limit, "present before you ask", and the human approval gate
are enforced purely by controller discipline; nothing in the daemon can see or refuse
a fourth review round. That is an accepted design, but it means the framework's
guarantees are only as strong as the least careful host agent — worth stating plainly
in the docs rather than implying enforcement.

## What is genuinely strong

To be fair to the framework, the following are real strengths:

- **Party model** (`party.ts`): explicit fields with model-label fallback, same-party
  refusal raised before any model call (`SamePartyReviewError`).
- **Non-lossy approval results**: `skipped[]` with reasons and kinds,
  `codeReview[]` gate outcomes, `followOn[]` seam outcomes, override reasons recorded
  on the artifact — good auditability.
- **Engine protocol depth**: checkpointed chunks, bounded retries with pointed
  diagnostics (never raw reasoning), inactivity supervision that polls cannot renew,
  idempotent admission signatures, previous-round feedback projection bounded to
  4 KiB, reviewRevision pinning, BUILD fingerprint binding, per-story cleanup fences.
- **Test volume on the engines**: ~7.6k LOC of tests across the two engines; the
  task-review suite measured 115/115 passing on 2026-11-03.
- **Honest sweep discipline**: the SWEEP record comparing failing titles
  byte-identically against a clean base checkout is exactly the right way to
  document pre-existing failures.

## Recommendations, in order

1. **Fix the gate's failure mode first** (small, tracked): wrap the CR read; map every
   legacy/corrupt/unknown record to a typed decision — either restore the documented
   fail-open, or make it deliberately fail-closed with a `ReviewBlockedError` that
   names the record's schemaVersion and the operator action. A raw `SyntaxError` and
   "PENDING REVIEW RE-IMPLEMENTATION" must never be an approval-path outcome. Add a
   migration decision for the 327 v1 records (e.g. historical-pass for
   already-approved stories on re-approval only).
2. **File a tracked issue to reconcile the gate suites with the new contract** — or
   with the old one, if fail-open and advisory-warn were meant to survive. Until
   those 32 tests are green, every "BUILD approval is code-review-gated" claim is
   unverifiable.
3. **Collapse the double gate**: one `enforceCodeReviewGate` call per approval, the
   result passed to both decision points.
4. **One doc pass** over CLAUDE.md / AGENTS.md / steering-block / `docs/workflow.md`
   to match the task-based engine's actual semantics, and align the
   unknown-provenance policy between the tool (refuses) and the gate (allows).
5. **Treat restoring the second party as the top-priority epic**, and until then
   make the suspension explicit and visible (a degraded-mode state recorded once)
   instead of per-story overrides that read as routine in the ledger.
6. **Reformat the new engines to the repo's house style** — the review framework
   should be the code reviewers most enjoy reading.

## Bottom line

The designs are unusually thorough and the new engines' execution protocols
(checkpoints, retries, fingerprint binding, party stamping, non-lossy results) are
genuinely strong. But the framework is mid-replacement, and the seam that broke is
the one everything else depends on: the approval gate crashes on legacy records, its
own test suite is red and was allowed to stay red, and the steering still describes
the previous framework. The engines were each built and verified story-by-story; the
*integration* — gate ↔ records ↔ tests ↔ docs — is what now needs a story of its own.
