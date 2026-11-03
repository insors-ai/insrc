<!-- insrc:artifact PLAN-17123b6d304af2a2-s3 -->

# Plan: E2026110317123b6d:S003

## Summary

**Epic:** `share-project-memory-across-agents-applications`
**LLD run:** `wf-1793701629778-6xhp87`
**LLD effective hash:** `18ac1fc6f9d6...`

Build the independent authoritative memory store behind the existing durable queue, with atomic effects/receipts, scoped revision and deletion guards, and coherent bounded reads. Native APFS/ext4 crash qualification gates production host wiring; the plan also preserves source trust, error codes, embedding compatibility and verified shutdown. Run focused tests per task, then the complete sweep after all implementation work, while keeping later-story maintenance and integration coverage explicitly pending.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Pin standalone native dependencies and preserve package boundaries | S | — | smoke: store-runtime-package-qualification; smoke: store-existing-packed-allowlists-and-native-absence | [[c1]] [[c2]] |
| 2 | **`t2`** Implement strict persisted codecs and embedding profile | M | `t1` | unit: store-row-codec-and-effect-reservations; unit: store-persisted-payload-v1-required-fields; unit: store-embedding-normalization-profile-v1 | [[c1]] [[c2]] |
| 3 | **`t3`** Qualify native single-table primitives under crashes | M | `t1`, `t2` | integration: store-runtime-package-qualification; integration: store-one-mutation-effects-receipt-generation; integration: store-null-vectors-version-pinned-reads; integration: store-macos-apfs-linux-ext4-qualification | [[c1]] [[c2]] |
| 4 | **`t4`** Implement owned store initialization and safe reopen | M | `t2`, `t3` | integration: store-directory-separation-and-no-empty-replacement; integration: store-startup-rollback-every-open-boundary; integration: store-embedding-profile-reopen-plan-query-compatibility | [[c1]] [[c2]] |
| 5 | **`t5`** Implement plan, reference and lifecycle guards | M | `t2`, `t4` | unit: store-row-codec-and-effect-reservations; unit: store-scope-epoch-predicate-escaping; unit: store-revision-tombstone-reference-guards; unit: store-persisted-payload-v1-required-fields; unit: store-lifecycle-transition-matrix; unit: store-embedding-profile-reopen-plan-query-compatibility | [[c1]] [[c2]] |
| 6 | **`t6`** Implement the sole atomic writer and uncertain-write fence | M | `t3`, `t4`, `t5` | integration: store-one-mutation-effects-receipt-generation; integration: store-generation-revision-conflicts-and-exact-retry; integration: store-native-uncertain-writes-fence | [[c1]] [[c2]] |
| 7 | **`t7`** Implement authoritative queue receipt and retirement proofs | M | `t6` | integration: store-proof-port-retained-and-recycled | [[c1]] [[c2]] |
| 8 | **`t8`** Implement broad forget barriers and frame eligibility guard | M | `t5`, `t6`, `t7` | integration: store-revision-tombstone-reference-guards; integration: store-broad-forget-selector-and-closed-lifecycle; integration: store-replay-forget-no-resurrection-scoped; integration: store-broad-forget-unseen-pending-event; integration: store-forget-after-plan-before-commit; integration: store-closed-lifecycle-explicit-new-activity | [[c1]] [[c2]] |
| 9 | **`t9`** Implement bounded coherent read snapshots | M | `t4`, `t6`, `t8` | integration: store-scope-epoch-predicate-escaping; integration: store-null-vectors-version-pinned-reads; integration: store-reader-expiry-delete-race; integration: store-embedding-profile-reopen-plan-query-compatibility | [[c1]] [[c2]] |
| 10 | **`t10`** Prove real queue/store crash and replay integration | M | `t7`, `t8`, `t9` | integration: store-proof-port-retained-and-recycled; integration: store-one-mutation-effects-receipt-generation; integration: store-generation-revision-conflicts-and-exact-retry; integration: store-replay-forget-no-resurrection-scoped; integration: store-reader-expiry-delete-race; integration: store-native-uncertain-writes-fence; integration: store-commit-kill-before-after-receipt-ack; integration: store-broad-forget-unseen-pending-event; integration: store-forget-after-plan-before-commit; integration: store-macos-apfs-linux-ext4-qualification | [[c1]] [[c2]] |
| 11 | **`t11`** Implement trusted admission transforms and public error boundaries | M | `t2`, `t7` | integration: store-admitted-provenance-v1-derivation; integration: store-closed-lifecycle-explicit-new-activity; integration: store-admission-policy-wrapper-through-real-queue; integration: store-public-submit-module-errors-outside-policy-catch | [[c1]] [[c2]] |
| 12 | **`t12`** Implement store OwnedWork and rollback lifecycle | M | `t6`, `t7`, `t9` | integration: store-no-lane-inversion-drain-ownership; integration: store-native-uncertain-writes-fence; integration: store-owned-work-two-participant-shutdown; integration: store-startup-rollback-every-open-boundary | [[c1]] [[c2]] |
| 13 | **`t13`** Wire qualified store into the Node service host | M | `t10`, `t11`, `t12` | integration: store-no-lane-inversion-drain-ownership; integration: store-owned-work-two-participant-shutdown; integration: store-startup-rollback-every-open-boundary; integration: store-admission-policy-wrapper-through-real-queue; integration: store-public-submit-module-errors-outside-policy-catch; smoke: store-host-readiness-status-and-not-ready-public-reads | [[c1]] [[c2]] |
| 14 | **`t14`** Complete isolated tarball and native-absence verification | M | `t13` | smoke: store-runtime-package-qualification; smoke: store-standalone-packed-node22-consumer; smoke: store-existing-packed-allowlists-and-native-absence | [[c1]] [[c2]] |
| 15 | **`t15`** Verify memory/index/queue isolation and record supporting-story gates | M | `t10`, `t13` | integration: store-directory-separation-and-no-empty-replacement; integration: store-index-reset-rebuild-preserves-memory; integration: store-cleanup-target-overlap-refusal; integration: store-memory-cleanup-preserves-index-and-queue | [[c1]] [[c2]] |
| 16 | **`t16`** Measure bounded store resources and latency | M | `t9`, `t10`, `t13` | smoke: store-resource-and-latency-study | [[c1]] [[c2]] |
| 17 | **`t17`** Run final sweep and assemble code-review handoff | M | `t14`, `t15`, `t16` | smoke: store-macos-apfs-linux-ext4-qualification; smoke: final-source-package-and-backend-full-sweep-and-evidence-handoff | [[c1]] [[c2]] |

