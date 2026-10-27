<!-- insrc:artifact PLAN-34798d209cf97413-S001 -->

# Plan: E2026102734798d20:S001

## Summary

**Epic:** `split-oversized-diff-evidence-into-lossless`
**LLD run:** `wf-1793076977701-80y26b`
**LLD effective hash:** `34798d209cf9...`

Build lossless diff evidence and enforce the128K complete-input cap through serial chunk review and parent gathering. Freeze a ten-minute-per-primary-chunk deadline and resume the same independent review across bounded host waits, including controller-owned review. Verify source, contracts, BUILD and TESTS identities before publication and approval, preserve unchanged completion records, then run the full sweep after all implementation tasks and retry S003 on an approved active runtime.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Complete-input measurement | M | — | integration: DIFF-BUDGET; integration: DIFF-REPAIR | [[c1]] |
| 2 | **`t2`** Verified bounded CLI transport | M | `t1` | integration: DIFF-TRANSPORT; integration: DIFF-ADMISSION | [[c1]] |
| 3 | **`t3`** Complete diff reader capture | M | — | integration: DIFF-READER | [[c2]] |
| 4 | **`t4`** Lossless attributed diff spans | M | `t3` | unit: DIFF-SPANS; unit: DIFF-COORDS; unit: DIFF-INTEGRITY | [[c2]] |
| 5 | **`t5`** Budget-aware material fitting | M | `t1`, `t4` | unit: DIFF-INTEGRITY; integration: DIFF-LARGE; integration: DIFF-SCALE; integration: DIFF-LOW-CAP | [[c2]] |
| 6 | **`t6`** Parent quality notes and gather | M | `t5` | integration: DIFF-GATHER; integration: DIFF-PARENT-QUALITY; integration: DIFF-FITS-ONE-CALL | [[c3]] |
| 7 | **`t7`** Parent-aware duplication coverage | M | `t6` | integration: DIFF-SCALE; integration: DIFF-SCALE-DUPLICATES | [[c3]] |
| 8 | **`t8`** Prepared dimension orchestration | M | `t2`, `t5`, `t7` | integration: DIFF-LARGE; integration: DIFF-FACTORY-LIMIT; integration: DIFF-FITS-ONE-CALL; integration: DIFF-TIME-PLAN | [[c4]] |
| 9 | **`t9`** Frozen chunk-derived timing | M | `t8` | integration: DIFF-TIME-PLAN; integration: DIFF-TIME-FIXED | [[c4]] |
| 10 | **`t10`** Refused singleton revision recovery | M | `t5`, `t8`, `t9` | integration: DIFF-REPAIR; integration: DIFF-TIME-FIXED; integration: DIFF-REFUSAL-SPAN | [[c2]] [[c4]] |
| 11 | **`t11`** Timed serial dispatch and shutdown | M | `t2`, `t9`, `t10` | integration: DIFF-BUDGET; integration: DIFF-REPAIR; integration: DIFF-ADMISSION; integration: DIFF-LARGE; integration: DIFF-TIME-FIXED; integration: DIFF-TIME-OUTER | [[c1]] [[c4]] |
| 12 | **`t12`** Canonical review input identity | M | — | integration: DIFF-FINGERPRINT-SNAPSHOT; integration: DIFF-IDENTITY-TESTS | [[c5]] |
| 13 | **`t13`** Idempotent completion writer | M | `t12` | integration: DIFF-APPROVE-IDENTITY; integration: DIFF-COMPLETION-NOOP; integration: DIFF-COMPLETION-CHANGE | [[c6]] |
| 14 | **`t14`** Publication freshness and ownership | M | `t11`, `t12` | integration: DIFF-PUBLISH-SOURCE; integration: DIFF-PUBLISH-BUILD; integration: DIFF-IDENTITY-TESTS | [[c5]] |
| 15 | **`t15`** Daemon-owned review operation lifecycle | M | `t9`, `t14` | integration: DIFF-TIME-OUTER; integration: DIFF-WAIT-RESUME | [[c7]] |
| 16 | **`t16`** Shared control transport contracts | M | `t15` | integration: DIFF-TIME-OUTER; integration: DIFF-WAIT-COMPAT; integration: DIFF-WAIT-TRANSPORT | [[c7]] |
| 17 | **`t17`** Resumable step state and help | M | `t16` | integration: DIFF-WAIT-RESUME; integration: DIFF-WAIT-COMPAT | [[c7]] |
| 18 | **`t18`** Controller bounded pipeline protocol | M | `t8`, `t10`, `t11`, `t12`, `t14`, `t17` | integration: DIFF-CONTROLLER-LARGE; integration: DIFF-CONTROLLER-VALIDATE; integration: DIFF-CONTROLLER-TIME; integration: DIFF-IDENTITY-TESTS | [[c8]] |
| 19 | **`t19`** Isolated controller-side execution helper | M | `t2`, `t18` | integration: DIFF-CONTROLLER-LARGE; integration: DIFF-CONTROLLER-TIME; integration: DIFF-CONTROLLER-ADMISSION | [[c8]] |
| 20 | **`t20`** Shared BUILD freshness approval gate | M | `t12`, `t13`, `t14` | integration: DIFF-PUBLISH-GATE; integration: DIFF-APPROVE-COMMON; integration: DIFF-APPROVE-WORKFLOW; integration: DIFF-APPROVE-TUI; integration: DIFF-APPROVE-IDENTITY; integration: DIFF-APPROVE-RACE; integration: DIFF-APPROVE-TESTS | [[c5]] [[c6]] |
| 21 | **`t21`** Public contract and audit integration | M | `t17`, `t19`, `t20` | integration: DIFF-COMPAT | [[c9]] |
| 22 | **`t22`** Combined build, focused regression and full repository sweep | M | `t21` | integration: DIFF-FINAL-REGRESSION: combined affected-area suites after all implementation; integration: DIFF-FULL-SWEEP: complete Node22 repository test sweep with exact source identity and skips/failures | [[c9]] |
| 23 | **`t23`** Actual S003 runtime reproduction | S | `t22` | smoke: DIFF-S003-RETRY | [[c9]] |

