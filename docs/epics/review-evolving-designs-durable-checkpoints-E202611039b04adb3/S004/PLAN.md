<!-- insrc:artifact PLAN-9b04adb36cac716d-s4 -->

# Plan: STORY-9b04adb36cac716d-s4

## Summary

**Epic:** `review-evolving-designs-durable-checkpoints`
**LLD run:** `wf-1794078672057-4c4sto`
**LLD effective hash:** `20a9ee7f3bdf...`

Connect completed design reviews to permanent artifact history and ordinary approval without changing the review engine. Preserve every attempt and all feedback, reserve capacity before model work, and remove only approved, fully archived inactive checkpoints through a verified private claim. Qualify normal routes with compiled fixtures and then separately verify the installed daemon with a narrow real review.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Define permanent review records and lossless aggregate schemas | M | — | — | unit: U1 permanent payload integrity and digest; aggregate schemas; integration: I8 full/impact 8194 limitations, >256 finding origins and bounded host diagnostics | [[c1]] |
| 2 | **`t2`** Reserve checkpoint capacity before provider dispatch | L | — | `t1` | integration: I8 exact-byte dispatch reservations, consolidation duplication, refusal and restart | [[c2]] |
| 3 | **`t3`** Support bounded design history and deterministic journal replay | L | — | `t1` | unit: U2 UTF-8 frame/journal boundaries and unknown-kind limits; integration: I1 deterministic-id journal crash replay | [[c3]] |
| 4 | **`t4`** Publish completed design attempts through artifact history | L | — | `t1`, `t2`, `t3` | integration: I1 publication receipt fault recovery and zero model reruns; integration: I2 immutable baseline, exact owned delta and source mutation | [[c4]] |
| 5 | **`t5`** Expose version-aware permanent review readers | M | — | `t4` | unit: U3 versioned readers and current IDE common fields; integration: I6 permanent retrieval after cleanup/restart and missing locator | [[c5]] |
| 6 | **`t6`** Enforce approval evidence at the shared lifecycle gate | L | — | `t4`, `t5` | unit: U4 approval applicability and truthful overrides; integration: I3 ordinary/direct lifecycle gate and actual route prerequisites | [[c6]] |
| 7 | **`t7`** Implement claimed-file checkpoint cleanup and recovery | L | — | `t4`, `t6` | integration: I4 private claims, replacement races, full-history preservation and restart; integration: I5 cleanup concurrency, fixed lock order and foreign-scope exclusion | [[c7]] |
| 8 | **`t8`** Qualify compiled routes, recovery and client contracts | L | — | `t2`, `t3`, `t4`, `t5`, `t6`, `t7` | integration: I7 both-party recovery/impact/provenance fixture parity; smoke: S1 compiled normal routes and code-review regression | [[c8]] |
| 9 | **`t9`** Record narrow installed-daemon live qualification | M | — | `t8` | live: L1 installed daemon independent review, progress, permanent retrieval and human-approved cleanup | [[c9]] |

### 1.1 TASK-9b04adb36cac716d-s4-t1 — Define permanent review records and lossless aggregate schemas

Implement validated design-chunk-review v1 history/binding/digest and publication receipt types; retain complete ordered attempt provenance and immutable baselines. Separate aggregate cardinality limits from per-chunk limits in full and impact consolidation, including host diagnostics and carried finding origins.

**Acceptance checks:**
- All accepted model and host-added feedback survives consolidation without truncation; 4097+4097 limitations and >256 combined origins pass when byte-admissible.
- Reject unsupported versions, missing/foreign/tampered history; keep S1–S3 semantics and per-chunk model limits.

### 1.2 TASK-9b04adb36cac716d-s4-t2 — Reserve checkpoint capacity before provider dispatch

Add shared serializer-based bounded reservations before planning, impact, chunk and retry dispatch. Include accepted response, report duplication, aggregate arrays, history and bounded terminal metadata; preserve the fixed checkpoint ceiling.

**Acceptance checks:**
- Exact-bound maximum valid responses persist and consolidate across restart; one-over refuses durably with zero provider calls.
- Bound host-added diagnostics and all reservation fields; distinguish checkpoint refusal from publication-only capacity retry.

### 1.3 TASK-9b04adb36cac716d-s4-t3 — Support bounded design history and deterministic journal replay

Extend existing artifact store journal/sidecar path with validated stable entry ids and narrow known-format size policy using review.maxJsonBytes and the approved ceiling; retain generic 256KiB policy.

**Acceptance checks:**
- Sync/async readers, journal and writer enforce UTF-8 actual size, escaped envelopes and declared-length preallocation bounds.
- Crash at append/head replace replays one identical entry; conflicting stable-id payload rejects; no nested artifact queue.

### 1.4 TASK-9b04adb36cac716d-s4-t4 — Publish completed design attempts through artifact history

