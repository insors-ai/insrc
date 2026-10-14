<!-- insrc:artifact TESTS-613abdb351c2c738-s1 -->

# Tests: 613abdb351c2c738 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-14T11:13:11.458Z on commit `f6de7994`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: chat queue store: enqueue, head, acknowledge and finish keep seq order, acknowledge a message at most once and only with the lease free, delete a done message, turn a stopped one into failed with a resend, and refuse an enqueue with a note at 500 live rows**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chat queue store: enqueue, head, acknowledge and finish keep seq order, acknowledge a message at most once and only with the lease free, delete a done message, turn a stopped one into failed with a resend, and refuse an enqueue with a note at 500 live rows | `vscode-plugin/src/chat/__tests__/chat-queue-store.test.ts` |

**integration: chat queue store: two processes on one database file acknowledging the same head at the same moment: exactly one succeeds and the message is processing once**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chat queue store: two processes on one database file acknowledging the same head at the same moment: exactly one succeeds and the message is processing once | `vscode-plugin/src/chat/__tests__/chat-queue-store.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-queue-store.test.ts` | 0 | 2 | 0.9 s |  |