### 1.1 E2026110317123b6d:S003:T001 — Pin standalone native dependencies and preserve package boundaries

Declare exact Lance0.40.0/Arrow18.1.0 dependencies in packages/project-memory/package.json and regenerate workspace package-lock.json; preserve fs-ext, public exports and lazy import behavior. Inventory packaged outputs without introducing backend imports. Update packed.test.ts's existing exact dependency assertion in this task; output requirements for not-yet-built modules remain t14.

**Acceptance checks:**
- Package build succeeds with unchanged public exports and Node22 engine contract.
- Pinned dependencies resolve in an isolated consumer; importing package does not load native SDK or touch disk.
- Existing exact packed dependency check is updated with the manifest, not deferred across unrelated tasks.

### 1.2 E2026110317123b6d:S003:T002 — Implement strict persisted codecs and embedding profile

Add approved private store types/codecs and embedding-profile constant; validate discriminated rows, canonical identities, nullable vectors, full lineage/outcomes and explicit model/dimension/normalizationVersion metadata.

**Acceptance checks:**
- Reject missing/extra/invalid fields and envelope/payload disagreements before mutation.
- Golden text/Float32 profile tests distinguish semantic normalizer from embedding preprocessing and reject incompatible plan metadata.

### 1.3 E2026110317123b6d:S003:T003 — Qualify native single-table primitives under crashes

