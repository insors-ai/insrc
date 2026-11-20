<!-- insrc:artifact TESTS-3275fb2e9a542cd6-s1 -->

# Tests: 3275fb2e9a542cd6 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 31 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

## t1

Run at 2026-11-20T05:12:45.381Z on commit `46a1e851d`. Tests check: **passed**. 0 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

the gate ran no test: every named test of this Task was reported by the builder

**smoke: Baseline commit, upstream overlap and quiescent-owner evidence**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/plans/test-harness-baseline-2026-11-20.json records exact commands, filters, timestamp and empty results; docs/plans/test-harness-build-2026-11-20.md explains limits. Commit 46a1e851d; baseline merge 97ec6496f.

## t2

Run at 2026-11-20T05:18:46.393Z on commit `7139f79e0`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Canonical-path contenders refuse overlap and preserve foreign/replaced/symlinked ownership**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Canonical-path contenders refuse overlap and preserve foreign/replaced/symlinked ownership | `scripts/__tests__/test-harness.test.ts` |
| pass | Malformed lease records and parent symlinks refuse without removal | `scripts/__tests__/test-harness.test.ts` |

**unit: Unsupported Node refuses before mutation and child environment resolves selected runtime**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Unsupported Node refuses before mutation and child environment resolves selected runtime | `scripts/__tests__/test-harness.test.ts` |

**integration: Abandoned ownership cannot be stolen by age or PID absence**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Abandoned ownership cannot be stolen by age or PID absence | `scripts/__tests__/test-harness.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `scripts/__tests__/test-harness.test.ts` | 0 | 4 | 0.5 s |  |

## t3

Run at 2026-11-20T05:33:51.742Z on commit `e27d221f5`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Prepared build excludes simultaneous writers and readers, validates helpers and rejects fingerprint drift**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Prepared build excludes simultaneous writers and readers, validates helpers and rejects fingerprint drift | `scripts/__tests__/test-harness-coordinator.test.ts` |
| pass | Output mutation lane precedes ordinary prepared readers and source drift never passes | `scripts/__tests__/test-harness-coordinator.test.ts` |
| pass | A timed-out writer retains its reservation until its child closes | `scripts/__tests__/test-harness-coordinator.test.ts` |
| pass | Default prepared output requires the host native lifecycle helper | `scripts/__tests__/test-harness-coordinator.test.ts` |

**integration: SIGINT/SIGTERM and deadline drain registered actors or retain blocked incomplete outcome**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | SIGINT/SIGTERM and deadline drain registered actors or retain blocked incomplete outcome | `scripts/__tests__/test-harness-coordinator.test.ts` |
| pass | Missing TAP destinations and failed build stages retain logs, actual closure and unavailable coverage | `scripts/__tests__/test-harness-coordinator.test.ts` |

**unit: Selector deduplication, explicit budgets and bounded concurrency reject invalid admission**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Selector deduplication, explicit budgets and bounded concurrency reject invalid admission | `scripts/__tests__/test-harness-coordinator.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `scripts/__tests__/test-harness-coordinator.test.ts` | 0 | 7 | 2.7 s |  |

## t4

Run at 2026-11-20T06:19:14.359Z on commit `1106cf2af`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Five prepared consumers reuse helpers and raw invocations refuse missing context**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Five prepared consumers reuse helpers and raw invocations refuse missing context | `scripts/__tests__/test-harness-consumers.test.ts` |

**integration: Retirement-package stale-output rebuild remains a serial mutation regression**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Retirement-package stale-output rebuild remains a serial mutation regression | `scripts/__tests__/test-harness-consumers.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `scripts/__tests__/test-harness-consumers.test.ts` | 0 | 2 | 82.3 s |  |

## t7

Run at 2026-11-20T06:10:10.669Z on commit `c3b307a56`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Root and VSCode command overlap refuses before asset synchronization**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Root and VSCode command overlap refuses before asset synchronization | `scripts/__tests__/test-harness-commands.test.ts` |

**integration: Build stages and specialized launcher gate policies survive wrapper integration**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Build stages and specialized launcher gate policies survive wrapper integration | `scripts/__tests__/test-harness-commands.test.ts` |
| pass | Specialized stages retain writer ownership and reader closure precedes later mutation | `scripts/__tests__/test-harness-commands.test.ts` |

**integration: Native refusal and saved-mode controls remain enforced**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Native refusal and saved-mode controls remain enforced | `scripts/__tests__/test-harness-commands.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `scripts/__tests__/test-harness-commands.test.ts` | 0 | 4 | 30 s |  |

