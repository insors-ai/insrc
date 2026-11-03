<!-- insrc:artifact PLAN-17123b6d304af2a2-s2 -->

# Plan: E2026110117123b6d:S002

## Summary

**Epic:** `share-project-memory-across-agents-applications`
**LLD run:** `wf-1793599888907-mgb1d3`
**LLD effective hash:** `18ac1fc6f9d6...`

Build a separate bounded file journal that acknowledges eligible events only after durable acceptance, recovers interrupted writes explicitly, and preserves retry identity. Integrate the queue into the existing standalone lifecycle without changing public contracts; semantic processing and Lance receipts remain later stories. Run focused tests per task, qualify crash behavior on named platforms, then validate the complete package and root build after all implementation changes.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Define private queue types and canonical bounded codec | M | — | unit: canonical-json-frame-length-checksum-and-bounded-decoding; unit: immutable-policy-snapshot-before-persistence; unit: scoped-identity-exact-retry-and-conflicting-reuse | [[c1]] [[c2]] |
| 2 | **`t2`** Add owned filesystem primitives and format bootstrap | M | `t1` | integration: owned-bootstrap-short-write-and-directory-sync | [[c1]] [[c3]] |
| 3 | **`t3`** Publish bounded checkpoints and segment rotation | M | `t2` | unit: retained-byte-and-worst-case-metadata-reservations; unit: checkpoint-schema-generation-and-retry-state-validation; integration: rotation-orphan-successor-and-checkpoint-replacement-matrix | [[c1]] [[c4]] |
| 4 | **`t4`** Recover accepted frontiers and diagnose corruption | M | `t3` | integration: recovery-frontier-complete-suffix-and-unaccepted-partial-tail; integration: published-checkpoint-and-sealed-corruption-fail-closed | [[c1]] [[c5]] |
| 5 | **`t5`** Implement serialized durable append and backpressure | M | `t4` | integration: durable-append-frontier-and-full-queue-refusal | [[c1]] [[c2]] [[c4]] |
| 6 | **`t6`** Enforce policy-bound admission and retry identity | M | `t5` | integration: concurrent-admission-fifo-and-idempotent-retry; integration: privacy-binding-and-scope-status-isolation-before-enqueue | [[c1]] [[c2]] |
| 7 | **`t7`** Implement pinned replay and scoped operation lookup | M | `t6` | integration: pinned-replay-and-qualified-operation-status; integration: retry-holes-do-not-authorize-mixed-segment-deletion | [[c1]] [[c5]] [[c6]] |
| 8 | **`t8`** Validate authoritative terminal receipt proofs | M | `t7` | integration: sc3-receipt-verifier-proof-and-causal-order-contract | [[c1]] [[c6]] |
| 9 | **`t9`** Recycle verified unpinned segments recoverably | M | `t8` | integration: verified-terminal-ack-retirement-and-reader-pins; integration: recycled-identity-requires-authoritative-receipt-capability | [[c1]] [[c6]] |
| 10 | **`t10`** Compose queue startup and service lifecycle | M | `t9` | integration: drain-close-startup-failure-preserve-backlog-and-ownership; integration: public-service-accepted-status-and-unavailable-semantic-capabilities | [[c1]] [[c7]] |
| 11 | **`t11`** Complete deterministic failure and privacy matrices | M | `t10` | integration: write-sync-rename-unlink-failure-fences-the-lane; integration: adversarial-admission-and-recycled-scope-isolation | [[c1]] [[c8]] |
| 12 | **`t12`** Qualify native process crash recovery on macOS and Linux | M | `t11` | integration: accepted-set-survives-process-kill-at-every-boundary; integration: macos-apfs-linux-ext4-node22-queue-qualification | [[c1]] [[c8]] |
| 13 | **`t13`** Measure queue resource and durability costs | M | `t12` | integration: queue-resource-and-fsync-cost-measurement | [[c1]] [[c8]] |
| 14 | **`t14`** Verify packed independent consumption and integrated build | M | `t13` | smoke: packed-external-submit-crash-reopen-and-operation; smoke: pure-import-and-no-daemon-or-backend-storage-dependency; smoke: package-suite-root-build-and-current-source-ci-evidence | [[c1]] [[c9]] |

### 1.1 E2026110217123b6d:S002:T001 — Define private queue types and canonical bounded codec

Implement packages/project-memory/src/queue/types.ts and packages/project-memory/src/queue/codec.ts, canonical JSON/strict envelope validation, immutable snapshots and incremental ingress reservations without editing public packages/project-memory/src/types.ts.

**Acceptance checks:**
- Preserve sc1/sc2 and sc3 signatures; private proof includes scope, epoch and bounded metadata.
- Reject unsafe JSON, invalid Unicode/envelopes, depth/node/byte excess; preserve content, key-order equivalence and -0 deterministically.
- Stable domain-separated identity and full admitted-command hash distinguish exact retry from conflicting reuse.