Build an isolated native qualification harness using real pinned Lance/Arrow, one records table and parent-observed process barriers. Exercise mixed nullable vectors, one-version publication, pinned readers, close/reopen and SIGKILL around commit on APFS/ext4; no production host wiring. Extend .github/workflows/project-memory.yml with narrowly selected SDK/store qualification scopes where required, preserving full/queue modes and separate macOS local execution.

**Acceptance checks:**
- Record exact Node/platform/filesystem/SDK/source fingerprints and observed process-kill outcomes; skipped platforms do not qualify.
- Mixed effects/receipt/control must be old or complete at each boundary; any atomicity or profile incompatibility stops for HLD amendment.
- Focused Linux qualification records the installed dependency graph and platform proof without automatically running full package/backend suites during task iteration.

### 1.4 E2026110317123b6d:S003:T004 — Implement owned store initialization and safe reopen

Add lazy native connection/table management under DirectoryOwnership, durable format intent/ready metadata, root control and profile/UUID validation; preserve recognized interrupted init and reject non-pristine missing/corrupt stores.

**Acceptance checks:**
- Only pristine roots initialize; existing S2 queue-only roots retain every byte and return explicit unavailable status.
- Missing/mismatched marker/root/runtime profile refuses before queue recovery; partial native handles close or owner remains held.

### 1.5 E2026110317123b6d:S003:T005 — Implement plan, reference and lifecycle guards

Validate bounded immutable CommitPlan provenance, generation/per-target revisions, scope authority, IDs, immutable history, acyclic supersession and full evidence/source relationships.

**Acceptance checks:**
- Allowed/forbidden lifecycle matrix and stale revision tests enforce exact predecessor/current-pointer rules.
- Duplicate keys, dangling/cross-scope references, oversized rows and reserved generated kinds fail before native mutation.

### 1.6 E2026110317123b6d:S003:T006 — Implement the sole atomic writer and uncertain-write fence

Serialize commits, reconcile exact existing receipts before stale-generation checks, bind queueId on first event, generate receipt/control and publish one standard merge; fence unknown native outcomes until settlement/reconciliation.

**Acceptance checks:**
- One event publishes effects+receipt+generation in one version; exact retry adds no version/effects.
- No-effect failed/quarantined/cleanup-pending outcomes have validated semantics; native rejection/timeouts never authorize blind retry or owner release.

### 1.7 E2026110317123b6d:S003:T007 — Implement authoritative queue receipt and retirement proofs

Implement unchanged ReceiptVerifier facade and minimal public receipt projection over immutable stored outcomes, with strict retained-frame matching and proof verification after queue recycling.

**Acceptance checks:**
- Retained conflicting retry regression remains enforced for pending/terminal states.
- Unavailable/duplicate/malformed authority is never absent; retirement confirms exact retained digests without content leakage or store-to-queue callback.

### 1.8 E2026110317123b6d:S003:T008 — Implement broad forget barriers and frame eligibility guard

Add qualified memory/source/subject/session/conversation/project tombstones, queue cutoff/closed-lifecycle guards, bounded source-dependency invalidation and private read-only pre-inference eligibility; commit always rechecks protection.

**Acceptance checks:**
- Unseen IDs from an older pending event cannot reactivate after broad forget; blocked work gets only a no-effect failed proof.
- Higher sequence alone cannot resume an old lifecycle; explicit host-authorized new identities are distinct, and old proofs/tombstones remain effective.

### 1.9 E2026110317123b6d:S003:T009 — Implement bounded coherent read snapshots

Create distinct pinned reader leases and current/receipt projections with exact scope/epoch/profile/source/tombstone/validity predicates, final freshness validation and bounded work/results; leave ranking/packing/public semantic reads to S5.

