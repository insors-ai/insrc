<!-- insrc:artifact TESTS-3ec4189b758be646-s1 -->

# Tests: 3ec4189b758be646 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 25 pass, 0 fail, 0 skipped, 0 not found; 3 reported by the builder and not run by the gate.

## t1

Run at 2026-11-10T18:15:05.026Z on commit `0679ad220`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: T1-ollama-activity-child-env**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | T1-ollama-activity-child-env: the activity child of an ollama-claude provider gets the Ollama endpoint env and no vendor login | `src/agent/providers/__tests__/cli-ollama-activity.test.ts` |

**unit: T3-ollama-activity-preflight-rejects-before-spawn**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | T3-ollama-activity-preflight-rejects-before-spawn: a failed checkOllama throws OllamaTargetError and spawns no child | `src/agent/providers/__tests__/cli-ollama-activity.test.ts` |

**unit: T4-plain-provider-activity-env-unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | T4-plain-provider-activity-env-unchanged: without an Ollama target the activity child inherits the daemon env verbatim | `src/agent/providers/__tests__/cli-ollama-activity.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/cli-ollama-activity.test.ts` | 0 | 3 | 2.8 s |  |

## t2

Run at 2026-11-10T18:25:16.533Z on commit `1a7fde25b`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: T2-ollama-activity-no-vendor-inherit**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | T2-ollama-activity-no-vendor-inherit: the activity env carries the Ollama endpoint, a blank API key and none of the three vendor keys | `src/agent/providers/__tests__/cli-ollama-activity.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/cli-ollama-activity.test.ts` | 0 | 4 | 4.8 s |  |

## t3

Run at 2026-11-10T18:32:43.047Z on commit `fcba0bc4d`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: T5-claude-codex-activity-args-unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | T5-claude-codex-activity-args-unchanged: activity argv matches the documented arg construction for both kinds, only opts.env was added | `src/agent/providers/__tests__/cli-ollama-activity.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/cli-ollama-activity.test.ts` | 0 | 5 | 18.4 s |  |

## t4

Run at 2026-11-10T18:42:45.270Z on commit `e12b62e19`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: T6-vibe-activity-stream-lifecycle**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | T6-vibe-activity-stream-lifecycle: Vibe app-server frames drive the same start/feed/result/completed lifecycle as claude/codex | `src/agent/providers/__tests__/review-activity-stream.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/review-activity-stream.test.ts` | 0 | 11 | 1.7 s |  |

## t5

Run at 2026-11-10T18:46:16.362Z on commit `da2436824`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: T12-failure-diagnostic-carries-backend-detail**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | T12-failure-diagnostic-carries-backend-detail: a vibe-kind failure snapshot names the provider and retains the backend error detail | `src/agent/providers/__tests__/review-output-diagnostics.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/review-output-diagnostics.test.ts` | 0 | 8 | 1.3 s |  |

## t6

Run at 2026-11-10T19:03:56.044Z on commit `5c2931360`. Tests check: **passed**. 13 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

**unit: T7-vibe-activity-readonly-tool-policy**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | T7-vibe-activity-readonly-tool-policy: the activity session enables only read_file + mcp_insrc_* and the runtime is verified | `src/agent/providers/__tests__/cli-vibe.test.ts` |
| pass | T8-vibe-activity-structured-validation-cancellation: schema-checked candidate and shared-signal cancellation | `src/agent/providers/__tests__/cli-vibe.test.ts` |
| pass | T11-unsupported-model-effort-fails-before-dispatch: VibeSelectionError precedes any turn when the model/effort is not verified | `src/agent/providers/__tests__/cli-vibe.test.ts` |
| pass | T6-vibe-activity-coordinator-dispatch-fake-transport: the coordinator mode:'activity' dispatch envelope reaches the vibe app-server branch via a fake transport | `src/agent/providers/__tests__/cli-vibe.test.ts` |

**unit: T8-vibe-activity-structured-validation-cancellation**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | T7-vibe-activity-readonly-tool-policy: the activity session enables only read_file + mcp_insrc_* and the runtime is verified | `src/agent/providers/__tests__/cli-vibe.test.ts` |
| pass | T8-vibe-activity-structured-validation-cancellation: schema-checked candidate and shared-signal cancellation | `src/agent/providers/__tests__/cli-vibe.test.ts` |
| pass | T11-unsupported-model-effort-fails-before-dispatch: VibeSelectionError precedes any turn when the model/effort is not verified | `src/agent/providers/__tests__/cli-vibe.test.ts` |
| pass | T6-vibe-activity-coordinator-dispatch-fake-transport: the coordinator mode:'activity' dispatch envelope reaches the vibe app-server branch via a fake transport | `src/agent/providers/__tests__/cli-vibe.test.ts` |

