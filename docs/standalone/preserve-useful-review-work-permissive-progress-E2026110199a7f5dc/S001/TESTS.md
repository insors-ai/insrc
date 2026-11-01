<!-- insrc:artifact TESTS-99a7f5dc933a8456-s1 -->

# Tests: 99a7f5dc933a8456 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 24 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

## t1

Run at 2026-11-01T10:51:28.549Z on commit `b076f9581`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Fake-clock monitor: progress beyond expected duration, 1800000ms expiry, no heartbeat/replay renewal and separate tool ages**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | activity monitor survives expected durations, ignores heartbeats/replays and expires after 30 quiet minutes | `src/shared/__tests__/review-activity.test.ts` |
| pass | tool ages are independent, native sessions are fenced and a silent tool cannot renew inactivity | `src/shared/__tests__/review-activity.test.ts` |
| pass | fresh activity and stop fence delayed timer callbacks and tool IDs are bounded | `src/shared/__tests__/review-activity.test.ts` |

**unit: Execution union rejects mixed timers; capability/Ollama refusal before execution; factual diagnostic classification**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | execution options reject mixed timers and unsupported providers before execution | `src/shared/__tests__/review-activity.test.ts` |
| pass | inactivity diagnostics distinguish observed local pressure, remote wait and unknown without claiming a cause | `src/shared/__tests__/review-activity.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/shared/__tests__/review-activity.test.ts` | 0 | 5 | 0.7 s |  |

## t2

Run at 2026-11-01T11:00:00.714Z on commit `0d716479d`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Claude/Codex fixture streams: incremental UTF-8, partial frames, tool IDs, candidate recognition and conservative final-output fallback**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Claude fragmented UTF-8 streams expose metadata and complete structured candidates, not partial input or acknowledgements | `src/agent/providers/__tests__/review-activity-stream.test.ts` |
| pass | Codex completed messages wait for successful turn finality and duplicate native IDs do not renew | `src/agent/providers/__tests__/review-activity-stream.test.ts` |
| pass | invalid and oversized candidate/frame data fail explicitly without accepting truncated feedback | `src/agent/providers/__tests__/review-activity-stream.test.ts` |

**integration: Activity process has no fixed timer/watchdog, explicit cancellation kills group, buffers/queues remain bounded and non-task mode unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | activity subprocess has no fixed timer, serializes observers and bounds retained output | `src/agent/providers/__tests__/review-activity-stream.test.ts` |
| pass | CLI activity mode ignores bounded provider timers and uses stream flags; durable accepted output survives wrapper failure | `src/agent/providers/__tests__/review-activity-stream.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/review-activity-stream.test.ts` | 0 | 5 | 0.7 s |  |

## t3

Run at 2026-11-01T11:10:18.743Z on commit `d05822208`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Daemon task activity survives old limits; attribution/task session identity; expiry persists incomplete without automatic retry**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | daemon review progresses beyond old deadlines and expires only after 30 quiet minutes without retry | `src/workflow/code-review/task-review/__tests__/activity-execution.test.ts` |
| pass | unsupported activity providers refuse before checkpoint writes or model execution | `src/workflow/code-review/task-review/__tests__/activity-execution.test.ts` |

**integration: Durable candidate vs crash/expiry/write failure/conflicting duplicate; validate before commit, receipt after checkpoint and cleanup**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | accepted feedback is durable before receipt and survives CLI failure or conflicting duplicates | `src/workflow/code-review/task-review/__tests__/activity-execution.test.ts` |
| pass | unsaved or invalid feedback never passes and persistence failure preserves the last durable checkpoint | `src/workflow/code-review/task-review/__tests__/activity-execution.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/task-review/__tests__/activity-execution.test.ts` | 0 | 4 | 1.1 s |  |

## t4

Run at 2026-11-01T11:24:30.279Z on commit `4d07cbd7a`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Real IPC controller activity envelope: owner/generation/sequence fencing, exact replay receipts, poll non-renewal and resume**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | real IPC activity protocol fences owners, sequences, replays and resumed execution generations | `src/workflow/code-review/task-review/__tests__/controller-activity.test.ts` |

**integration: Controller/daemon expiry and persistence parity; capability/timing refusal and removed endpoints remain unavailable**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | controller and daemon share inactivity outcomes; controller write failure never returns accepted feedback | `src/workflow/code-review/task-review/__tests__/controller-activity.test.ts` |
| pass | controller feedback queued before expiry commits before a later inactivity callback | `src/workflow/code-review/task-review/__tests__/controller-activity.test.ts` |
| pass | real IPC activity protocol fences owners, sequences, replays and resumed execution generations | `src/workflow/code-review/task-review/__tests__/controller-activity.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/task-review/__tests__/controller-activity.test.ts` | 0 | 3 | 1.2 s |  |

## t5

Run at 2026-11-01T11:39:48.999Z on commit `4c250b16a`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

**integration: End-to-end deterministic recovery: two CLI adapters/routes, silent tools/local-pressure/unknown telemetry, no repeated completed task**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | native adapter plus real IPC persists feedback on both routes and CLIs, and terminal resume never reruns a CLI | `src/workflow/code-review/task-review/__tests__/activity-e2e.test.ts` |
| pass | both native adapters preserve feedback queued before expiry and never accept a failed checkpoint write | `src/workflow/code-review/task-review/__tests__/activity-e2e.test.ts` |
| pass | tool ages are independent, native sessions are fenced and a silent tool cannot renew inactivity | `src/shared/__tests__/review-activity.test.ts` |
| pass | inactivity diagnostics distinguish observed local pressure, remote wait and unknown without claiming a cause | `src/shared/__tests__/review-activity.test.ts` |
| pass | controller feedback queued before expiry commits before a later inactivity callback | `src/workflow/code-review/task-review/__tests__/controller-activity.test.ts` |
| pass | a non-JSON final Codex message cannot promote earlier JSON and terminal failure cannot accept later feedback | `src/agent/providers/__tests__/review-activity-stream.test.ts` |

**smoke: Production build plus focused task-review, provider, IPC and retired-boundary regression suites; no paid/live or full repository sweep**

Reported by the builder, not run by the gate: **pass**. Evidence: Final npm run build passed (/tmp/review-timeout-final-build.log). Prior focused serial task-review/shared-monitor/native-stream/CLI/Ollama/subprocess/retired-boundary/writer-inventory suite: 114 passed, 0 failed/skipped (/tmp/review-timeout-t5-regressions.log). Final native-finality and strengthened wrapper-exit/expiry/write-failure e2e recheck: 8 passed, 0 failed/skipped (/tmp/review-timeout-finality-regression.log). Synthetic frames and fake local CLIs, not live hosted-model acceptance. Only affected regressions repeated for final fix 4c250b16a.

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/review-activity-stream.test.ts` | 0 | 6 | 0.8 s |  |
| `src/shared/__tests__/review-activity.test.ts` | 0 | 5 | 0.7 s |  |
| `src/workflow/code-review/task-review/__tests__/activity-e2e.test.ts` | 0 | 2 | 2.2 s |  |
| `src/workflow/code-review/task-review/__tests__/controller-activity.test.ts` | 0 | 3 | 1.3 s |  |