### 1.1 E2026102734798d20:S001:T001 — Complete-input measurement

Count actual messages, role framing, envelopes, schema and explicit context/history/repair at all job/gather/duplicate planning and send boundaries.

**Acceptance checks:**
- One measurer includes actual enveloped schema; lower limits respected and irreducible fixed framing refused.

### 1.2 E2026102734798d20:S001:T002 — Verified bounded CLI transport

Add optional shared boundedInput/capability/isolated execution intent and enforcing CLI normalization/isolation admission; ordinary completions keep defaults.

**Acceptance checks:**
- No model spawn for unsupported isolation or over-budget normalized input; OAuth stays CLI-owned; terminal unsupported error.

### 1.3 E2026102734798d20:S001:T003 — Complete diff reader capture

Recover full Story-scoped per-file diff beyond ordinary capture limits or refuse incomplete/truncated/missing hunks before reviewing.

**Acceptance checks:**
- Never review a bounded slice as complete; original inventories and scope/ledger exclusions preserved.

### 1.4 E2026102734798d20:S001:T004 — Lossless attributed diff spans

Add optional fragment metadata and Unicode-safe <=16Ki staging spans, exact offsets/digests/coordinates, unique IDs and stable deduplicated changed files.

**Acceptance checks:**
- Reassembly exactly matches parent; graph/small/binary compatibility and coverageEligible:false.

### 1.5 E2026102734798d20:S001:T005 — Budget-aware material fitting

Implement measured per-dimension fitDiffMaterial and sparse parent ownership before primary planning; recursively split staging ranges to authoritative cap.

**Acceptance checks:**
- Fixed context fits but16Ki span exceeds12000 cap: all evidence fits after subdivision; no gaps/overlap or nonprogress recursion.

### 1.6 E2026102734798d20:S001:T006 — Parent quality notes and gather

Add required per-fragment notes, exact validation, parent check-item obligations and forced chunk mode even when one call fits; adjudicate cross-fragment facts.

