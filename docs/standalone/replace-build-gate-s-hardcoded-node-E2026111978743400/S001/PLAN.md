<!-- insrc:artifact PLAN-787434000fa22691-s1 -->

# Plan: STORY-787434000fa22691-s1

## Summary

**Epic:** `replace-build-gate-s-hardcoded-node`
**LLD run:** `wf-1795111970362-jt5tqs`
**LLD effective hash:** `787434000fa2...`

The build gate stops assuming a Node project. A command profile, read once per build from the repository root's marker files and an optional repo setting, drives both the gate and the builder prompt. A Node project with no setting behaves exactly as today; other project types get their own guidance in the prompt, and either state their commands in a repo setting for an independent run or are told the gate ran nothing.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add CommandProfile and project-type detection | M | — | — | unit: src/daemon/steps/build-step/__tests__/validation-checks.test.ts: project type is detected from root marker files and mixed or no markers give unknown; unit: src/daemon/steps/build-step/__tests__/validation-checks.test.ts: the Node default profile equals today's argv and tap format | [[c1]] [[c2]] |
| 2 | **`t2`** Route basePlan and the plan fields through the profile; no-command result | M | — | `t1` | unit: src/daemon/steps/build-step/__tests__/validation-checks.test.ts: a Node project with no setting gets the same argv and TAP judging as before; unit: src/daemon/steps/build-step/__tests__/validation-checks.test.ts: a project with no known commands makes no process call and both checks are ok false with a note; unit: src/daemon/steps/build-step/__tests__/validation-checks.test.ts: no Node command constant is the source of a non-Node plan | [[c2]] [[c4]] |
| 3 | **`t3`** Exit-code result format and non-Node typecheck project skip | M | — | `t2` | unit: src/daemon/steps/build-step/__tests__/validation-checks.test.ts: an exit-code plan passes when every file exits 0 and fails on a non-zero exit; unit: src/daemon/steps/build-step/__tests__/validation-checks.test.ts: withTypecheckProjects makes no tsconfig search for a non-Node plan | [[c2]] |
| 4 | **`t4`** Render prompts and Definition of done from the profile | M | — | `t1`, `t2` | unit: src/daemon/steps/build-step/__tests__/render.test.ts: the prompt of a Node project still names npx tsc --noEmit and the Node test command; unit: src/daemon/steps/build-step/__tests__/render.test.ts: the implement-task prompt and the Definition of done for a Python, Go, Rust and JVM project name that type's commands and no npx tsc or npx tsx | [[c1]] [[c3]] |
| 5 | **`t5`** Read and validate the optional repo setting; wire the phases | M | — | `t2`, `t3`, `t4` | unit: src/daemon/steps/build-step/__tests__/validation-checks.test.ts: a repo setting wins over the default; an empty command or an unknown result format is refused with InvalidCommandSetting; integration: src/daemon/steps/build-step/__tests__/validate-task-round.test.ts: a Node project's round is unchanged; integration: src/daemon/steps/build-step/__tests__/validate-task-round.test.ts: a project with no commands is not passed and its record says the gate ran nothing | [[c3]] [[c4]] |
| 6 | **`t6`** Config catalog row, contract test and docs for the repo setting | S | — | `t5` | unit: src/config/__tests__/config-catalog-contract.test.ts: the catalog contract holds with the new build-commands row | [[c3]] [[c4]] |
| 7 | **`t7`** Test-file naming for a project with a repo setting (plan-level addition) | M | — | `t5` | unit: src/daemon/steps/build-step/__tests__/test-mapping.test.ts: a Node plan refuses a case file that is not .test.ts and a repo-setting plan accepts its own test file; unit: src/daemon/steps/build-step/__tests__/validation-checks.test.ts: the trivial plan keeps a repo-setting project's own test files as tests | [[c1]] [[c2]] |

### 1.1 TASK-787434000fa22691-s1-t1 — Add CommandProfile and project-type detection

Add the CommandProfile type, InvalidCommandSetting error and a detector that reads root marker files (package.json, pyproject.toml/setup.py, go.mod, Cargo.toml, pom.xml/build.gradle/build.sbt) to give node, python, go, rust, jvm or unknown. Several markers of different types give unknown. Include the per-type guidance table used only for prompt text. The Node default reproduces today's TYPECHECK_ARGV, TEST_RUNNER_ARGV and TAP format. No behaviour change yet.

**Acceptance checks:**
- A temp repo holding only package.json is detected as node, and likewise pyproject.toml python, go.mod go, Cargo.toml rust, pom.xml jvm
- No marker or markers of different types give unknown
- The Node default profile equals today's argv constants and tap format
- The guidance table has an entry for every detected type including unknown, so the prompt can render all of them
- Typecheck passes

### 1.2 TASK-787434000fa22691-s1-t2 — Route basePlan and the plan fields through the profile; no-command result

basePlan takes a CommandProfile and returns the commands plus resultFormat and commandsSource; ValidationCheckPlan gains both fields and allows empty commands. runValidationChecks makes no process call for commandsSource 'none' and returns typecheck and tests results that are ok false with a note saying nothing ran. The four route builders keep spreading basePlan.

**Acceptance checks:**
- A Node project with no setting gets exactly today's plan and TAP judging
- A plan with commandsSource 'none' makes no process call and both checks are ok false with a note
- Existing validation-checks, tap-results and registry tests pass unchanged for the Node default

