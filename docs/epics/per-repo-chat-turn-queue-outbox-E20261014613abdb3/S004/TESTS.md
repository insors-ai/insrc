<!-- insrc:artifact TESTS-613abdb351c2c738-s4 -->

# Tests: 613abdb351c2c738 s4

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 22 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

## t1

Run at 2026-10-14T17:28:09.450Z on commit `d4e8739f`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: chat-failure.test.ts: overloaded, rate limit, 429 and 5xx texts, timeouts and connection failures map to their causes**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | overloaded, rate limit, 429 and 5xx texts, timeouts and connection failures map to their causes | `vscode-plugin/src/chat/__tests__/chat-failure.test.ts` |

**unit: chat-failure.test.ts: the adapter's not-authenticated text and the CLIs' unauthorised and invalid key texts map to auth**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the adapter's not-authenticated text and the CLIs' unauthorised and invalid key texts map to auth | `vscode-plugin/src/chat/__tests__/chat-failure.test.ts` |

**unit: chat-failure.test.ts: CLI not found and any unmatched text, including a model refusal, map to other**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CLI not found and any unmatched text, including a model refusal, map to other | `vscode-plugin/src/chat/__tests__/chat-failure.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-failure.test.ts` | 0 | 3 | 0.3 s |  |

## t2

Run at 2026-10-14T17:29:43.129Z on commit `90130862`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: chat-queue-store.test.ts: an infrastructure failure before acting becomes retrying with attempts 1 and nextAttemptAt now plus 10 s, keeps its seq and error, and releases the lease**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an infrastructure failure before acting becomes retrying with attempts 1 and nextAttemptAt now plus 10 s, keeps its seq and error, and releases the lease | `vscode-plugin/src/chat/__tests__/chat-queue-store.test.ts` |

**integration: chat-queue-store.test.ts: attempts 1 and 2 use 1 min and 5 min, and a failure at attempts 3 becomes failed with the error**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | attempts 1 and 2 use 1 min and 5 min, and a failure at attempts 3 becomes failed with the error | `vscode-plugin/src/chat/__tests__/chat-queue-store.test.ts` |

**integration: chat-queue-store.test.ts: acted true, cause auth, cause other or a missing cause becomes failed with the error and is never retrying**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | acted true, cause auth, cause other or a missing cause becomes failed with the error and is never retrying | `vscode-plugin/src/chat/__tests__/chat-queue-store.test.ts` |

**integration: chat-queue-store.test.ts: retryNow makes a retrying row due at once with attempts unchanged and returns false for any other row**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | retryNow makes a retrying row due at once with attempts unchanged and returns false for any other row | `vscode-plugin/src/chat/__tests__/chat-queue-store.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-queue-store.test.ts` | 0 | 18 | 1 s |  |

## t3

Run at 2026-10-14T17:32:14.193Z on commit `ee431e5b`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: cli-adapter.test.ts: a claude result with is_error carries its text on done ok:false, a codex error result does too, and a successful result has no message**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a claude result with is_error carries its text on done ok:false, a codex error result does too, and a successful result has no message | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |

**unit: chat-queue-runner.test.ts: a queued turn that ends with done ok:false resolves failed with the text, not done**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a queued turn that ends with done ok:false resolves failed with the text, not done | `vscode-plugin/src/chat/__tests__/chat-queue-runner.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-queue-runner.test.ts` | 0 | 2 | 0.7 s |  |
| `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` | 0 | 83 | 1.3 s |  |

## t4

Run at 2026-10-14T17:34:40.823Z on commit `c81b9728`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: chat-queue-runner.test.ts: a turn that emitted a tool-call, file-edit or tool-result before its error reports acted true; one that failed with none reports acted false with the classified cause**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a turn that emitted a tool-call, file-edit or tool-result before its error reports acted true; one that failed with none reports acted false with the classified cause | `vscode-plugin/src/chat/__tests__/chat-queue-runner.test.ts` |

**unit: chat-queue-runner.test.ts: a claude is_error result with an overload text before any tool call is reported failed with the overload cause; the same after a file edit reports acted true**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a claude is_error result with an overload text before any tool call is reported failed with the overload cause; the same after a file edit reports acted true | `vscode-plugin/src/chat/__tests__/chat-queue-runner.test.ts` |

**unit: chat-queue-runner.test.ts: every failed turn's cause and error text are logged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | every failed turn's cause and error text are logged | `vscode-plugin/src/chat/__tests__/chat-queue-runner.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-queue-runner.test.ts` | 0 | 5 | 0.8 s |  |

