<!-- insrc:artifact TESTS-46667edffe5cc451-s1 -->

# Tests: 46667edffe5cc451 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 17 pass, 0 fail, 0 skipped, 0 not found; 5 reported by the builder and not run by the gate.

## t1

Run at 2026-11-08T18:46:05.194Z on commit `67dc8d663`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

**unit: MCP structural-schema, YAML merge and CSV reader regression suites**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | actual MCP code-review advertisement has object-valued array items throughout | `src/mcp/__tests__/structural-schema.test.ts` |
| pass | Kubernetes parser resolves YAML merge keys, explicit overrides and multiple documents | `src/indexer/target-resolution/__tests__/core-and-parsers.test.ts` |
| pass | saved CSV registers, previews rows, and answers a bounded query through DuckDB | `src/daemon/db/__tests__/saved-csv-dependencies.test.ts` |

**integration: MCP stdio list and call plus HTTP TLS, redirect, abort, WebSocket and Ollama stream checks**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Compiled MCP SDK lists and calls a schema tool over stdio | `src/mcp/__tests__/stdio-dependencies.test.ts` |
| pass | HTTP tools preserve TLS validation, redirects, cancellation, and WebSocket negotiation | `src/daemon/tools/builtins/http/__tests__/transport.test.ts` |
| pass | memory-only Ollama transport retains completion until actual HTTP EOF after terminal frame | `src/agent/providers/__tests__/ollama-private-transport.test.ts` |

**smoke: Build and inspect packed backend entry points and resolved packages after unused dependency removal**

Reported by the builder, not run by the gate: **pass**. Evidence: Node 22.22.1 npm run build log at /tmp/insrc-dependabot-t1-build.log. npm pack --dry-run inventory /tmp/insrc-dependabot-t1-pack.json contains every declared bin. Compiled MCP listed tools and called insrc_schema, and the lockfile has zero PDF.js or csv-parse instances. Compiled tool smoke, YAML merge and saved CSV appear in /tmp/insrc-dependabot-t1-coverage.tap (18 passed).

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/ollama-private-transport.test.ts` | 0 | 6 | 2.7 s |  |
| `src/daemon/db/__tests__/saved-csv-dependencies.test.ts` | 0 | 1 | 2.1 s |  |
| `src/daemon/tools/builtins/http/__tests__/transport.test.ts` | 0 | 1 | 0.6 s |  |
| `src/indexer/target-resolution/__tests__/core-and-parsers.test.ts` | 0 | 16 | 0.8 s |  |
| `src/mcp/__tests__/stdio-dependencies.test.ts` | 0 | 1 | 0.8 s |  |
| `src/mcp/__tests__/structural-schema.test.ts` | 0 | 3 | 0.6 s |  |

## t2

Run at 2026-11-08T20:13:47.146Z on commit `445774cf2`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

**unit: Overwrite-enabled ZIP outside-sentinel regression for extractAllTo, extractAllToAsync and extractEntryTo**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Cassandra ZIP dependency preserves outside sentinel bytes and mode with overwrite enabled | `src/daemon/db/__tests__/cassandra-zip-dependencies.test.ts` |

**integration: Authenticated SMTP STARTTLS with attachments, authentication failure, required-TLS failure and partial recipient rejection**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | SMTP tool delivers attachments over authenticated STARTTLS and reports SMTP refusals | `src/daemon/tools/builtins/notify/__tests__/smtp-dependencies.test.ts` |

**live: Load saved Cassandra, etcd and MySQL settings through the daemon registry, then connect, read schema and perform a bounded read**

Reported by the builder, not run by the gate: **pass**. Evidence: MySQL three passing integration cases in /tmp/insrc-dependabot-t2-live.log and named Cassandra and etcd saved-driver cases in /tmp/insrc-dependabot-t2-kv-cases.tap. DRIVER-QUALIFICATION.md records the coverage.

**integration: Verify saved SQL Server configuration, schema and bounded reads at the Tedious SDK boundary using the fixture**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | saved SQL Server configuration uses Tedious for schema and bounded reads at the SDK boundary | `src/daemon/db/__tests__/saved-driver-dependencies.test.ts` |
| pass | CM-S3-DRIVER-LOGS: installed SDK diagnostic controls retain reviewed source and version evidence for all 14 modules | `src/daemon/db/__tests__/session-driver-logs.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/cassandra-zip-dependencies.test.ts` | 0 | 1 | 0.5 s |  |
| `src/daemon/db/__tests__/saved-driver-dependencies.test.ts` | 0 | 1 | 1.1 s |  |
| `src/daemon/db/__tests__/session-driver-logs.test.ts` | 0 | 4 | 12.4 s |  |
| `src/daemon/tools/builtins/notify/__tests__/smtp-dependencies.test.ts` | 0 | 1 | 1.9 s |  |

## t3

Run at 2026-11-08T19:06:25.021Z on commit `f0af23c1f`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

**smoke: Clean macOS and Linux Node 22.22.1 daemon installs with native dependency version checks**

Reported by the builder, not run by the gate: **pass**. Evidence: NATIVE-QUALIFICATION.md records both platforms and binding versions. Clean npm ci and actual model output are in /tmp/insrc-dependabot-t3-macos.log and /tmp/insrc-dependabot-t3-linux.log.

**integration: Load local ONNX and run a representative embedding without a cloud dependency**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Daemon produces a 768-component local embedding with the patched native graph | `src/agent/providers/__tests__/onnx-native-dependencies.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/onnx-native-dependencies.test.ts` | 0 | 1 | 1 s |  |

## t4

Run at 2026-11-08T19:11:35.598Z on commit `5aedc0347`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: LanceDB staged tarball manifest-diff, integrity and license assertions**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | bundled LanceDB retains upstream code and notices with only approved manifest exclusions | `packages/project-memory/src/__tests__/packed.test.ts` |

**integration: Build and pack the release artifact and inspect the default clean consumer dependency graph without host overrides**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | tarball-public-dependency-and-asset-allowlist | `packages/project-memory/src/__tests__/packed.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `packages/project-memory/src/__tests__/packed.test.ts` | 0 | 8 | 12.3 s |  |