**Acceptance checks:**
- Missing/foreign/duplicate notes fail; parent correctness requires both separately carried facts; bounded reduction retains provenance.

### 1.7 E2026102734798d20:S001:T007 — Parent-aware duplication coverage

Exclude diff fragments from symbol Cartesian compare/pair stages and add bounded parent/global duplication obligations including nonfragment context.

**Acceptance checks:**
- No quadratic sibling comparison growth; within/cross-parent duplication remains judged with valid counterpart attribution; graph comparisons compatible.

### 1.8 E2026102734798d20:S001:T008 — Prepared dimension orchestration

Split prepare/execute seams and update all five model/two deterministic factories to share exact snapshot/adapter/effective cap; prepare all before models.

**Acceptance checks:**
- Same prepared job IDs/material execute serially; deterministic/no-call dimensions count zero and wrappers remain compatible.

### 1.9 E2026102734798d20:S001:T009 — Frozen chunk-derived timing

Create aggregate and per-child timing plans, primary N and600000*N budgets, safe absolute clock/timer arithmetic and child activation semantics.

**Acceptance checks:**
- 1/5/20 primary chunks yield10/50/200minutes; preparation counts; later serial child not starved by admission-time clock; retry/gather never extend.

### 1.10 E2026102734798d20:S001:T010 — Refused singleton revision recovery

On lower provider refusal derive complete descendant material revision, discard affected dimension outputs/closures, reprepare only it under original N/deadlines.

**Acceptance checks:**
- Strictly shrinking revisions preserve original bytes and audit lineage; no stale notes, duplicate dispatch or budget credits; irreducible/time-exhausted stop.

### 1.11 E2026102734798d20:S001:T011 — Timed serial dispatch and shutdown

Apply size/capability checks and min(per-call,child/root remaining) to structured/session calls and deterministic boundaries; own cancellation shutdown and reject late outputs.

**Acceptance checks:**
- All bounded chunk/gather/repair calls carry exact input cap; timeout/cancel aborts and settles owned process, no late completed result.

### 1.12 E2026102734798d20:S001:T012 — Canonical review input identity

Capture consistent source/diff/contracts/BUILD and ordered TESTS states/content/view fingerprints with explicit version/canonical exclusions and synchronous comparator.

**Acceptance checks:**
- TESTS-only changes incl ranAt/order/malformed/absence alter identity; unchanged approval fields do not; inconsistent/unavailable reads fail closed.

### 1.13 E2026102734798d20:S001:T013 — Idempotent completion writer

Add completion-specific no-op reconciliation through real completion/changed-files/standalone writers, preserve prior times/authors/versions/order and skip identical writes.

**Acceptance checks:**
- Real unchanged completion preserves fingerprint/bytes; semantic changes persist and stale old review; genuine validate behavior and TESTS ranAt unchanged.

### 1.14 E2026102734798d20:S001:T014 — Publication freshness and ownership

Require real daemon/controller prepublication source/contract/BUILD/TESTS identity+author hook, record fingerprint metadata and recheck after publication.

**Acceptance checks:**
- Edits/rebuild/TESTS mutation without second start prevent new CR; narrow postcheck race yields unusable stale record, never accepted completion.

### 1.15 E2026102734798d20:S001:T015 — Daemon-owned review operation lifecycle

Add scoped in-memory start/join/status/cancel ownership with prepared timing, immutable fingerprint, conflict rules, detached waiters and terminal grace.

**Acceptance checks:**
- Same target/input joins one execution; changed inputs conflict; explicit cancel/deadline stops owner; restart/lost handle never succeeds; no fixed total cap.

### 1.16 E2026102734798d20:S001:T016 — Shared control transport contracts

Extend codeReview.run serializers and add discriminated control results/helper in socket and actual in-daemon clients; keep legacy final-only streams.

**Acceptance checks:**
- Start/status/cancel fields survive both transports; pending has no artifact; malformed final refused; every control waiter returns within200s without killing operation.

### 1.17 E2026102734798d20:S001:T017 — Resumable step state and help

