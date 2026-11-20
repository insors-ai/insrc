<!-- insrc:artifact TESTS-787434000fa22691-s1 -->

# Tests: 787434000fa22691 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 39 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-19T18:39:05.994Z on commit `8cf85dc13`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/steps/build-step/__tests__/validation-checks.test.ts: project type is detected from root marker files and mixed or no markers give unknown**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | project type is detected from root marker files and mixed or no markers give unknown | `src/daemon/steps/build-step/__tests__/validation-checks.test.ts` |

**unit: src/daemon/steps/build-step/__tests__/validation-checks.test.ts: the Node default profile equals today's argv and tap format**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the Node default profile equals today's argv and tap format | `src/daemon/steps/build-step/__tests__/validation-checks.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/steps/build-step/__tests__/validation-checks.test.ts` | 0 | 33 | 5.9 s |  |

## t2

Run at 2026-11-19T18:43:45.201Z on commit `5a862ba31`. Tests check: **passed**. 10 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/steps/build-step/__tests__/validation-checks.test.ts: a Node project with no setting gets the same argv and TAP judging as before**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a Node project with no setting gets the same argv and TAP judging as before | `src/daemon/steps/build-step/__tests__/validation-checks.test.ts` |
| pass | the captured run in the Story's tap-sample folder gives the result of each of its titles: pass, fail, skipped for ' # SKIP' with and without a reason, and skipped for ' # TODO' | `src/daemon/steps/build-step/__tests__/tap-results.test.ts` |
| pass | a title nested in a suite or a subtest is found at its depth by its own title | `src/daemon/steps/build-step/__tests__/tap-results.test.ts` |
| pass | TAP's escaping of '#' and backslash in a title is reversed, so the title as declared matches (mutation: compare the raw line) | `src/daemon/steps/build-step/__tests__/tap-results.test.ts` |
| pass | a title that occurs twice fails if either occurrence failed, passes if one passed and none failed, and is skipped if both were skipped | `src/daemon/steps/build-step/__tests__/tap-results.test.ts` |
| pass | output with no TAP version line and no result line is reported as not understood, with no titles | `src/daemon/steps/build-step/__tests__/tap-results.test.ts` |
| pass | validation-checks-registry.test.ts: trackedFiles, changedFiles and trivialCheckPlan return the old file lists including deleted and untracked files | `src/daemon/steps/build-step/__tests__/validation-checks-registry.test.ts` |
| pass | validation-checks-registry.test.ts: no execFileSync call remains in validation-checks.ts for git | `src/daemon/steps/build-step/__tests__/validation-checks-registry.test.ts` |

**unit: src/daemon/steps/build-step/__tests__/validation-checks.test.ts: a project with no known commands makes no process call and both checks are ok false with a note**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a project with no known commands makes no process call and both checks are ok false with a note | `src/daemon/steps/build-step/__tests__/validation-checks.test.ts` |

**unit: src/daemon/steps/build-step/__tests__/validation-checks.test.ts: no Node command constant is the source of a non-Node plan**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | no Node command constant is the source of a non-Node plan | `src/daemon/steps/build-step/__tests__/validation-checks.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/steps/build-step/__tests__/tap-results.test.ts` | 0 | 5 | 0.4 s |  |
| `src/daemon/steps/build-step/__tests__/validation-checks-registry.test.ts` | 0 | 2 | 0.6 s |  |
| `src/daemon/steps/build-step/__tests__/validation-checks.test.ts` | 0 | 36 | 6 s |  |

## t3

Run at 2026-11-19T18:48:34.713Z on commit `4199c00d2`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/steps/build-step/__tests__/validation-checks.test.ts: an exit-code plan passes when every file exits 0 and fails on a non-zero exit**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an exit-code plan passes when every file exits 0 and fails on a non-zero exit | `src/daemon/steps/build-step/__tests__/validation-checks.test.ts` |
| pass | runValidationChecks runs each file in its own process, in order, with the TAP reporter, and returns per file its exit code and titles (mutation: run all files in one command) | `src/daemon/steps/build-step/__tests__/validation-checks.test.ts` |
| pass | a named test whose cases took their file's exit code carries its note into the document, above its table | `src/workflow/runners/build/__tests__/test-record.test.ts` |

**unit: src/daemon/steps/build-step/__tests__/validation-checks.test.ts: withTypecheckProjects makes no tsconfig search for a non-Node plan**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | withTypecheckProjects makes no tsconfig search for a non-Node plan | `src/daemon/steps/build-step/__tests__/validation-checks.test.ts` |
| pass | validation-checks-registry.test.ts: trackedFiles, changedFiles and trivialCheckPlan return the old file lists including deleted and untracked files | `src/daemon/steps/build-step/__tests__/validation-checks-registry.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/steps/build-step/__tests__/validation-checks-registry.test.ts` | 0 | 2 | 0.6 s |  |
| `src/daemon/steps/build-step/__tests__/validation-checks.test.ts` | 0 | 38 | 6 s |  |
| `src/workflow/runners/build/__tests__/test-record.test.ts` | 0 | 7 | 0.6 s |  |

## t4

Run at 2026-11-20T05:44:20.781Z on commit `3acdac40a`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/steps/build-step/__tests__/render.test.ts: the prompt of a Node project still names npx tsc --noEmit and the Node test command**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the prompt of a Node project still names npx tsc --noEmit and the Node test command | `src/daemon/steps/build-step/__tests__/render.test.ts` |
| pass | the validate prompts no longer instruct running the repo-wide sweep or any shell command, and the implement prompt still cites it | `src/daemon/steps/build-step/__tests__/render.test.ts` |
| pass | the implement prompt tells the builder to pass the cases for each listed test at the validate turn, and the judge's evidence lists each named test with its cases and results; with no named tests the evidence reads as before | `src/daemon/steps/build-step/__tests__/render.test.ts` |

