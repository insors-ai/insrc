<!-- insrc:artifact TESTS-6a811b8acca60ac5-S001 -->

# Tests: 6a811b8acca60ac5 S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-12T05:58:45.405Z on commit `a5b917cb`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: approval queue: requests are kept in arrival order and only the head is actionable; a decision for any other id is refused**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | approval queue: requests are kept in arrival order and only the head is actionable; a decision for any other id is refused | `vscode-plugin/src/chat/__tests__/approval-queue.test.ts` |

**unit: approval queue: a batch is complete only when its turn has ended and every request is decided**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | approval queue: a batch is complete only when its turn has ended and every request is decided | `vscode-plugin/src/chat/__tests__/approval-queue.test.ts` |

**unit: approval queue: the grant chain accumulates approved tool names once each and resets on clear()**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | approval queue: the grant chain accumulates approved tool names once each and resets on clear() | `vscode-plugin/src/chat/__tests__/approval-queue.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/approval-queue.test.ts` | 0 | 3 | 0.3 s |  |

## t2

Run at 2026-10-12T06:00:19.431Z on commit `38001c26`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: claude permission_denied emits resolution 'turn-ended'; control-protocol and codex approval requests emit resolution 'in-turn'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | claude permission_denied emits resolution 'turn-ended'; control-protocol and codex approval requests emit resolution 'in-turn' | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` | 0 | 76 | 1 s |  |
