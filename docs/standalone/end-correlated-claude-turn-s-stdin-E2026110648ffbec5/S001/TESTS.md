<!-- insrc:artifact TESTS-48ffbec56130edb6-s1 -->

# Tests: 48ffbec56130edb6 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 9 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

## t1

Run at 2026-11-06T13:28:10.089Z on commit `1baaeffb4`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: cli-adapter-correlation.test.ts: an abandoned session-file Claude turn ends its input once and is not killed**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an abandoned session-file Claude turn ends its input once and is not killed | `vscode-plugin/src/chat/__tests__/cli-adapter-correlation.test.ts` |

**unit: cli-adapter-correlation.test.ts: an abandoned pipe turn ends its input and is stopped with SIGTERM**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an abandoned pipe turn ends its input and is stopped with SIGTERM | `vscode-plugin/src/chat/__tests__/cli-adapter-correlation.test.ts` |

**unit: cli-adapter-correlation.test.ts: a throwing endInput does not stop the finally's cleanup**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a throwing endInput does not stop the finally's cleanup | `vscode-plugin/src/chat/__tests__/cli-adapter-correlation.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/cli-adapter-correlation.test.ts` | 0 | 18 | 0.5 s |  |

## t2

Run at 2026-11-06T13:31:56.218Z on commit `d3498207a`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: cli-adapter-correlation.test.ts: a correlated Claude turn ends the CLI stdin at its own result, not before**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a correlated Claude turn ends the CLI stdin at its own result, not before | `vscode-plugin/src/chat/__tests__/cli-adapter-correlation.test.ts` |
| pass | the real spawner with closeInput starts a process that reads its input to the end at once; without it the process waits | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |
| pass | CLI pipe fallback preserves UTF-8 across stdout lines and stderr chunks | `vscode-plugin/src/chat/__tests__/cli-adapter-utf8.test.ts` |
| pass | a turn's segment is the lines between its turn-start and turn-end markers; tail yields only complete CLI lines with the cursor after each, skips marker lines, holds back a half-written line until its newline, and follows growth until the writer finishes | `vscode-plugin/src/chat/__tests__/session-output.test.ts` |

**unit: cli-adapter-correlation.test.ts: an abandonment after the result adds no second call**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an abandonment after the result adds no second call | `vscode-plugin/src/chat/__tests__/cli-adapter-correlation.test.ts` |

**unit: cli-adapter-correlation.test.ts: an abandoned Codex turn never calls endInput**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an abandoned Codex turn never calls endInput | `vscode-plugin/src/chat/__tests__/cli-adapter-correlation.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/cli-adapter-correlation.test.ts` | 0 | 18 | 0.5 s |  |
| `vscode-plugin/src/chat/__tests__/cli-adapter-utf8.test.ts` | 0 | 1 | 0.4 s |  |
| `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` | 0 | 99 | 1.4 s |  |
| `vscode-plugin/src/chat/__tests__/session-output.test.ts` | 0 | 16 | 1.4 s |  |

## t3

Run at 2026-11-06T13:35:13.686Z on commit `3038b53b8`. Tests check: **passed**. 0 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

the gate ran no test: every named test of this Task was reported by the builder

**live: real claude CLI: close stdin mid-turn, the turn completes with the matching request id and the process exits 0**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/standalone/end-correlated-claude-turn-s-stdin-E2026110648ffbec5/S001/LIVE-CHECKS.md, section 'mid': RESULT is_error=false uuid_match=true at 15.6s, EXIT code=0 at 16.2s after stdin was closed at 5.0s

**live: real claude CLI: stdin left open idles after the result; closing it at the result lets background work finish**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/standalone/end-correlated-claude-turn-s-stdin-E2026110648ffbec5/S001/LIVE-CHECKS.md, sections 'none' (result at 15.8s, still alive at the 75.1s kill) and 'after' (correlated result 3.5s, background result 25.1s, EXIT code=0 at 25.7s, bg.txt written)
