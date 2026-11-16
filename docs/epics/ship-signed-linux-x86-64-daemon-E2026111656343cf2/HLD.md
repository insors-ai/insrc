<!-- insrc:artifact HLD-56343cf2a9c3b509 -->

# HLD: ship-signed-linux-x86-64-daemon

## Summary

**Tracker:** [insors-ai/insrc#186](https://github.com/insors-ai/insrc/issues/186)

Signed Linux x86-64 releases use target-specific artifacts and a user-scoped installation. An independently authenticated installer verifies the release before changing the active daemon. Normal controls use the selected verified runtime, and a durable recovery record retains the predecessor. Linux ARM continues to use source sync.

## Contents

1. [Problem context](#1-problem-context)
2. [Framework summary](#2-framework-summary)
3. [Architecture shape](#3-architecture-shape)
4. [Diagrams](#4-diagrams)
5. [Shared contracts](#5-shared-contracts)
6. [Story boundaries](#6-story-boundaries)
7. [Non-functional targets](#7-non-functional-targets)
8. [Rollout](#8-rollout)
9. [Alternatives considered](#9-alternatives-considered)
10. [References](#10-references)

## 1. Problem context

> See **DEF-56343cf2a9c3b509** § 1. Problem

## 2. Framework summary

Add a versioned Linux x86-64 bundle and target-specific publication path. Reuse signed manifest verification and safe staging primitives where compatible, and retain distinct development, qualification and production trust. Use a user-scoped Linux lifecycle coordinator with retained process identity and an offline recoverable selector.

## 3. Architecture shape

Release production has three privilege boundaries. The unprivileged build pins source, runtime version and upstream runtime digest, builds Linux ELF binaries and Node native modules on the Ubuntu 24.04 amd64 ABI baseline, and records complete target and provenance. Protected qualification signing independently retrieves the immutable build origin and authenticates the exact archive and manifest without executing candidate code. Local qualification drives the same parser and cutover with isolated trust and state. Final signing verifies a release-owner-approved qualification record from protected control. That record binds independently authenticated test outcomes, host and predecessor profiles, the raw manifest digest and original archive digest before final signing and publication of those unchanged bytes. Development authorization uses configured full refs with per-ref channel identity, and production retains protected release-branch policy. Use explicit target-qualified artifact names and a separate Linux publication coordinate with target-specific asset lookup. Keep existing Darwin tags and artifact schemas intact.

A separately authenticated bootstrap pins the verifier and trust roots and installs a stable per-user controller independent of the candidate's mutable checkout. At first install or legacy migration it resolves the explicit channel, authenticates and bounds the manifest, checks host eligibility, verifies the archive, stages privately with an allowlist, and verifies relocated runtime identity without executing archive code. The host contract identifies architecture, OS/ABI, declared system libraries, pinned bundled Node, and functional pidfd support. Shell and TUI route signed enrollment through the same coordinator for all exposed actions. Signed enrollment is recorded durably before signed activation, independently of the active selector. Before enrollment, the original source commands remain available. After enrollment, an independently persisted mode anchor identifies signed ownership even if a selector, floor or journal is damaged or missing. A missing required record, a conflicting anchor or a partial enrollment blocks source fallback, and the controller reports whether exact retry or explicit repair is needed. ARM source and existing Darwin paths retain their current routing.

For an update, one user-private mutation lock serializes admission, lifecycle operations and recovery. After verifying the staged bytes, the coordinator checks the exact candidate/predecessor compatibility, including source installations. Initial rollout accepts only release pairs whose predecessor can reopen every durable change possible through durable commit, including interrupted startup changes across persistent stores. The candidate cannot accept normal mutable workload before commit. The compatibility rule applies through the final pre-commit write so a crash between readiness and commit can still restore the predecessor. Unproven or incompatible pairs are refused before stopping the incumbent. The controller persists the admission record and accepted replay floor before it marks the transaction prepared or disrupts the incumbent. An interruption before the prepared phase leaves the incumbent intact and recovery completes admission from verified local bytes or reconciles the incomplete admission with the accepted floor before considering a newer release. The journal pins the predecessor, candidate and prior running intent. Use the existing Linux retained-process and pidfd path for stop, confirm predecessor exit, switch the selector atomically, and validate the candidate's process identity, expected revision and live daemon and MCP readiness before commit. An update to a stopped installation can start a validation process on the actual installed state under the same compatibility and identity rules. Confirm it has exited before committing stopped intent. On failure, stop the candidate by verified identity and confirm exit before restoring the pinned offline predecessor. Never leave a failed first installation selected. If no predecessor exists, return to the stopped state under the signed enrollment anchor and retain the floor for retry. On interruption recover by journal phase. When exit, state safety or runtime proof cannot be verified, retain the record and block further launch. Power loss must not author a new channel state, reset an enrolled floor, or activate two daemon instances.

## 4. Diagrams

- [Sequence diagram](docs/epics/ship-signed-linux-x86-64-daemon-E2026111656343cf2/sequence-diagram.html)
- [Component dependencies](docs/epics/ship-signed-linux-x86-64-daemon-E2026111656343cf2/component-dependency.html)

## 5. Shared contracts

### 5.1 sc1: Linux artifact identity and trust

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`

**Purpose:** S1 defines the signed subject and host compatibility envelope used by S2 admission and S3 promotion. One build origin supplies one exact manifest and archive for a target and channel. Qualification, development and production signature grants stay separate and cannot satisfy one another. LinuxReleaseIdentity is the verified envelope. The controller calculates manifestSha256 from the exact manifest bytes and compares it to the protected evidence. The digest is external to the signed manifest payload.

**Interface sketch (type-level):**

```
type ReleaseTarget = 'linux-x64';
type TrustRole = 'qualification' | 'development' | 'production';
interface CandidateOrigin { repository: string; ref: string; commit: string; runId: string; runAttempt: number; artifactId: string; }
interface LinuxReleaseIdentity { target: ReleaseTarget; channel: string; version: string; sequence: number; origin: CandidateOrigin; manifestSha256: string; archiveSha256: string; archiveBytes: number; runtimeFingerprint: string; }
interface LinuxHostContract { distribution: string; abi: string; nodeVersion: string; systemLibraries: readonly string[]; pidfdRequired: boolean; }
```

**Assumptions cited:** [[c1]]

### 5.2 sc2: Admission and recoverable installation

**Owner Story:** `s2`
**Consumed by:** `s3`

**Purpose:** S2 owns the delivery mode, lifecycle dispatch and transaction evidence that S3 qualifies. An enrollment owns one active pin, at most one pending transaction and a floor per enrolled channel and trust domain. A transaction references one candidate pin and at most one predecessor, absent only for first install. The floor is independent of the current selector and survives recovery.

**Interface sketch (type-level):**

```
type PriorIntent = 'running' | 'stopped';
type InstallPhase = 'prepared' | 'incumbent-stopped' | 'candidate-selected' | 'committed' | 'recovery-required';
interface ReleaseFloor { domain: string; channel: string; sequence: number; manifestSha256: string; archiveSha256: string; }
interface RuntimePin { kind: 'source' | 'signed'; releaseId: string; runtimeFingerprint: string; root: string; }
interface LinuxCutover { phase: InstallPhase; candidate: RuntimePin; predecessor?: RuntimePin; priorIntent: PriorIntent; floor: ReleaseFloor; compatibilityEvidenceId?: string; }
```

### 5.3 sc3: Target-bound release qualification

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`

**Purpose:** S1 owns the subject binding used by the qualification signer, installer and publication consumer. Each promotion requires complete evidence for one exact target subject and the applicable compatibility pair. S3 defines the runner, validates and records the local evidence, and authorizes exact-byte promotion. Promotion validates required test IDs and outcomes against independently authenticated release-owner evidence. The artifact build cannot issue this evidence. Each compatibility proof binds exact candidate and predecessor fingerprints plus the covered state contract.

**Interface sketch (type-level):**

```
interface QualificationSubject { target: ReleaseTarget; manifestSha256: string; archiveSha256: string; origin: CandidateOrigin; channel: string; }
interface QualificationEvidenceRef { subject: QualificationSubject; deviceProfileDigest: string; testEvidenceDigests: readonly string[]; predecessorEvidenceId?: string; }
```

## 6. Story boundaries

### 6.1 Story STORY-56343cf2a9c3b509-s1

**Owns:** `sc1`, `sc3`

Linux packaging, versioned metadata and protected signing primitives. Use controlled fixtures for verifier and policy tests so implementing S1 does not require live publication or a completed S2.

### 6.2 Story STORY-56343cf2a9c3b509-s2

**Owns:** `sc2`
**Depends on:** `sc1`, `sc3`

User-scoped bootstrap and stable dispatcher, host admission, immutable local releases, enrollment, locking, durable recovery, state-compatibility checks and daemon readiness. Local fixtures exercise source and signed predecessors.

### 6.3 Story STORY-56343cf2a9c3b509-s3

**Depends on:** `sc1`, `sc2`, `sc3`

Local exact-asset qualification harness and evidence attestation, publication and discovery wiring, cross-target checks, and source-mode ARM regression. S3 consumes S1 signing and S2 lifecycle contracts.

## 7. Non-functional targets

- **Performance:** Stage, verify, and check compatibility while the incumbent runs. Downtime begins only at verified drain and ends at candidate readiness or safe recovery. No release tests run in hosted signing workflows.
- **Security:** A build can never read deployment keys. Signing jobs consume bounded inputs from trusted workflows, never execute candidate files, and bind exact origin and policy. Reject substituted trust roots, unsafe archives, unsupported host or ABI, missing enrolled metadata, replays, and nonmatching process ownership before live mutation. The private state directory and signed installation require no root or system service changes.
- **Observability:** Report platform, target, release identity, selected delivery mode and safe recovery status through existing surfaces. Keep trust secrets and absolute evidence details out of user-facing status. Qualification records actual kernel and user-space architecture, virtualization mode and test evidence digests.
- **Durability:** Select a staged immutable release only after verified admission. Persist the floor and recovery record with file and parent-directory durability and use identity-bound process operations. Retain exact signed inputs, predecessor proof and state-compatibility proof for offline retry and recovery.

## 8. Rollout

**A — Build and sign candidates**

**Stories:** `s1`

Establish signed Linux subject, host metadata and protected signing primitives.

**Backward compat:** Keep Darwin format and origin rules and Linux ARM source flows.

**B — Verify and activate locally**

**Stories:** `s2`

Wire authenticated bootstrapping, controls and recoverable user-scoped cutover before publication.

**Backward compat:** Existing Linux source installs keep their mode until deliberate enrollment. Keep Darwin selection and assets.

**C — Qualify and publish**

**Stories:** `s3`

Run local same-byte qualification, then enable opt-in target-specific discovery and publication.

**Backward compat:** Keep macOS tags and assets and verify ARM shell and TUI source workflows.

**Ordering rationale:** S1 owns signed subject and trust contracts consumed by S2. S3 requires both S1 artifact identity and a complete S2 cutover path before qualifying or publishing live artifacts.

**Risky bits**

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| State survives switching runtimes | The candidate can mutate state before readiness and a predecessor can refuse a newer schema. | Require exact predecessor compatibility evidence before stopping it. Inject failure after durable writes and at cutover boundaries. Recovery alone may restore the pinned predecessor without lowering the floor. |
| Subject identity and trust | Wrong-platform, wrong-ref or replaced artifacts can share display version and origin fields. | Bind immutable run attempt, artifact ID, target, ref, channel and digests at signing, evidence and publish boundaries. Separate protected signatures from isolated qualification. |
| Linux host baseline | Translated user space and the minimum host kernel exercise different native lifecycle behaviors. | Run on a clean Ubuntu 24.04 amd64 profile and record native ABI, actual kernel architecture and Linux shutdown behavior. Complete kernel-sensitive tests on an x86-64 Linux kernel. |

## 9. Alternatives considered

### 9.1 a1: Target-specific bundles with shared trust primitives — **CHOSEN**

Add a Linux bundle contract and lifecycle adapter while preserving Darwin formats and release paths.

Package and qualify Linux artifacts independently. Share bounded manifest verification, safe staging, exact-byte publication principles, and branch-policy semantics with existing release lanes.

Install via a pinned bootstrap and private release store. A Linux lifecycle coordinator selects the signed runtime, uses the current process-identity helpers, and journals cutover and rollback without affecting ARM source selection.

**Pros:**
- Linux and macOS can publish the same version independently while retaining existing asset contracts.
- Supports user-scoped installation and rollback without a system package manager.

**Cons:**
- Linux owns an additional durable lifecycle implementation and compatibility matrix.

**Cost estimate:** L

### 9.2 a2: Native distribution package

Use signed apt repository metadata and Debian packages for Ubuntu.

Publish the packaged daemon through an authenticated apt repository with distro-native version and dependency management.

Add user-scoped lifecycle and compatibility checks around package upgrades and implement production and development policy as separate apt channels.

**Pros:**
- Apt can resolve Ubuntu system dependencies and track installed files.

**Cons:**
- Typical system package operations require administrator privileges and update shared files.
- Per-user daemon state and exact predecessor recovery still require their own transaction around package changes.

**Cost estimate:** L

**Rejected because:** System package lifecycle leaves user-scoped rollback and dispatch integration open.

### 9.3 a3: Common cross-platform bundle and supervisor

Converge both existing macOS lanes and Linux on one new lifecycle and manifest model.

Replace the parallel bundle shapes with one versioned target-aware delivery contract. Move promotion, signature checks and release selection behind a common lifecycle abstraction.

Migrate Darwin prebuilt users to the new format and host adapter while introducing the Linux adapter.

**Pros:**
- One protocol can represent artifact identity and admission across targets.

**Cons:**
- Changing existing macOS enrollment and bundle formats expands scope and adds cutover risk.

**Cost estimate:** L

**Rejected because:** Satisfies lifecycle requirements but increases risk to the existing macOS contract.

## 10. References

- **[[c1]]** `analyze-bundle` `scripts/package-daemon-candidate.mjs`
- **[[c2]]** `analyze-bundle` `scripts/package-daemon-development.mjs`
- **[[c3]]** `analyze-bundle` `scripts/stage-daemon-bundle.mjs`
- **[[c4]]** `analyze-bundle` `scripts/verify-daemon-bundle.mjs`
- **[[c5]]** `analyze-bundle` `scripts/daemon-bundle-metadata.mjs`
- **[[c6]]** `analyze-bundle` `scripts/daemon-development-metadata.mjs`
- **[[c7]]** `analyze-bundle` `src/cli/services/daemon.ts`
- **[[c8]]** `analyze-bundle` `src/cli/services/lifecycle.ts`
- **[[c9]]** `analyze-bundle` `src/shared/daemon-process-client.ts`
- **[[c10]]** `analyze-bundle` `src/shared/daemon-process.ts`
- **[[c11]]** `analyze-bundle` `.github/workflows/daemon-candidate.yml`
- **[[c12]]** `analyze-bundle` `.github/workflows/daemon-qualification-sign.yml`
- **[[c13]]** `analyze-bundle` `.github/workflows/daemon-promotion.yml`
- **[[c14]]** `analyze-bundle` `src/bin/insrc-release-bootstrap.ts`
- **[[c15]]** `analyze-bundle` `src/shared/managed-daemon-installation.ts`

## Citations

- **[[c1]]** `analyze-bundle` `scripts/package-daemon-candidate.mjs`
- **[[c2]]** `analyze-bundle` `scripts/package-daemon-development.mjs`
- **[[c3]]** `analyze-bundle` `scripts/stage-daemon-bundle.mjs`
- **[[c4]]** `analyze-bundle` `scripts/verify-daemon-bundle.mjs`
- **[[c5]]** `analyze-bundle` `scripts/daemon-bundle-metadata.mjs`
- **[[c6]]** `analyze-bundle` `scripts/daemon-development-metadata.mjs`
- **[[c7]]** `analyze-bundle` `src/cli/services/daemon.ts`
- **[[c8]]** `analyze-bundle` `src/cli/services/lifecycle.ts`
- **[[c9]]** `analyze-bundle` `src/shared/daemon-process-client.ts`
- **[[c10]]** `analyze-bundle` `src/shared/daemon-process.ts`
- **[[c11]]** `analyze-bundle` `.github/workflows/daemon-candidate.yml`
- **[[c12]]** `analyze-bundle` `.github/workflows/daemon-qualification-sign.yml`
- **[[c13]]** `analyze-bundle` `.github/workflows/daemon-promotion.yml`
- **[[c14]]** `analyze-bundle` `src/bin/insrc-release-bootstrap.ts`
- **[[c15]]** `analyze-bundle` `src/shared/managed-daemon-installation.ts`
