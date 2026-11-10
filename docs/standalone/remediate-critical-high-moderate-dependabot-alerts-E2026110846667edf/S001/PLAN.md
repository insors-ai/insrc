<!-- insrc:artifact PLAN-46667edffe5cc451-s1 -->

# Plan: STORY-46667edffe5cc451-s1

## Summary

**Epic:** `remediate-critical-high-moderate-dependabot-alerts`
**LLD run:** `wf-1794158892326-31wwbi`
**LLD effective hash:** `7cca28aa1022...`

Apply the approved dependency changes in three ordered batches with targeted verification. Qualify the native daemon and the exact standalone memory tarball on the Node 22 baseline. Run one full sweep after all implementation tasks and record live GitHub reconciliation as a post-deployment check.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Patch daemon transport, parsers, and shared tooling | M | approved r1 | — | unit: MCP structural-schema, YAML merge and CSV reader regression suites; integration: MCP stdio list and call plus HTTP TLS, redirect, abort, WebSocket and Ollama stream checks; smoke: Build and inspect packed backend entry points and resolved packages after unused dependency removal | [[c1]] [[c2]] [[c3]] |
| 2 | **`t2`** Patch SMTP and database driver dependencies | M | draft r2 | `t1` | unit: Overwrite-enabled ZIP outside-sentinel regression for extractAllTo, extractAllToAsync and extractEntryTo; integration: Authenticated SMTP STARTTLS with attachments, authentication failure, required-TLS failure and partial recipient rejection; live: Load saved Cassandra, etcd and MySQL settings through the daemon registry, then connect, read schema and perform a bounded read; integration: Verify saved SQL Server configuration, schema and bounded reads at the Tedious SDK boundary using the fixture | [[c1]] [[c2]] [[c4]] |
| 3 | **`t3`** Patch and qualify daemon native dependency resolution | M | approved r1 | `t2` | smoke: Clean macOS and Linux Node 22.22.1 daemon installs with native dependency version checks; integration: Load local ONNX and run a representative embedding without a cloud dependency | [[c1]] [[c2]] [[c5]] |
| 4 | **`t4`** Build the standalone storage-only memory artifact | M | approved r1 | `t3` | unit: LanceDB staged tarball manifest-diff, integrity and license assertions; integration: Build and pack the release artifact and inspect the default clean consumer dependency graph without host overrides | [[c1]] [[c2]] [[c5]] [[c6]] |
| 5 | **`t5`** Qualify packed consumers and store compatibility | M | approved r1 | `t4` | integration: Run packed project-memory API and native binding smoke on macOS and Linux Node 22.22.1; integration: Open populated pre-upgrade fixture and verify records, vectors, queue and receipts, then rehearse the approved restore in scratch | [[c1]] [[c5]] [[c6]] |
| 6 | **`t6`** Run the full sweep and record release verification | M | approved r1 | `t5` | smoke: Verify root build, completed full sweep evidence and baseline failure deferral to GitHub #143; unit: Recompute all captured in-scope root ranges and byte-check the four archived lockfiles; smoke: Record tracker reconciliation commands and pending state until GitHub rescans the default branch | [[c1]] [[c2]] [[c7]] |

### 1.1 TASK-46667edffe5cc451-s1-t1 — Patch daemon transport, parsers, and shared tooling

Select an isolated build baseline and verify its dependency inputs against the reviewed snapshot. Apply batch 1 direct and parent-scoped dependency updates to the root manifest and lockfile. Remove PDF.js and csv-parse after the caller and packed entry-point checks.

**Acceptance checks:**
- Verify the selected baseline with no unrelated edits and identify any dependency drift before applying reviewed changes.
- Confirm every batch 1 dependency path falls outside affected ranges, including MCP SDK to Express to proxy-addr 2.0.8. Review overrides and lock churn.
- Verify MCP stdio, HTTP/TLS and WebSockets, Ollama streaming, YAML, and the saved DuckDB CSV path. Confirm removed packages are absent.

### 1.2 TASK-46667edffe5cc451-s1-t2 — Patch SMTP and database driver dependencies

Apply batch 2 Nodemailer, Cassandra and ZIP, MySQL, etcd and gRPC, and SQL Server Azure Identity changes. Preserve saved configuration loading and driver contracts.

**Acceptance checks:**
- Confirm every batch 2 resolved dependency is outside the mapped affected ranges.
- Verify authenticated STARTTLS, recipient handling and attachments. Run live saved-configuration connection, schema and bounded-read checks for Cassandra, etcd and MySQL. Verify SQL Server saved configuration, schema and bounded reads at the Tedious SDK boundary with the existing fixture. Record live SQL Server qualification as deferred at the user's direction, outside this build gate.
- Prove the overwrite-enabled destination symlink fixture detects baseline behavior and passes on the selected adm-zip release for synchronous, asynchronous and single-entry extraction.

### 1.3 TASK-46667edffe5cc451-s1-t3 — Patch and qualify daemon native dependency resolution

Apply batch 3 daemon Sharp and ONNX tar constraints. Qualify clean macOS and Linux installations with Node 22.22.1 and exercise local ONNX startup and embedding.