Implement proposed history.ts/publication.ts and coordinator integration: save full report first, journal current-subject-bound history plus compact head reference, verify durable readback and checkpoint receipt; explicit retry_publication makes no model calls.

**Acceptance checks:**
- Publication ACK follows durable history and receipt; failures keep recoverable checkpoint and pending error.
- Exact owned lifecycle delta avoids self-invalidation without masking subject edits; original baseline/Markdown remain immutable.

### 1.5 TASK-9b04adb36cac716d-s4-t5 — Expose version-aware permanent review readers

Update report-log/report-file and artifact-content/delivery/CLI readers for discriminated legacy historical versus new design reports. Add exact artifact locator for post-cleanup progress and normal daemon/MCP routing.

**Acceptance checks:**
- After fresh daemon restart, permanent results are retrievable without checkpoint, project scan or model; missing locator errors explicitly.
- Legacy historical display remains read-only; new chunk reports never manufacture legacy claims; current VS Code/JetBrains common wire fields remain aligned.

### 1.6 TASK-9b04adb36cac716d-s4-t6 — Enforce approval evidence at the shared lifecycle gate

Wire ordinary MCP/daemon and direct lifecycle approval into current independent complete permanent evidence checks under coordinator fence then artifact queue, with truthful explicit override and idempotent reapproval.

**Acceptance checks:**
- HIGH/MED, incomplete/latest unfinished, stale revision/document/context, same-party or missing history block; LOW-only passes.
- Exercise epic DEF/HLD/LLD, standalone and sized-issue LLD actual ancestor rules; ISSUE/SPEC/PLAN gain no mandatory review. No providers or nested queued writes under gate.

### 1.7 TASK-9b04adb36cac716d-s4-t7 — Implement claimed-file checkpoint cleanup and recovery

Add proposed cleanup.ts and post-approval hook outside store queue. Filter exact project/artifact, verify every preserved attempt and inactive ownership, then privately claim same-filesystem file before verification/deletion; quarantine mismatches and restore only without clobber.

**Acceptance checks:**
- Never unlink public pathname: replacements before/after claim remain safe; unverified bytes retained with path/reason, crashes recover claims safely.
- Retain active, foreign, corrupt, symlink, unpreserved and unfinished overridden state; release replay state only after actual deletion and no new public checkpoint; independent artifacts continue.

### 1.8 TASK-9b04adb36cac716d-s4-t8 — Qualify compiled routes, recovery and client contracts

Add integrated fixture tests and compiled MCP/daemon qualification for both reviewer parties, DEF/HLD/LLD routes, recovery/retry/mutation/impact/publication/approval/cleanup/restart; run production build and existing code-review smoke.

**Acceptance checks:**
- Fault injection verifies one permanent publication, no model reruns for persistence and no cross-session/foreign cleanup interference.
- Fixtures explicitly labelled; current IDE parsers checked; no legacy execution, activation subsystem or raw approval IPC; record focused tests and build outcomes.

### 1.9 TASK-9b04adb36cac716d-s4-t9 — Record narrow installed-daemon live qualification

After coordinated push/update/restart, run narrow independent review scenarios through registered normal tools, record exact provenance, timings, findings/permanent references and approved cleanup dispositions; reuse only exact covered-kind prior live evidence.