## t5

Run at 2026-11-08T19:20:02.017Z on commit `db613ce26`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Run packed project-memory API and native binding smoke on macOS and Linux Node 22.22.1**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | packed-isolated-node22-consumer | `packages/project-memory/src/__tests__/packed.test.ts` |
| pass | packed-store-private-commit-read-receipt-and-cold-public-status | `packages/project-memory/src/__tests__/packed.test.ts` |

**integration: Open populated pre-upgrade fixture and verify records, vectors, queue and receipts, then rehearse the approved restore in scratch**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | packed upgrade reopens baseline rows vectors queue and receipts and old release restores backup | `packages/project-memory/src/__tests__/packed.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `packages/project-memory/src/__tests__/packed.test.ts` | 0 | 9 | 19.3 s |  |

## t6

Run at 2026-11-09T04:36:37.697Z on commit `3a3d66c4a`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

**smoke: Verify root build, completed full sweep evidence and baseline failure deferral to GitHub #143**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/standalone/remediate-critical-high-moderate-dependabot-alerts-E2026110846667edf/S001/RELEASE-VERIFICATION.md and /tmp/insrc-dependabot-sweep.XHqEr6/ (build.log, sweep.tap, comparison.txt, mcp-baseline-probe-16.tap, t2-post-sweep.tap). Evidence check passes under revised plan. Full sweep itself exited 1 with 560 failures and 37 cancellations. Baseline signatures tracked in #143. Branch-specific pin fix passed seven targeted checks.

**unit: Recompute all captured in-scope root ranges and byte-check the four archived lockfiles**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | all scoped root advisory ranges clear and archived lockfiles remain byte-identical | `docs/standalone/remediate-critical-high-moderate-dependabot-alerts-E2026110846667edf/S001/release-verification.test.ts` |

**smoke: Record tracker reconciliation commands and pending state until GitHub rescans the default branch**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/standalone/remediate-critical-high-moderate-dependabot-alerts-E2026110846667edf/S001/RELEASE-VERIFICATION.md, Post-deployment GitHub reconciliation. Documented read-only command and pending scan status verified.

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `docs/standalone/remediate-critical-high-moderate-dependabot-alerts-E2026110846667edf/S001/release-verification.test.ts` | 0 | 1 | 0.7 s |  |