Wire pending operation continuations, pin active TTL/LRU state, exact cancellation semantics versus freshness fallback and update public schema/help/guide.

**Acceptance checks:**
- Repeated polling does not relaunch/reset deadlines; active >1h state retained; lost/expired/cancelled yields no CR; legacy/session routing intact.

### 1.18 E2026102734798d20:S001:T018 — Controller bounded pipeline protocol

Replace degraded whole-grounding emit_judgements with serial emit_review_call/callResult state machine, real applyOutput/failure/gather, atomic replay and fixed deadlines.

**Acceptance checks:**
- Daemon-authored oversized diff never emits/accepts aggregate unbounded verdict; all original spans covered; no daemon LLM judgments; reviewedBy:controller and warn cap.

### 1.19 E2026102734798d20:S001:T019 — Isolated controller-side execution helper

Implement trusted MCP client helper using enforcing local CliProvider, not inherited chat transcript; capability admission, one-call ownership/cancel and bounded envelope dispatch.

**Acceptance checks:**
- Unverified/self-declared flags fail before evidence; actual fresh CLI args/stdin/schema verified; same pending call not relaunched and expiry enforced.

### 1.20 E2026102734798d20:S001:T020 — Shared BUILD freshness approval gate

Enforce synchronous identity at common direct/TUI approval and workflow wrapper, new stale-review result projections, nonoverride identity and safe pre/postwrite checks.

**Acceptance checks:**
- Direct/TUI/single/batch refuse stale TESTS/source/BUILD even with override/enforcement off; no tracker/commit/follow-on; unchanged approval/reapproval works.

### 1.21 E2026102734798d20:S001:T021 — Public contract and audit integration

Reconcile changed IPC/tool/types/help consumers, compatibility regressions and legitimately refresh review-source audit metadata where required; keep historical S003 datasets/proofs.

**Acceptance checks:**
- No unknown-status success branch or omitted control fields; compatible legacy paths; no minification/deletion/splitting evidence or release enablement.

### 1.22 E2026102734798d20:S001:T022 — Combined build, focused regression and full repository sweep

After all t1-t21 implementation and focused per-task checks finish, run one Node22 build, combined affected-area regression suites and full repository test sweep, preserving source snapshot and exact outcomes.

**Acceptance checks:**
- No full sweep during individual tasks; final full sweep runs only after all implementation is built, with baseline failures, live-service skips and pending evidence reported accurately; resolve introduced regressions before independent code review.

### 1.23 E2026102734798d20:S001:T023 — Actual S003 runtime reproduction

On approved activated built runtime retry independent daemon degraded review for484fcef7efaf229e/s3 at128000; record verdict/errors and provenance. This is external runtime validation after implementation/sweep; if runtime activation is unavailable, retain pending status and request the necessary activation explicitly instead of restarting automatically.

