<!-- insrc:artifact LLD-787434000fa22691-s1 -->

# LLD: STORY-787434000fa22691-s1 — Replace the build gate's hardcoded Node commands with project-type guidance

## Summary

**Epic:** `replace-build-gate-s-hardcoded-node`
**HLD base run:** `wf-1795111970362-jt5tqs`
**HLD effective hash:** `787434000fa2...`

The build gate and the builder's prompt stop assuming a Node project. The prompt names the typecheck and test commands that fit the project's type, taken from a table keyed by the files at the repository root. The gate keeps its Node behaviour for a Node project, and a project of another type states its own typecheck and test commands and how to read the result (tap or exit code) in a repo setting; without them the gate says it ran nothing instead of passing.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)
9. [Open questions](#9-open-questions)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `basePlan`

```typescript
function basePlan(profile: CommandProfile): Pick<ValidationCheckPlan, 'typecheck' | 'testCommand' | 'typecheckTimeoutMs' | 'testTimeoutMs'> & { resultFormat: 'tap' | 'exit-code'; commandsSource: 'node-default' | 'repo-setting' | 'none' }
```

**Parameters:**
- `profile: CommandProfile` — The commands the project states or the Node default; replaces the TYPECHECK_ARGV and TEST_RUNNER_ARGV constants.

**Returns:** `plan fields` — The typecheck argv, the test command argv, the time limits, how a test run is read, and where the commands came from.

**Errors:**
- `InvalidCommandSetting` when A repo setting names an empty command or a result format other than tap or exit-code.

**Preconditions:**
- The project type was read from the repository root's marker files, or the repo setting was read.

**Postconditions:**
- A Node project with no setting gets exactly today's argv and TAP reading.
- A project of another type with no setting gets commandsSource 'none' and no command.

### 2.2 `runValidationChecks`

```typescript
function runValidationChecks(repoPath: string, plan: ValidationCheckPlan, deps?: CheckRunnerDeps): Promise<ValidationCheckResults>
```

**Parameters:**
- `plan: ValidationCheckPlan` — A plan whose commands may be absent (commandsSource 'none').

**Returns:** `ValidationCheckResults` — For a plan with no commands, a typecheck result and a tests result that each say nothing ran, never ok true.

**Preconditions:**
- Never throws: a failure to start is a failed CheckResult with a note.

**Postconditions:**
- A plan with commandsSource 'none' makes no process call.
- A tests result for a plan with resultFormat 'exit-code' passes when every test file command exits 0, and named test cases are not checked per case.
- A plan with resultFormat 'tap' is judged exactly as today.

### 2.3 `withTypecheckProjects`

```typescript
function withTypecheckProjects(repoPath: string, plan: ValidationCheckPlan, base?: string, storyKey?: string): Promise<ValidationCheckPlan>
```

**Parameters:**
- `plan: ValidationCheckPlan` — Extra tsconfig project directories are added only for a Node plan.

**Returns:** `ValidationCheckPlan` — The plan unchanged for a plan that is not Node-based.

**Postconditions:**
- For a non-Node plan no tsconfig.json search is made.

### 2.4 `TYPECHECK_CMD`

```typescript
const TYPECHECK_CMD: string  // becomes a value read from the command profile, no longer the literal 'npx tsc --noEmit'
```

**Returns:** `string` — The typecheck command line shown to the builder in the implement-task prompt and the Definition of done.

**Postconditions:**
- For a project with no known commands the prompt says to find and run the project's own typecheck and tests, naming the table's guidance for its type.

## 3. Data model changes

### 3.1 `CommandProfile` — new

One value per project: the project type (node, python, go, rust, jvm or unknown), the typecheck argv, the test command argv, the result format (tap or exit-code) and where the commands came from (node-default, repo-setting or none). The project type comes from marker files at the repository root; the per-type commands in the table are guidance text for the prompt, not commands the gate runs. Only a repo setting or the Node default gives the gate a command.

**Call sites:**
- `src/daemon/steps/build-step/validation-checks.ts:219-221`
- `src/daemon/steps/build-step/render.ts:30-31`
- `src/daemon/steps/build-step/render.ts:113-114`
- `src/daemon/steps/build-step/phases/validate.ts:433-434`

### 3.2 `ValidationCheckPlan` — field-add

Adds resultFormat ('tap' | 'exit-code') and commandsSource ('node-default' | 'repo-setting' | 'none'); typecheck and testCommand may be empty when commandsSource is 'none'. The route builders keep spreading basePlan.

**Call sites:**
- `src/daemon/steps/build-step/validation-checks.ts:97-117`
- `src/daemon/steps/build-step/validation-checks.ts:347`
- `src/daemon/steps/build-step/validation-checks.ts:369-372`
- `src/daemon/steps/build-step/validation-checks.ts:411`

### 3.3 `CheckResult` — invariant-change

A check that ran no command is ok false with a note that says why, so a gate that ran nothing cannot read as passed; the verdict combines it as a failed independent check and the builder's and verdict session's evidence are reported beside it.

**Call sites:**
- `src/daemon/steps/build-step/validation-checks.ts:133-136`
- `src/daemon/steps/build-step/phases/validate.ts:434`

## 4. Error paths

**Error cases**

- **A repo setting names an empty command, a command that does not start, or a result format other than tap or exit-code** (recoverable)
  - Detection: basePlan validates the setting when it builds the plan; a spawn failure surfaces as a spawnError in runOne or runTestFile
  - Response: A bad setting is refused with InvalidCommandSetting naming the field, and no command runs; a command that cannot start is a failed CheckResult with a 'could not start' note, as today
  - User impact: The validate turn reports an actionable reason instead of passing or hanging
- **A project of a type other than Node has no repo setting, so the gate has no command to run** (recoverable)
  - Detection: The plan's commandsSource is 'none'
  - Response: runValidationChecks makes no process call and returns a typecheck result and a tests result that are ok false with a note saying the gate ran nothing and why
  - User impact: The build does not read as passed; the user sees that the gate had no commands and can set them
- **The project type cannot be told from the marker files (several markers, or none)** (recoverable)
  - Detection: Project-type detection finds no marker or markers of different types at the repository root
  - Response: The type is 'unknown'; the prompt gives the generic instruction to find and run the project's own typecheck and tests, and the gate falls back as for a type with no setting
  - User impact: No wrong command is shown or run on a guess
- **A test command with result format exit-code is used for a Task whose named tests must be checked per case** (recoverable)
  - Detection: A named test of the plan has cases and the plan's resultFormat is 'exit-code'
  - Response: The tests check passes only on exit codes and records, per named test, that its cases were not checked individually; a named test the builder reported with a result keeps that result as reported
  - User impact: The record says which evidence is per case and which is not

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A Node project (package.json at the root) with no repo setting | Identical to today: npx tsc --noEmit, npx tsx --test-force-exit with the TAP reporter, per-case results, tsconfig projects checked |
| A Node project whose repo setting gives its own commands | The setting wins over the Node default; commandsSource is 'repo-setting' |
| A monorepo with a package.json at the root and a go.mod in a subdirectory | The root's marker decides the type; the subdirectory is not guessed |
| A change that touches only documents | The plan's noTests rule decides as today, whatever the project type |

**Invariants to preserve**

- A Node project with no setting is gated by exactly the typecheck and TAP-judged test runs it has today, in the repository root and in each extra tsconfig project that owns a touched file [[c2]]
- A run whose output was not understood as TAP proves nothing, and a run that ran nothing never reads as a pass [[c2]]
- The prompts tell the verdict session not to run the typecheck or tests itself because the daemon already has; this stays true only where the daemon ran them [[c3]]
- The constants asserted by the existing tests keep their values for the Node default, so the Node tests stay green [[c4]]

## 5. Test strategy

**Test framework:** `node:test run through tsx, with the existing stand-in process runner and temporary repositories (convention of src/daemon/steps/build-step/__tests__)`

**Test levels**

- **unit** — Prove the command profile, the plan fields and the gate's two result formats without running a real toolchain
  - Subjects: `src/daemon/steps/build-step/__tests__/validation-checks.test.ts: basePlan gives the Node default for a package.json project, a repo setting wins, a non-Node type with no setting has commandsSource 'none'`, `src/daemon/steps/build-step/__tests__/validation-checks.test.ts: runValidationChecks makes no process call for commandsSource 'none' and returns ok false with a note`, `src/daemon/steps/build-step/__tests__/validation-checks.test.ts: an exit-code plan passes when every file exits 0 and fails on a non-zero exit`, `src/daemon/steps/build-step/__tests__/validation-checks.test.ts: withTypecheckProjects makes no tsconfig search for a non-Node plan`, `src/daemon/steps/build-step/__tests__/render.test.ts: the prompt and the Definition of done name the project type's commands and no npx tsc for a Python or Go project`
  - Fixtures: `Temporary repositories holding only a marker file (package.json, pyproject.toml, go.mod, Cargo.toml, pom.xml, or none)`, `The stand-in process runner already used by validation-checks.test.ts`
- **integration** — Prove the validate phase end to end for a Node project and for a non-Node project with and without a setting
  - Subjects: `src/daemon/steps/build-step/__tests__/validate-task-round.test.ts: a Node project's round is unchanged`, `src/daemon/steps/build-step/__tests__/validate-task-round.test.ts: a project with no commands is not passed and its record says the gate ran nothing`
  - Fixtures: `The existing validate-round harness with a stand-in verdict session`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `validation-checks.test.ts: a Node project with no setting gets the same argv and TAP judging as before`, `render.test.ts: the prompt of a Node project still names npx tsc --noEmit and the Node test command` |
| `ac2` | `render.test.ts: the implement-task prompt and the Definition of done for a Python, Go, Rust and JVM project name that type's commands and no npx tsc or npx tsx`, `validation-checks.test.ts: no Node command constant is the source of a non-Node plan` |
| `ac3` | `validation-checks.test.ts: a project with no known commands makes no process call and both checks are ok false with a note`, `validate-task-round.test.ts: such a build does not read as passed` |
| `ac4` | `validation-checks.test.ts: a repo setting wins over the default; an empty command or an unknown result format is refused with InvalidCommandSetting`, `validation-checks.test.ts: an exit-code plan passes on exit 0 and fails otherwise` |
| `ac5` | `validation-checks.test.ts and tap-results.test.ts and validation-checks-registry.test.ts pass unchanged for the Node default` |

## 6. Migration

**State before:** Every build, whatever the project, is gated by npx tsc --noEmit and npx tsx --test-force-exit with a TAP report (validation-checks.ts constants spread by basePlan), and every builder prompt tells the builder to run npx tsc --noEmit and npx tsx --test (render.ts constants and the implement-task prompt). A non-Node project can never pass the gate.

**State after:** A command profile is read once per build. A Node project with no setting behaves exactly as before. The prompt names the project type's commands from a guidance table. A project of another type either states its commands and result format in a repo setting and gets an independent run, or has no commands and the gate says it ran nothing and does not pass it.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the command profile and the project-type detection from root marker files, with the Node default reproducing today's argv and TAP format; no behaviour changes yet — ↩ rollbackable
2. Route basePlan and the plan fields resultFormat and commandsSource through the profile, keep the TYPECHECK_ARGV and TEST_RUNNER_ARGV values as the Node default, and make runValidationChecks return a failed, explained result when there is no command — ↩ rollbackable
3. Add the exit-code result format to the tests check and skip the tsconfig project search for a plan that is not Node-based — ↩ rollbackable
4. Render the prompt, the Definition of done and the implement-task slots from the profile and the guidance table instead of the TYPECHECK_CMD and TEST_CMD literals — ↩ rollbackable
5. Read the optional repo setting for the typecheck command, the test command and the result format, validate it, and document it in docs/daemon.md — ↩ rollbackable

**Backward compat:** No stored data and no public API change. A Node project with no repo setting sees the same plan, commands, prompts and results as before. A non-Node project that previously could not pass the gate now sees an explained failure or, with a setting, an independent run. A repo setting is new and optional, so no existing config needs editing.

## 7. Alternatives considered

### 7.1 a1: Guidance only, no gate run for non-Node projects

Detect the project type; for Node the gate runs as today; for any other type the builder prompt names that type's typecheck and test commands and the gate runs nothing of its own.

Add a small table in the build step from project type to the typecheck command, the test command and the test-file naming, used only to render the implement-task prompt and the Definition of done (replacing TYPECHECK_CMD and TEST_CMD). The project type is read from marker files at the repository root (package.json, pyproject.toml or setup.py, go.mod, Cargo.toml, pom.xml or build.gradle, build.sbt). The gate keeps its TAP-based run for a Node project only. For a project of another type the validate phase skips the typecheck and tests checks and records that the gate ran nothing, so the verdict session and the builder's own report carry the result.

**Rejected because:** Meets the request but drops the daemon's own typecheck and test run for every non-Node project. CLAUDE.md puts accuracy first and the gate's passed is the daemon's judgment, not a self-report.

### 7.2 a2: Per-project-type commands the gate runs, judged by exit code

A table gives each project type its typecheck argv and test argv, the gate runs them, and for a non-Node type a test file passes when its command exits 0.

Introduce a project profile (type, typecheck argv, test command argv, test-file pattern) resolved from marker files and an optional repo setting that overrides it. The gate and the prompt both read the profile. The Node profile keeps TAP parsing and per-case results. Other profiles run the typecheck and each test file or package and judge by exit code only; a named test case cannot be checked individually, so a Task's named tests for such a project are checked by file and by the builder's report.

**Rejected because:** Keeps an independent run but guesses each project's runner from marker files, and its exit-code-only judgment is weaker than the Node gate while costing a large build.

### 7.3 a3: Profiles with a result reader per runner

As a2, plus a reader per runner that turns its output (TAP, JUnit XML, go test -json, pytest junit) into per-case results.

Keep the project profile of a2 and add a result-reader interface the gate calls: the Node profile uses the existing TAP reader, and other profiles name a machine-readable reporter and a reader for it (go test -json, pytest with junit output, cargo test with a JSON or junit formatter, maven surefire XML). Named tests are checked per case for every type.

**Rejected because:** Best evidence but the largest build, not asked for, and its readers could not be tested here for Go, Rust or Java.

### 7.4 a4: Guidance by type with the gate's commands taken from a repo setting — **CHOSEN**

The prompt gets type-specific guidance; the gate's own typecheck and test commands come from an optional repo setting and run only when the repo sets them (the Node default stays for a Node project).

As a1 for the prompt: a table of per-type commands renders the guidance, so no hardcoded npx tsc remains. The gate reads two optional repo-level settings, a typecheck command and a test command with a stated result format (tap or exit-code). A Node project with no setting keeps today's behaviour; a project of another type with no setting runs nothing and says so; a project that sets them gets an independent run, judged by TAP or exit code as stated.

## 8. References

- **[[c1]]** `code` `src/daemon/steps/build-step/validation-checks.ts:35` — "s1 search.text: the hardcoded typecheck and test-runner argv constants (also validation-checks.ts:43 and :219-221; render.ts:30-31, :113-114, :239-240)"
- **[[c2]]** `code` `src/daemon/steps/build-step/validation-checks.ts:443-470` — "s1 module.profile: how the gate runs the typecheck and the tests and reads the TAP report (also validation-checks.ts:515-560 and tap-results.ts:63)"
- **[[c3]]** `code` `src/daemon/steps/build-step/phases/validate.ts:433-434` — "s1 usage.example: the validate phase builds the plan, adds the typecheck projects and runs the checks (also render.ts:280 and :311)"
- **[[c4]]** `code` `src/daemon/steps/build-step/__tests__/validation-checks.test.ts:100-101` — "s1 test.locate: tests that assert the current constants (also validation-checks.test.ts:58 and :708-710)"

## 9. Open questions

- Confirm alternative a4 (guidance by type, with an optional repo setting that gives a non-Node project an independent gate run): the request did not choose between guidance only and configured commands.
- cd1 partial: CommandProfile and InvalidCommandSetting are new symbols, declared as new rather than taken from an existing symbol.
- ep3 partial: the invariants cite c2, c3 and c4, assumed to be the ids of the s1 bundles in order and given below as citations.
- ts1 partial: the Story has no acceptance criteria, so ac1 to ac5 were written by this LLD and need the user's confirmation as the acceptance criteria.
- alt2 partial: alternatives were scored against four constraints derived from the request, since no Story, Epic or HLD constraints exist.
- sbdry4 partial: the criterion ids ac1 to ac5 and citation ids c2 to c4 are labels this LLD assigned.

## Resolved questions

- `q188e74ee` — Confirm alternative a4 (guidance by type, with an optional repo setting that gives a non-Node project an independent gate run): the request did not choose between guidance only and configured commands.
  - **resolved**: Guidance with an optional gate — User approved the LLD with alternative a4 (2026-11-19): guidance by project type plus an optional repo setting for an independent gate run. _(2026-11-19T18:26:12.000Z)_
- `q0c9c644b` — cd1 partial: CommandProfile and InvalidCommandSetting are new symbols, declared as new rather than taken from an existing symbol.
  - **resolved**: Define both as new symbols — User approved 2026-11-19: no existing equivalents were found; CommandProfile and InvalidCommandSetting are new. _(2026-11-19T18:27:07.976Z)_
- `q8c62c1f9` — ep3 partial: the invariants cite c2, c3 and c4, assumed to be the ids of the s1 bundles in order and given below as citations.
  - **resolved**: Verify existing IDs — Verified 2026-11-19: c1-c4 in the LLD are the four s1 analyze bundles in order (search.text, module.profile, usage.example, test.locate); c2, c3 and c4 cite the intended bundles. _(2026-11-19T18:27:55.231Z)_
- `q59c82aa2` — ts1 partial: the Story has no acceptance criteria, so ac1 to ac5 were written by this LLD and need the user's confirmation as the acceptance criteria.
  - **resolved**: Confirm ac1–ac5 — User was offered ac1-ac5 for amendment on 2026-11-19, said 'yes, resolve all' and asked for no changes, so the five LLD-authored criteria stand as the Story's acceptance criteria. _(2026-11-19T18:28:31.456Z)_
- `q0a66b38a` — alt2 partial: alternatives were scored against four constraints derived from the request, since no Story, Epic or HLD constraints exist.
  - **resolved**: Confirm constraints before proceeding — User confirmed 2026-11-19 (yes, resolve all): the four request-derived constraints (guidance by project type, no hardcoded Node command, independent gate evidence, stays small) are the scoring basis; no Story, Epic or HLD constraints exist. _(2026-11-19T18:28:57.665Z)_

## Citations

- **[[c1]]** `code` `src/daemon/steps/build-step/validation-checks.ts:35` — "s1 search.text: the hardcoded typecheck and test-runner argv constants (also validation-checks.ts:43 and :219-221; render.ts:30-31, :113-114, :239-240)"
- **[[c2]]** `code` `src/daemon/steps/build-step/validation-checks.ts:443-470` — "s1 module.profile: how the gate runs the typecheck and the tests and reads the TAP report (also validation-checks.ts:515-560 and tap-results.ts:63)"
- **[[c3]]** `code` `src/daemon/steps/build-step/phases/validate.ts:433-434` — "s1 usage.example: the validate phase builds the plan, adds the typecheck projects and runs the checks (also render.ts:280 and :311)"
- **[[c4]]** `code` `src/daemon/steps/build-step/__tests__/validation-checks.test.ts:100-101` — "s1 test.locate: tests that assert the current constants (also validation-checks.test.ts:58 and :708-710)"