### 1.3 TASK-787434000fa22691-s1-t3 — Exit-code result format and non-Node typecheck project skip

Add the exit-code path to runTestFile: a test file command passes when it exits 0, with no per-case results, and namedResults records that cases were not checked per case while keeping builder-reported results as reported. withTypecheckProjects makes no tsconfig search for a non-Node plan.

**Acceptance checks:**
- An exit-code plan passes when every file exits 0 and fails on a non-zero exit
- Named tests under an exit-code plan are recorded as not checked per case
- withTypecheckProjects makes no tsconfig search for a non-Node plan
- A tap plan is judged exactly as before

### 1.4 TASK-787434000fa22691-s1-t4 — Render prompts and Definition of done from the profile

Replace the TYPECHECK_CMD and TEST_CMD literals in render.ts and the implement-task prompt slots with values from the profile and guidance table. A Node project keeps today's text; other types name their own commands; an unknown type is told to find and run the project's own typecheck and tests. The statement that the daemon already ran the checks is made only where the daemon ran them.

**Acceptance checks:**
- A Node project's prompt still names npx tsc --noEmit and the Node test command
- Prompts for python, go, rust and jvm name that type's commands and no npx tsc or npx tsx
- The 'daemon already ran' text is absent when commandsSource is none
- render.test.ts passes

### 1.5 TASK-787434000fa22691-s1-t5 — Read and validate the optional repo setting; wire the phases

Read an optional per-repo setting for the typecheck command, test command and result format; validate it in basePlan (empty command or a format other than tap or exit-code is refused with InvalidCommandSetting); the setting wins over the Node default with commandsSource 'repo-setting'. Wire the validate and implement phases to pass the profile to the plan and the prompt.

**Acceptance checks:**
- A repo setting wins over the default for a Node and a non-Node project
- An empty command or unknown result format is refused naming the field and nothing runs
- A non-Node project with a setting gets an independent run judged as stated
- validate-task-round test shows a no-command build does not read as passed and a Node round is unchanged

### 1.6 TASK-787434000fa22691-s1-t6 — Config catalog row, contract test and docs for the repo setting

Add the config catalog row for the new setting, update the row count in config-catalog-contract.test.ts and document the key in docs/daemon.md.

**Acceptance checks:**
- config-catalog-contract test passes with the new row
- docs/daemon.md documents the key, the two result formats and the no-setting behaviour

### 1.7 TASK-787434000fa22691-s1-t7 — Test-file naming for a project with a repo setting (plan-level addition)

Plan-level addition for the user to confirm at approval, not in the LLD: test-mapping refuses a case file not ending in .test.ts and the trivial plan's isTest keeps only .test.ts files in __tests__. For a plan with commandsSource 'repo-setting' and a non-Node type, accept any repo-relative file for a case and treat the project's own test files as tests, leaving the Node rules unchanged.

**Acceptance checks:**
- A Node plan still refuses a case file that is not .test.ts
- A repo-setting python or go plan accepts its own test file path as a case
- The trivial plan's isTest does not drop non-Node test files for such a plan
- test-mapping.test.ts and validation-checks.test.ts pass

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| src/daemon/steps/build-step/__tests__/validation-checks.test.ts: basePlan gives the Node default for a package.json project, a repo setting wins, a non-Node type with no setting has commandsSource 'none' | `t1`, `t2`, `t5` |
| src/daemon/steps/build-step/__tests__/validation-checks.test.ts: runValidationChecks makes no process call for commandsSource 'none' and returns ok false with a note | `t2` |
| src/daemon/steps/build-step/__tests__/validation-checks.test.ts: an exit-code plan passes when every file exits 0 and fails on a non-zero exit | `t3` |
| src/daemon/steps/build-step/__tests__/validation-checks.test.ts: withTypecheckProjects makes no tsconfig search for a non-Node plan | `t3` |
| src/daemon/steps/build-step/__tests__/render.test.ts: the prompt and the Definition of done name the project type's commands and no npx tsc for a Python or Go project | `t4` |
| src/daemon/steps/build-step/__tests__/validate-task-round.test.ts: a Node project's round is unchanged | `t5` |
| src/daemon/steps/build-step/__tests__/validate-task-round.test.ts: a project with no commands is not passed and its record says the gate ran nothing | `t5` |

## 3. References

- **[[c1]]** `code` `src/daemon/steps/build-step/render.ts` — "LLD handoff and s1 search.text bundle: the Node command literals TYPECHECK_CMD and TEST_CMD and the .test.ts convention in test-mapping.ts"
- **[[c2]]** `code` `src/daemon/steps/build-step/validation-checks.ts` — "LLD handoff and s1 module.profile bundle: basePlan, runValidationChecks, runTestFile and namedResults with the TAP reading"
- **[[c3]]** `code` `src/daemon/steps/build-step/phases/validate.ts` — "LLD handoff and s1 usage.example bundle: where the plan and prompt are built and where a repo setting is read (src/config/config-catalog.ts)"
- **[[c4]]** `code` `src/daemon/steps/build-step/__tests__/validation-checks.test.ts` — "LLD handoff and s1 test.locate bundle: existing tests whose constants stay for the Node default, and the config catalog contract test"
