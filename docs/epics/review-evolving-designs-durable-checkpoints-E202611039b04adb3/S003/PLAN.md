<!-- insrc:artifact PLAN-9b04adb36cac716d-s3 -->

# Plan: STORY-9b04adb36cac716d-s3

## Summary

**Epic:** `review-evolving-designs-durable-checkpoints`
**LLD run:** `wf-1793779743636-doc30v`
**LLD effective hash:** `20a9ee7f3bdf...`

Add impact-aware correction reviews to the existing design-review coordinator. Reviewers assess direct and indirect effects, inspect affected chunks and a fresh consistency check, and retain eligible prior coverage by reference. Strict history, finding reconciliation and visible fresh/retained progress preserve correctness while reusing S1/S2 recovery; permanent history and approval cleanup remain S4.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Bound impact, finding and report schemas | M | — | — | unit: Strict impact/disposition/projection schemas reject extras, wrong branches and bounds; old full checkpoints decode | [[c1]] [[c9]] |
| 2 | **`t2`** Admit sequential correction attempts and freeze history | M | — | `t1` | integration: Sequential admission/replay and two checkpoint-growth branches preserve history and reject invalid statuses | [[c1]] [[c3]] [[c4]] |
| 3 | **`t3`** Resolve and validate immutable coverage origins | M | — | `t2` | unit: Backward provenance eligibility matrix and incomplete-source bypass rejection | [[c1]] [[c3]] [[c5]] |
| 4 | **`t4`** Validate current impact selection and explicit full fallback | M | — | `t3` | unit: Full-plan partition and explicit-full versus rejected-selective retry classification | [[c1]] [[c5]] [[c9]] [[c13]] |
| 5 | **`t5`** Schedule selected work with existing recovery controls | M | — | `t4` | unit: Interleaved selected order and impact reservation kind; integration: Selected work resume/mutation/generation and persisted retry counters | [[c1]] [[c6]] |
| 6 | **`t6`** Run impact preparation on native and controller routes | M | — | `t5` | integration: Native/controller impact exchange parity and atomic plan-plus-impact save | [[c1]] [[c4]] [[c5]] [[c13]] |
| 7 | **`t7`** Reconcile findings and consolidate effective coverage | M | — | `t6` | unit: Exact coverage partition and effective finding counts; unit: Final-result-only decisions, missing reconciliation carry, resolved/superseded evidence | [[c1]] [[c5]] [[c9]] |
| 8 | **`t8`** Expose impact transport and truthful progress | M | — | `t7` | integration: Normal impact schema/IPC routing rejects foreign or stale submissions; unit: Fresh-only progress pagination and retained breakdown | [[c1]] [[c4]] [[c9]] [[c14]] |
| 9 | **`t9`** Qualify S3 across workflow contexts and compiled entrypoints | M | — | `t8` | smoke: Disposable compiled MCP/IPC initial and corrected review call counts; integration: Epic standalone issue contexts and S1/S2 regression qualification | [[c1]] [[c3]] [[c4]] [[c5]] [[c6]] [[c13]] [[c14]] |

### 1.1 TASK-9b04adb36cac716d-s3-t1 — Bound impact, finding and report schemas

Define additive contracts and deterministic schema fixtures before runtime integration.

**Acceptance checks:**
- Strict sc4 assessment, source tuples, finding-decision union, preparationKind, result/report/progress and impact request schemas reject extras and enforce existing count/byte bounds.
- Initial/no-impact checkpoints remain readable; correction report requires complete bounded provenance; no copied historical bodies.

### 1.2 TASK-9b04adb36cac716d-s3-t2 — Admit sequential correction attempts and freeze history

Extend coordinator admission and checkpoint evolution using existing subject fences and recovery gates.

**Acceptance checks:**
- Initial attempt=1, exact historical replay and latest+1 after complete terminal report are distinct branches; submitted.attempt remains 1.
- checkEvolution permits only ordinary impact correction or existing approved invalidated full restart; freezes all prior attempts and preparationKind; save failure dispatches nothing.

### 1.3 TASK-9b04adb36cac716d-s3-t3 — Resolve and validate immutable coverage origins

Add bounded backward historical-origin resolution and retained coverage eligibility checks shared by impact validation and consolidation.

**Acceptance checks:**
- Resolve strictly decreasing same-artifact/reviewer references to accepted substantive sources; reject cycles, forward/equal/foreign/missing/invalidated or malformed origins.
- Require passed/changes_requested and empty limitations at every link; reject older-passed bypass of immediately preceding incomplete coverage; preserve prior bytes.

### 1.4 TASK-9b04adb36cac716d-s3-t4 — Validate current impact selection and explicit full fallback