### 1.2 E2026110217123b6d:S002:T002 — Add owned filesystem primitives and format bootstrap

Implement private packages/project-memory/src/queue/io.ts, exact-file identity checks, writeAll, explicit file/directory sync and bounded format/bootstrap state under S1 ownership.

**Acceptance checks:**
- No implicit roots or backend imports; format.json and numbered segments created durably and exclusively.
- Handle short/zero writes and sanitize OS failures; preserve bytes and ownership on uncertain I/O.
- Expose private fault-injection seams only; no production fault options.

### 1.3 E2026110217123b6d:S002:T003 — Publish bounded checkpoints and segment rotation

Implement packages/project-memory/src/queue/checkpoint.ts with current/prior replacement protocol, immutable numbered segments, reservation accounting and rotation target semantics.

**Acceptance checks:**
- Backup and replacement require file sync/rename/directory sync in approved order; uncertainty fences mutations.
- Physical retained bytes, per-frame/segment/control reservations and ceilings are enforced before acceptance.
- Valid oversized single frames use dedicated bounded segments; uint64 identifiers never wrap.

### 1.4 E2026110217123b6d:S002:T004 — Recover accepted frontiers and diagnose corruption

Implement packages/project-memory/src/queue/recovery.ts with strict checkpoint/segment validation and bounded durable recovery/fault records.

**Acceptance checks:**
- Never roll back a corrupt published checkpoint to silently lose accepted work.
- Promote only valid contiguous complete suffixes; trim only incomplete unterminated unaccepted tail under durable intent/report.
- Missing accepted files, duplicates, sequence gaps, complete malformed lines, unknown versions and event-bearing orphans fail closed; exact successor header-only orphan follows specified protocol.

### 1.5 E2026110217123b6d:S002:T005 — Implement serialized durable append and backpressure

Implement packages/project-memory/src/queue/file-queue.ts append/seal/stats on one bounded FIFO mutation lane with acceptance-frontier publication.

**Acceptance checks:**
- Accepted response follows full frame write, data sync and durable checkpoint frontier; no semantic commit claim.
- Reserve physical and future metadata budgets; full queue rejects new work without evicting pending events.
- Any ambiguous write/publication failure fences the lane until quiescent recovery; stats distinguish pending events/retained bytes.

### 1.6 E2026110217123b6d:S002:T006 — Enforce policy-bound admission and retry identity

Implement packages/project-memory/src/queue/admission.ts with invocation-time snapshot/reservation, bind/admit/revalidation and exact retry lookup before disk-budget rejection.

**Acceptance checks:**
- Denied/unbound/invalid commands leave no event bytes, invoke no models and emit no payload logs.
- Policy may redact payload only; validate namespace ownership and epoch; same key/hash/epoch deduplicates and changed reuse conflicts.
- Concurrent calls preserve invocation FIFO including policy waits; ingress count/memory reservations refund correctly and hanging policy blocks safely.

### 1.7 E2026110217123b6d:S002:T007 — Implement pinned replay and scoped operation lookup

Add bounded replay snapshots/cursors, authorized status reads and retained retry index.

**Acceptance checks:**
- Replay preserves total sequence, unresolved holes and reader pins; paused readers prevent deletion.
- Status rebinds scope; every stored qualifier must match a supplied qualifier, provenance session is distinct, unknown/mismatch are indistinguishable.
- Drain accounting tracks active readers/calls separately from durable backlog; no new replay/status starts after stopAdmission.

### 1.8 E2026110217123b6d:S002:T008 — Validate authoritative terminal receipt proofs

Implement S2-owned read-only verifier collaborator and markResolved bookkeeping using a test fake only.

**Acceptance checks:**
- Authoritative lookup first when installed reconciles lost queue ACK and recycled identity; validate scope/key/hash/epoch/generation and logical terminal proof.
- Absent/unavailable/mismatched/nonterminal proof never permits resolution; queue-only S2 cannot resolve/recycle.
- cleanup-pending is terminal only with explicit proof, without claiming physical deletion complete; no Lance store or worker implementation.

### 1.9 E2026110217123b6d:S002:T009 — Recycle verified unpinned segments recoverably

Implement receipt barrier and one-segment retirement checkpoint/unlink/directory-sync/finalization protocol.

**Acceptance checks:**
- Only sealed fully terminal unpinned segments can retire; mixed pending segments remain.
- Crash at any retirement phase resumes recorded intent safely, including exact already-unlinked files.
- After recycling authoritative receipts prevent duplicate replay; missing verifier fails closed including older queue-only reopen; no second permanent receipt ledger.

### 1.10 E2026110217123b6d:S002:T010 — Compose queue startup and service lifecycle

Wire packages/project-memory/src/host-node.ts and packages/project-memory/src/runtime.ts private ingress delegate and OwnedWork with tracked partial-startup ownership.

