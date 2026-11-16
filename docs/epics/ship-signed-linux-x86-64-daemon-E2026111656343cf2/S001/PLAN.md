<!-- insrc:artifact PLAN-56343cf2a9c3b509-s1 -->

# Plan: STORY-56343cf2a9c3b509-s1

## Summary

**Epic:** `ship-signed-linux-x86-64-daemon`
**LLD run:** `wf-1794821285058-zmmrtl`
**LLD effective hash:** `0bb14a0963d8...`

Build and verify a signed Linux x86-64 daemon candidate from an exact source revision. Keep build credentials separate from signing, and require independent qualification evidence before final signing. Run task-specific tests locally as each task lands, then run the story sweep.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Define and verify Linux release metadata | M | — | — | unit: Linux manifest schema and digest boundaries; unit: Role-separated Ed25519 grants and configured channel scope | [[c1]] [[c2]] |
| 2 | **`t2`** Package the Ubuntu amd64 runtime | M | — | `t1` | unit: Linux staging inventory, path safety and ELF dependency fixture checks; smoke: Local Ubuntu 24.04 amd64 package, relocate, verify fingerprint, load native modules and exercise required entry points | [[c1]] [[c3]] [[c4]] |
| 3 | **`t3`** Add the isolated Linux candidate workflow | S | — | `t2` | integration: Linux workflow shape, credential isolation, exact revision and configured ref tests | [[c3]] [[c5]] |
| 4 | **`t4`** Verify protected candidate origin and archive retrieval | M | — | `t1`, `t3` | integration: GitHub origin and validated download fixtures for Linux, Darwin, rerun, substituted origin, duplicate ZIP members and digest tampering | [[c1]] [[c5]] [[c6]] |
| 5 | **`t5`** Issue qualification grants and verify detached evidence | M | — | `t1`, `t4` | integration: Fixture qualification grant and signed local evidence for exact artifact, host, required tests and predecessor | [[c2]] [[c7]] |
| 6 | **`t6`** Guard final channel signing and sequence allocation | M | — | `t4`, `t5` | integration: Independent-writer sequence race, scoped ledger, stale and corrupt ledger, and interrupted exact retry; integration: Final signing role, evidence and origin checks across all Linux stages using fixtures | [[c2]] [[c7]] [[c8]] |

### 1.1 TASK-56343cf2a9c3b509-s1-t1 — Define and verify Linux release metadata

Add a Linux-only strict v1 manifest, normalized candidate identity, host requirements, canonical repo/ref channel scope, and detached Ed25519 role grants. Expose the verified subject with the digest of exact original bytes. Keep Darwin callers on their current formats.

**Acceptance checks:**
- Reject malformed UTF-8, duplicate or unknown fields, unsafe sequence/IDs, wrong target/scope/role/key, and mismatched final lane.
- Verify qualification and final grants over identical raw bytes with independent role keys.

### 1.2 TASK-56343cf2a9c3b509-s1-t2 — Package the Ubuntu amd64 runtime

Package the approved Node version verified against pinned upstream bytes, daemon/CLI/MCP entrypoints, Linux process broker, watchdog, dependencies and workspace runtime assets. Use safe shared staging, canonical USTAR-compatible archive output and target-specific inventory.

**Acceptance checks:**
- Verify source commit and build host; reject missing inputs, unsafe links, unsupported ELF or ABI, and unlisted dependencies.
- Relocate the archive with the shared verifier and load required native modules using the bundled Node on the documented baseline.

### 1.3 TASK-56343cf2a9c3b509-s1-t3 — Add the isolated Linux candidate workflow

Add a dispatchable Ubuntu 24.04 amd64 candidate workflow with read-only permissions, pinned actions, exact requested full SHA, pinned runtime and target-qualified output coordinates. Record exact run/attempt/artifact identity.

**Acceptance checks:**
- Allow a configured full development ref without a branch-name code change. Keep production on the protected configured release ref.
- Build and upload exact outputs. The job has no signing credentials, write token, or hosted test step.