Implement proposed validateDesignImpact over full plan/inventory and validated historical origins.

**Acceptance checks:**
- Validate full plan then disjoint complete selected/retained partition, mandatory fresh consistency and eligible strictly backward same-review origins.
- Reject incomplete/limited sources, older-passed bypass, foreign/cyclic/forward/missing/invalidated origins; raw validation errors normalize only at execution boundary.
- Uncertain context accepts explicit full candidate; affected_chunks is rejected within current-unit retry budget without host rewriting.

### 1.5 TASK-9b04adb36cac716d-s3-t5 — Schedule selected work with existing recovery controls

Extend nextDesignUnit/reserveDesignUnit and progress tracking for selected execution without changing S2 policy.

**Acceptance checks:**
- Derive executionOrder by filtering complete dependency order; retained chunks make zero calls; final consistency remains fresh; completedChunks is a fresh prefix.
- Reserve current.kind=impact for impact preparation and use same kind in interrupted matching; reject preparation mismatch before mutations.
- Preserve retry counters, explicit recovery, subject-only invalidation/late-generation fences and active-tool/30-minute inactivity controls; raw stored-state errors remain terminal.

### 1.6 TASK-9b04adb36cac716d-s3-t6 — Run impact preparation on native and controller routes

Add designImpactPrompt and coordinator impact exchange/execute branches with shared validation and atomic accepted plan+impact.

**Acceptance checks:**
- Native and trusted controller use identical impact policy/schema and atomically persist plan+impact before chunk dispatch.
- Derive executionOrder from complete plan, skip retained chunks with zero provider calls, set impact current.kind and preserve reservation/recovery generation fences.
- Use existing initial+three retries, explicit directed recovery, real activity/tool tracking and subject-only invalidation; no new timeouts or auto next attempt.

### 1.7 TASK-9b04adb36cac716d-s3-t7 — Reconcile findings and consolidate effective coverage

Extend result assessment and consolidation while preserving all-fresh behavior.

**Acceptance checks:**
- Exact F=S, S disjoint R and S union R=P; fresh-only result bodies, valid retained origins and complete inventory coverage.
- Extract decisions solely from accepted fresh final consistency result; missing reconciliation carries unresolved findings and produces incomplete.
- Deduplicate findings by immutable source tuple, validate resolved/superseded evidence, compute effective counts and exact report.impact projection; no second disposition argument.

### 1.8 TASK-9b04adb36cac716d-s3-t8 — Expose impact transport and truthful progress

Update public registrations, observation and workflow guidance to expose implemented S3 semantics.

**Acceptance checks:**
- Register impact through normal MCP, daemon RPC, handler routing, method class and repo audit with trusted owner/generation/sequence checks.
- Progress total is selected executionOrder length, completed is fresh accepted count; separately report retained/effective breakdown; paginate fresh results only.
- Existing no-impact callers stay valid; polling never dispatches work and complete fraction never masks incomplete status.

### 1.9 TASK-9b04adb36cac716d-s3-t9 — Qualify S3 across workflow contexts and compiled entrypoints

Finish scoped integration qualification and maintain relevant design/sequence documentation.

