<!-- insrc:artifact PLAN-9b72686c1746af2b-s2 -->

# Plan: E202609309b72686c:S002

## Summary

**Epic:** `harden-insrc-artifact-creation-flows-two`
**LLD run:** `wf-1790750067728-ftqeit`
**LLD effective hash:** `a96cc61752b7...`

Building S002 is a small, additive change to the build-step validate phase plus tests. One code task extends the validate input type with an optional standalone context, threads it through the MCP router, and adds a gated branch in handleValidate that resolves the story identity (mirroring implement) and reuses the existing verdict + fail-open persist block — so a small standalone story finally lands a BUILD record. One test task adds the standalone/fail-open/no-identity/completion-gate assertions and re-runs the daemon suite, keeping the plan-driven path a regression guard.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add the standalone branch to build-step validate (input field + handler + router threading) | S | — | unit: standalone validate writes BUILD-<epicHash>-S001.json keyed to the story identity (existsSync); unit: the persisted standalone record carries the collectBuildChangeLog file-level change list for a non-empty changed set; unit: fail-open: a persistBuildRecord throw is swallowed and the verdict is still returned; unit: no-identity guard: a standalone Small validate missing epicHash returns BuildStepError('no-identity') and writes no record | [[c1]] [[c2]] |
| 2 | **`t2`** Extend the build-step tests for the standalone validate path + regressions, run the suite | S | `t1` | unit: regression: plan-driven validate (no standalone) still resolves via resolveTaskRef + persists, and an unresolved target still errors; unit: completion gate: approveWorkflowTarget finds the persisted standalone BUILD record by BUILD- prefix and approves it; smoke: the full daemon test sweep runs green under tsx --test | [[c3]] |

### 1.1 E202609309b72686c:S002:T001 — Add the standalone branch to build-step validate (input field + handler + router threading)

Add an optional `standalone?: BuildStandaloneContext` to BuildStepInputValidate (types.ts:59), thread the already-accepted standalone object from the MCP build-step tool router into the typed validate input, and add an early branch in handleValidate (validate.ts) gated on input.standalone: resolve epicHash/storyId/sizeClass from the context (mirroring handleStandaloneImplement, with a 'no-identity' guard), skip resolveTaskRef, run the existing verdict session, and reuse the existing persist-on-verdict block (:93-112) with that identity so persistBuildRecord + collectBuildChangeLog write BUILD-<epicHash>-<storyId>.json. The plan-driven path (no standalone) is left byte-identical.

**Acceptance checks:**
- BuildStepInputValidate carries an optional standalone?: BuildStandaloneContext field and the router threads it in
- handleValidate takes the standalone branch when input.standalone is present, resolving identity from the context and skipping resolveTaskRef
- the standalone branch reuses the existing persist-on-verdict block (persistBuildRecord + collectBuildChangeLog) with the resolved identity, keeping the try/catch fail-open (k5)
- a missing standalone.epicHash on a Small build returns BuildStepError('no-identity') and writes no BUILD-undefined path
- the plan-driven path (input.standalone absent) is unchanged — still resolveTaskRef → existing persist block
- no summary/feedback fields are added to the record (S003's scope); the record body is byte-identical to a plan-driven record (k4)

### 1.2 E202609309b72686c:S002:T002 — Extend the build-step tests for the standalone validate path + regressions, run the suite

Add additive assertions to the build-step test suite: a standalone validate persists BUILD-<hash>-S001.json with the collectBuildChangeLog change trace (ac1/ac3), a stubbed persistBuildRecord throw is swallowed and the verdict still returned (ac4), a missing epicHash returns 'no-identity', the plan-driven validate path is unchanged (regression), and the completion gate (approveWorkflowTarget) finds + approves the persisted standalone record (ac2). Run the daemon test sweep (tsx --test) to confirm green.

**Acceptance checks:**
- a unit test asserts the standalone validate writes BUILD-<epicHash>-S001.json (existsSync) with the change-log (ac1/ac3)
- a unit test asserts the fail-open behaviour (persist throw → verdict still returned) (ac4) and the no-identity guard
- a regression test asserts the plan-driven validate path + unresolved-target error are unchanged
- a unit test asserts the completion gate approves the persisted standalone record (ac2)
- the full daemon test sweep passes green

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| handleBuildStep({phase:'validate', standalone:{standalone:true, epicHash, storyId:'S001', sizeClass:'small'}}) with a stubbed passing verdict writes BUILD-<epicHash>-S001.json (existsSync) keyed to the story identity (ac1) | `t1` |
| the persisted standalone record carries the file-level changeLog from collectBuildChangeLog when the changed set is non-empty (ac3) | `t1` |
| the returned value is the verdict ({next:'done', verdict, passed}) — same shape as the plan-driven path | `t1` |
| a persistBuildRecord throw (stubbed) during the standalone branch is swallowed and the verdict is still returned — the build is not turned into an error (ac4) | `t1` |
| a standalone validate call missing standalone.epicHash returns BuildStepError('no-identity') and writes no BUILD-undefined path | `t1` |
| handleBuildStep({phase:'validate', target:'s1/t1'}) (no standalone) still resolves via resolveTaskRef and persists the plan-driven BUILD record exactly as the existing build-step.test.ts:280 test asserts | `t2` |
| a plan-driven validate with an unresolved target still returns BuildStepError('unresolved-target') | `t2` |
| after the standalone validate writes BUILD-<epicHash>-S001.json, approveWorkflowTarget (the completion gate) finds it by the BUILD- prefix and approves it — extending the approve-build-completion.test.ts pattern | `t2` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s2 — the validate-phase gap (BuildStepInputValidate has no standalone; handleValidate resolveTaskRef bails before persistBuildRecord)` — "types.ts:59 BuildStepInputValidate lacks standalone; validate.ts:64 resolveTaskRef, :102 persistBuildRecord in the fail-open persist block."
- **[[c2]]** `prior-artifact` `LLD s2 — the implement standalone pattern to mirror (handleStandaloneImplement + BuildStandaloneContext)` — "implement.ts:70 resolves standalone identity (sizeClass/epicHash/storyId) from BuildStandaloneContext (types.ts:33); S002 mirrors it in validate."
- **[[c3]]** `prior-artifact` `LLD s2 — test strategy over the build-step suite (build-step.test.ts + approve-build-completion.test.ts)` — "extend the _setBuildValidateProviderForTests-driven suite: standalone persist + fail-open + no-identity + plan-driven regression + completion-gate approve."
