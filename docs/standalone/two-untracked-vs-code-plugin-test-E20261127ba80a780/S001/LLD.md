<!-- insrc:artifact LLD-ba80a780f4408613-s1 -->

# LLD: STORY-ba80a780f4408613-s1 — test fixtures and assertions inside the named test files plus the probe helper edit

## Summary

**Epic:** `two-untracked-vs-code-plugin-test`
**HLD base run:** `wf-1795793421317-sm4v1l`
**HLD effective hash:** `7e05709c463b...`

Revision 4 per review feedback (design unchanged since rev 2). Test-side-only fix of two vscode-plugin test defects, no product code changes. (1) docs-review-panel t3 compile probe: recorded failing diagnostics are exclusively node_modules .d.ts declaration-file errors, so the single correct compiler option is skipLibCheck. compileProbe (scripts/test-harness/probe.mjs:8-25) gains a narrow per-probe skipLibCheck?: boolean (default off; wiring pinned by the unit test in scripts/__tests__/test-harness.test.ts:124, commit b23dd0e7e), and the panel call site passes skipLibCheck: true (commit 7a47d0e28). (2) commands.test.ts: full captured-sequence assertion matches the current controller contract: install [-y --target <root>], start/restart [--skip-sync --skip-install --skip-build], stop, update via installer [--migrate-runtime --no-start]. Acceptance mapping: ac1/ac2 are carried by the real-panel probe behavior test (scripts/__tests__/test-harness-probes.test.ts:13, which runs the two t3 tests under a nested harness and asserts 2 pass / 0 fail), with the stub test as wiring evidence; ac3 by the commands test. Harness evidence for the t3 tests on fix commit 7a47d0e28: .insrc/tmp/test-harness/runs/a76220f7-26a1-4d77-aa31-d08fc1886bcc and aa15f6e1-091d-4712-bce3-47ca8f728627 logs show 237 ok / 0 not ok individually (pre-fix run 4bde4114: not ok 78); the file-level pending-promise termination is tracked separately as ISSUE-4b33600426ce1112 and is not an individual test outcome.

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

**Does not apply**: Standalone small bugfix; no epic-level contract change.

## 2. HLD context

**Framework:** Standalone small bugfix (ISSUE-ba80a780f4408613); test-side only; no HLD shared contracts owned or consumed.
**Rollout phase:** single-step bugfix

## 3. Contract details

**Surface level:** internal

### 3.1 `compileProbe`

```typescript
compileProbe({ root, target, snippet, compiler, budgetMs, skipLibCheck? }): Promise<{ ok: boolean; out: string }>
```

**Parameters:**
- `root: string` _(optional)_ — Checkout root; probe target must belong to it
- `target: string` — Real module the probe imports
- `snippet: (specifier: string) => string` — Fixture source generator
- `compiler: string` _(optional)_ — tsc binary path
- `budgetMs: number` _(optional)_ — Child-process time budget (child-timeout on exceed)
- `skipLibCheck: boolean` _(optional)_ — When true, append --skipLibCheck so declaration-file (.d.ts) checking is skipped while TS source and fixture diagnostics stay active; default false preserves all existing callers

**Returns:** `Promise<{ ok: boolean; out: string }>` — ok = tsc exit code 0; out = full diagnostic text

**Errors:**
- `context-invalid` when Caller is not an admitted reader, or target lies outside the active checkout
- `compiler-unavailable` when Compiler binary missing, launch error, or non-zero exit without TS diagnostics
- `child-timeout` when Probe exceeded budgetMs
- `interrupted` when SIGINT/SIGTERM during probe
- `cleanup-unconfirmed` when Isolated probe workspace could not be drained and removed

**Preconditions:**
- participantContext(root).phase === "reading"
- existsSync(compiler)
- realpathSync(target) inside checkout

**Postconditions:**
- probe workspace file written with flag wx and removed after drain
- --skipLibCheck present in argv iff skipLibCheck === true
- return shape unchanged: { ok, out }

### 3.2 `typecheckAgainstPanel (test helper)`

```typescript
typecheckAgainstPanel(_t: Skipper, snippet: (moduleSpecifier: string) => string): Promise<{ ok: boolean; out: string }>
```