**Acceptance checks:**
- No automatic daemon restart or release changes; if activation unavailable preserve pending proof honestly, never script a fake review success.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| DIFF-SPANS: added/modified/deleted/renamed text and binary/small-file compatibility; reassembly equals original diff exactly | `t4` |
| DIFF-COORDS: CRLF, emoji, Unicode and giant-line continuations preserve offsets/old-new source locations and unique changedFiles | `t4` |
| DIFF-INTEGRITY: duplicate/missing/reordered span and digest mismatches reject before calls | `t4`, `t5` |
| DIFF-BUDGET: at/below/above128000×3 with message role separators, call envelope, actual schema, examples, neighbour context and assistant/history content | `t1`, `t11` |
| DIFF-REPAIR: added correction/history causes smaller redivision/reduction or an explicit refusal; no oversized call is sent | `t1`, `t10`, `t11` |
| DIFF-TRANSPORT: provider normalization/schema expansion and isolated fresh-call mode are measured; unmeasured project/tool/session additions are disabled or refused | `t2` |
| DIFF-ADMISSION: absent/false boundedStructuredInput support yields zero completion calls; declared support receives the exact shared boundedInput shape and authoritative job.plan.limitChars for all chunk/gather/repair requests. | `t2`, `t11` |
| DIFF-LARGE: S003-sized inventory evidence produces multiple serial review calls under384000 complete-input characters; every source span is carried by a completed chunk | `t5`, `t8`, `t11` |
| DIFF-GATHER: gather combines findings and provenance across parent-file fragments; no fragment omitted, out-of-scope finding promoted, or graph coverage invented | `t6` |
| DIFF-SCALE: many fragments retain sparse sibling connectivity and avoid new quadratic material construction | `t5`, `t7` |
| DIFF-COMPAT: source-symbol and small-file review parity, cancellation, retries, gather/reduction, duplicate comparisons, and lower configured budgets remain supported | `t21` |
| DIFF-PARENT-QUALITY: no chunk emits a local finding; a parent correctness finding is produced only when gather receives facts from two separate fragments. Reject missing/foreign/duplicate parent notes and prove reduction preserves both facts and provenance. | `t6` |
| DIFF-READER: through DiffGroundingDeps/git-diff reader, recover truncated per-file input completely or refuse unrecoverable truncation/missing hunks before any model call or completed artifact. Replace the legacy tests that explicitly allow truncated bounded-slice reviews. | `t3` |
| DIFF-FACTORY-LIMIT: for each of the five model-dimension factories, a provider cap below configured review size reaches adapter reduction/duplicate budgets, createJob.plan.limitChars and every boundedInput.maxInputChars unchanged. Cover the two deterministic callers without introducing a separate budget. | `t8` |
| DIFF-FITS-ONE-CALL: a file larger than16Ki with complete prompt below128K still forces quality chunk mode, validates one note per fragment and executes parent gather. Ordinary non-fragment input remains single-call compatible. | `t6`, `t8` |
| DIFF-S003-RETRY: rebuild under Node22 then run the actual independent daemon diff review for484fcef7efaf229e/s3 with128000-token setting; record actual verdict/degraded mode and any remaining errors | `t23` |
| DIFF-TIME-PLAN: 1/5/20 primary chunks yield 600000/3000000/12000000ms; five model dimensions aggregate correctly, deterministic slots count zero, fitting single-call counts one; all prepared before first completion and execution uses identical job IDs/snapshot/caps. | `t8`, `t9` |
| DIFF-TIME-FIXED: root includes grounding/preparation, later serial child receives its own allowance capped by root remaining; repair/retry/gather/duplicates/redivision never extend either clock; structured and reviewer-session dispatch receive min(per-call,remaining); late output produces no CR. | `t9`, `t10`, `t11` |
| DIFF-TIME-OUTER: healthy >20/30min and >4h derived jobs survive outer waiting caps under fake time; idle/stall and explicit cancel still abort owned execution; integer overflow/invalid counts and timer overflow handled safely. | `t11`, `t15`, `t16` |
| DIFF-WAIT-RESUME: >300s review returns pending within200s and repeated status/resume/start joins one execution; disconnect does not cancel, explicit cancel does, stale/lost handle never succeeds; changed source conflicts, active state survives1h TTL/LRU, terminal grace cleans up and exactly one valid CR is written. | `t15`, `t17` |
| DIFF-WAIT-COMPAT: legacy stream without operation, freshness proceed:false diff fallback, pending proceed:false cancellation, session refusal, target authorization and independent-review routing remain intact. | `t16`, `t17` |
| DIFF-LOW-CAP: 16384-character staging span with effective12000 complete-input cap and fitting fixed context is subdivided before preparation; every call fits, reconstruction exact, initial N reflects final fitted primary plan. A fixed-context-too-large control refuses without calls. | `t5` |
| DIFF-REFUSAL-SPAN: singleton provider size refusal creates smaller descendant revision, discards old dimension outputs/notes and rebuilds all obligations/closures, then completes all original bytes; original timing N/deadlines unchanged. Repeated no-progress refusal and exhausted time fail with no CR. Include emoji boundaries and cross-fragment correctness regression after repartition. | `t10` |
| DIFF-SCALE-DUPLICATES: drive actual quality compare/pair/gather for hundreds of fragments: no fragment IDs enter symbol pair comparisons and no quadratic fragment candidates/calls are generated. Existing graph symbol pair behavior preserved. Within-parent and cross-parent duplication only detectable from separate notes is found with correct provenance, including fragmented versus nonfragment evidence. | `t7` |
| DIFF-WAIT-TRANSPORT: both shared serializer and real socket/in-daemon clients carry start/status/cancel+handle unchanged; pending has no artifact, done.result preserves existing validation, failed/cancelled/malformed variants cannot stamp; waiter timeout detaches and explicit cancel stops the one operation. | `t16` |
| DIFF-CONTROLLER-LARGE: daemon-authored oversized diff, admitted isolated controller adapter, serial emit_review_call/callResult loop through all primary/reduction/parent/global duplication stages; every complete task <=effective cap, every original range covered, no whole grounding in responses, zero daemon LLM calls, final reviewedBy:controller and warn cap. | `t18`, `t19` |
| DIFF-CONTROLLER-VALIDATE: reject legacy full-dimension degraded submission, foreign/stale/out-of-order/missing/duplicate notes and mismatched call envelopes; retry corrections and singleton refused-range replacement preserve provenance and fixed timing N/deadlines. Atomic replay returns same continuation without duplicate model task or final write. | `t18` |
| DIFF-CONTROLLER-TIME: fake clock covers waiting across client turns, activated child/per-call expiry, repeated start with same callID/deadline, explicit cancel, token TTL/lost daemon, changed source/author and late valid answer; none can publish CR. | `t18`, `t19` |
| DIFF-CONTROLLER-ADMISSION: unsupported/unverified/self-declared isolated host capability returns unsupported-bounded-controller before any evidence/task emission. Verified fresh adapter rejects sentinel conversation/project/history and oversized complete envelope/schema; legacy full graph behavior remains compatible. | `t19` |
| DIFF-PUBLISH-SOURCE: change a reviewed file, uncommitted diff, HEAD/range or effective approved contract during daemon execution without another start call; real runner hook returns review-input-changed, no new CR write, no done verdict and prior artifact preserved. | `t14` |
| DIFF-PUBLISH-BUILD: replace BUILD content/author during daemon execution without another start; even same path/mtime is detected, independent author check fails and no CR written. Repeat on controller continuation/finalization. | `t14` |
| DIFF-PUBLISH-GATE: unchanged fingerprinted inputs permit existing gate evaluation, edit after pre-write check or after successful completion causes stale-review refusal; unavailable identity also refuses. Verify post-publication race reports no accepted completion and legacy unfingerprinted artifacts retain documented compatibility. | `t20` |
| DIFF-FINGERPRINT-SNAPSHOT: deterministic canonical content identity, capture detects edits during reads, identical source matches, distinct mode/rename/binary/build/contract identity differs; no model call or stamp on inconsistent capture. | `t12` |
| DIFF-APPROVE-COMMON: through real approveArtifactByJsonPath, a stale/malformed/partial/unsupported fingerprint or unavailable identity refuses before any write. Repeat with overrideReview and enforcement off; neither bypasses stale-review. Unchanged fingerprinted input and genuine legacy CR exercise their documented policies. | `t20` |
| DIFF-APPROVE-WORKFLOW: through approveWorkflowTarget single and batch routes, stale-review appears in skipped/codeReview outcomes with reason, no approvedAt or follow-on; a sibling fresh artifact may still follow existing batch policy. Type projections/renderers preserve the new status rather than treating nonblocked as success. | `t20` |
| DIFF-APPROVE-TUI: call real cli/services/workflow.approve with stale review and overrides; common check refuses, tracker/commit/follow-on spies see zero calls, artifact unchanged. Fresh input still follows existing approval behavior. | `t20` |
| DIFF-APPROVE-IDENTITY: successful approval and reapproval do not invalidate BUILD identity solely through exact approval/audit fields; substantive BUILD/author/contract/rangeBase/source edits do. No-op completion merge stays stable; substantive completion merge requires a new review. | `t13`, `t20` |
| DIFF-APPROVE-RACE: mutate source between wrapper preflight and common boundary, and between common check/write; return stale-review without accepted completion or side effects, preserve current body/foreign edits and remove only owned new approval metadata. Recheck stale identity on later gate consumption. | `t20` |
| DIFF-IDENTITY-TESTS: daemon and controller review fixture changes only TESTS after admission: pass->fail, absent->present, present->absent, malformed/unreadable replacement, builder-reported result/evidence and ranAt-only selection change all prevent publication. Preserve task/file array order and failure-tie semantics; no BUILD/source edit or repeated start required. | `t12`, `t14`, `t18` |
| DIFF-APPROVE-TESTS: fingerprinted CR then TESTS-only mutation refuses common approval, approveWorkflowTarget and real TUI approve, including override/enforcement off. Unchanged TESTS identity succeeds under existing verdict policy; unreadable current input fails closed. | `t20` |
| DIFF-COMPLETION-NOOP: using real collectBuildChangeLog -> ensureBuildRecordOnCompletion -> persistBuildRecord/mergeWithPrior on an existing reviewed BUILD at later fake time, unchanged semantics retains exact prior updatedAt/changeLog author/timestamp/version/order and stable fingerprint, then real workflow approval/reapproval succeeds. Assert no JSON/MD write for byte-identical no-op. | `t13` |
| DIFF-COMPLETION-CHANGE: real writer with changed task result, scoped file membership/version, Story commit or folder identity persists a substantive update and invalidates old CR. Completion cannot erase known version/author, mutate TESTS ranAt or hide source-byte changes. Validate-mode writes retain their existing genuine-run behavior. | `t13` |

