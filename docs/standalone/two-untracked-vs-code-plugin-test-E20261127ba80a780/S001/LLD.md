<!-- insrc:artifact LLD-ba80a780f4408613-s1 -->

# LLD: STORY-ba80a780f4408613-s1 — test fixtures and assertions inside the two named test files plus the probe helper edit

## Summary

**Epic:** `two-untracked-vs-code-plugin-test`
**HLD base run:** `wf-1795785940717-8xzpqh`
**HLD effective hash:** `c54175a13113...`

Revision 2 addressing design-review feedback. Test-side-only fix of two vscode-plugin test defects, no product code changes. (1) docs-review-panel t3 compile probe: the recorded failing diagnostics are exclusively node_modules .d.ts declaration-file errors (TS2416/TS2503/TS2304/TS2552/TS1203), so the single correct compiler option is skipLibCheck — explicit "types" would not suppress them. compileProbe (scripts/test-harness/probe.mjs:8-25) gains a narrow per-probe skipLibCheck?: boolean option, default off (all other callers unchanged; timeout/compiler-error/interrupted/cleanup behavior untouched), and the panel call site typecheckAgainstPanel (docs-review-panel.test.ts:2497) passes skipLibCheck: true. Distinct controls preserved: the valid real-module fixture must pass (control.ok===true), invalid fixtures must assert the specific diagnostics (/Property .* does not exist on type/ per absent-state member; /not assignable to type .never./ for the unhandled-kind witness) — not merely ok===false — and the shipped-source witness check stays; because shared probe.mjs changes, its own tests (scripts/__tests__/test-harness.test.ts) also run. (2) commands.test.ts:132-143: update ONLY the install tuple of the full-sequence argv assertion to ["/bin/bash", installer, "-y", "--target", root], preserving the start/stop/restart/update tuples (controller.ts:68-76). Runnable selectors: npm test -- --suite=vscode src/chat/__tests__/docs-review-panel.test.ts src/daemon/__tests__/commands.test.ts.

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

**Does not apply**: Standalone small bugfix (ISSUE-ba80a780f4408613); no epic-level contract change.

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
- `skipLibCheck: boolean` _(optional)_ — When true, append --skipLibCheck to the owned tsc argv so declaration-file (.d.ts) checking is skipped while TS source and fixture diagnostics stay active; default false preserves all existing callers

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

Add optional skipLibCheck?: boolean (default false). When true the owned tsc argv [compiler, --noEmit, --strict, --exactOptionalPropertyTypes, --module nodenext, --moduleResolution nodenext, --target es2022, file] gains --skipLibCheck; all other args, timeout, compiler-error and cleanup handling unchanged.

```
skipLibCheck?: boolean // default false
```

**Call sites:**
- `scripts/test-harness/probe.mjs:8-25`
- `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts:2497`

## 5. Error paths

**Error cases**

