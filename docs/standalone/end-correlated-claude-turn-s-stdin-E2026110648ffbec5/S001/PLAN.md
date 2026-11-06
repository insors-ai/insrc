<!-- insrc:artifact PLAN-48ffbec56130edb6-s1 -->

# Plan: STORY-48ffbec56130edb6-s1

## Summary

**Epic:** `end-correlated-claude-turn-s-stdin`
**LLD run:** `wf-1793964843326-pinqsk`
**LLD effective hash:** `50f12d0b1163...`

The build is one small edit to the Claude adapter's cleanup path plus its tests. Task 1 adds the branch that ends a correlated turn's input when its reader is abandoned, task 2 pins it with unit tests in the correlation suite, and task 3 records the two real-CLI checks as reported results. Nothing in the lifecycle, the panel or the observer changes.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** End a correlated turn's input in run()'s finally when its reader is abandoned | S | — | — | unit: cli-adapter-correlation.test.ts: an abandoned session-file Claude turn ends its input once and is not killed; unit: cli-adapter-correlation.test.ts: an abandoned pipe turn ends its input and is stopped with SIGTERM; unit: cli-adapter-correlation.test.ts: a throwing endInput does not stop the finally's cleanup | [[c1]] [[c2]] [[c3]] [[c4]] [[c6]] |
| 2 | **`t2`** Unit tests for abandonment and the cases that must not close | S | — | `t1` | unit: cli-adapter-correlation.test.ts: a correlated Claude turn ends the CLI stdin at its own result, not before; unit: cli-adapter-correlation.test.ts: an abandonment after the result adds no second call; unit: cli-adapter-correlation.test.ts: an abandoned Codex turn never calls endInput | [[c5]] [[c3]] [[c4]] |
| 3 | **`t3`** Record the two live checks as reported results | S | — | `t1` | live: real claude CLI: close stdin mid-turn, the turn completes with the matching request id and the process exits 0; live: real claude CLI: stdin left open idles after the result; closing it at the result lets background work finish | [[c5]] [[c6]] |

### 1.1 TASK-48ffbec56130edb6-s1-t1 — End a correlated turn's input in run()'s finally when its reader is abandoned

In run()'s finally in vscode-plugin/src/chat/cli-adapter.ts, add the branch for a correlated turn (state.requestUuid defined) with no terminal event: call the endInput() seam once before the existing pipe-turn kill, shielded so a throwing seam cannot skip the rest of the cleanup. Nothing else changes: no early close, no change to the lifecycle, the panel or the observer.

**Acceptance checks:**
- An abandoned correlated session-file turn ends its input once and is not killed
- An abandoned correlated pipe turn ends its input and is still stopped with SIGTERM
- A turn that reached its terminal event adds no second endInput call from the finally
- A throwing endInput does not skip the pipe-turn kill or the pending-request cleanup
- Codex and Vibe turns never call endInput

### 1.2 TASK-48ffbec56130edb6-s1-t2 — Unit tests for abandonment and the cases that must not close

Add the tests to vscode-plugin/src/chat/__tests__/cli-adapter-correlation.test.ts: an abandoned session-file turn, an abandoned pipe turn, no early close and no second call after the result, a throwing endInput, and an abandoned Codex turn, using the fake spawner's inputEnds() and signals() handles and iterator return() to abandon the reader.

**Acceptance checks:**
- Each test named in the LLD's test strategy exists and passes
- The two existing endInput tests stay green
- The full cli-adapter, correlation, utf8 and session-output suites stay green

### 1.3 TASK-48ffbec56130edb6-s1-t3 — Record the two live checks as reported results

Re-run the real-CLI checks (EOF mid-turn finishes the turn and exits 0; stdin left open idles after the result; closing at the result lets background work finish) from the throwaway scripts, and pass them to the build's validate as reported test results. Because the scripts are not in the repository, the evidence is the exact timings, request-id match and exit codes copied into the reported evidence.

**Acceptance checks:**
- The mid-turn EOF run completes with the matching request id and exit code 0
- The open-stdin run idles after its result until killed
- The background-task run completes the background work before exit 0
- Both are recorded as reported results whose evidence holds the timings and exit codes

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| vscode-plugin/src/chat/__tests__/cli-adapter-correlation.test.ts: an abandoned session-file Claude turn ends its input once and is not killed | `t1` |
| same file: an abandoned pipe turn ends its input and is stopped with SIGTERM | `t1` |
| same file: nothing ends the input before the correlated result (existing test stays green), and an abandonment after the result adds no second call | `t2` |
| same file: a throwing endInput does not stop the finally's cleanup | `t1` |
| same file: an abandoned Codex turn never calls endInput (extends the existing prompt-argument test) | `t2` |
| real claude CLI: close stdin mid-turn, the turn completes with the matching request id and the process exits 0 | `t3` |
| real claude CLI: stdin left open idles after the result; closing it at the result lets background work finish | `t3` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s1 contract: run() abandonment behaviour in the finally`
- **[[c2]]** `prior-artifact` `LLD s1 contract: the endInput seam, idempotent and optional`
- **[[c3]]** `prior-artifact` `LLD s1 data model change: the run() abandonment contract`
- **[[c4]]** `prior-artifact` `LLD s1 error paths: throwing seam, CLI not exiting, pending approval`
- **[[c5]]** `prior-artifact` `LLD s1 test strategy: unit and live levels, acceptance mapping ac1 to ac3`
- **[[c6]]** `prior-artifact` `LLD s1 migration: finally branch, tests, live checks as reported results`