**Acceptance checks:**
- A concurrent forget, binding change, generation change or expiry prevents stale content from returning.
- Lease/dependency/result limits fail explicitly without truncation, and no native handles escape the private facade.

### 1.10 E2026110317123b6d:S003:T010 — Prove real queue/store crash and replay integration

Compose owner, real S2 queue and private store directly in a test harness. Qualify receipt-before-ACK recovery, broad-forget unknown-ID races, exact retries, recycling and uncertain settlement on macOS/APFS and Linux/ext4 before production service wiring.

**Acceptance checks:**
- Require actual SIGKILL and parent-observed acceptance/commit barriers; assert old-or-complete effects and proof/control coherence after recovery.
- Both platforms produce passing fingerprinted evidence for all required boundaries; fake proofs and the earlier clean-exit probe do not close this gate.

### 1.11 E2026110317123b6d:S003:T011 — Implement trusted admission transforms and public error boundaries

Add pure source/provenance input/output transforms and optional package-private QueueAdmission constructor seam. Execute module hooks and persist outside original HostPolicy catch; preserve unchanged host sanitization, S2 formats and no-hook behavior.

**Acceptance checks:**
- Public-submit integration returns INVALID_REQUEST for protected raw fields and REVISION_CONFLICT for changed retained/terminal identity, with queue bytes unchanged.
- Host-thrown same-named errors remain sanitized; source hash/span/time and deterministic retry/attestation tests pass without model calls.

### 1.12 E2026110317123b6d:S003:T012 — Implement store OwnedWork and rollback lifecycle

Add the private store lifecycle adapter with admission stop, pending accounting, native/read drain and idempotent close; exercise queue-before-store resource release and every partially opened startup handle.

**Acceptance checks:**
- Queue proof lookups stay available through queue drain/close; two-participant tests prove no lane inversion or false pending zero.
- Timeout/cancellation/failed close never releases ownership before native settlement, and startup rollback attempts all allocated resources.

### 1.13 E2026110317123b6d:S003:T013 — Wire qualified store into the Node service host

Update host-node composition to owner -> qualified store -> queue with proof facade -> recovery -> service, supply admission transforms and [queue,storeOwnedWork]; update deterministic attesting host fixtures and unsupported capability behavior.

**Acceptance checks:**
- Production composition is enabled only after native/platform gate evidence passes; unsupported hosts/profiles fail explicitly.
- Submit remains durable accepted, status reconciles receipts and public context/search/inspect remain NOT_READY until S5; host ports remain usable after close.

### 1.14 E2026110317123b6d:S003:T014 — Complete isolated tarball and native-absence verification

Update strict packed.test.ts dependency/output assertions, require intended private modules and test real external Node22 consumers, pure imports, missing fs-ext/Lance bindings, crash/reopen and lifecycle with no backend sources or new public exports.

**Acceptance checks:**
- All existing packed subjects pass with narrow dist/store allowlist and exact dependencies.
- Isolated install/consumer uses only packaged resources, exits naturally without leaked handles, and verifies native-open failures preserve ownership safety.

### 1.15 E2026110317123b6d:S003:T015 — Verify memory/index/queue isolation and record supporting-story gates

Test real isolated backend index rebuild/reset against committed memory and pending queue events; implement only S3 internal non-destructive cleanup target preflight and overlap/alias/identity refusal. Record S7 host overlap and S9 real cleanup completion scenarios as pending support gates.

**Acceptance checks:**
- Actual index rebuild preserves logical memory/protection/proofs and exact pending event bytes/status; a sentinel alone is insufficient.
- Unsafe internal paths fail before destructive action; no S3 reset API, S7 registry implementation or S9 purge/migration is introduced or falsely marked complete.

### 1.16 E2026110317123b6d:S003:T016 — Measure bounded store resources and latency