**Acceptance checks:**
- Confirm every root Sharp and tar instance is outside mapped affected ranges.
- Verify real macOS and Linux clean installation, native loading and local embedding on Node 22.22.1. Capture platform, binary versions and outputs.

### 1.4 TASK-46667edffe5cc451-s1-t4 — Build the standalone storage-only memory artifact

Implement shared staging for the normal @insrc/project-memory tarball. Verify upstream LanceDB 0.40.0 integrity, narrow only the optional provider entries, retain licenses and native binding versions, and have packed consumer tests use this same artifact.

**Acceptance checks:**
- Verify the staged SDK's upstream SHA-512, unchanged code and types, retained license and notices, and removal of only the approved optional provider entries.
- Check actual tarball contents and a clean default consumer graph. The SDK is bundled, native bindings resolve from their pinned optional packages, and staging files, affected embedding paths and host overrides are absent.

### 1.5 TASK-46667edffe5cc451-s1-t5 — Qualify packed consumers and store compatibility

Run the exact tarball from t4 on macOS and Linux under Node 22.22.1. Extend independent qualification to exercise a populated store from the preceding release and verify the approved backup restoration procedure.

**Acceptance checks:**
- Capture actual native loading and package export smoke evidence for both platforms, with ordinary npm optional dependency behavior.
- Verify records, vectors, pending queue and completed receipts from the preceding release in the upgraded package. Restore a verified consistent backup into scratch and open it with the previous artifact.

### 1.6 TASK-46667edffe5cc451-s1-t6 — Run the full sweep and record release verification

Once all implementation tasks pass targeted checks, perform the combined build and single full sweep. Reconcile all in-scope root ranges, archived evidence and live-service coverage. Define the authenticated GitHub reconciliation procedure for after the default-branch scan. Record the failed sweep and reconcile its signatures against the unchanged baseline. The user deferred reproduced baseline failures to GitHub #143.

**Acceptance checks:**
- Verify the root build passed and record the single completed full sweep after targeted task validation, with exact commands, revision, exit status and pass, failure, cancellation and skip counts. Preserve the failed result. Identify baseline-reproduced failures tracked in GitHub #143 and show that story-specific failures are corrected with passing targeted validation.
- Check every captured in-scope root alert against every matching resolved dependency instance and preserve all four archived lockfiles byte-for-byte.
- Keep eight low alerts outside the gate. Keep live alert reconciliation explicitly pending until a fresh authenticated default-branch scan check can verify each scoped alert.
- Record each evidence-only alert and any ZIP advisory metadata discrepancy separately. Do not dismiss tracker alerts as a build side effect.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| Daemon dependency closure | `t1`, `t2`, `t3`, `t6` |
| Standalone memory consumer package graph | `t4`, `t5` |
| Recorded historical alerts | `t6` |
| MCP tool schema conversion | `t1` |
| YAML merges and multi-document parsing | `t1` |
| DuckDB CSV input | `t1` |
| SMTP envelope and attachments | `t2` |
| ZIP destination symlink rejection | `t2` |
| CSV registration, preview and query via the existing DuckDB path after manifest removal | `t1` |
| Static and dynamic dependency caller inventory and packaged entry-point check for PDF.js and csv-parse | `t1` |
| MCP stdio list and call | `t1` |
| HTTP redirects and aborts, WebSocket handshake, Ollama streaming | `t1` |
| SMTP STARTTLS delivery | `t2` |
| Cassandra, etcd, MySQL, and SQL Server connection and read paths | `t2` |
| Load pre-upgrade saved configurations for Cassandra, etcd, MySQL and SQL Server through the daemon registry, then connect, read schema and execute an authorized read query | `t2` |
| macOS and Linux Node 22.22.1 native install | `t3`, `t5` |
| ONNX embedding initialization | `t3` |
| Clean packed consumer memory create and reopen of pre-upgrade store | `t5` |

## 3. References

- **[[c1]]** `prior-artifact` `docs/standalone/remediate-critical-high-moderate-dependabot-alerts-E2026110846667edf/S001/LLD.md#4-test-strategy`
- **[[c2]]** `doc` `docs/standalone/remediate-critical-high-moderate-dependabot-alerts-E2026110846667edf/S001/DEPENDENCY-BASELINE.md#root-dependency-selections`
- **[[c3]]** `prior-artifact` `docs/standalone/remediate-critical-high-moderate-dependabot-alerts-E2026110846667edf/S001/LLD.md#61-a1-scoped-updates-with-a-verified-standalone-package--chosen`
- **[[c4]]** `doc` `docs/standalone/remediate-critical-high-moderate-dependabot-alerts-E2026110846667edf/S001/DEPENDENCY-BASELINE.md#zip-symlink-regression-probe`
- **[[c5]]** `doc` `docs/standalone/remediate-critical-high-moderate-dependabot-alerts-E2026110846667edf/S001/DEPENDENCY-BASELINE.md#standalone-package-delivery`
- **[[c6]]** `prior-artifact` `docs/standalone/remediate-critical-high-moderate-dependabot-alerts-E2026110846667edf/S001/LLD.md#5-migration`
- **[[c7]]** `doc` `docs/standalone/remediate-critical-high-moderate-dependabot-alerts-E2026110846667edf/S001/DEPENDABOT-SNAPSHOT.json`