## t5

Run at 2026-11-20T06:34:13.277Z on commit `521592d7c`. Tests check: **passed**. 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**smoke: Peer state round-trip terminates with both MessagePorts closed**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Peer state round-trip terminates with both MessagePorts closed | `src/daemon/steps/__tests__/peer-state-store-leakfree.test.ts` |

**integration: Failed fixture readiness reclaims socket and child before the next case**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Failed fixture readiness reclaims socket and child before the next case | `src/daemon/tools/__tests__/fixture-lifetime.test.ts` |
| pass | Detached fixture acknowledgments are drained before checkout release | `src/daemon/tools/__tests__/fixture-lifetime.test.ts` |
| pass | Unconfirmed cleanup retains handles and readiness failure cannot wait forever | `src/daemon/tools/__tests__/fixture-lifetime.test.ts` |
| pass | Owned groups retain descendants with independent stdio until disposal | `src/daemon/tools/__tests__/fixture-lifetime.test.ts` |
| pass | An escaped descendant with independent stdio blocks release until its acknowledgment | `src/daemon/tools/__tests__/fixture-lifetime.test.ts` |

**integration: Ready handshake precedes behavioral cancellation deadline**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Ready handshake precedes behavioral cancellation deadline | `src/daemon/tools/__tests__/fixture-lifetime.test.ts` |
| pass | git-abort.test.ts: git_show starts no command after an abort between its header, diff and stat commands | `src/daemon/tools/builtins/git/__tests__/git-abort.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/steps/__tests__/peer-state-store-leakfree.test.ts` | 0 | 1 | 0.3 s |  |
| `src/daemon/tools/__tests__/fixture-lifetime.test.ts` | 0 | 6 | 7.9 s |  |
| `src/daemon/tools/builtins/git/__tests__/git-abort.test.ts` | 0 | 5 | 4.6 s |  |

## t6

Run at 2026-11-20T06:40:34.477Z on commit `90b744fd1`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Real panel type probes preserve positive and intended-negative diagnostics**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Real panel type probes preserve positive and intended-negative diagnostics | `scripts/__tests__/test-harness-probes.test.ts` |

**integration: Compiler launch failure and interruption cannot pass a negative probe or pollute source includes**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Compiler launch failure and interruption cannot pass a negative probe or pollute source includes | `scripts/__tests__/test-harness-probes.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `scripts/__tests__/test-harness-probes.test.ts` | 0 | 2 | 51.1 s |  |

## t8

Run at 2026-11-20T07:03:08.903Z on commit `63177dc29`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

**smoke: Sequential focused validation reports actual coverage, remaining failures and closed actors**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/plans/test-harness-final-validation-2026-11-20.json and docs/plans/test-harness-build-2026-11-20.md: 19 sequential controller checks pass at 3fd825b00, separate 8-check coordinator follow-up passes at 02c2fbe8b (7 repeated plus 1 live-serial disposable control); backend run 70018a3b-5b68-400b-b5be-a49d03bf37a4 has 28 pass/2 existing Linux-only skips, cleanup confirmed and complete coverage. Full native diagnostics remain 8 pass/11 fail/1 cancel/3 skips; retained for Batch17, not reported green. Tracked TAP logs and source/output fingerprints supplied. Final process snapshot reports no matching actors, active lease or source probes. Sequence definition validated with no findings; browser rendering unavailable and explicitly unverified.

**smoke: Documented runtime, selector, budget and blocked-recovery commands match observed behavior**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Abandoned ownership cannot be stolen by age or PID absence | `scripts/__tests__/test-harness.test.ts` |
| pass | Unsupported Node refuses before mutation and child environment resolves selected runtime | `scripts/__tests__/test-harness.test.ts` |
| pass | Selector deduplication, explicit budgets and bounded concurrency reject invalid admission | `scripts/__tests__/test-harness-coordinator.test.ts` |
| pass | Explicit live opt-in admits files serially without enabling services in the control | `scripts/__tests__/test-harness-coordinator.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `scripts/__tests__/test-harness-coordinator.test.ts` | 0 | 8 | 8.5 s |  |
| `scripts/__tests__/test-harness.test.ts` | 0 | 4 | 0.5 s |  |
