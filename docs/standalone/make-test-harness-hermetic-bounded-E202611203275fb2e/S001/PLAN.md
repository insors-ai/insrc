<!-- insrc:artifact PLAN-3275fb2e9a542cd6-s1 -->

# Plan: STORY-3275fb2e9a542cd6-s1

## Summary

**Epic:** `make-test-harness-hermetic-bounded`
**LLD run:** `wf-1795149678886-t22m35`
**LLD effective hash:** `4889d3eb4e7c...`

Build one checkout-level owner for generated output and bounded test lifetimes, then migrate rebuild fixtures, process readiness and compiler probes onto it. Route developer commands through the same Node-22 context and verify adversarial failure paths before a sequential focused run. Preserve production behavior, native refusals and qualification policy; interrupted runs with unconfirmed cleanup remain visibly blocked.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Reconcile the implementation baseline | S | — | — | smoke: Baseline commit, upstream overlap and quiescent-owner evidence | [[c1]] [[c5]] |
| 2 | **`t2`** Establish run ownership and runtime context | M | — | `t1` | integration: Canonical-path contenders refuse overlap and preserve foreign/replaced/symlinked ownership; unit: Unsupported Node refuses before mutation and child environment resolves selected runtime; integration: Abandoned ownership cannot be stolen by age or PID absence | [[c1]] [[c2]] |
| 3 | **`t3`** Coordinate builds and test admission | M | — | `t2` | integration: Prepared build excludes simultaneous writers and readers, validates helpers and rejects fingerprint drift; integration: SIGINT/SIGTERM and deadline drain registered actors or retain blocked incomplete outcome; unit: Selector deduplication, explicit budgets and bounded concurrency reject invalid admission | [[c1]] [[c2]] [[c3]] |
| 4 | **`t4`** Migrate rebuild fixtures to prepared output | M | — | `t3` | integration: Five prepared consumers reuse helpers and raw invocations refuse missing context; integration: Retirement-package stale-output rebuild remains a serial mutation regression | [[c1]] [[c3]] |
| 5 | **`t5`** Repair fixture readiness and resource lifetimes | M | — | `t3` | smoke: Peer state round-trip terminates with both MessagePorts closed; integration: Failed fixture readiness reclaims socket and child before the next case; integration: Ready handshake precedes behavioral cancellation deadline | [[c1]] [[c2]] [[c3]] |
| 6 | **`t6`** Move compiler probes outside source includes | M | — | `t3` | integration: Real panel type probes preserve positive and intended-negative diagnostics; integration: Compiler launch failure and interruption cannot pass a negative probe or pollute source includes | [[c1]] [[c2]] [[c3]] |
| 7 | **`t7`** Route supported commands and regression launchers | M | — | `t4`, `t5`, `t6` | integration: Root and VSCode command overlap refuses before asset synchronization; integration: Build stages and specialized launcher gate policies survive wrapper integration; integration: Native refusal and saved-mode controls remain enforced | [[c1]] [[c2]] [[c4]] |
| 8 | **`t8`** Validate and document the supported harness | M | — | `t7` | smoke: Sequential focused validation reports actual coverage, remaining failures and closed actors; smoke: Documented runtime, selector, budget and blocked-recovery commands match observed behavior | [[c1]] [[c2]] [[c3]] [[c4]] |

### 1.1 TASK-3275fb2e9a542cd6-s1-t1 — Reconcile the implementation baseline

Inspect and integrate upstream changes while preserving local artifacts; verify quiescence before shared-output work.

**Acceptance checks:**
- Record the resulting commit and any overlaps with the approved LLD; stop for a design amendment if behavior changed materially.
- No active prior test/build owner; no unknown probe residue or real daemon is removed.

### 1.2 TASK-3275fb2e9a542cd6-s1-t2 — Establish run ownership and runtime context

Add proposed scripts/test-harness/context.mjs contracts for canonical-root lease identity, runtime preflight, child environment, bounded budgets, run workspace and explicit recovery.

**Acceptance checks:**
- Two checkout aliases contend for one lease; malformed/replaced/symlinked/abandoned records fail closed without PID/age takeover.
- Unsupported runtime fails before mutation; nested child environment uses the validated Node22 binary, preserves explicit live opt-ins, and never leaks environment values.
- Record transitions permit release only with matching identity and confirmed closure; unconfirmed cleanup or abandoned ownership retains blocked state. t3 integrates actual actor draining.

### 1.3 TASK-3275fb2e9a542cd6-s1-t3 — Coordinate builds and test admission

Add proposed scripts/test-harness/build.mjs and run.mjs; preserve all existing build stages, prepare output once and schedule a serial mutation lane before bounded readers.

**Acceptance checks:**
- Second build/test refuses before shared mutation; standalone build acquires ownership; only admitted preparing/mutating writers can join with one writer reservation.
- Prepared metadata requires successful build, required helpers and stable input/output fingerprints; drift invalidates validation.
- Selectors deduplicate and reject empty/outside paths; default concurrency2 bounded1–4; documented longer intentional file budgets remain possible and recorded.
- Owned child results, logs, coverage and close confirmation survive failures and catchable signals.
- Real disposable-child SIGINT and SIGTERM controls stop admission, drain owned actors and return incomplete/nonzero; no closure acknowledgment retains blocked ownership.

