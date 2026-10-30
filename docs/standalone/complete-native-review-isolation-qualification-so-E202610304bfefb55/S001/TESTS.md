<!-- insrc:artifact TESTS-4bfefb556f0dc560-s1 -->

# Tests: 4bfefb556f0dc560 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 12 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

## t1

Run at 2026-10-30T09:51:03.769Z on commit `6ca7ee613`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Claude v2 launch disables plugins hooks instructions and memory without breaking OAuth or scoped MCP**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Claude v2 launch disables plugins hooks instructions and memory without breaking OAuth or scoped MCP | `src/agent/providers/__tests__/claude-investigation-v2.test.ts` |

**unit: StructuredOutput is schema-bound protocol only and every unknown duplicate malformed or contradictory native capability refuses**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | StructuredOutput is schema-bound protocol only and every unknown duplicate malformed or contradictory native capability refuses | `src/agent/providers/__tests__/claude-investigation-v2.test.ts` |

**unit: Missing or managed policy provenance cannot become an empty effective inventory**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Missing or managed policy provenance cannot become an empty effective inventory | `src/agent/providers/__tests__/claude-investigation-v2.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/claude-investigation-v2.test.ts` | 0 | 3 | 0.7 s |  |

## t2

Run at 2026-10-30T10:07:08.586Z on commit `03c52d887`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Complete paired host evidence emits a completed Claude v2 candidate and qualifies through installed authority**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Complete paired host evidence emits a completed Claude v2 candidate and qualifies through installed authority | `src/agent/providers/__tests__/native-investigation-probe.test.ts` |

**integration: Internal post-ACK cancellation qualifies only after actual process drain while operator cancellation stays cancelled**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Internal post-ACK cancellation qualifies only after actual process drain while operator cancellation stays cancelled | `src/agent/providers/__tests__/native-investigation-probe.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/native-investigation-probe.test.ts` | 0 | 12 | 16.2 s |  |

## t3

Run at 2026-10-30T10:21:28.220Z on commit `332fbfb12`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Deleting changing or swapping any evidence basis raw phase pin or candidate refuses qualification**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Deleting changing or swapping any evidence basis raw phase pin or candidate refuses qualification | `src/agent/providers/__tests__/native-investigation-probe.test.ts` |

**integration: V1 fixtures Codex ordinary provider and design review compatibility remain intact**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Installed v2 sessions recheck native startup policy before accepting scoped operations | `src/agent/providers/__tests__/claude-investigation-session.test.ts` |
| pass | Native-only terminal result validation preserves ordinary Claude buffered completions | `src/agent/providers/__tests__/claude-investigation-events.test.ts` |
| pass | Codex scoped session progress budget cancellation and legacy behavior | `src/agent/providers/__tests__/codex-investigation-session.test.ts` |
| pass | a claude reviewer session runs in the repo with the session arguments and returns the checked answer | `src/agent/providers/__tests__/cli-review-session.test.ts` |
| pass | Legacy S005 pre S005 design and installation order partitions remain compatible | `src/daemon/__tests__/review-investigation-adoption.test.ts` |
| pass | Rollback retains accepted complete work for publication without new judgment | `src/daemon/__tests__/review-investigation-adoption.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/claude-investigation-events.test.ts` | 0 | 3 | 0.7 s |  |
| `src/agent/providers/__tests__/claude-investigation-session.test.ts` | 0 | 2 | 7.8 s |  |
| `src/agent/providers/__tests__/cli-review-session.test.ts` | 0 | 26 | 35.3 s |  |
| `src/agent/providers/__tests__/codex-investigation-session.test.ts` | 0 | 1 | 6 s |  |
| `src/agent/providers/__tests__/native-investigation-probe.test.ts` | 0 | 13 | 18.3 s |  |
| `src/daemon/__tests__/review-investigation-adoption.test.ts` | 0 | 8 | 9.6 s |  |

## t4

Run at 2026-10-30T10:50:36.072Z on commit `61f43754a`. Tests check: **passed**. 0 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

the gate ran no test: every named test of this Task was reported by the builder

**live: Installed source-only and indexed-impact probes each complete with a validated candidate using one serial control restricted pair**

Reported by the builder, not run by the gate: **pass**. Evidence: /tmp/qualification-fix-live-acceptance.json; /tmp/live-insrc-probe-v2-admission-fixed-run.json; actual probes dd88812b-0a8e-4cec-9946-c0f8cdf434f0 and ab926476-faf4-48e3-9c4e-4638c0e787d6 completed with exported candidates/no missing evidence on03959efd1. Canonical draft mode records .insrc/artifacts/ISSUE-9ff1c86fdd7adcbc.json and ISSUE-f29a3e27b3282f6e.json; safe drained restart logs /tmp/qualification-fix-daemon-restart-2.log. Failed earlier IDs remain in /tmp/live-insrc-probe-v2-qualification-run.json, not promoted. Corrected admission arithmetic /tmp/v2-probe-admission-analysis.jsonl; focused tests/build /tmp/qualification-fix-t4-admission-tests.log and /tmp/qualification-fix-t4-build.log.
