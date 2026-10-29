<!-- insrc:artifact TESTS-7aaf7e1b4a54e86f-s1 -->

# Tests: 7aaf7e1b4a54e86f s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 25 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-29T20:03:05.623Z on commit `d20a7c622`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Probe schemas reject launch overrides, forged/serialized grants and invalid observation states**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Probe schemas reject launch overrides, forged/serialized grants and invalid observation states | `src/agent/providers/__tests__/investigation-probe-grant.test.ts` |
| pass | Probe grants snapshot identity and budget and reject cancelled or expired authority | `src/agent/providers/__tests__/investigation-probe-grant.test.ts` |

**unit: Probe capability remains optional and cannot supply production qualification**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Probe capability remains optional and cannot supply production qualification | `src/agent/providers/__tests__/investigation-probe-grant.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/investigation-probe-grant.test.ts` | 0 | 3 | 0.7 s |  |

## t2

Run at 2026-10-29T20:08:18.548Z on commit `0f84455f8`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Probe and review across repositories share one lane until actual teardown**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Probe and review across repositories share one lane until actual teardown | `src/daemon/__tests__/review-investigation-provider-lane.test.ts` |
| pass | Process wide provider admission serializes repositories and cancels queued work without a lease | `src/daemon/__tests__/review-investigation-recovery.test.ts` |

**integration: Cancelling queued probe does not invoke provider or release another owner's slot**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Cancelling queued probe does not invoke provider or release another owner's slot | `src/daemon/__tests__/review-investigation-provider-lane.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/review-investigation-provider-lane.test.ts` | 0 | 2 | 1.7 s |  |
| `src/daemon/__tests__/review-investigation-recovery.test.ts` | 0 | 3 | 26.2 s |  |

## t3

Run at 2026-10-29T20:15:05.346Z on commit `30b1dcd7d`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Synthetic probe bridge records ordered durable ACKs and rejects cross-run capabilities**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Synthetic probe bridge records ordered durable ACKs and rejects cross-run capabilities | `src/daemon/__tests__/review-investigation-probe-fixtures.test.ts` |

**integration: Private canaries leave real source/config/auth untouched and cleanup on failure**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Private canaries leave real source/config/auth untouched and cleanup on failure | `src/daemon/__tests__/review-investigation-probe-fixtures.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/review-investigation-probe-fixtures.test.ts` | 0 | 2 | 0.7 s |  |

## t4

Run at 2026-10-29T20:23:46.534Z on commit `8b5a86106`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Trusted probe executes once with exact pinned launch, inclusive budget and bounded cancellation**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Trusted probe executes once with exact pinned launch, inclusive budget and bounded cancellation | `src/agent/providers/__tests__/native-investigation-probe.test.ts` |
| pass | Probe capture overflow and spawn observation failure drain the actual process | `src/agent/providers/__tests__/native-investigation-probe.test.ts` |

**unit: Production native session refuses probe grants and unchanged installed-proof checks hold**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Production native session refuses probe grants and unchanged installed-proof checks hold | `src/agent/providers/__tests__/native-investigation-probe.test.ts` |
| pass | Effective native isolation qualification rejects inherited tools and unproven binaries | `src/agent/providers/__tests__/investigation-session.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/investigation-session.test.ts` | 0 | 1 | 0.9 s |  |
| `src/agent/providers/__tests__/native-investigation-probe.test.ts` | 0 | 3 | 1.3 s |  |

## t5

Run at 2026-10-29T20:29:14.015Z on commit `20b8c75aa`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Claude observed inventory/denial parser rejects model claims, flags, gaps and stale identities**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Claude observed inventory/denial parser rejects model claims, flags, gaps and stale identities | `src/agent/providers/__tests__/claude-investigation-probe.test.ts` |

**integration: Claude probe retains OAuth without credential copies and never fabricates cancellation proof**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Claude probe retains OAuth without credential copies and never fabricates cancellation proof | `src/agent/providers/__tests__/native-investigation-probe.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/claude-investigation-probe.test.ts` | 0 | 1 | 0.5 s |  |
| `src/agent/providers/__tests__/native-investigation-probe.test.ts` | 0 | 4 | 2 s |  |

## t6

Run at 2026-10-29T20:36:26.482Z on commit `df622d03d`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Codex observation parser pins launcher and real runtime; missing inventory remains unsupported**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Codex observation parser pins launcher and real runtime; missing inventory remains unsupported | `src/agent/providers/__tests__/codex-investigation-probe.test.ts` |

**integration: Codex probe preserves strict schema cleanup and actual process drain**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Codex probe preserves strict schema cleanup and actual process drain | `src/agent/providers/__tests__/native-investigation-probe.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/codex-investigation-probe.test.ts` | 0 | 1 | 0.7 s |  |
| `src/agent/providers/__tests__/native-investigation-probe.test.ts` | 0 | 5 | 3.6 s |  |

## t7

Run at 2026-10-29T20:48:36.490Z on commit `395fe9e9f`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Real routed probe IPC registers all operations on owning main daemon and strict gateway dispatcher**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Real routed probe IPC registers all operations on owning main daemon and strict gateway dispatcher | `src/daemon/__tests__/review-investigation-probe.test.ts` |

**integration: Probe UUID replay/conflict, crash interruption, readonly status and bounded export**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Probe UUID replay/conflict, crash interruption, readonly status and bounded export | `src/daemon/__tests__/review-investigation-probe.test.ts` |
| pass | Oversized unsigned candidate fails explicitly instead of exporting truncated evidence | `src/daemon/__tests__/review-investigation-probe.test.ts` |

**integration: Malformed probe never enters production investigation or legacy parsers**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Malformed probe never enters production investigation or legacy parsers | `src/daemon/__tests__/review-investigation-probe.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/review-investigation-probe.test.ts` | 0 | 4 | 1.3 s |  |

## t8

Run at 2026-10-29T21:07:39.058Z on commit `609fdb21d`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Unsigned export validates every required observation and never signs, approves or changes config**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Unsigned export validates every required observation and never signs, approves or changes config | `src/daemon/__tests__/review-investigation-probe-export.test.ts` |
| pass | Unsigned raw evidence export rejects changed bytes and foreign fixture roots | `src/daemon/__tests__/review-investigation-probe-export.test.ts` |
| pass | Probe launch identity is durable before provider observation and cannot change | `src/daemon/__tests__/review-investigation-probe.test.ts` |
| pass | Effective native isolation qualification rejects inherited tools and unproven binaries | `src/agent/providers/__tests__/investigation-session.test.ts` |

**integration: IPC-only operator client reports missing attestation/readiness prerequisites without invoking production review**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | IPC-only operator client reports missing attestation/readiness prerequisites without invoking production review | `src/daemon/__tests__/review-investigation-probe-export.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/investigation-session.test.ts` | 0 | 1 | 0.9 s |  |
| `src/daemon/__tests__/review-investigation-probe-export.test.ts` | 0 | 3 | 0.7 s |  |
| `src/daemon/__tests__/review-investigation-probe.test.ts` | 0 | 5 | 1.3 s |  |