- **Probe compile polluted by dependency declaration-file diagnostics (node_modules .d.ts TS2416/TS2503/TS2304/TS2552/TS1203) so the positive control fails on valid code** (recoverable)
  - Detection: compileProbe returns ok=false with out containing only node_modules/*.d.ts errors (witness: harness run 4bde4114 not-ok-78)
  - Response: Panel probe call site passes skipLibCheck: true, appending --skipLibCheck to the owned tsc argv; declaration-file checking is skipped, TS source and fixture diagnostics stay active
  - User impact: t3 absent-state positive control (control.ok===true) passes on valid code; invalid fixtures still fail on their own diagnostics
- **Probe child process exceeds its budget** (terminal)
  - Detection: processScope result.timedOut -> harnessError child-timeout
  - Response: Unchanged: probe throws child-timeout; test surfaces it as a failure, not a skip
  - User impact: Slow machine still bounded; no hang
- **Compiler missing or produces no type-check result** (terminal)
  - Detection: launchError, or exit!=0 without /error TS\d+:/ in output -> harnessError compiler-unavailable
  - Response: Unchanged: setup error propagates
  - User impact: Test fails loudly rather than silently passing
- **Probe workspace cannot be cleaned** (recoverable)
  - Detection: scope.drain() returns falsy -> harnessError cleanup-unconfirmed, workspace retained
  - Response: Unchanged: retained probe workspace for diagnosis
  - User impact: No silent leftover deletion
- **commands.test.ts install tuple stale vs controller --target contract** (recoverable)
  - Detection: assert.deepEqual(captured, ...) mismatches on the install argv
  - Response: Update only the install tuple to ["/bin/bash", installer, "-y", "--target", root]; start/stop/restart/update tuples preserved
  - User impact: Test asserts the full owned-runtime sequence the controller actually runs (controller.ts:68-76)

**Edge cases**

| Input | Expected |
| :--- | :--- |
| skipLibCheck omitted (all existing probe callers) | argv unchanged — no --skipLibCheck; behavior identical to today |
| skipLibCheck: true with a fixture that has a REAL type error in fixture or panel source | ok=false and out still matches the expected diagnostic (Property ... does not exist / not assignable to type never) — scoping does not weaken source checking |
| probe run from repo root vs vscode-plugin cwd | same result — root passed explicitly (REPO_ROOT) and target must realpath inside the checkout |
| install with migrate=true | argv gains --migrate-runtime --no-start after --target <root>; sequence assertion covers only the ordinary install path |

**Invariants to preserve**

- The unhandled-companion-kind test must still fail compilation on a genuinely unhandled kind, asserting /not assignable to type .never./ — not merely ok===false — and the shipped-source witness check on docs-review-panel.ts stays [[c1]]
- The absent-state test must assert /Property .* does not exist on type/ per member AND keep the valid real-module positive control control.ok===true [[c1]]
- The owned-runtime --target install contract is intentional (77c317a88); the full captured-sequence assertion (install+start+stop+restart+update) is preserved with only the install tuple updated [[c2]]
- No product code changes; harness timeout, compiler-error, interrupted and cleanup behavior of compileProbe unchanged [[c3]]

## 6. Test strategy

**Test framework:** `node:test via the repo test harness (Node 22.22.1): npm test -- --suite=vscode src/chat/__tests__/docs-review-panel.test.ts src/daemon/__tests__/commands.test.ts (src/ selectors are relative to vscode-plugin/ per docs/testing.md:14-22); plus npm test -- scripts/__tests__/test-harness.test.ts because shared scripts/test-harness/probe.mjs changes`

**Test levels**

- **unit** — Both fixed assertions pass under the supported harness; the probe change keeps distinct positive/negative/witness controls honest; the harness probe's own tests stay green after the shared probe.mjs edit.
  - Subjects: `t3: the 'absent' state carries NO member other than state — enforced by the TYPE, not just at runtime`, `t3: an unhandled companion kind is a COMPILE error, not an unlabelled slot`, `VS Code daemon commands delegate install and lifecycle through fixed shell and surface owned-runtime failures`
  - Fixtures: `existing harness compile probe (scripts/test-harness/probe.mjs) + controller fixture tree (mkdtemp root with ctlScript/daemonEntry/bundledInstaller)`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `t3: the 'absent' state carries NO member other than state — enforced by the TYPE, not just at runtime` |
| `ac2` | `t3: an unhandled companion kind is a COMPILE error, not an unlabelled slot`, `t3: the 'absent' state carries NO member other than state — enforced by the TYPE, not just at runtime` |
| `ac3` | `VS Code daemon commands delegate install and lifecycle through fixed shell and surface owned-runtime failures` |
| `ac4` | `scripts/__tests__/test-harness.test.ts probe coverage (npm test -- scripts/__tests__/test-harness.test.ts)` |

## 7. Migration

**State before:** probe not isolated from dependency .d.ts noise (no skipLibCheck option); commands.test.ts install tuple lacks --target <root>

**State after:** compileProbe accepts per-probe skipLibCheck (default off) and the panel probe opts in; commands.test.ts install tuple matches the controller contract

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. No migration — test-only change; nothing to backfill or roll out — ↩ rollbackable

**Backward compat:** Test-only change; no runtime or public surface changes. Default-off option keeps every existing compileProbe caller behavior-identical.

## 8. Alternatives considered

### 8.1 a1: Per-probe skipLibCheck option on shared compileProbe — **CHOSEN**

Add skipLibCheck?: boolean (default false) to compileProbe; pass --skipLibCheck only when set; enable it at the docs-review-panel call site only.

Extend compileProbe({root,target,snippet,compiler,budgetMs,skipLibCheck}) in scripts/test-harness/probe.mjs:8-25 so the tsc argv gains --skipLibCheck only when the option is true; typecheckAgainstPanel (docs-review-panel.test.ts:2497) passes skipLibCheck: true; all other callers unchanged (default off). Timeout, compiler-error, interrupted and cleanup-unconfirmed behavior untouched. Separately update commands.test.ts:132-143 install tuple only.

### 8.2 a2: Per-probe explicit types option

Add types?: string[] to compileProbe and pass --types when set.

Pass --types to tsc to restrict ambient @types inclusion.

### 8.3 a3: Post-filter probe output to project paths

Keep tsc broad; classify diagnostics and fail only on errors in fixture/panel sources.

Parse compileProbe output and ignore errors whose path is under node_modules.

## 9. References

- **[[c1]]** `code` `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts:2496-2579`
- **[[c2]]** `code` `vscode-plugin/src/daemon/__tests__/commands.test.ts:128-143`
- **[[c3]]** `code` `scripts/test-harness/probe.mjs:8-25`
- **[[c4]]** `code` `vscode-plugin/src/daemon/controller.ts:68-76`
- **[[c5]]** `doc` `docs/testing.md:14-22`
