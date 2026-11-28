# Manual code review — controller-maintenance scope

- **Change:** ISSUE-e1aed06b860a76cb / BUILD-e1aed06b860a76cb-s1 — *Align controller tests with retired lifecycle removal* (small bugfix, no LLD/PLAN)
- **Scope:** `scopes/controller-maintenance/` — base `2fca011a69ec`, review head `2cf1eea1cb5c` (code commits `c7932b377e2d`, `82190bed1027`; record commits `b06fb951d955`, `2cf1eea1cb5c`)
- **Files reviewed:** `scripts/__tests__/test-harness-commands.test.ts`, `scripts/__tests__/test-harness-consumers.test.ts`, ISSUE.md, S001/BUILD.md, S001/TESTS.md, S001/evidence/controller-maintenance.md, S001/evidence/surrounding-audit.json, `evidence/controller-history/*.tap` (packet root)
- **Reviewed against:** the code at `2cf1eea1cb5c` in the local repository (`scripts/test-harness/{build,run,process}.mjs`, `test-harness-coordinator.test.ts`, `controller-store.test.ts`, `driver-log-policy.test.ts`, `vscode-plugin/package.json`)
- **Reviewer:** Claude Code (controller session), 2026-11-28
- **Not done:** tests were not re-run; no files outside this review note were changed; no approval performed.

## Verdict

**Acceptable, with two follow-ups recommended. No blocking findings.**

The change does what the approved ISSUE asks: it is confined to two test files, makes no production change, and every new expectation matches the current code at the review head. The one material concern is that `--test-force-exit` hides an undiagnosed non-exit in the saved-mode case instead of explaining it (finding 1).

## Findings

| # | Severity | Location | Finding and consequence | Proposed correction |
|---|---|---|---|---|
| 1 | LOW-MED | `test-harness-commands.test.ts:79-85` (`testArgs` with `--test-force-exit`) | The selected saved-mode case (`driver-log-policy.test.ts:25`, *CM-S3-DRIVER-LOGS: owner context is immutable lazy quiet…*) passed but its process did not exit. `evidence/controller-history/maintenance-e1-surrounding.tap:47-50` shows the file killed by the 120 s timeout under the harness default arguments. The fix adds `--test-force-exit`, which makes the process exit, but the retained handle was never identified (controller-maintenance.md says so). `--test-force-exit` is a common project convention (`src/daemon/__tests__/*.test.ts` headers), so this isn't wrong. But a real handle leak in driver-log policy, or in its test, is now masked here, and the nested run no longer matches the harness default (`run.mjs:47`, which has no force-exit). | Identify the retained handle (for example `--test-reporter=spec` with `process._getActiveHandles()` at the end of the file), or record a tracked follow-up ISSUE that names the unexplained non-exit, so the masking is explicit and on the ledger. |
| 2 | LOW | `test-harness-commands.test.ts:88` | `assert.equal(file.coverageIncomplete, false)` cannot fail. `run.mjs:71` computes `coverageIncomplete = testArgs === undefined && …`, and this test supplies `testArgs`, so the value is always `false`. The adjacent `coverage.counts.pass === 1` check does catch a missing TAP report, so actual protection is preserved. The assertion still overstates what is checked. | Drop the assertion, or replace it with `assert.equal(file.coverage.status, 'reported')`, which does depend on the TAP output. |
| 3 | LOW | `test-harness-commands.test.ts:82-84` | The custom `testArgs` drops `--test-concurrency=1`, which the harness default includes (`run.mjs:47`). This is harmless today because exactly one case is selected per file, but it silently diverges from the default command if the pattern is widened. | Keep `--test-concurrency=1` alongside `--test-force-exit`, or build on the default argument list instead of restating it. |
| 4 | LOW (record) | `S001/TESTS.md` header | The header reads "**Totals:** 0 pass, 0 fail, 0 skipped, 0 not found", while the per-file tables show `pass` for 4 and 2 titles with exit 0. The run-by-file route apparently doesn't feed the named-test totals. This is a rendering issue in the gate's record, not in this change, but a reader of TESTS.md alone sees "0 pass". | Note it in the BUILD summary, or file it against the TESTS renderer. Not a blocker for this change. |

## Checks performed and found sound

**Build-stage expectation (`test-harness-commands.test.ts:44`)**
- The new eight-stage list matches `buildStages` at the head exactly (`scripts/test-harness/build.mjs:42-49`): clean-output, the project-memory build, tsc, typecheck:tools, forbidden-spawn-scan, check-model-definitions, copy-assets, build-installer-control.
- The retired `build-process-broker.mjs` and `build-shutdown-watchdog.mjs` stages are correctly removed.

