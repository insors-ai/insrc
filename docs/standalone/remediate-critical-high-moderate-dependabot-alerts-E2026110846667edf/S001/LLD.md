<!-- insrc:artifact LLD-46667edffe5cc451-s1 -->

# LLD: STORY-46667edffe5cc451-s1 — Remediate critical, high, and moderate Dependabot alerts

## Summary

**Epic:** `remediate-critical-high-moderate-dependabot-alerts`
**HLD base run:** `wf-1794158892326-31wwbi`
**HLD effective hash:** `7cca28aa1022...`

Patch the daemon and standalone project-memory dependency graphs. The daemon owns its local embedding runtime, while standalone memory uses LanceDB for storage with caller-supplied embeddings. Preserve current protocols and stored data, and verify the packed package from a clean consumer before release. The approved ISSUE sets the historical scope, and its captured alert records support offline design verification. Live GitHub closure is checked after the default branch is rescanned.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Error paths](#3-error-paths)
4. [Test strategy](#4-test-strategy)
5. [Migration](#5-migration)
6. [Alternatives considered](#6-alternatives-considered)
7. [References](#7-references)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

## 3. Error paths

**Error cases**

- **A root or packed consumer still resolves an affected dependency copy** (recoverable)
  - Detection: Enumerate every resolved copy and compare against the approved historical scope in docs/standalone/remediate-critical-high-moderate-dependabot-alerts-E2026110846667edf/S001/DEPENDABOT-SNAPSHOT.json. Independently recompute the manifest and severity counts from the captured records. Install the produced tarball in a clean consumer with default optional dependencies and no host overrides.
  - Response: Fail the applicable release gate and correct resolution. If the published upstream graph cannot be secured, qualify a narrowly scoped package change separately before releasing standalone memory.
  - User impact: The affected release stays pending while independently validated daemon batches can be assessed.
- **Native dependency fails to load or an existing memory store fails to reopen** (recoverable)
  - Detection: Run real binding, embedding, and store reopen checks in clean Node 22.22.1 macOS and Linux installs.
  - Response: Block release for the affected package and retain the existing store data. Diagnose ABI, package selection, or API mismatch before rerunning.
  - User impact: Users avoid an installer or store compatibility regression.
- **Dependabot continues to report the ZIP symlink advisory after the patched package is deployed** (recoverable)
  - Detection: Run extractAllTo, extractAllToAsync and extractEntryTo with overwrite and permission preservation enabled on separate temporary fixtures. In each fixture, an archive entry targets a pre-existing symlink pointing outside the destination to a sentinel with distinct bytes and mode 0600. The vulnerable baseline must replace the bytes and change permissions. The patched release must preserve both regardless of whether extraction throws or skips. The disposable 0.5.18 and 0.6.1 probes demonstrated the expected outcomes across all three calls.
  - Response: Record the runtime result and tracker status separately. Treat an actual outside write as a blocker and escalate any advisory metadata mismatch.
  - User impact: Completion evidence shows which result is verified.
- **A live test service is unavailable** (recoverable)
  - Detection: Record the failing reachability or credential preflight and the exact affected checks.
  - Response: Run available fixture and unit checks. Keep live coverage explicitly pending with instructions for an environment that provides the service.
  - User impact: Release evidence distinguishes completed coverage from pending service validation.
- **Producer resolves patched Sharp but an installed package reintroduces the old optional branch** (recoverable)
  - Detection: Compare the packed artifact and a clean consumer lockfile. A disposable Node 22 probe resolved sharp 0.35.5 at the producer and 0.33.5 from the packed shrinkwrap in the consumer.
  - Response: Use the bundled storage-only SDK recipe in docs/standalone/remediate-critical-high-moderate-dependabot-alerts-E2026110846667edf/S001/DEPENDENCY-BASELINE.md. Verify the upstream checksum and license, exclusion of optional embedding branches, presence of the bundled SDK and correct resolution of the original native binding, and installation with default options and no host overrides.
  - User impact: Standalone users receive a safe default install without editing the host manifest.
- **Current GitHub alert state is unavailable after deployment** (recoverable)
  - Detection: Run the authenticated paginated alert query after the default-branch dependency scan and check each historical alert ID for its current state.
  - Response: Leave tracker reconciliation pending and retry when access is restored. Record current state separately from the frozen design evidence and package-level remediation results.
  - User impact: The release record identifies which GitHub closures were verified.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Valid CSV through an existing file connection after manifest cleanup | DuckDB preview and query remain functional. |
| Nested but valid YAML merge and multiple documents | Existing project config and infrastructure discovery still parse supported documents. |
| Historical lockfile still names an old Sharp version | The historical content and original test provenance remain intact. Any tracker disposition is scoped to those four paths. |

**Invariants to preserve**

- Keep MCP stdio and current tool request and response schemas. [[c1]]
- Keep the package API, existing LanceDB data, and local-only embedding behavior. [[c2]]
- Keep saved driver settings and existing CSV file behavior. [[c3]]
- Standalone storage owns one LanceDB SDK dependency. The SDK selects one installed native binding for the host and memory receives vectors from its caller. The daemon owns its separate Transformers dependency. A standalone SDK distribution may narrow optional install edges while retaining the SDK version, platform bindings, and Arrow and store compatibility. [[c2]]

## 4. Test strategy

**Test framework:** `Node test runner with tsx, existing npm build and project-memory qualification workflow. Use disposable services or existing fixtures and record live-service availability.`

**Test levels**

- **contract** — Compare every package instance to the open advisory ranges in the root and fresh packed consumer lockfiles.
  - Subjects: `Daemon dependency closure`, `Standalone memory consumer package graph`, `Recorded historical alerts`
- **unit** — Exercise existing affected behavior and add narrow regressions for security-sensitive gaps.
  - Subjects: `MCP tool schema conversion`, `YAML merges and multi-document parsing`, `DuckDB CSV input`, `SMTP envelope and attachments`, `ZIP destination symlink rejection`, `CSV registration, preview and query via the existing DuckDB path after manifest removal`, `Static and dynamic dependency caller inventory and packaged entry-point check for PDF.js and csv-parse`
- **integration** — Verify protocol, TLS, and package compatibility using real transports and clean installs.
  - Subjects: `MCP stdio list and call`, `HTTP redirects and aborts, WebSocket handshake, Ollama streaming`, `SMTP STARTTLS delivery`, `Cassandra, etcd, MySQL, and SQL Server connection and read paths`, `Load pre-upgrade saved configurations for Cassandra, etcd, MySQL and SQL Server through the daemon registry, then connect, read schema and execute an authorized read query`
- **smoke** — Verify installed platform bindings and preserve existing store compatibility.
  - Subjects: `macOS and Linux Node 22.22.1 native install`, `ONNX embedding initialization`, `Clean packed consumer memory create and reopen of pre-upgrade store`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `Batch 1 acceptance means the daemon transport, parsers and tooling resolve outside every mapped affected range while keeping existing interfaces.`, `Check the MCP SDK and Express proxy chain, stdio list and call, YAML merges, HTTP redirects and TLS, WebSocket and Ollama streaming. Search source, loaders, scripts, package edges and built entry points before dependency removal. Verify CSV through a saved DuckDB connection and no affected PDF.js or csv-parse dependency in the packed backend.` |
| `ac2` | `Batch 2 acceptance means SMTP and driver version changes preserve existing configurations, secure transports and authorized reads.`, `Check SMTP STARTTLS and authenticated delivery with recipients and attachments. Load existing Cassandra, etcd, MySQL and SQL Server configurations and exercise connection and read paths. Run the validated ZIP sentinel regression across all three extraction APIs.` |
| `ac3` | `Batch 3 acceptance means daemon and standalone memory native dependencies resolve safely, load on supported macOS and Linux Node 22.22.1, and preserve storage.`, `Check ONNX startup, then clean consumer install of the packed memory tarball with default optional dependencies and no host override. Verify the SDK checksum, license and graph, native binding, and records, vectors, queue and receipts when reopening a populated baseline store.` |
| `ac4` | `Combined acceptance requires targeted evidence for each ordered batch and one full repository sweep after all batches pass.`, `Recompute the approved historical inventory from the cited machine-readable snapshot. Check advisory ranges against the resolved lockfiles and preserve archived evidence byte-for-byte. The eight low alerts are outside this issue.`, `After the default-branch scan, independently query GitHub for the current state of each in-scope alert and record evidence-only and advisory metadata exceptions. An unavailable endpoint leaves this release check pending.` |

## 5. Migration

**State before:** The existing stdio server, network clients, and memory store adapters described in s1 use the locked runtime dependency versions. A default standalone project-memory installation resolves its own LanceDB dependency closure.

**State after:** The daemon and standalone consumer package graphs pass the same advisory-range checks and existing stores reopen using their current schemas.

**Zero downtime:** no — **Data rewrite:** no

**Steps**

1. Qualify batch 1 with its scoped transport, parser, caller and lockfile checks. — ↩ rollbackable
2. Qualify batch 2 with its SMTP, saved driver and ZIP checks. — ↩ rollbackable
3. Qualify batch 3 with clean native installs, a packed consumer, and a populated pre-upgrade store fixture. — ↩ rollbackable
4. Run the full repository sweep once after all three batches pass targeted checks. — ↩ rollbackable
5. Before deployment, stop the writer, make a verified consistent backup of the store and queue including receipts, and restore it into a scratch location using the previous release to confirm recoverability. Preserve the backup and previous release artifact until verification completes. — ↩ rollbackable
6. Deploy and verify the daemon and standalone releases. On rollback, stop the writer, preserve the upgraded store separately, restore the verified pre-upgrade backup, and reopen it with the previous release. Treat post-upgrade writes as pending recovery until explicitly reconciled. — ↩ rollbackable
7. After the default branch is updated and rescanned, query GitHub and reconcile each historical alert ID. Retain the approved inventory as historical evidence. Record current open alerts and unavailable tracker checks separately. — ↩ rollbackable

**Backward compat:** Preserve MCP schemas, daemon IPC, memory exports, saved connections and forward reopening of a populated store and queue written by the pre-remediation release. Select the baseline artifact from the release immediately before this story. Include records with vectors and both a pending queue item and a completed receipt. Rollback uses the verified pre-upgrade backup. It does not assume the previous release can open data written after upgrade.

## 6. Alternatives considered

### 6.1 a1: Scoped updates with a verified standalone package — **CHOSEN**

Refresh compatible versions and scope exceptions to their parent packages, with a separate packed consumer gate.

Use the resolved package versions, parent-scoped constraints, and advisory mapping in docs/standalone/remediate-critical-high-moderate-dependabot-alerts-E2026110846667edf/S001/DEPENDENCY-BASELINE.md. Batch 1 updates the MCP SDK to 1.32.2, Express to 5.3.0 and proxy-addr to 2.0.8, keeps Undici on 7.x with 7.30.2 verified, and refreshes the remaining transport, validation, YAML and tooling dependencies. Remove pdfjs-dist and csv-parse after checking tracked static imports, dynamic loading, dependency parents and packaged entry points. Batch 2 moves Nodemailer to 10.4.0, Cassandra to 4.10.0 with adm-zip 0.6.1 in the new parent range, MySQL to 3.24.6, etcd's gRPC to 1.14.7, and Tedious's Azure Identity to 4.14.1 with MSAL 7.2.1. Batch 3 resolves Sharp 0.35.5 and tar 7.5.22 for the daemon native paths. For standalone memory, bundle a manifest-only storage copy of upstream LanceDB 0.40.0 in the normal memory tarball. Leave the original platform bindings as version-pinned consumer optional dependencies. The verified upstream integrity, staging manifest, bundle mechanism, licensing and isolated consumer results are recorded in docs/standalone/remediate-critical-high-moderate-dependabot-alerts-E2026110846667edf/S001/DEPENDENCY-BASELINE.md.

### 6.2 a2: Replace affected upstream dependency chains

Replace or fork packages whose current dependency graph cannot resolve securely by normal version selection.

Replace broad dependency families or maintain a fork that changes runtime behavior, while keeping the external daemon and memory contracts equivalent.

**Rejected because:** A broad fork or replacement can satisfy consumer resolution, but changes to the runtime SDK or provider behaviors would increase compatibility and maintenance costs beyond what this issue needs.

### 6.3 a3: Upgrade full dependency families

Use the latest major releases across affected families.

Adopt the current supported upstream lines and migrate each affected integration wherever its public API changed.

**Rejected because:** Adds unrelated integration churn and the newer LanceDB release still selects the affected optional Transformers branch.

## 7. References

- **[[c1]]** `code` `src/mcp/server.ts:1264`
- **[[c2]]** `code` `packages/project-memory/src/store/lance-store.ts:184`
- **[[c3]]** `code` `src/daemon/db/file-execution.ts:45`
- **[[c4]]** `prior-artifact` `ISSUE-46667edffe5cc451`
- **[[c5]]** `doc` `package-lock.json`
- **[[c6]]** `code` `packages/project-memory/src/__tests__/packed.test.ts`
- **[[c7]]** `code` `src/agent/providers/onnx-embedder.ts:95`
- **[[c8]]** `doc` `https://docs.npmjs.com/cli/v10/configuring-npm/package-json/#overrides`
- **[[c9]]** `doc` `https://github.com/advisories/GHSA-vwc7-r8mq-g2x9`
- **[[c10]]** `doc` `https://github.com/cthackers/adm-zip/releases/tag/v0.6.1`
- **[[c11]]** `doc` `docs/standalone/remediate-critical-high-moderate-dependabot-alerts-E2026110846667edf/S001/DEPENDENCY-BASELINE.md`
- **[[c12]]** `code` `src/daemon/db/config.ts`
- **[[c13]]** `doc` `docs/standalone/remediate-critical-high-moderate-dependabot-alerts-E2026110846667edf/S001/DEPENDABOT-SNAPSHOT.json`
