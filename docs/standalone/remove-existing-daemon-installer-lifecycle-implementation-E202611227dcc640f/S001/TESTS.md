<!-- insrc:artifact TESTS-7dcc640fef47d9e6-s1 -->

# Tests: 7dcc640fef47d9e6 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 9 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

## t1

Run at 2026-11-23T04:40:29.488Z on commit `ad21d4f8b`. Tests check: **passed**. 0 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

the gate ran no test: every named test of this Task was reported by the builder

**smoke: Preflight source-hash/selector, manifest accounting, existing script/test-selector and toolchain-availability checks (read-only; no live daemon operation).**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/standalone/remove-existing-daemon-installer-lifecycle-implementation-E202611227dcc640f/S001/evidence/preflight.md

## t2

Run at 2026-11-23T05:08:21.310Z on commit `e00185c8a`. Tests check: **passed**. 0 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

the gate ran no test: every named test of this Task was reported by the builder

**smoke: 278-path absence and preserved-noncandidate-file accounting check; no per-task full build.**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/standalone/remove-existing-daemon-installer-lifecycle-implementation-E202611227dcc640f/S001/evidence/t2-deletion.json

## t3

Run at 2026-11-23T05:20:22.028Z on commit `a90576bd2`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Retained shared process identity/run-file guard and generic IPC subsets, including src/shared/__tests__/daemon-process.test.ts, src/shared/__tests__/daemon-run-files.test.ts and src/shared/__tests__/ipc-client.test.ts (executed after all edits in t8).**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | process start parsers preserve OS markers and distinguish zombies and malformed observations | `src/shared/__tests__/daemon-process.test.ts` |
| pass | guard serializes cooperating owners and release invalidates its authority | `src/shared/__tests__/daemon-run-files.test.ts` |
| pass | rpc preserves a multi-byte response character split across socket reads | `src/shared/__tests__/ipc-client.test.ts` |
| pass | application disposal coalesces, drains before closing resources and skips unsafe native closes after lock loss during drain | `src/daemon/__tests__/shutdown-store-failure.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/shutdown-store-failure.test.ts` | 0 | 2 | 1.3 s |  |
| `src/shared/__tests__/daemon-process.test.ts` | 0 | 3 | 0.5 s |  |
| `src/shared/__tests__/daemon-run-files.test.ts` | 0 | 17 | 0.8 s |  |
| `src/shared/__tests__/ipc-client.test.ts` | 0 | 11 | 0.4 s |  |

## t4

Run at 2026-11-23T05:28:20.845Z on commit `58fb3f3e5`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Retained CLI command/model/configuration and status/backup/compact assertions, plus CLI/MCP launch contract/source checks (bounded execution in t8).**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | help lists the command reference | `src/cli/__tests__/command.test.ts` |
| pass | tui-models.test.ts: Model Tiers pane cycles the fake answer's families, models and efforts and writes whole tiers; unserved model has no effort edit; refusals and deferred application shown | `src/cli/__tests__/tui-models.test.ts` |
| pass | reachable model renders running + uptime + socket + version/pid + repos with index state | `src/cli/panes/__tests__/DaemonSection.test.ts` |
| pass | maintenance consumes captured stopped-process proof without live IPC or fabricated dead-process observations | `src/daemon/db/__tests__/connection-maintenance-control.test.ts` |
| pass | CLI and MCP launch isolated development entries with preserved arguments and workspace without installer fallback | `src/cli/__tests__/entry-scripts.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/cli/__tests__/command.test.ts` | 0 | 29 | 0.5 s |  |
| `src/cli/__tests__/entry-scripts.test.ts` | 0 | 1 | 0.7 s |  |
| `src/cli/__tests__/tui-models.test.ts` | 0 | 13 | 8.5 s |  |
| `src/cli/panes/__tests__/DaemonSection.test.ts` | 0 | 4 | 0.7 s |  |
| `src/daemon/db/__tests__/connection-maintenance-control.test.ts` | 0 | 1 | 0.4 s |  |