### 1.4 TASK-56343cf2a9c3b509-s1-t4 — Verify protected candidate origin and archive retrieval

Implement protected fetch validation against trusted repository IDs, workflow, event, run/attempt, ref, SHA, target, artifact and expiry before reading only bounded allowed output entries. Reject duplicate and foreign assets.

**Acceptance checks:**
- Same-version Darwin and Linux outputs remain independently addressable. Rerun, workflow, fork, ID, target and transport/inner digest mismatches fail closed.
- Validate inputs and extract only named bounded members, with directory and archive safety retained.
- Verify authenticated artifact transport SHA-256 or an independently recorded protected expected inner SHA-256. Candidate metadata never supplies its own trust anchor.

### 1.5 TASK-56343cf2a9c3b509-s1-t5 — Issue qualification grants and verify detached evidence

Add issuer-side qualification manifest preparation and validation of independently signed local evidence against trusted required test IDs, target, ABI, exact archive origin and applicable predecessor fingerprints. Keep qualification side effects isolated.

**Acceptance checks:**
- Verify receipt and qualification grant using independent pinned trust. Reject missing, duplicate, failed or foreign-case evidence.
- Bind predecessor evidence outside the manifest to avoid a digest cycle. Fixture keys cover qualification and absence of production privileges.

### 1.6 TASK-56343cf2a9c3b509-s1-t6 — Guard final channel signing and sequence allocation

Build protected final signer orchestration from exact-candidate verification and evidence checks. Serialize durable sequence allocation per repository, target, final lane and channel before releasing the detached final signature. S3 consumes this signer contract to publish. Use a protected shared sequence authority with atomic compare-and-set for independent jobs and processes.

**Acceptance checks:**
- Recheck authenticated qualification grant, evidence, exact bytes and ref policy. No signing job executes candidate code.
- Competing manifests claiming one sequence cannot both be signed. Include exact retry across interruption, scope independence, and stale/corrupt ledger refusal.
- Interrupt after durable binding and before delivery and retry the exact manifest. Race independent writers and verify at most one distinct digest obtains a binding.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| Strict manifest fields and branch/channel derivation | `t1` |
| Detached grant namespaces | `t1`, `t5`, `t6` |
| Unknown, duplicate and malformed inputs | `t1`, `t4`, `t5` |
| Exact GitHub origin response fixtures | `t3`, `t4` |
| Wrong run attempt or asset target | `t4` |
| Required evidence, role separation and separate Darwin coordinates | `t1`, `t4`, `t5`, `t6` |
| Relocated native binary and addon loading | `t2` |
| Signed manifest and verified staged fingerprint | `t1`, `t2`, `t5`, `t6` |
| Required daemon, CLI and MCP entrypoints | `t2` |

## 3. References

- **[[c1]]** `prior-artifact` `docs/epics/ship-signed-linux-x86-64-daemon-E2026111656343cf2/S001/LLD.md#23-qualificationevidenceref`
- **[[c2]]** `prior-artifact` `docs/epics/ship-signed-linux-x86-64-daemon-E2026111656343cf2/S001/LLD.md#32-linux-manifest-v1-and-detached-roles--new`
- **[[c3]]** `prior-artifact` `docs/epics/ship-signed-linux-x86-64-daemon-E2026111656343cf2/S001/LLD.md#21-stageruntime`
- **[[c4]]** `analyze-bundle` `scripts/stage-daemon-bundle.mjs`
- **[[c5]]** `prior-artifact` `docs/epics/ship-signed-linux-x86-64-daemon-E2026111656343cf2/S001/LLD.md#31-linux-candidate-build--new`
- **[[c6]]** `code` `scripts/daemon-release-artifact.sh`
- **[[c7]]** `prior-artifact` `docs/epics/ship-signed-linux-x86-64-daemon-E2026111656343cf2/S001/LLD.md#33-target-bound-qualification-proof--new`
- **[[c8]]** `prior-artifact` `docs/epics/ship-signed-linux-x86-64-daemon-E2026111656343cf2/S001/LLD.md#6-error-paths`