**Acceptance checks:**
- Deterministic native/controller scenarios cover Epic/Standalone/Issue contexts, indirect dependencies, provenance chains, missing decisions, mutations and interrupted/paused recovery.
- Disposable compiled fake-CLI MCP/IPC smoke proves full initial then selective corrected review, zero retained calls, truthful progress and blocker carry; label synthetic evidence.
- Run production build and scoped regression suites once; keep S4 publication/approval/cleanup and installed-daemon rollout out of this story.
- Verify corrupt trusted provenance, checkpoint-cap/persistence failure, owner/generation errors and candidate bounds have the documented terminal-versus-output-retry behavior. Re-run relevant all-fresh S1/S2 and code-review regression subsets.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| Impact {plan,impact} envelope round-trips; missing/extra fields, byte/count limits and positive sequential attempt constraints reject without dispatch. | `t1`, `t2`, `t6`, `t8` |
| Complete current plan and selected/retained partition: no omitted/duplicate/unknown chunk, all consistency fresh, no unsafe split/merge retention, same artifact/reviewer backward-only sources. | `t1`, `t3`, `t4` |
| Finding tuple identities and explicit dispositions: duplicate IDs across attempts/chunks do not conflate; unknown/resolved/superseded references reject or remain incomplete. | `t1`, `t7` |
| Direct correction selects edited concern and indirect dependent chunks even when their text is unchanged; final consistency always executes. | `t4`, `t6` |
| Uncertainty, missing usable baseline, incompatible grouping or reviewer-party change produces explicit full mode without retained results. | `t4` |
| Retained coverage remains references to immutable accepted source; full report counts include carried HIGH/MED/LOW and unresolved mandatory limits; no copied-as-fresh chunks. | `t3`, `t7` |
| Fresh final consistency must account for all prior effective findings; carry by default, evidence-backed resolution and supersession require selected inspection, including removed sections. | `t7` |
| Atomic accepted plan+impact and prior attempt immutability; failed saves preserve last accepted bytes and dispatch zero further work. | `t2`, `t6` |
| Interleaved retention: full plan [keep-A, change-B, keep-C, final], completed fresh [change-B] selects final; out-of-order/duplicate fresh results reject, retained dependencies resolve by ID and receive zero dispatches. [[c6]] | `t5` |
| Final findingDecisions strict union round-trip, missing/foreign/duplicate origins, branch-specific required fields, nonfinal rejection, unresolved carry on missing evidence, and valid resolved/superseded evidence references. [[c5]] [[c9]] | `t1`, `t7` |
| Selective consolidation exact partition: [keep-A, change-B, keep-C, final] accepts fresh [change-B, final] with retained A/C, and rejects absent C, duplicate/unknown origins, fresh/retained overlap or retained final; report.chunks remains fresh-only. Full mode and no-impact calls retain all-fresh behavior. [[c5]] [[c6]] | `t7` |
| Incomplete retention rejection: a structurally identical prior chunk with status incomplete or nonempty limitations must be selected afresh on native and controller routes; reject bypass via an older passed source or an incomplete provenance link. Complete sibling chunks in an overall-incomplete prior report remain eligible. If fresh review still cannot verify mandatory coverage, keep the new report incomplete. [[c5]] [[c9]] | `t3`, `t4` |
| Every same-attempt marker mutation (planning to impact, impact to planning, explicit to absent, absent to explicit) rejects before save; accepted impact rewrite/removal or a half plan/impact pair rejects while previous checkpoint bytes stay unchanged. [[c3]] [[c9]] | `t2` |
| Native/controller candidates invoke the same proposed validateDesignImpact and extended assessDesignResult contracts; output errors use the failed unit's retry budget, wrong-owner/transport and invalid stored-state errors do not. Missing final reconciliation is incomplete with conservative carry, never a fabricated resolution. [[c4]] [[c5]] [[c13]] | `t4`, `t6` |
| Retained-source rejection matrix at validateDesignImpact AND consolidation: reject forward or equal attempt link, a cycle, cross-artifact or cross-reviewer source, missing source attempt, missing/malformed source result, and invalidated source attempt; verify prior bytes unchanged and no false consolidated coverage. Model-candidate errors use impact retries, already accepted corrupt state stops without model retry. [[c1]] [[c3]] [[c5]] [[c13]] | `t3`, `t4`, `t7` |
| Reservation preparationKind mismatch matrix: planning argument on an impact attempt, impact argument on a planning/missing-marker attempt, and omitted default-planning argument on an impact attempt all reject invalid_checkpoint before counters/actions/current change and with zero provider calls. Matching preparation kinds and regular chunk reservations remain valid. [[c6]] [[c9]] [[c13]] | `t5` |
| Selective progress live/stored/native/controller: plan [keep-A, change-B, keep-C, final] shows fresh 1/2 then 2/2 with retained2, effective3/4 then4/4; full attempts preserve N/N with retained0; pre-plan omits breakdown; count bounds and cursor fresh-only semantics reject bad state/request without a model call. An incomplete final report still shows status incomplete even when all selected assessments returned. [[c6]] [[c9]] [[c14]] | `t8` |
| Corrupt stored checkpoint JSON/schema is terminal invalid_checkpoint with no rewrite or retry; readable valid history with semantic uncertainty selects a full review only through valid admission. [[c3]] [[c13]] | `t2`, `t3`, `t9` |
| Report.impact strict schema and projection: initial/pre-S3/full-restart report omits it; selective and correction-full reports require every declared field. Verify complete fresh/retained coverageOrigins, matching sc4/final-output fields, effective finding deduplication/counts, resolved/superseded exclusion, and carry+incomplete when reconciliation is missing. Reject partial objects, extra fields, wrong origin/justification, duplicate tuples and bounds overflow without silent truncation. [[c3]] [[c5]] [[c9]] | `t1`, `t7` |
| Distinguish reviewer output bound failures (current-unit retries then pause) from a checkpoint serialization cap failure (checkpoint_too_large terminal, zero automatic retries or later dispatch, prior bytes unchanged). Verify failed cannot use recover/resume or restart_full; if terminal persistence fails, uncertainty remains visible. Use disposable deterministic fixtures, not hosted model calls. [[c3]] [[c4]] [[c9]] [[c13]] | `t4`, `t9` |
| Round-7 correction cases: impact reservation and interrupted matching use current.kind=impact, while ordinary planning and chunk reservations retain their kinds; mismatches mutate nothing. Assert raw invalid_plan/invalid_result/invalid_schema/invalid_json/input_too_large at validator/decode boundaries and normalized invalid_output at the reviewer-execution diagnostic boundary. Stored-state invalid_checkpoint/foreign_checkpoint/result_too_large/invalid_checkpoint_path/invalid_project/invalid_review_id remain terminal with no model retry, and original bytes remain unchanged. [[c3]] [[c5]] [[c6]] [[c9]] [[c13]] | `t4`, `t5`, `t9` |
| Consolidation has no separate findingDecisions input: extract only the accepted final consistency result array; verify report.impact equality, and omission yields [] with unresolved carry and incomplete. A forged second copy cannot override the accepted final result. [[c5]] [[c9]] | `t7` |
| Uncertain/unusable comparison context accepts an explicit full-mode candidate without retry, but rejects an affected_chunks candidate with raw invalid_plan/invalid_result normalized to invalid_output and spends only the current impact-unit retry budget. The host never silently transforms candidate scope or creates another attempt. [[c5]] [[c13]] | `t4`, `t6` |
| Explicit next-attempt admission after terminal complete review; exact replay, conflicting identity, active/paused/invalidated paths and no automatic next attempt. | `t2` |
| Both reviewer parties use identical impact schema/guidelines; selected units execute in dependency order, retained units make zero model calls, complete final consistency and visible provenance. | `t6`, `t7` |
| Impact crash/transport/schema failure preserves accepted work, spends at most initial+three per impact unit, pauses for user direction and resumes with no extra accepted-unit calls. | `t5`, `t6` |
| Mutation during blocked impact, selective execution and final save latches invalidation; restoration cannot revive; approved restart_full reviews every chunk without reuse. | `t5`, `t6`, `t9` |
| Epic DEF/HLD/Story LLD versus standalone and ISSUE-rooted LLD resolve correct current context without invented upstream artifacts; external changes do not trigger invalidation. | `t9` |
| Admission branch matrix: initial attempt1; exact historical replay after later attempts; latest+1 after each terminal complete report; skipped/unknown ordinal, different artifact, active subject, uncertain storage, paused/interrupted/invalidated/failed predecessor rejection. Original submitted.attempt stays1, all prior attempt bytes freeze, current baseline is fresh; save failure dispatches zero. [[c3]] [[c4]] | `t2` |
| Checkpoint evolution accepts terminal-complete sequential impact append and separately accepts invalidated+approved full restart; cross-branch preparationKind, changed prior prefix, missing report, changed initial submission and skipped attempt reject. [[c3]] | `t2` |
| Controller/native impact parity: phase impact/kind impact accepts the same complete plan+sc4 decision and commits them together before acknowledgement; plan/impact or impact/planning mismatches, foreign owners, stale generations/sequences, replay conflicts and malformed envelopes reject with the existing retry distinction. Normal MCP phase schema, unary RPC route and main-owner classification/audit stay in lockstep. [[c4]] [[c9]] | `t6`, `t8` |
| Extend compiled disposable fake-CLI MCP/IPC smoke: full first review, corrected artifact, indirect impact, retained coverage, fresh consistency and auditable finding carry/resolution; inspect recorded call counts/provenance. | `t9` |
| Typecheck/production build plus scoped design-review/MCP/schema/recovery regressions; existing code-review remains unaffected. S4 owns full approval/permanent-history/live rollout qualification. | `t9` |

## 3. References

- **[[c1]]** `prior-artifact` `.insrc/artifacts/LLD-9b04adb36cac716d-s3.json` — "Approved revision 11 governs S3 sc4 implementation, including contractDetails, dataModelChanges, errorPaths and testStrategy; consume S1/S2 and exclude S4 publication/approval/cleanup."
- **[[c3]]** `code` `src/workflow/review/design-review/checkpoint.ts`
- **[[c4]]** `code` `src/workflow/review/design-review/coordinator.ts`
- **[[c5]]** `code` `src/workflow/review/design-review/results.ts`
- **[[c6]]** `code` `src/workflow/review/design-review/recovery-state.ts`
- **[[c9]]** `code` `src/workflow/review/design-review/contracts.ts`
- **[[c13]]** `code` `src/workflow/review/design-review/technical-failure.ts`
- **[[c14]]** `code` `src/workflow/review/design-review/progress.ts`