Add reproducible native/JS resource and latency study with approved corpus/safety boundaries, history/tombstones, batches, leases and overflow cases; record dependency footprint and exact hardware/source/profile metadata.

**Acceptance checks:**
- Report p50/p95 open/commit/current, disk/receipt/control bytes, heap and native RSS; validate bounds without changing semantics or silently truncating.
- Measurements disclose fixture limits, do not claim production SLO or power-loss proof, and any needed bound/design change is explicit.

### 1.17 E2026110317123b6d:S003:T017 — Run final sweep and assemble code-review handoff

After all implementation tasks, run root/package builds, complete package regression and full backend sweep on stable source, archive APFS/ext4 proof/resource/packaging/isolation evidence and map all S3 criteria before independent story code review.

**Acceptance checks:**
- During prior tasks run only relevant tests; now run full sweep once after all tasks, repeating only for changed/failing scope.
- Build/coverage/evidence distinguish native platform qualifications and S7/S9-dependent AC29 gates; no fabricated S2 formal completion, full-AC29 pass, review or approval.
- Archive final-source APFS/ext4 complete package/crash qualification alongside source/LLD/profile/dependency fingerprints; earlier t3/t10 snapshots alone cannot count as final evidence.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| store-row-codec-and-effect-reservations | `t2`, `t5` |
| store-scope-epoch-predicate-escaping | `t5`, `t9` |
| store-revision-tombstone-reference-guards | `t5`, `t8` |
| store-persisted-payload-v1-required-fields | `t2`, `t5` |
| store-lifecycle-transition-matrix | `t5` |
| store-admitted-provenance-v1-derivation | `t11` |
| store-broad-forget-selector-and-closed-lifecycle | `t8` |
| store-embedding-normalization-profile-v1 | `t2` |
| store-runtime-package-qualification | `t1`, `t3`, `t14` |
| store-proof-port-retained-and-recycled | `t7`, `t10` |
| store-one-mutation-effects-receipt-generation | `t3`, `t6`, `t10` |
| store-null-vectors-version-pinned-reads | `t3`, `t9` |
| store-generation-revision-conflicts-and-exact-retry | `t6`, `t10` |
| store-replay-forget-no-resurrection-scoped | `t8`, `t10` |
| store-reader-expiry-delete-race | `t9`, `t10` |
| store-directory-separation-and-no-empty-replacement | `t4`, `t15` |
| store-no-lane-inversion-drain-ownership | `t12`, `t13` |
| store-native-uncertain-writes-fence | `t6`, `t10`, `t12` |
| store-commit-kill-before-after-receipt-ack | `t10` |
| store-owned-work-two-participant-shutdown | `t12`, `t13` |
| store-startup-rollback-every-open-boundary | `t4`, `t12`, `t13` |
| store-index-reset-rebuild-preserves-memory | `t15` |
| store-cleanup-target-overlap-refusal | `t15` |
| store-broad-forget-unseen-pending-event | `t8`, `t10` |
| store-forget-after-plan-before-commit | `t8`, `t10` |
| store-closed-lifecycle-explicit-new-activity | `t8`, `t11` |
| store-admission-policy-wrapper-through-real-queue | `t11`, `t13` |
| store-public-submit-module-errors-outside-policy-catch | `t11`, `t13` |
| store-embedding-profile-reopen-plan-query-compatibility | `t4`, `t5`, `t9` |
| store-standalone-packed-node22-consumer | `t14` |
| store-macos-apfs-linux-ext4-qualification | `t3`, `t10`, `t17` |
| store-resource-and-latency-study | `t16` |
| store-existing-packed-allowlists-and-native-absence | `t1`, `t14` |
| store-memory-cleanup-preserves-index-and-queue | `t15` |

## 3. References

- **[[c1]]** `prior-artifact` `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/LLD.md`
- **[[c2]]** `prior-artifact` `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/HLD.md`
