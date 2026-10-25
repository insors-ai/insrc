<!-- insrc:artifact TESTS-83c85f38afad7843-s1 -->

# Tests: 83c85f38afad7843 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 22 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

## t1

Run at 2026-10-25T17:24:18.514Z on commit `61a431be2`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: bounded prefix selects only requested turn and complete pre-checkpoint lines**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | bounded prefix selects only requested turn and complete pre-checkpoint lines | `vscode-plugin/src/chat/__tests__/session-output.test.ts` |

**integration: bounded prefix terminates while writer lives; abort, rotated generation and missing marker**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | bounded prefix terminates while writer lives; abort, rotated generation and missing marker | `vscode-plugin/src/chat/__tests__/session-output.test.ts` |

**integration: existing default session-output tail behavior**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | tailing again from a yielded cursor resumes exactly after that line; a segment without a turn-end marker ends at the next turn-start or once the writer is finished | `vscode-plugin/src/chat/__tests__/session-output.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/session-output.test.ts` | 0 | 7 | 0.5 s |  |

## t2

Run at 2026-10-25T17:31:24.648Z on commit `8b1a25dec`. Tests check: **passed**. 10 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: only designated request UUID singular/list result ends new Claude turn**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | only singular or merged request UUID results complete, including empty and failed own results | `vscode-plugin/src/chat/__tests__/cli-adapter-correlation.test.ts` |

**unit: earlier empty/failed/uncorrelated results retain real assistant/tool reply**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | queued results cannot truncate the actual user reply | `vscode-plugin/src/chat/__tests__/cli-adapter-correlation.test.ts` |
| pass | live pipe and retained output preserve tools and final reply after a queued result | `vscode-plugin/src/chat/__tests__/cli-adapter-correlation.test.ts` |

**unit: own empty/error result returns before process exit without kill**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | only singular or merged request UUID results complete, including empty and failed own results | `vscode-plugin/src/chat/__tests__/cli-adapter-correlation.test.ts` |

**unit: stream input preserves prompt/options and permission relay; input/EOF failures**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | stream input preserves exact prompt and options, and missing correlation cannot synthesize success | `vscode-plugin/src/chat/__tests__/cli-adapter-correlation.test.ts` |
| pass | initial input write failure stops the process and returns a visible error without retry | `vscode-plugin/src/chat/__tests__/cli-adapter-correlation.test.ts` |
| pass | correlated EOF retains partial output and reports native nonzero exit or missing result | `vscode-plugin/src/chat/__tests__/cli-adapter-correlation.test.ts` |
| pass | S004 t5: decide() writes the correct control response for a live requestId; stale/unknown -> no-op (<=1 write per id) | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |

**integration: file/pipe live and midstream correlated reattach checkpoint handling**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | correlated resume reconstructs identity after acknowledgement and checkpoints its own terminal | `vscode-plugin/src/chat/__tests__/cli-adapter-correlation.test.ts` |
| pass | live pipe and retained output preserve tools and final reply after a queued result | `vscode-plugin/src/chat/__tests__/cli-adapter-correlation.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/cli-adapter-correlation.test.ts` | 0 | 7 | 0.5 s |  |
| `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` | 0 | 88 | 1.4 s |  |

## t3

Run at 2026-10-25T17:41:14.810Z on commit `b305e41a1`. Tests check: **passed**. 9 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

**integration: legacy failed result survives two reloads without repeated visible content**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | legacy failed result survives two reloads without duplicate visible output | `vscode-plugin/src/chat/__tests__/cli-adapter-correlation.test.ts` |

**integration: legacy multiple-result EOF, abort, retention, stop and PID reuse**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | legacy replay waits through multiple results and reports missing retained prefixes explicitly | `vscode-plugin/src/chat/__tests__/cli-adapter-correlation.test.ts` |
| pass | bounded prefix terminates while writer lives; abort, rotated generation and missing marker | `vscode-plugin/src/chat/__tests__/session-output.test.ts` |
| pass | resume()'s handed-over process stops the recorded pid's group only while its start time matches | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |

**integration: Codex item versus turn completion and existing queue/panel/lifecycle/UTF8 suites**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Codex item completion retains content and native turn completion does not wait for exit | `vscode-plugin/src/chat/__tests__/cli-adapter-correlation.test.ts` |
| pass | CLI pipe fallback preserves UTF-8 across stdout lines and stderr chunks | `vscode-plugin/src/chat/__tests__/cli-adapter-utf8.test.ts` |
| pass | a queued turn that ends with done ok:false resolves failed with the text, not done | `vscode-plugin/src/chat/__tests__/chat-queue-runner.test.ts` |
| pass | S004 t7: permission-decision is relayed to the live turn adapter.decide with (turnId, requestId, decision) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | a turn whose output ends without a done or error event ends as an error | `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` |

**smoke: plugin noEmit TypeScript and full plugin test suite with baseline accounting**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/standalone/keep-chat-turn-s-reply-when-E2026101383c85f38/S001/VERIFICATION.md — plugin TypeScript clean; affected 150/150 pass; full plugin 1430 pass/7 fail/8 skip, all 7 failures reproduced on pre-change commit 3752402643a200109864ca67b5281f7d3c7ce613. This is passing baseline accounting, not a green full suite.

**live: serial bounded installed-Claude new/resumed adapter smoke and Codex protocol verification**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/standalone/keep-chat-turn-s-reply-when-E2026101383c85f38/S001/adapter-native-smoke.json — Claude 2.1.310 actual new ACK and resumed ACK2; verification.json records Codex 0.164.0 exec-help/fixture inspection, independent item/turn regression. No live Codex model call.

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` | 0 | 163 | 4.5 s |  |
| `vscode-plugin/src/chat/__tests__/chat-queue-runner.test.ts` | 0 | 11 | 0.9 s |  |
| `vscode-plugin/src/chat/__tests__/cli-adapter-correlation.test.ts` | 0 | 11 | 0.5 s |  |
| `vscode-plugin/src/chat/__tests__/cli-adapter-utf8.test.ts` | 0 | 1 | 0.5 s |  |
| `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` | 0 | 88 | 1.4 s |  |
| `vscode-plugin/src/chat/__tests__/session-output.test.ts` | 0 | 7 | 0.5 s |  |
| `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` | 0 | 32 | 1.8 s |  |