**VS Code asset command (`:53`)**
- `vscode-plugin/package.json` at the head has exactly `"sync-assets": "node ../scripts/sync-client-runtime-assets.mjs vscode"`.
- The exact `assert.equal` is stronger than the old `assert.match` on `INSRC_PACKAGED_INSTALLER`.

**Replacement selector for the native refusal case (`:79`)**
- The deleted `src/shared/__tests__/daemon-process-client.test.ts` is absent at the head.
- The replacement `controller rejects lock replacement and unsafe records or control roots` exists at `src/installer/__tests__/controller-store.test.ts:81`, and the anchored `^…$` pattern matches it exactly.
- The case does exercise native refusal: `ControllerStore` acquires, holds and replaces through `controlBinding()` (`controller-store.ts:91-96,124`), and the test asserts `lock-lost` and `lock-invalid` refusals. The test's title remains accurate.
- The saved-mode case still exists unchanged at `driver-log-policy.test.ts:25`.
- `pass === 1` per file, together with `results.length === 2`, proves both selections really ran.

**Strict-closure mode**
- `INSRC_BUILD_CONFIRM_CLOSURE: '1'` is injected through the same cloned-environment wrapper used at `test-harness-coordinator.test.ts:159,180` and `qualification-containment.mjs:83`. It does not mutate `process.env`.
- `process.mjs:27` reads it from `run.environment()`, so the `closureMode === 'owned-groups'` assertion now holds whatever the ambient environment is.
- The record says this was proven by a run with the parent variable unset (`maintenance-e1-explicit-closure.tap`).

**`runHarness` options**
- `ownedRun` and `ownedScope` are supplied as the required pair (`run.mjs:48`), and `withRun(run, scope => …)` gives the retained scope.
- The new `cleanup.json` assertions (`confirmedClosed`, `owned-groups`, empty error arrays) and the released-lease check (`.insrc/tmp/test-harness/active` absent) strengthen the test.

**Retired consumers test (`test-harness-consumers.test.ts`)**
- All five removed consumer files are absent at the head (`daemon-ctl-forced-stop`, `process-broker-native`, `shutdown-lifecycle-evidence`, `shutdown-watchdog`, `shutdown-bounded`).
- No product test calls `requirePreparedBuild` outside the harness, which matches the ISSUE's own search.
- The guards the deleted test exercised are still covered:
  - **writer/reader exclusion** (`harness-busy`): `test-harness-coordinator.test.ts:27-30`
  - **reader rebuild refused** (`harness-write-during-read` via `mainBuild`): `:33-34`
  - **output drift** (`harness-build-drift`): `:36-37`
  - **missing helper** (`harness-build-incomplete`): `:41`
  - **source drift in the mutation lane**: `:53-54`
- The applicable raw-invocation refusal is kept for `MUTATION_FILE`. Its immutability fingerprint is widened to `out` plus `packages/project-memory/dist`, which matches `publishPrepared` (`build.mjs:56`).
- The serial retirement-package mutation regression is kept unchanged.
- Unused imports (`closeSync`, `openSync`, `writeFileSync`, `pathToFileURL`, `createRun`, `prepareBuild`, `withRun`) are removed.

**Scope discipline**
- Only the two test files change in code. There is no production helper, runtime, budget, dependency or wire change, matching the ISSUE's fix intent.

**Evidence**
- The pre-fix baseline (`budget-t2-controller-baseline-ae1b93f79.tap`) failed 3 of 3, as the ISSUE states.
- `surrounding-audit.json` reports 16/16 with three owned-group-confirmed runs, empty error arrays and all-zero result codes.
- The registered validation passed 4 commands cases and 2 consumers cases with exit 0.
- The record is candid about the first registered failure (an ambient environment dependency), the first isolated failure, and the blocked interrupted isolate `d7a67629` at `/private/tmp/insrc-q5-pb8Jqt`. That isolate is correctly kept outside the passing evidence and was not tidied away by inference.

## Open items for the owner

1. Finding 1: diagnose the saved-mode non-exit now, or accept `--test-force-exit` with a tracked follow-up ISSUE?
2. The blocked isolate `d7a67629` (`/private/tmp/insrc-q5-pb8Jqt`: 13 admissions, 12 disposals, a surviving actor marker) still needs explicit operator recovery or disposal. It is outside this change's evidence, but it will keep its lease and worktree until someone handles it.
3. Human BUILD approval for BUILD-e1aed06b860a76cb-s1 is pending. Nothing in this review grants it.