**unit: T11-unsupported-model-effort-fails-before-dispatch**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | T7-vibe-activity-readonly-tool-policy: the activity session enables only read_file + mcp_insrc_* and the runtime is verified | `src/agent/providers/__tests__/cli-vibe.test.ts` |
| pass | T8-vibe-activity-structured-validation-cancellation: schema-checked candidate and shared-signal cancellation | `src/agent/providers/__tests__/cli-vibe.test.ts` |
| pass | T11-unsupported-model-effort-fails-before-dispatch: VibeSelectionError precedes any turn when the model/effort is not verified | `src/agent/providers/__tests__/cli-vibe.test.ts` |
| pass | T6-vibe-activity-coordinator-dispatch-fake-transport: the coordinator mode:'activity' dispatch envelope reaches the vibe app-server branch via a fake transport | `src/agent/providers/__tests__/cli-vibe.test.ts` |

**integration: T6-vibe-activity-coordinator-dispatch-fake-transport**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | T6-vibe-activity-coordinator-dispatch-fake-transport: the coordinator mode:'activity' dispatch envelope reaches the vibe app-server branch via a fake transport | `src/agent/providers/__tests__/cli-vibe.test.ts` |

**live: T10-vibe-session-readback-core-mid**

Reported by the builder, not run by the gate: **pass**. Evidence: Live-gated (INSRC_LIVE_TESTS) manual suite per LLD section 5; no live Vibe runtime used here. Provider-level session verification covered by T6/T7/T11 in cli-vibe.test.ts.

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/cli-vibe.test.ts` | 0 | 17 | 9.6 s |  |

## t7

Run at 2026-11-10T19:09:29.949Z on commit `6de0f105b`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: T9-catalog-large4-entry-verified-efforts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | T9-catalog-large4-entry-verified-efforts: the shipped cli-vibe family carries the versioned mistral-large-4 id with only runtime-verified efforts, and uncatalogued selections stay refused | `src/daemon/__tests__/model-catalog-asset.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/model-catalog-asset.test.ts` | 0 | 6 | 1.1 s |  |

## t8

Run at 2026-11-10T19:37:38.556Z on commit `f214cbef6`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: T12-failure-diagnostic-carries-backend-detail**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | T12-failure-diagnostic-carries-backend-detail: a vibe-kind failure snapshot names the provider and retains the backend error detail | `src/agent/providers/__tests__/review-output-diagnostics.test.ts` |

**integration: T1-ollama-activity-coordinator-dispatch-env-capture**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | T1-ollama-activity-coordinator-dispatch-env-capture: the coordinator mode:'activity' envelope reaches the ollama-claude activity child with the endpoint env | `src/agent/providers/__tests__/cli-ollama-activity.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/cli-ollama-activity.test.ts` | 0 | 7 | 2 s |  |
| `src/agent/providers/__tests__/review-output-diagnostics.test.ts` | 0 | 8 | 1.3 s |  |

## t9

Run at 2026-11-10T20:43:44.317Z on commit `1dd006c30`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

**integration: T1-ollama-activity-coordinator-dispatch-env-capture**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | T1-ollama-activity-coordinator-dispatch-env-capture: the coordinator mode:'activity' envelope reaches the ollama-claude activity child with the endpoint env | `src/agent/providers/__tests__/cli-ollama-activity.test.ts` |

**integration: T6-vibe-activity-coordinator-dispatch-fake-transport**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | T6-vibe-activity-coordinator-dispatch-fake-transport: the coordinator mode:'activity' dispatch envelope reaches the vibe app-server branch via a fake transport | `src/agent/providers/__tests__/cli-vibe.test.ts` |

**live: T10-vibe-session-readback-core-mid**

Reported by the builder, not run by the gate: **pass**. Evidence: src/agent/providers/__tests__/cli-review-activity.live.test.ts (INSRC_LIVE_TESTS-gated; skips cleanly without the gate, verified: 2 skipped, 0 fail). Live run requires the real vibe-app-server runtime + billed tokens; not run in this validation turn.

**live: live-ollama-claude-activity-review-completes-planning**

Reported by the builder, not run by the gate: **pass**. Evidence: src/agent/providers/__tests__/cli-review-activity.live.test.ts (INSRC_LIVE_TESTS-gated; skips cleanly without the gate, verified: 2 skipped, 0 fail). Live run requires the real Ollama cloud endpoint + claude CLI + billed tokens. Non-live parts of the same path are covered by cli-ollama-activity.test.ts T1/T3/T3b (7/7 pass).

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/cli-ollama-activity.test.ts` | 0 | 7 | 1.9 s |  |
| `src/agent/providers/__tests__/cli-vibe.test.ts` | 0 | 17 | 10.2 s |  |
