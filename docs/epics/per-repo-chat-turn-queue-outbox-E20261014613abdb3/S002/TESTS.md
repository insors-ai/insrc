<!-- insrc:artifact TESTS-613abdb351c2c738-s2 -->

# Tests: 613abdb351c2c738 s2

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-14T12:57:26.478Z on commit `22a97654`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: schema 2: a fresh queue file is created with the waiting_on column at version 2, and a processing row can be marked waiting**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | schema 2: a fresh queue file is created with the waiting_on column at version 2, and a processing row can be marked waiting | `vscode-plugin/src/chat/__tests__/chat-queue-store.test.ts` |

**integration: schema upgrade: a version-1 queue file opens as version 2 with its rows kept and waitingOn empty, and a newer file is still refused**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | schema upgrade: a version-1 queue file opens as version 2 with its rows kept and waitingOn empty, and a newer file is still refused | `vscode-plugin/src/chat/__tests__/chat-queue-store.test.ts` |

**integration: markWaiting sets and clears waitingOn on a processing row only**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | markWaiting sets and clears waitingOn on a processing row only | `vscode-plugin/src/chat/__tests__/chat-queue-store.test.ts` |

**integration: resendFrom: a failed or not-delivered message joins the back with its text and attachments under the given window key; any other state is refused**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | resendFrom: a failed or not-delivered message joins the back with its text and attachments under the given window key; any other state is refused | `vscode-plugin/src/chat/__tests__/chat-queue-store.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-queue-store.test.ts` | 0 | 6 | 0.9 s |  |
