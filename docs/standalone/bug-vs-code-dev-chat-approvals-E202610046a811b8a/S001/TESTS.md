<!-- insrc:artifact TESTS-6a811b8acca60ac5-s1 -->

# Tests: 6a811b8acca60ac5 S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 27 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

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

## t3

Run at 2026-10-12T06:15:46.832Z on commit `283285a0`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: three requests in one turn: only the first card is posted (with '1 of 3')**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | three requests in one turn: only the first card is posted (with '1 of 3') | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**integration: a turn followed after reload routes its approval-requests through the queue and its end ends the batch**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a turn followed after reload routes its approval-requests through the queue and its end ends the batch | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**integration: Stop with requests queued records each as rejected and clears the queue**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Stop with requests queued records each as rejected and clears the queue | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**integration: outcome rows: one role:'permission-outcome' row per decision, in decision order, and no approval-request rows (restore shows only chips)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | outcome rows: one role:'permission-outcome' row per decision, in decision order, and no approval-request rows (restore shows only chips) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` | 0 | 118 | 1.9 s |  |

## t4

Run at 2026-10-12T06:11:45.853Z on commit `3c8fee28`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: the second card is posted only after the first is decided; a decision on a waiting card's id does nothing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the second card is posted only after the first is decided; a decision on a waiting card's id does nothing | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**integration: live-turn provider with two requests: decide() is called for the first before the second card is posted; no follow-up turn is started**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | live-turn provider with two requests: decide() is called for the first before the second card is posted; no follow-up turn is started | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**integration: an in-turn request that carries a toolName is relayed with decide(), not batched (routing by resolution)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an in-turn request that carries a toolName is relayed with decide(), not batched (routing by resolution) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S001 (bugfix): an in-turn request is relayed to adapter.decide (codex/in-turn relay); an id the host does not hold still falls through | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` | 0 | 114 | 1.6 s |  |

## t5

Run at 2026-10-12T06:15:07.976Z on commit `283285a0`. Tests check: **passed**. 10 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: approving all three starts exactly one follow-up turn, after the last decision and the turn's end, with allowedTools = all three tools and a prompt naming the three approved actions**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | approving all three starts exactly one follow-up turn, after the last decision and the turn's end, with allowedTools = all three tools and a prompt naming the three approved actions | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**integration: no approval ever supersedes a running follow-up: turns.start is called once per batch**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | no approval ever supersedes a running follow-up: turns.start is called once per batch | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**integration: deny: a denied request gets a rejected chip, the next request is still asked, and the follow-up names it as denied; all denied -> no follow-up and an informational message**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | deny: a denied request gets a rejected chip, the next request is still asked, and the follow-up names it as denied; all denied -> no follow-up and an informational message | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**integration: a follow-up that is refused again forms the next batch and its follow-up carries the previous batch's grants**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a follow-up that is refused again forms the next batch and its follow-up carries the previous batch's grants | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**integration: single request: the existing approve/deny/exact-command/tool-name/dir-block/suppressEcho tests keep passing unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | S001 (bugfix): Approve on a tool-gate WITH a command re-runs naming the EXACT command (not the vague nudge) + pre-allows the tool | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S001 (bugfix): Approve on a tool-gate WITHOUT a command falls back to the tool-name phrasing (+ allowedTools) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S001 (bugfix): Approve on a dir-block does NOT re-run/grant — it posts an informational message; argv/allowlist untouched | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S001 (bugfix) + S003 (ux polish): Deny drops both a tool-gate and a dir-block — no re-run; posts ONLY the rejected outcome chip | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S003 ac2: approving a tool-gate WITH a command re-runs with [toolName] but posts ZERO user-row echoes (suppressEcho) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S003 ac2: the tool-name FALLBACK grant (no command) also suppresses the echo + records the approved outcome | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` | 0 | 118 | 1.9 s |  |

## t6

Run at 2026-10-12T06:17:50.408Z on commit `ecac0875`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: a user-typed message while requests are queued records each as rejected, clears the queue, resets the grant chain and runs as a normal turn**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a user-typed message while requests are queued records each as rejected, clears the queue, resets the grant chain and runs as a normal turn | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**integration: a live provider with a queued in-turn request, then the user types a message: decide(turnId, requestId, 'deny') is called before the new turn starts, and the request gets a rejected chip**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a live provider with a queued in-turn request, then the user types a message: decide(turnId, requestId, 'deny') is called before the new turn starts, and the request gets a rejected chip | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` | 0 | 120 | 1.9 s |  |

## t7

Run at 2026-10-12T06:47:31.425Z on commit `88db0f22`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: approval renderer: with position/total and total > 1 the card shows '1 of 3'; without them it renders exactly as before**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | approval renderer: with position/total and total > 1 the card shows '1 of 3'; without them it renders exactly as before | `vscode-plugin/src/chat/__tests__/render-registry.test.ts` |

**integration: a request joining the queue while the head is shown updates the shown card in place (one card per requestId)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a request joining the queue while the head is shown updates the shown card in place (one card per requestId) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**integration: reloading the webview while requests are queued re-posts the head card, and deciding it continues the queue**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | reloading the webview while requests are queued re-posts the head card, and deciding it continues the queue | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` | 0 | 122 | 1.9 s |  |
| `vscode-plugin/src/chat/__tests__/render-registry.test.ts` | 0 | 68 | 0.3 s |  |
