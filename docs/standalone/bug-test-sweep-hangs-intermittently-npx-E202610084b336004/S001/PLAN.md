<!-- insrc:artifact PLAN-4b33600426ce4112-s1 -->

# Plan: STORY-4b33600426ce4112-s1

## Summary

**Epic:** `bug-test-sweep-hangs-intermittently-npx`
**LLD run:** `wf-1795856871448-vln4i8`
**LLD effective hash:** `290a411de989...`

Build the sweep-hang fix in four small tasks: keep the exec-stand-in test server ref'd while installed (drops server.unref()), give bare test sweeps a finite default per-test timeout via a package.json sweep script documented in docs/testing.md, smoke-verify the repro sweep terminates on every run, and regression-check that the harness gate path is unchanged.

## Contents

1. [Epic impact analysis](#1-epic-impact-analysis)
2. [Tasks](#2-tasks)
3. [Test-strategy coverage](#3-test-strategy-coverage)
4. [References](#4-references)

## 1. Epic impact analysis

**Does not apply**: Standalone ISSUE-anchored bugfix.

## 2. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Drop server.unref() in the exec-stand-in test helper | S | — | — | unit: exec-stand-in keeps its server ref'd while installed | [[c1]] [[c3]] |
| 2 | **`t2`** Give the bare sweep a finite default per-test timeout | S | — | — | integration: bare sweep with the default timeout terminates and reports every file | [[c2]] [[c3]] |
| 3 | **`t3`** Smoke-verify the repro sweep terminates on every run | S | — | `t1`, `t2` | smoke: repro sweep finishes within the bound on every attempt | [[c2]] [[c3]] |
| 4 | **`t4`** Regression: harness gate path unchanged | S | — | `t1` | unit: harness run of the touched helper file passes | [[c1]] [[c2]] [[c3]] |

### 2.1 TASK-4b33600426ce4112-s1-t1 — Drop server.unref() in the exec-stand-in test helper

src/workflow/__tests__/helpers/exec-stand-in.ts: keep the gh/git stand-in Unix-socket server ref'd while installed (remove server.unref()), so an awaited execFile response keeps the event loop alive; remove() still closes the server and restores PATH. Add a unit assertion that the server handle is ref'd while installed.

**Acceptance checks:**
- installExecStandIn leaves the stand-in server ref'd until remove()
- an awaited gh/git call through the stand-in resolves
- remove() closes the server and restores PATH

### 2.2 TASK-4b33600426ce4112-s1-t2 — Give the bare sweep a finite default per-test timeout

Add an npm script (e.g. "test:sweep") that runs tsx --test with a finite --test-timeout so bare parallel globs always bound each file, and document it in docs/testing.md: bare globs should use the bounded invocation; the harness remains the owned gate path.

**Acceptance checks:**
- package.json has the sweep script with a finite --test-timeout
- docs/testing.md documents the bounded bare invocation

### 2.3 TASK-4b33600426ce4112-s1-t3 — Smoke-verify the repro sweep terminates on every run

Run the bare workflow+mcp sweep repeatedly on Node 22.22.1 with the new default: every attempt finishes within the bound and every file reports a result (previously 6/6 hangs at 100s without a timeout).

**Acceptance checks:**
- N consecutive bare sweeps finish without an external kill and report all files

### 2.4 TASK-4b33600426ce4112-s1-t4 — Regression: harness gate path unchanged

Run npm test -- on the touched helper's test file and the gate-pinned single-file runs to prove the harness path (bounded child, --test-force-exit) is unaffected; root typecheck clean.

**Acceptance checks:**
- npm test -- <exec-stand-in usage file> passes under the pinned Node 22.22.1 command
- typecheck clean (root npx tsc --noEmit)

## 3. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| src/workflow/__tests__/helpers/exec-stand-in.ts (installExecStandIn/remove) and its existing usage tests | `t1` |
| bare tsx --test --test-timeout=<default> glob runs of src/workflow + src/mcp | `t2`, `t3` |
| package.json sweep script | `t2` |
| repeated bare sweeps of the workflow+mcp subsets on Node 22.22.1 | `t3` |

## 4. References

- **[[c1]]** `code` `src/workflow/__tests__/helpers/exec-stand-in.ts:78`
- **[[c2]]** `doc` `docs/testing.md`
- **[[c3]]** `code` `docs/standalone/bug-test-sweep-hangs-intermittently-npx-E202610084b336004/S001/LLD.md`