## t5

Run at 2026-10-14T17:37:27.326Z on commit `1d8d49ab`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: chat-queue-runner.test.ts: a retried message is started with skipUserRow, so the stored transcript has a single user row after a retry while the prompt is still sent to the CLI**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a retried message is started with skipUserRow, so the stored transcript has a single user row after a retry while the prompt is still sent to the CLI | `vscode-plugin/src/chat/__tests__/chat-queue-runner.test.ts` |

**unit: chat-queue-runner.test.ts: a retry stores and posts one retrying line, still in the stored transcript after a reload, and a turn that streamed only text before an infrastructure failure is retried and keeps its partial text**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a retry stores and posts one retrying line, still in the stored transcript after a reload, and a turn that streamed only text before an infrastructure failure is retried and keeps its partial text | `vscode-plugin/src/chat/__tests__/chat-queue-runner.test.ts` |

**unit: chat-queue-runner.test.ts: an auth failure stores and posts a sign-in line in the chat**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an auth failure stores and posts a sign-in line in the chat | `vscode-plugin/src/chat/__tests__/chat-queue-runner.test.ts` |

**unit: chat-queue-runner.test.ts: a normal turn still pushes and echoes its user row exactly as before**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a normal turn still pushes and echoes its user row exactly as before | `vscode-plugin/src/chat/__tests__/chat-queue-runner.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-queue-runner.test.ts` | 0 | 9 | 0.9 s |  |

## t6

Run at 2026-10-14T17:39:15.006Z on commit `390de5ff`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: chat-queue-worker.test.ts: a finish that stays busy is retried each tick for 60 s, then retrying stops and one chat note is shown; a new worker for the same window frees the lease and fails the message with a resend**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a finish that stays busy is retried each tick for 60 s, then retrying stops and one chat note is shown; a new worker for the same window frees the lease and fails the message with a resend | `vscode-plugin/src/chat/__tests__/chat-queue-worker.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-queue-worker.test.ts` | 0 | 17 | 1.1 s |  |

## t7

Run at 2026-10-14T17:41:17.100Z on commit `846659f5`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: chat-queue-worker.test.ts: a retrying head is not taken before its due time, holds the queue behind it, and runs when due**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a retrying head is not taken before its due time, holds the queue behind it, and runs when due | `vscode-plugin/src/chat/__tests__/chat-queue-worker.test.ts` |

**unit: chat-queue-worker.test.ts: a message that fails three infrastructure retries ends failed and the next message runs**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a message that fails three infrastructure retries ends failed and the next message runs | `vscode-plugin/src/chat/__tests__/chat-queue-worker.test.ts` |

**unit: chat-queue-worker.test.ts: act retry-now on a retrying row runs it at the next tick; on any other row it is refused with a note**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | act retry-now on a retrying row runs it at the next tick; on any other row it is refused with a note | `vscode-plugin/src/chat/__tests__/chat-queue-worker.test.ts` |

**unit: chat-outbox.test.ts: a retrying row carries attempt and nextAttemptAt**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a retrying row carries attempt and nextAttemptAt | `vscode-plugin/src/chat/__tests__/chat-outbox.test.ts` |

**unit: chat-shell.test.ts: a retrying row shows 'attempt n of 3', a countdown, a retry-now button and a cancel button, and retry-now posts outbox-retry-now with its seq**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a retrying row shows 'attempt n of 3', a countdown, a retry-now button and a cancel button, and retry-now posts outbox-retry-now with its seq | `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-outbox.test.ts` | 0 | 3 | 0.4 s |  |
| `vscode-plugin/src/chat/__tests__/chat-queue-worker.test.ts` | 0 | 20 | 1.1 s |  |
| `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` | 0 | 10 | 0.5 s |  |

## t8

Run at 2026-10-14T17:45:07.374Z on commit `1bd89556`. Tests check: **failed**. 0 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

no test files to run; reported as failed by the builder: hand check with a real provider failure: a passing provider error before acting waits, shows its countdown and runs again; retry-now runs it at once; a failure after an edit stays failed

**live: hand check with a real provider failure: a passing provider error before acting waits, shows its countdown and runs again; retry-now runs it at once; a failure after an edit stays failed**

Reported by the builder, not run by the gate: **fail**. Evidence: NOT RUN - no real provider failure could be produced from the build session; unverified, not passed. Labelled fault-injection evidence (a scripted fake claude CLI, not a real provider): vscode-plugin/src/chat/__tests__/chat-queue-fault-injection.test.ts, described in the BUILD summary.