**Parameters:**
- `_t: Skipper` — Test skipper handle (unused; compile failure is a test failure, not a skip)
- `snippet: (moduleSpecifier: string) => string` — Fixture source importing the real panel module

**Returns:** `Promise<{ ok: boolean; out: string }>` — Compile result of the fixture against the real docs-review-panel module

**Errors:**
- `harnessError` when Any compileProbe error case propagates (setup error, not a skip)

**Preconditions:**
- harness compile probe available (TSC exists)

**Postconditions:**
- delegates to compileProbe with skipLibCheck: true so node_modules .d.ts noise cannot fail the probe; real-module and fixture diagnostics remain fully checked

## 4. Data model changes

### 4.1 `compileProbe options object` — field-add

Add optional skipLibCheck?: boolean (default false). When true the owned tsc argv gains --skipLibCheck; all other args, timeout, compiler-error and cleanup handling unchanged. Wiring pinned by the unit test in scripts/__tests__/test-harness.test.ts:124 (commit b23dd0e7e).

```
skipLibCheck?: boolean // default false
```

**Call sites:**
- `scripts/test-harness/probe.mjs:8-25`
- `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts:2497`
- `scripts/__tests__/test-harness.test.ts:124`

## 5. Error paths

**Error cases**

- **Probe compile polluted by dependency declaration-file diagnostics (node_modules .d.ts) so the positive control fails on valid code** (recoverable)
  - Detection: compileProbe returns ok=false with out containing only node_modules/*.d.ts errors (witness: harness run 4bde4114 not-ok-78)
  - Response: Panel probe call site passes skipLibCheck: true; declaration-file checking is skipped, TS source and fixture diagnostics stay active
  - User impact: t3 positive control passes on valid code; invalid fixtures still fail on their own diagnostics
- **Probe run outside an admitted harness run (e.g. the build gate bare tsx runner)** (terminal)
  - Detection: participantContext throws harness-context-invalid
  - Response: Unchanged by design: probes require the supported harness; gate-runnable behavior coverage comes from test-harness-probes.test.ts which spawns its own nested harness run
  - User impact: Probe-dependent behavior is verified by the nested-harness test, not by the gate directly
- **Probe child exceeds budget / compiler missing / workspace cannot be cleaned / interrupted** (terminal)
  - Detection: timedOut, launchError or no TS diagnostics, drain falsy, SIGINT/SIGTERM
  - Response: Unchanged: child-timeout / compiler-unavailable / cleanup-unconfirmed / interrupted — covered by test-harness-probes.test.ts:23
  - User impact: Failures stay loud; no silent pass
- **commands.test.ts sequence stale vs controller contract** (recoverable)
  - Detection: assert.deepEqual(captured, ...) mismatches
  - Response: Full sequence asserted: install [-y --target <root>], start/restart [--skip-sync --skip-install --skip-build], stop, update via installer [--migrate-runtime --no-start]
  - User impact: Test asserts the real owned-runtime sequence (controller.ts:68-95)

**Edge cases**

| Input | Expected |
| :--- | :--- |
| skipLibCheck omitted (all existing probe callers) | argv unchanged — no --skipLibCheck (pinned by test-harness.test.ts:124) |
| skipLibCheck: true with a REAL type error in fixture or panel source | ok=false and out still matches the expected diagnostic — scoping does not weaken source checking (asserted by the real-panel probe test) |
| install with migrate=true (update) | installer argv gains --migrate-runtime --no-start after --target <root> |

**Invariants to preserve**

- The unhandled-companion-kind test still fails compilation on a genuinely unhandled kind asserting /not assignable to type .never./, and the shipped-source witness check stays (docs-review-panel.test.ts:2550-2579) [[c1]]
- The absent-state test asserts /Property .* does not exist on type/ per member AND keeps the valid positive control control.ok===true (docs-review-panel.test.ts:2500-2528) [[c1]]
- No product code changes; harness timeout/compiler-error/interrupted/cleanup behavior unchanged; default-off option keeps other callers identical (pinned by test-harness.test.ts:124) [[c3]]
- The owned-runtime --target install contract (77c317a88) and the full captured-sequence assertion are preserved [[c2]]

## 6. Test strategy

**Test framework:** `node:test. All subjects are gate-runnable (the build gate runs each mapped file via npx tsx --test-force-exit from the repo root) and also pass under the supported harness (npm test -- <file>, Node 22.22.1): scripts/__tests__/test-harness-probes.test.ts, scripts/__tests__/test-harness.test.ts, and npm test -- --suite=vscode src/daemon/__tests__/commands.test.ts. Harness evidence for the t3 tests on fix commit 7a47d0e28: .insrc/tmp/test-harness/runs/a76220f7-26a1-4d77-aa31-d08fc1886bcc and aa15f6e1-091d-4712-bce3-47ca8f728627 (0-vscode-plugin_src_chat___tests___docs-review-panel.test.ts.log) show 237 ok / 0 not ok individually; pre-fix run 4bde4114 showed not ok 78. The file-level pending-promise termination of that file under the harness is tracked separately as ISSUE-4b33600426ce1112 and is not an individual test outcome.`

**Test levels**

- **unit** — All three subjects are gate-runnable. The real-panel probe test (test-harness-probes.test.ts:13) runs the two t3 docs-review-panel tests under a nested harness (name pattern) and asserts 2 pass / 0 fail — carries ac1/ac2 with real positive and intended-negative diagnostics. The stub test (test-harness.test.ts:124) pins the skipLibCheck argv wiring (default off, appended only when set). The commands test pins the full owned-runtime argv sequence (ac3).
  - Subjects: `Real panel type probes preserve positive and intended-negative diagnostics`, `compileProbe appends --skipLibCheck only when the per-probe skipLibCheck option is set and otherwise leaves its argv unchanged`, `VS Code daemon commands delegate install and lifecycle through fixed shell and surface owned-runtime failures`
  - Fixtures: `nested harness run over vscode-plugin (real-panel test); stub compiler + createRun temp root (wiring test); controller fixture tree (commands test)`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `Real panel type probes preserve positive and intended-negative diagnostics`, `compileProbe appends --skipLibCheck only when the per-probe skipLibCheck option is set and otherwise leaves its argv unchanged` |
| `ac2` | `Real panel type probes preserve positive and intended-negative diagnostics` |
| `ac3` | `VS Code daemon commands delegate install and lifecycle through fixed shell and surface owned-runtime failures` |

## 7. Migration

**State before:** probe not isolated from dependency .d.ts noise; commands.test.ts sequence stale vs controller contract

**State after:** compileProbe accepts per-probe skipLibCheck (default off, wiring unit-tested) and the panel probe opts in; commands.test.ts asserts the current full argv sequence

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. No migration — test-only change; nothing to backfill or roll out — ↩ rollbackable

**Backward compat:** Test-only change; no runtime or public surface changes. Default-off option keeps every existing compileProbe caller behavior-identical (pinned by test-harness.test.ts:124).

## 8. Alternatives considered

### 8.1 a1: Subjects = real-panel probe test + skipLibCheck wiring unit test + commands test; ac1/ac2 mapped to the real-panel probe test — **CHOSEN**

Gate-runnable subjects that check actual behavior, with the acceptance mapping pointing at behavior checks, not the stub.

test-harness-probes.test.ts:13 runs the two t3 tests under a nested harness (name pattern) and asserts 2 pass / 0 fail — that carries ac1/ac2; the stub test pins the option wiring; the commands test carries ac3.

### 8.2 a2: Keep rev 3 mapping (ac1/ac2 on the stub argv test)

Acceptance mapping points at the stub compiler argv test.

As rev 3.

## 9. References

- **[[c1]]** `code` `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts:2496-2579`
- **[[c2]]** `code` `vscode-plugin/src/daemon/__tests__/commands.test.ts:128-146`
- **[[c3]]** `code` `scripts/test-harness/probe.mjs:8-25`
- **[[c4]]** `code` `vscode-plugin/src/daemon/controller.ts:68-95`
- **[[c5]]** `code` `scripts/__tests__/test-harness.test.ts:124-155`
- **[[c6]]** `code` `scripts/__tests__/test-harness-probes.test.ts:13-36`
- **[[c7]]** `doc` `docs/testing.md:14-22`