**Acceptance checks:**
- Label hosted versus fixture results honestly; uncovered DEF/HLD/LLD kinds stay unverified and failures are investigated.
- Use CliProvider only and explicit human approval for live artifact gates; retain working code-review smoke evidence and no activation-proof framework.
- Externally gated: do not mark complete until the operator has updated/restarted the installed daemon and required human approvals are recorded; local fixtures are insufficient.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| U1: Versioned permanent payload validates every attempt, baseline, plan, accepted result, retained finding/coverage origin, model/party, failure/action history and exact preservation digest; missing/foreign/duplicate/tampered data rejects. | `t1` |
| U2: UTF-8 frame/journal size policy accepts exact boundaries and rejects one byte over, malformed declared lengths, unsupported versions and oversized unknown/legacy/feedback kinds; only known design records receive the configured allowance within the existing design ceiling. | `t3` |
| U3: Version-aware log, artifact-content, delivery and CLI readers preserve legacy display and expose new chunk findings without fabricated claims; current VS Code and JetBrains wire contracts retain existing common fields. | `t5`, `t8` |
| U4: Normal approval requires current complete opposite-party new-format evidence; HIGH/MED, stale body/document/context, same-party, incomplete, invalidated, paused/latest active and missing referenced records block; LOW-only/advice passes; explicit override remains truthful. | `t6` |
| I1: Crash/fault injection at journal stage, history append, head replace and checkpoint publication ACK recovers one identical entry/reference with zero model reruns; conflicting replay never overwrites history. | `t3`, `t4` |
| I2: Queued and direct subject changes before/during publication and immediately before approval refuse stale evidence; only exact owned lifecycle metadata is exempt, unrelated source changes are ignored and canonical Markdown is not rewritten. | `t4`, `t6` |
| I3: DEF/HLD/LLD normal MCP/daemon approval and direct LifecycleService approval share the same gate; epic, standalone and issue-linked routes require only their actual documents, while ISSUE/SPEC/PLAN remain human-only gates. | `t6`, `t8` |
| I4: Successful artifact approval cleans only matching inactive fully preserved checkpoints; verify every attempt including older failures, and retain latest unpublished work after override, foreign same-s1/slug records, corrupt/symlink and file-replacement races. Inject replacement immediately before claim, after claim verification and at the old public-path unlink boundary: no public pathname is unlinked, unverified claimed bytes survive in quarantine, and new public bytes remain intact. Inject crashes after claim and before deletion, and exercise no-clobber restore with a replacement present. | `t7`, `t8` |
| I5: Cleanup/start/correction/publication contention on one artifact returns retained promptly, while independent artifacts progress; fixed lock order avoids recursive store queues and no provider or unrelated Git-history replay runs under cleanup. | `t7`, `t8` |
| I6: After cleanup and a fresh daemon instance, exact artifactPath/history reference retrieves the permanent result without a checkpoint or model; missing locator rejects rather than scanning projects. | `t5`, `t8` |
| I7: Both reviewer parties publish S1-S3 fixture outcomes for interruption/recovery, technical retry pause, mutation invalidation, selective retained coverage and final consistency with unchanged semantic results and real provenance. | `t8` |
| I8: Before planning/impact/chunk/retry dispatch, checkpoint-ceiling tests at exact and one-byte-over serializer bounds reserve maximum response, consolidation duplication and bounded error/publication metadata. Refused dispatch makes zero model calls and durably records refusal. At the admitted boundary, maximum valid feedback survives save, consolidation and restart without a rerun. Independently exercise permanent-history capacity pending, then model-free retry after raising the allowed history limit; it never repairs checkpoint overflow. Reproduce two individually valid chunks with 4097 limitations each and verify all 8194 survive full and impact consolidation, checkpoint restart, permanent publication and reading. Test derived aggregate maxima and one-over boundaries, bounded host-added diagnostics, and multiple chunks whose combined findings exceed 256 (including carried origins); admitted complete results must consolidate losslessly or dispatch must have been refused before provider work. | `t1`, `t2`, `t3`, `t4` |
| S1: Built MCP/IPC and daemon paths exercise DEF/HLD/LLD lifecycle publication, current-subject invalidation, recovery/retry pause, selective correction, approval override/refusal, scoped cleanup and permanent result lookup across restart using labelled fake native CLI responses. Existing compiled code-review smoke stays passing; no legacy flags, raw approval IPC or activation subsystem. | `t8` |
| L1: After coordinated daemon update, run a narrow real DEF/HLD/LLD design scenario through insrc_review_step with live progress and permanent result retrieval, then normal registered approval/cleanup after explicit human consent. Record chosen provider/model, measured ACK/progress timings, actual findings/result/history reference and checkpoint disposition; separate hosted calls from fixtures and retain current code-review smoke evidence. A failure is recorded and investigated, not substituted with a fake pass. | `t9` |

## 3. References

- **[[c1]]** `prior-artifact` `.insrc/artifacts/LLD-9b04adb36cac716d-s4.json#/body/dataModelChanges/0`
- **[[c2]]** `prior-artifact` `.insrc/artifacts/LLD-9b04adb36cac716d-s4.json#/body/dataModelChanges/2`
- **[[c3]]** `prior-artifact` `.insrc/artifacts/LLD-9b04adb36cac716d-s4.json#/body/contractDetails/api/2`
- **[[c4]]** `prior-artifact` `.insrc/artifacts/LLD-9b04adb36cac716d-s4.json#/body/dataModelChanges/1`
- **[[c5]]** `prior-artifact` `.insrc/artifacts/LLD-9b04adb36cac716d-s4.json#/body/contractDetails/api/5`
- **[[c6]]** `prior-artifact` `.insrc/artifacts/LLD-9b04adb36cac716d-s4.json#/body/dataModelChanges/3`
- **[[c7]]** `prior-artifact` `.insrc/artifacts/LLD-9b04adb36cac716d-s4.json#/body/dataModelChanges/4`
- **[[c8]]** `prior-artifact` `.insrc/artifacts/LLD-9b04adb36cac716d-s4.json#/body/testStrategy/testLevels/2`
- **[[c9]]** `prior-artifact` `.insrc/artifacts/LLD-9b04adb36cac716d-s4.json#/body/testStrategy/testLevels/3`