**Acceptance checks:**
- Return service only after recovery; submit/operation perform real queue work while context/search/inspect stay NOT_READY.
- Stop admission, drain calls/I/O/leases, then close handles; durable backlog remains replayable and does not block clean shutdown.
- Startup/close failures retain owner unless cleanup verified; supplied models/policy/logger stay host-owned; service and participant drain are distinct.

### 1.11 E2026110217123b6d:S002:T011 — Complete deterministic failure and privacy matrices

Exercise real-filesystem private faults and adversarial contract cases across integrated queue paths.

**Acceptance checks:**
- Inject before/after write, sync, backup/rename, rotation, retirement and unlink; uncertain outcomes fence and recover.
- Cover retry-full queue, source mutation, scope omissions after recycling, policy failures, metadata caps, clocks, overflow and paused readers.
- Use durable fake verifier to test receipt boundaries while explicitly excluding S3 Lance atomicity claims.

### 1.12 E2026110217123b6d:S002:T012 — Qualify native process crash recovery on macOS and Linux

Add Node22 child barrier/SIGKILL accepted-set oracle and real ownership/filesystem qualification.

**Acceptance checks:**
- Accepted identities/order survive kill at every durable boundary and duplicate retry causes no logical duplication.
- Run on actual macOS/APFS and Linux/ext4 Node >=22.22.1 <23 with native ownership; unsupported/skipped runs are pending, never passed.
- Publish environment and coverage evidence; process/fault tests do not imply hardware power-loss qualification.

### 1.13 E2026110217123b6d:S002:T013 — Measure queue resource and durability costs

Add reproducible bounded benchmark/evidence for queue acceptance/recovery with actual durability steps enabled.

**Acceptance checks:**
- Named hardware/OS/filesystem/Node corpus covers 1KiB/64KiB/1MiB commands, 16MiB safety edge and empty/1k/metadata-cap backlogs.
- Report p50/p95 acceptance, cold recovery, physical data/control bytes and RSS/heap/counters; semantic commit is unimplemented.
- No invented production defaults/latency SLO; record operational limits and handoff obligations for S3/S4/S9.

### 1.14 E2026110217123b6d:S002:T014 — Verify packed independent consumption and integrated build

Extend recursive dist/dependency closure verification for queue modules, external consumer smoke and package documentation.

**Acceptance checks:**
- Isolated normally installed tarball submits, crashes/reopens, retries and queries accepted status without workspace/backend access.
- Pure import has no side effects; recursive package contents/types/native dependency closure and natural exit verified.
- After all code tasks complete run package suite and root build once; preserve existing S1 lifecycle/ownership tests and record any unrelated failures separately.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| canonical-json-frame-length-checksum-and-bounded-decoding | `t1` |
| immutable-policy-snapshot-before-persistence | `t1` |
| scoped-identity-exact-retry-and-conflicting-reuse | `t1` |
| retained-byte-and-worst-case-metadata-reservations | `t3` |
| checkpoint-schema-generation-and-retry-state-validation | `t3` |
| concurrent-admission-fifo-and-idempotent-retry | `t6` |
| accepted-set-survives-process-kill-at-every-boundary | `t12` |
| recovery-frontier-complete-suffix-and-unaccepted-partial-tail | `t4` |
| published-checkpoint-and-sealed-corruption-fail-closed | `t4` |
| rotation-orphan-successor-and-checkpoint-replacement-matrix | `t3` |
| write-sync-rename-unlink-failure-fences-the-lane | `t11` |
| verified-terminal-ack-retirement-and-reader-pins | `t9` |
| recycled-identity-requires-authoritative-receipt-capability | `t9` |
| retry-holes-do-not-authorize-mixed-segment-deletion | `t7` |
| drain-close-startup-failure-preserve-backlog-and-ownership | `t10` |
| macos-apfs-linux-ext4-node22-queue-qualification | `t12` |
| public-service-accepted-status-and-unavailable-semantic-capabilities | `t10` |
| sc3-receipt-verifier-proof-and-causal-order-contract | `t8` |
| privacy-binding-and-scope-status-isolation-before-enqueue | `t6` |
| packed-external-submit-crash-reopen-and-operation | `t14` |
| pure-import-and-no-daemon-or-backend-storage-dependency | `t14` |
| package-suite-root-build-and-current-source-ci-evidence | `t14` |
| queue-resource-and-fsync-cost-measurement | `t13` |

## 3. References

- **[[c1]]** `prior-artifact` `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S002/LLD.md:25`
- **[[c2]]** `prior-artifact` `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S002/LLD.md:132`
- **[[c3]]** `prior-artifact` `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S002/LLD.md:123`
- **[[c4]]** `prior-artifact` `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S002/LLD.md:141`
- **[[c5]]** `prior-artifact` `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S002/LLD.md:165`
- **[[c6]]** `prior-artifact` `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S002/LLD.md:174`
- **[[c7]]** `prior-artifact` `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S002/LLD.md:182`
- **[[c8]]** `prior-artifact` `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S002/LLD.md:205`
- **[[c9]]** `prior-artifact` `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S002/LLD.md:284`