## 3. References

- **[[c1]]** `prior-artifact` `docs/standalone/split-oversized-diff-evidence-into-lossless-E2026102734798d20/S001/LLD.md` — "Approved contractDetails APIs promptChars/runReviewJob and data model complete-input accounting, bounded structured provider transport."
- **[[c2]]** `prior-artifact` `docs/standalone/split-oversized-diff-evidence-into-lossless-E2026102734798d20/S001/LLD.md` — "Approved lossless attributed diff spans, reader recovery/refusal, budget-aware fit and singleton descendant revision contracts."
- **[[c3]]** `prior-artifact` `docs/standalone/split-oversized-diff-evidence-into-lossless-E2026102734798d20/S001/LLD.md` — "Approved quality fragment note validation, forced parent gather and parent/global duplication adjudication."
- **[[c4]]** `prior-artifact` `docs/standalone/split-oversized-diff-evidence-into-lossless-E2026102734798d20/S001/LLD.md` — "Approved prepared dimension orchestration, fixed initial primary counts, ten-minute per-chunk root/child deadlines and serial execution."
- **[[c5]]** `prior-artifact` `docs/standalone/split-oversized-diff-evidence-into-lossless-E2026102734798d20/S001/LLD.md` — "Approved canonical source/contracts/BUILD/TESTS fingerprint, publication revalidation and common BUILD approval freshness."
- **[[c6]]** `prior-artifact` `docs/standalone/split-oversized-diff-evidence-into-lossless-E2026102734798d20/S001/LLD.md` — "Approved completion-specific no-op preservation in completion-record/changed-files/standalone writers, exact timestamp/body retention and real writer regressions."
- **[[c7]]** `prior-artifact` `docs/standalone/split-oversized-diff-evidence-into-lossless-E2026102734798d20/S001/LLD.md` — "Approved daemon operation ownership, shared control serializer/result transport, bounded status waits and active-state TTL/lifecycle."
- **[[c8]]** `prior-artifact` `docs/standalone/split-oversized-diff-evidence-into-lossless-E2026102734798d20/S001/LLD.md` — "Approved controller-owned bounded per-call protocol, isolated MCP-side CLI helper and admission/independence guarantees."
- **[[c9]]** `prior-artifact` `docs/standalone/split-oversized-diff-evidence-into-lossless-E2026102734798d20/S001/LLD.md` — "Approved migration/test strategy: focused tests per task, final build/sweep and actual S003 independent review retry without inventory/release/automatic daemon restart changes."
