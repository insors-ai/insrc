<!-- insrc:artifact LLD-4b33600426ce4112-s1 -->

# LLD: STORY-4b33600426ce4112-s1 — Make the test sweep finish reliably without --test-force-exit

## Summary

**Epic:** `bug-test-sweep-hangs-intermittently-npx`
**HLD base run:** `wf-1795856871448-vln4i8`
**HLD effective hash:** `290a411de989...`

This Story makes bare parallel test sweeps terminate reliably without --test-force-exit. A finite default per-test timeout on the bare sweep entry point bounds every file (a straggler is failed at the bound and reported, never dropped), and the exec-stand-in test helper keeps its gh/git socket server ref'd while installed, so an awaited stand-in response cannot outlive the event loop and cancel the rest of its file. Product unref semantics (daemon housekeeping timers, session pool, mcp pipe) are deliberately untouched.

## Contents

1. [Epic impact analysis](#1-epic-impact-analysis)
2. [HLD context](#2-hld-context)
3. [Contract details](#3-contract-details)
4. [Data model changes](#4-data-model-changes)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Migration](#7-migration)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)

## 1. Epic impact analysis

**Does not apply**: Standalone ISSUE-anchored bugfix; no Epic stories built yet.

## 2. HLD context

**Framework:** Standalone bugfix Story (ISSUE-anchored, no parent HLD). Design directly against the repo: the harness (scripts/test-harness/run.mjs) is the owned bounded sweep path; bare globs need a per-test bound to finish reliably.
**Rollout phase:** standalone

## 3. Contract details

**Surface level:** internal

### 3.1 `installExecStandIn`

```typescript
(fn?: ExecFake) => void
```

**Parameters:**
- `fn: ExecFake | undefined` _(optional)_ — stand-in handler; undefined removes the stand-ins

**Returns:** `void` — PATH points at the stand-in bin dir (or is restored)

**Preconditions:**
- called from a test file that spawns gh/git via execFile

**Postconditions:**
- the stand-in server is listening AND ref'd (no unref before remove()), so awaited execFile responses keep the event loop alive

### 3.2 `remove`

```typescript
() => void
```

**Returns:** `void` — stand-ins uninstalled

**Preconditions:**
- installExecStandIn was called

**Postconditions:**
- server closed, PATH restored, temp dir removed; the unref call is gone

## 4. Data model changes

### 4.1 `test-run invocation (package.json scripts / docs/testing.md)` — field-add

The documented bare sweep entry point gains a finite default --test-timeout (e.g. an npm "test:sweep" script passing --test-timeout) so bare globs always carry a per-test bound; the harness remains the owned gate path with per-file budgets and the pinned --test-force-exit command. No stored data changes.

**Call sites:**
- `package.json`
- `docs/testing.md`

## 5. Error paths

**Error cases**

- **A test promise never settles in a parallel bare sweep (event loop drained; only unref'd handles pending)** (recoverable)
  - Detection: node:test reports "Promise resolution is still pending but the event loop has already resolved" and cancels the rest of the file; without a per-test timeout the parent sweep never terminates
  - Response: The default finite --test-timeout fails the stuck test at the bound and the file is reported; the exec-stand-in server staying ref'd removes the known loop-drain window for gh/git awaits
  - User impact: Bare npx tsx --test <glob> runs finish on every run with a complete per-file report instead of hanging to an external kill
- **A file is merely slow under parallel load (compiler-API scans, e2e)** (recoverable)
  - Detection: The per-test timeout fires ("test timed out after Nms")
  - Response: The file is reported failed-at-timeout and the sweep continues; a single-file rerun (as the headers recommend) passes
  - User impact: Slow-but-healthy files are visible as timeouts, not silently dropped

**Edge cases**

| Input | Expected |
| :--- | :--- |
| bare single-file run npx tsx --test <file> | unchanged; headers already recommend --test-force-exit for single files |
| harness run npm test -- <file> | unchanged: owned bounded child per file, pinned Node 22.22.1 command with --test-force-exit; the gate path is untouched |
| product code with unref'd housekeeping handles (session-pool sweep, state-store TTL, mcp session pipe, daemon children) | untouched — unref stays so real daemons/hosts are not kept alive; only the test stand-in server changes |

**Invariants to preserve**

- The harness remains the owned sweep path: one bounded child per test file with budgets, pinned runtime and --test-force-exit in the gate testCommand [[c1]]
- Product unref() semantics are deliberate (do not keep a host/daemon alive for housekeeping) and must not change [[c1]]
- Every test file still reports a result in a sweep; nothing is dropped [[c2]]

## 6. Test strategy

**Test framework:** `node:test via tsx (repo convention; harness runs files as bounded children under Node 22.22.1)`

**Test levels**

- **unit** — exec-stand-in keeps its server ref'd while installed and closes it on remove, so an awaited stand-in response cannot outlive the event loop
  - Subjects: `src/workflow/__tests__/helpers/exec-stand-in.ts (installExecStandIn/remove) and its existing usage tests`
  - Fixtures: `existing exec-stand-in usage tests`
- **integration** — A bare parallel sweep carrying the new default timeout terminates and reports every file
  - Subjects: `bare tsx --test --test-timeout=<default> glob runs of src/workflow + src/mcp`, `package.json sweep script`
- **smoke** — The repro sweep now finishes within the bound on every attempt (was 6/6 hangs at 100s on Node 22.22.1)
  - Subjects: `repeated bare sweeps of the workflow+mcp subsets on Node 22.22.1`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `bare sweep with the default timeout terminates on every run and reports every file (smoke: N attempts, 0 external kills)` |
| `ac2` | `exec-stand-in unit test: no unref before remove; an awaited gh/git call through the stand-in resolves` |
| `ac3` | `harness gate path unchanged: npm test -- <file> passes under the pinned command (regression on the touched helper)` |

## 7. Migration

**State before:** no default per-test timeout on bare runs; exec-stand-in server unref'd while installed

**State after:** bare sweep entry point carries a finite default --test-timeout; exec-stand-in server ref'd until remove()

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

undefined. undefined — ✕ non-rollbackable
undefined. undefined — ✕ non-rollbackable
undefined. undefined — ✕ non-rollbackable

**Backward compat:** single-file and harness runs unchanged

## 8. Alternatives considered

### 8.1 a1: Default per-test timeout for bare runs

Give bare tsx --test sweeps a finite per-test timeout so a straggler file fails at the bound instead of blocking the sweep forever.

Invocation/docs-level default --test-timeout (plus an npm sweep script that passes it); harness stays the owned sweep path; stragglers are reported as timeout failures, not dropped.

### 8.2 a2: Repair unref'd-handle awaits in test-reachable code

Keep handles that tests await ref'd while work is in flight (exec-stand-in server, deadline timers).

exec-stand-in server stays ref'd until remove(); audit deadline timers on awaited paths; product unref semantics carefully scoped.

### 8.3 a3: Harness-only sweeps (docs only)

Declare the harness the only supported sweep; change nothing.

Document that bare parallel globs are unsupported.

### 8.4 a4: Timeout default + test-helper ref discipline (combined) — **CHOSEN**

a1 for guaranteed termination plus a2 scoped strictly to the test helper exec-stand-in (server ref'd while installed); product unref untouched.

Finite default --test-timeout in the documented bare sweep entry point + exec-stand-in keeps its server ref'd until remove().

## 9. References

- **[[c1]]** `code` `src/workflow/__tests__/helpers/exec-stand-in.ts:78`
- **[[c2]]** `code` `src/workflow/team/sighting-store.ts:61`
- **[[c3]]** `doc` `docs/testing.md`
- **[[c4]]** `code` `vscode-plugin/src/activation.ts:34-58`