**unit: src/daemon/steps/build-step/__tests__/render.test.ts: the implement-task prompt and the Definition of done for a Python, Go, Rust and JVM project name that type's commands and no npx tsc or npx tsx**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the implement-task prompt and the Definition of done for a Python, Go, Rust and JVM project name that type's commands and no npx tsc or npx tsx | `src/daemon/steps/build-step/__tests__/render.test.ts` |
| pass | the 'daemon already ran' text is absent when commandsSource is none | `src/daemon/steps/build-step/__tests__/render.test.ts` |
| pass | the mapping instructions follow the project's profile: native test files and file-level checking for a configured non-Node project, per-case checking in .test.ts files for Node | `src/daemon/steps/build-step/__tests__/render.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/steps/build-step/__tests__/render.test.ts` | 0 | 13 | 0.8 s |  |

## t5

Run at 2026-11-20T05:46:10.341Z on commit `3acdac40a`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/steps/build-step/__tests__/validation-checks.test.ts: a repo setting wins over the default; an empty command or an unknown result format is refused with InvalidCommandSetting**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a repo setting wins over the default; an empty command or an unknown result format is refused with InvalidCommandSetting | `src/daemon/steps/build-step/__tests__/validation-checks.test.ts` |
| pass | the build commands are rows of the repo settings table, in the Build group, and no row of the global catalog | `src/daemon/steps/build-step/__tests__/validation-checks.test.ts` |
| pass | repo.settings validates the build rows: a command is a non-empty string, the format is tap or exit-code, and null clears | `src/daemon/steps/build-step/__tests__/validation-checks.test.ts` |
| pass | an exit-code plan passes when every file exits 0 and fails on a non-zero exit | `src/daemon/steps/build-step/__tests__/validation-checks.test.ts` |

**integration: src/daemon/steps/build-step/__tests__/validate-task-round.test.ts: a Node project's round is unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a Node project's round is unchanged | `src/daemon/steps/build-step/__tests__/validate-task-round.test.ts` |
| pass | a settings edit while the checks run changes neither the plan, the judge prompt nor the settings refusal: the profile is resolved once, at the phase's entry | `src/daemon/steps/build-step/__tests__/validate-task-round.test.ts` |

**integration: src/daemon/steps/build-step/__tests__/validate-task-round.test.ts: a project with no commands is not passed and its record says the gate ran nothing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a project with no commands is not passed and its record says the gate ran nothing | `src/daemon/steps/build-step/__tests__/validate-task-round.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/steps/build-step/__tests__/validate-task-round.test.ts` | 0 | 4 | 1.1 s |  |
| `src/daemon/steps/build-step/__tests__/validation-checks.test.ts` | 0 | 42 | 6 s |  |

## t6

Run at 2026-11-20T05:48:04.883Z on commit `3acdac40a`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/config/__tests__/config-catalog-contract.test.ts: the catalog contract holds with the new build-commands row**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the config.catalog payload carries the build commands as repo rows (typecheckCommand, testCommand, resultFormat), and they are no row of the global catalog | `src/config/__tests__/config-catalog-contract.test.ts` |
| pass | real CONFIG_CATALOG self-consistency: every row in-domain, every default satisfies its predicate | `src/config/__tests__/config-catalog-contract.test.ts` |
| pass | enrichment (S001): every enum row carries a non-empty enumValues; every non-enum row omits it | `src/config/__tests__/config-catalog-contract.test.ts` |
| pass | table keys, kinds, GithubEntry fields and one policy row per TeamPolicy rule | `src/config/__tests__/repo-fields.test.ts` |
| pass | the shared fixture equals the daemon table and the config.catalog payload | `src/cli/__tests__/repo-fields-contract.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/cli/__tests__/repo-fields-contract.test.ts` | 0 | 3 | 0.5 s |  |
| `src/config/__tests__/config-catalog-contract.test.ts` | 0 | 13 | 0.4 s |  |
| `src/config/__tests__/repo-fields.test.ts` | 0 | 5 | 0.4 s |  |

## t7

Run at 2026-11-19T19:09:06.849Z on commit `d3e78f03f`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/steps/build-step/__tests__/test-mapping.test.ts: a Node plan refuses a case file that is not .test.ts and a repo-setting plan accepts its own test file**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a Node plan refuses a case file that is not .test.ts and a repo-setting plan accepts its own test file | `src/daemon/steps/build-step/__tests__/test-mapping.test.ts` |
| pass | a mapping is refused, with every fault listed, for an unknown name, a repeated name, a file that is not a tracked '.test.ts' file in the repository, a path that leaves the repository, an empty title, an entry with neither cases nor a reported result, and a reported result on a unit, an integration and a contract test and on a test with no level | `src/daemon/steps/build-step/__tests__/test-mapping.test.ts` |

**unit: src/daemon/steps/build-step/__tests__/validation-checks.test.ts: the trivial plan keeps a repo-setting project's own test files as tests**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the trivial plan keeps a repo-setting project's own test files as tests | `src/daemon/steps/build-step/__tests__/validation-checks.test.ts` |
| pass | trivialCheckPlan marks each touched file 'touched' and the result lists every title of each file | `src/daemon/steps/build-step/__tests__/validation-checks.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/steps/build-step/__tests__/test-mapping.test.ts` | 0 | 5 | 0.4 s |  |
| `src/daemon/steps/build-step/__tests__/validation-checks.test.ts` | 0 | 40 | 6.2 s |  |