### 1.4 TASK-3275fb2e9a542cd6-s1-t4 — Migrate rebuild fixtures to prepared output

Replace five ordinary build hooks with prepared-context checks; keep src/daemon/__tests__/review-retirement-package.test.ts as a real exclusive rebuild regression.

**Acceptance checks:**
- All six audited consumers participate; direct unsupported invocations fail with an actionable selector command before fake-daemon startup.
- The retirement regression still plants stale output and asserts its removal/package behavior; prepared output refreshes before readers.
- Focused consumers cannot lose compiled helpers through concurrent cleanup; no native refusal assertion is weakened.

### 1.5 TASK-3275fb2e9a542cd6-s1-t5 — Repair fixture readiness and resource lifetimes

Use existing process/channel helpers with per-case cleanup and bounded ready handshakes; move peer MessageChannel allocation into a meaningful test with finally cleanup.

**Acceptance checks:**
- Importing the peer file creates no unowned module-scope port; its real state round-trip test terminates and both ports close.
- Failed fixture startup releases owned socket/process before next case; short behavior deadlines begin only after bounded readiness.
- Cancellation and disposal retain actual handles; escaped/unconfirmed children block release rather than authorizing PID scans or production lifecycle changes.

### 1.6 TASK-3275fb2e9a542cd6-s1-t6 — Move compiler probes outside source includes

Migrate typecheckAgainstPanel and every caller to the approved async snippet-factory contract and retained compiler lifecycle in the ignored run workspace.

**Acceptance checks:**
- Snippets import real panel types with correct NodeNext/package resolution; intended negative diagnostic and positive controls remain enforced.
- Launch failure/unrelated diagnostics/timeouts cannot pass negative type tests; catchable interruption drains compiler.
- No probe file enters backend or extension source includes, including after interruption; normal extension typecheck still works.

### 1.7 TASK-3275fb2e9a542cd6-s1-t7 — Route supported commands and regression launchers

Switch root build/test and VSCode test commands to ownership, move mutating pretest asset sync inside admission, and adapt specialized regression launchers at their ownership seam.

**Acceptance checks:**
- Both packages use canonical checkout ownership; asset sync cannot run before overlap refusal and keeps existing semantics.
- Existing workspace/typecheck/spawn-scan/native/model/assets stages remain checked; only wrapper exposure assertions change here.
- Specialized scripts retain proof/gate policy; altered fingerprints stay pending Batch15 with no fabricated qualification.

### 1.8 TASK-3275fb2e9a542cd6-s1-t8 — Validate and document the supported harness

Run isolated adversarial controls then sequential affected suites; document selectors, runtime setup, budgets, recovery and remaining sibling failures in the audit/index.

**Acceptance checks:**
- All local ac1–ac6 checks have recorded evidence including contention, runtime drift, failed startup, positive/negative probes, interruption and blocked recovery.
- No overlapping broad sweeps; broaden only after focused controls pass and prior actors close; report actual pass/fail/cancelled coverage and environment.
- Document explicit abrupt-death limits and recovery; preserve sibling failures/security refusals and leave release qualification pending.
- Inspect generated sequence source against implementation ordering and verify rendering if available; report unavailable evidence.
- Exercise real catchable signals separately from abandoned/replaced-record controls; do not claim all detached descendants can be reclaimed after arbitrary SIGKILL.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| unsupported Node exits before output mutation | `t2` |
| a changed lease or source/output fingerprint never produces successful validation | `t2`, `t3`, `t8` |
| one checkout owner protects prepared output from a second test or build | `t2`, `t3`, `t7` |
| output-mutating tests run alone and ordinary consumers reuse the prepared build | `t3`, `t4` |
| all nested Node and npm children use the validated runtime | `t2`, `t7` |
| a failing fixture closes its own socket and child before the next case | `t5` |
| startup readiness is bounded separately from the asserted cancellation deadline | `t5` |
| timeouts and unconfirmed cleanup remain nonzero incomplete results | `t3`, `t5`, `t8` |
| type probes distinguish intended diagnostics from launch failure and retain positive controls | `t6` |
| native refusal and saved-mode assertions are preserved | `t4`, `t7` |
| the coordinator uses existing build/process boundaries without production API changes | `t3`, `t7` |
| the peer-state fixture registers a real test and releases both ports | `t5` |
| interrupted type probes cannot enter normal source includes | `t6` |
| uncatchable owner death leaves blocked ownership without lock stealing | `t2`, `t8` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s1 dataModelChanges` — "HarnessRunRecord, PreparedBuild and HarnessChild/ProbeWorkspace responsibilities and audited integration sites."
- **[[c2]]** `prior-artifact` `LLD s1 contractDetails and errorPaths` — "Async real-module type probes; ownership/runtime preconditions; failure detection, bounded drain and blocked recovery."
- **[[c3]]** `prior-artifact` `LLD s1 testStrategy` — "Local ac1–ac6 and all fourteen test-level subjects retain meaningful assertions and actual coverage."
- **[[c4]]** `prior-artifact` `LLD s1 migration` — "Command routing, admitted asset sync, specialized-launcher ownership only, compatibility and qualification boundaries."
- **[[c5]]** `analyze-bundle` `plan s1` — "Approved LLD grounding reused for sizing. v2 is ahead one local approval commit and behind four upstream commits; reconcile before implementation. No tracker publication is claimed."
