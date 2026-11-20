# Test failure audit — 2026-11-20

Audited checkout: `v2`, commit `d7bcd4f9ae10162c710d9f10ebca145a62d8b2d9`, macOS arm64. This is an investigation record, not an implementation plan or an assertion that every failure is a product defect. No fixes were applied.

## Execution and limits

The backend was launched with Node **22.23.2**, using the local `tsx`, TAP output, `--test-force-exit`, and four test-file workers. Release-script/project-memory and VS Code sweeps used two workers. Live-service opt-ins were not enabled. The shell's default Node is **26.5.1**: tests that spawn `npm` through the inherited PATH can still use Node 26. Later isolated runs explicitly put Node 22 first on PATH. This distinction matters for the packaging failure below.

Commands (from the repository root unless stated):

```sh
NODE22=/opt/homebrew/opt/node@22/bin/node
"$NODE22" node_modules/tsx/dist/cli.mjs --test --test-force-exit --test-concurrency=4 --test-reporter=tap 'src/**/__tests__/*.test.ts'
"$NODE22" node_modules/tsx/dist/cli.mjs --test --test-force-exit --test-concurrency=2 --test-reporter=tap 'scripts/__tests__/*.test.ts' 'packages/project-memory/src/__tests__/*.test.ts'
# VS Code, cwd vscode-plugin; direct execution does not run npm's pretest asset sync:
"$NODE22" ../node_modules/tsx/dist/cli.mjs --test --test-force-exit --test-concurrency=2 --test-timeout=60000 --test-reporter=tap 'src/**/__tests__/*.test.ts'
# JetBrains, cwd jetbrains-plugin:
./gradlew test --console=plain
./gradlew test --no-configuration-cache --console=plain
```

The initial VS Code run stopped advancing; the bounded replacement completed. A 60-second file timeout is an audit limit, not evidence that the entire docs-review suite is functionally broken: that file executes repeated synchronous TypeScript compilations. Its interrupted probe also contaminated a later compile check. The probe was identified and removed after its owning process exited. Asset mismatch failures from bypassing `npm pretest` are labelled as prerequisites below.

Backend tests also share the checkout's ignored `out/` directory. Some build/rebuild it, and the retirement packaging test cleans it. Missing compiled helpers and subsequent fixture failures must be distinguished from source assertion failures. Do not treat this concurrent sweep as an isolated qualification of native lifecycle behavior.

The primary backend sweep cannot finish normally because `src/daemon/steps/__tests__/peer-state-store-leakfree.test.ts` creates a top-level `MessageChannel` but contains **no test declarations**. Its `after` hook is never reached, leaving the two ports open. `--test-force-exit` at the overall runner does not cure a child file that never completes. A bounded continuation runs the 887 test files sorted from that path onward with `--test-timeout=60000`, Node 22 first on PATH, and four workers. Its results supplement the primary run rather than pretending to be one uninterrupted passing/failing total.

A second continuation excludes that known hanging file (886 files, eight workers, same 60-second limit). The original sweep covers the 518 files before it. These runs overlap, so the inventory deduplicates `(file, test title)`; it does not add their failure counters together. Overlapping processes can increase startup/timing pressure, and several Kotlin-compilation/compatibility files exceed the audit limit. Those cancellations are limitations of this audit, not automatically source regressions. No further broad reruns were started to amplify that load.

Raw local evidence is in `/tmp/insrc-test-audit-src.tap`, `/tmp/insrc-test-audit-extra.tap`, `/tmp/insrc-test-audit-vscode-bounded.tap`, `/tmp/insrc-test-audit-jetbrains.log`, and `/tmp/insrc-test-audit-jetbrains-rerun.log`. Reruns use `/tmp/insrc-test-audit-rerun-early.tap`, `/tmp/insrc-test-audit-rerun-contracts.tap`, and `/tmp/insrc-test-audit-vscode-rerun.tap`. These temporary logs are not committed artifacts; the inventory below preserves the failing test names and causes.

Additional evidence: `/tmp/insrc-test-audit-remainder.tap`, `/tmp/insrc-test-audit-continuation.tap`, `/tmp/insrc-test-audit-vscode-contracts.tap`, and `/tmp/insrc-test-audit-clean-debug.tap`.

**Coverage limit:** the backend and additional recovery runners eventually stopped advancing, including runners whose child processes had exited. They did not emit final totals; the remaining workflow coverage is not established. The inventory is a captured failure audit, not a claim of an exhaustive completed 1,405-file sweep. An attempted termination of a stalled runner was rejected by automatic approval review (`approval required`, with approval policy set to `Never`), so stalled/background test processes may remain. No process-killing workaround was attempted.

## Confirmed causes and interpretation

### Review removal left historical expectations behind

`src/workflow/review-unavailable.ts` now throws `Design/Code review functionality is being rewritten.` Retained review endpoints delegate to it. `role-router-global-tiers.test.ts` still looks for the old model-label implementation in `workflow-review-rpc.ts`; `lifecycle-wiring.test.ts` still invokes that endpoint expecting a review to run. The scan test in `scripts/__tests__/forbidden-spawn-scan.test.ts` still expects direct `gitDiffTool.execute` sites in removed review/build implementations. These expectations conflict with the explicit review-retirement contract.

The daemon registration/audit tests have related, but distinct, drift: `handler-runtime.test.ts` has a fixed expected handler list missing newer methods such as `codeReview.task.cancel` and `daemon.qualificationState`; `repo-call-audit.test.ts` omits `daemon.qualificationState`; `repo-call-table.test.ts` finds `daemon.qualificationState` and `design-review-step.cancel` in neither its modifying table nor its reviewed list. `repo-gate-dispatch.test.ts` assumes at least 20 modifying RPCs, which is no longer true after retirement. `daemon-doc-repo-table.test.ts` finds differences between the documentation table and the runtime table. Those are contract/accounting inconsistencies, not proof that an actual dispatch escaped the gate.

### Search assertions depend on timing and backend wording

`failed-lookups.test.ts:247` requires `/EACCES/`. Installed ripgrep instead reports `Permission denied (os error 13)`, wrapped as `search.text: the search did not finish: ripgrep exited with 2`. The search is correctly reported failed; the assertion assumes the Node fallback's error spelling. This failure reproduced in isolation.

`completeness-all-lookups.test.ts:541` gives a fake ripgrep 300 ms to emit a hit and then expects that hit in `failed.partial`. In the concurrent sweep the partial was absent; the same file passed in the serial rerun. `tryRipgrepComplete` records stdout chunks received before termination, while `failedOutput` omits an empty partial array. The evidence is consistent with a startup/scheduling race against the very short deadline; it does not establish a deterministic loss after a hit was received.

### Native lifecycle prerequisites and cascading fixtures

`daemon-ctl-forced-stop.test.ts` reaches the macOS process capability broker, which refuses with `denied (errno 1)`. Tests expecting successful retained-target acquisition or a later `wrong-target` result fail earlier at this prerequisite. This is an observed platform permission restriction; the exact entitlement/host-policy cause was not established.

`daemon-stop-forced.test.ts` initially cannot launch `out/bin/insrc-process-broker` (`ENOENT`). Its first stubborn daemon therefore remains alive. Later cases reuse one socket path and report `EADDRINUSE` / `stand-in daemon exited early (1)`; a readiness assertion then observes a leftover PID instead of `undefined`. These are dependent fixture failures, not eleven independently proven termination bugs. The suite has an after-all child cleanup, rather than cleanup after each failing case. Isolated reruns are recorded separately; a rebuilt helper does not by itself grant macOS broker permission.

`review-retirement-package.test.ts` invokes `npm run build` and fails when `scripts/check-model-definitions.mjs` cannot import `out/daemon/model-catalog.js`. Its nested build uses Node 26.5.1 despite the parent test using Node 22. This needs an isolated Node-22 build before attributing the missing output to source compilation or a concurrent output-directory race.

### Seeded completeness fixture no longer establishes completeness

`repo-completeness.test.ts:54` expects a seeded repository to be complete but receives `complete:false`, reason `4 entities have no vector`, count `unembedded:4`. `helpers/seeded-daemon.ts` first upserts entities with empty embedding arrays and then calls the low-level Lance `addEntityEmbeddings`. The current entity-write path records embedding markers only after its vector-write transaction (`src/db/entities.ts`, `writeVectorsThenMarkers`). The fixture bypasses that marker update. A Lance vector existing is therefore insufficient to make the seeded graph/index-state claim completeness. The failure occurs before the test's full-index-running assertions.

`search-filter.test.ts` and `search-guard.test.ts` use the same seeded daemon and `whileIndexing`. That helper requests `repo.reindex` and polls `search.closure` for a very specific `repo-indexing` error, including the expected file count. The observed failures say the full index was never seen running, with the last request successfully answered. Each such attempt waits 180 seconds before throwing at `helpers/seeded-daemon.ts:237`. Those tests therefore do not reach their assertions about filtering or refusals during indexing. Whether the run finishes too quickly, fails before observation, or is no longer represented by that exact guard response remains unresolved; this output alone does not prove a cross-repo search leak.

### Model/catalog and VS Code settings have drifted

`retired-roles.test.ts` compares raw native manifest suffixes directly with taxonomy role IDs, and reports `tools.convertEscalate` as unknown. However, `vscode-plugin/src/config/key-map.ts:40` deliberately maps `tools.convert.escalate` to that native alias to avoid a nested setting under the string-valued `tools.convert`. This is an outdated assertion that does not account for `nativeRoleKey`, rather than proof that the alias is obsolete.

The extension catalog tests independently find genuinely missing `insrc.build.resultFormat`, and `indexer.docRelations` declared with default `mid` instead of the taxonomy's `cheap`. The manifest sync script's `--check` fails because the committed manifest differs from generated settings. These are manifest/catalog mismatches, not missing dependencies.

`model-literal-scan.test.ts` flags the explicit `family !== 'ollama'` guard in `src/indexer/doc-relations-provider.ts:41`. The scan forbids a quoted runner outside its owner/exclusion list, which does not include that file. The code and the source policy need reconciliation; this audit does not assume that deleting a valid provider guard is the correct fix.

### Release evidence is stale, rather than a new failed Linux run

`scripts/__tests__/build-script.test.ts:24` hardcodes three spawn-scan exemptions, but the scanner now also exempts `daemon/managed-release-staging.ts` with an explicit macOS updater rationale. The scanner itself returns success; the test fails comparing the exemption list.

The two S001 project-memory qualification tests and two S002 crash-qualification tests compare archived run commits to current package/workflow paths with `git diff`. Those scopes now differ, including `.github/workflows/project-memory.yml`. They reject stale evidence before replaying qualification assertions. The S002 performance check hashes current source and fails first at `src/host-node.ts`: current SHA-256 `7f6bb7888a5100e24c0360e47769a257fb8f4b625d3699ba0d1f6614ed863622` versus recorded `dfce9dfab8cf5622e1399022a3af2b47ced9a21c7129ce2fed402dfa826475e1`. None of these failures proves a new Linux/ext4 or APFS crash run failed, and this local audit did not regenerate external qualification evidence.

### VS Code theme/layout tests and execution prerequisites

Six `chat-theme.test.ts` assertions expect two style blocks and select the last one as the layout stylesheet. The rendered shell now has three blocks, so subsequent root/body/selector checks inspect the wrong block. The history-chip regex additionally expects the old exact markup, before the new-chat button was added ahead of it. These are source/layout snapshot mismatches; a browser visual regression was not established by this audit.

`repo-config.test.ts` still expects a per-repo `tasks.review` field, which is absent from the current role taxonomy. The asset test finds the committed `assets/steering-block.md` differs from the canonical prompt; normal `npm test` runs `pretest` to synchronize these assets, while this direct sweep intentionally did not mutate them. `privacy.test.ts` uses an entry path beginning `vscode-plugin/`, so it cannot resolve it when run with the package's working directory. Its repository-root rerun distinguishes that working-directory assumption.

The bounded docs-review run timed out while its type-contract probes repeatedly compile deliberately invalid snippets against the panel. Interrupting the test file prevents its `finally` cleanup; a leftover `__sc4probe_*.ts` is then included by the extension compiler and makes `vscode-bundle-catalog.test.ts` fail with TS2339. After removing the orphan probe, a clean repository-root, Node-22 rerun **passes the compilation and bundling stages**, then fails at line 58: the bundled key map has 41 entries versus 42 catalog rows, missing `build.resultFormat`. Thus the original compiler error was contamination, while the later catalog mismatch is an independently reproduced failure. The repository-root rerun of `privacy.test.ts` passes, confirming the earlier failure's working-directory dependency.

### JetBrains tests cannot compile

Both Gradle invocations fail at `:compileTestKotlin`; no JetBrains test body ran. `InsrcSettingsTrackerTest.kt` uses `SaveResult.Saved` as a singleton at lines 124, 183, 187, 208, and 227, but it is now `data class Saved(val restartRequired: Boolean = false)`. Lines 148, 150, and 153 call removed `UnixSocketDaemonRpc.requestLine`. Lines 202 and 227, and `RepoFieldsContractTest.kt:131`, pass four arguments to `PerRepoSection`, whose constructor now accepts only `(model, gateway)`. The `Unit`/`SaveResult` diagnostics are secondary to those obsolete expressions.

The default Gradle invocation also cannot store its configuration cache: `bundleBackendAssets`, a `Copy` task, captures Gradle script/project references. `build.gradle.kts:142` resolves an environment-variable provider with `rootProject.file` in its mapping. Disabling the configuration cache removes that second failure but leaves the same Kotlin compile errors.

## Results and complete observed inventory

### Additional backend findings from the continuation

- **Unsafe inspection of temporary errors:** `provider-diagnostics.test.ts` reproduces an expected `unsupported-temporary` code becoming `undefined`. Its fixture throws an object with hostile `getPrototypeOf`/property traps. In `structured-output.ts`, the catch checks `err instanceof VibeTurnError` before the session-memory safe conversion; that operation can invoke the hostile prototype trap. Both named tests share one rejected matrix promise. `rpc-diagnostics.test.ts` likewise exposes `CM_PRIVATE_RAW_GETTER`: `failedOutput` executes `err instanceof LookupFailedError` before checking temporary execution mode, triggering the proxy's `getPrototypeOf` at executor line 696. This is an observed error-sanitization defect, not just an old snapshot.
- **Ambient debug environment:** the audit environment has a nonempty `DEBUG` variable (its value was not recorded). `driverResourceLog` intentionally refuses temporary resources when ambient diagnostic switches are present, throwing `unsupported-temporary`. `driver-log-policy.test.ts` does not sanitize that variable, so its positive quiet-policy test fails at construction. Clearing only `DEBUG` makes both that test file and `session-service-isolation.test.ts` pass. The three-file clean-environment rerun reports 26 passed, one failed; only the DuckDB error-wording assertion remains. This verifies an environment-sensitive prerequisite for the earlier temporary PostgreSQL/Redis failure, rather than a reproduced driver isolation defect.
- **Generic path-escape error:** `duckdb-file-driver.test.ts:455` expects `/resolves outside the repo root/`, but `runtime-config.ts:36` now raises `ManagementInputError: Invalid connection request.` The path is refused; the expected error wording is outdated. This still fails with `DEBUG` cleared.
- **Compiled evidence and reviewed inventories:** `session-release-gate.test.ts` fails its synthetic positive verification control. `session-source-inventory.test.ts` reports removed review/budget files still in its classification inventory and a stale digest for `src/daemon/threads/method-class.ts`. The corresponding module-state inventories also contain removed review coordinators and miss changed structured-schema state. These prove the inventories/evidence need reconciliation; they do not prove all listed production paths are behaviorally unsafe.
- **Obsolete local checkout assumption:** `analyze-step-handler.test.ts` and `analyze-step-narrow.test.ts` hardcode `/Users/subhagho/work/projects/insors/insrc-ide`. Their start phase fails, so dependent tests pass `undefined` instead of a state token and assert the wrong error. They should use an isolated registered fixture/current repository; the deprecated fork is not a release prerequisite.
- **Removed source import:** `task-persistence.test.ts` launches a fixture that imports missing `src/workflow/artifacts/provenance/writer.js`. The child exits with `ERR_MODULE_NOT_FOUND` before its persistence matrix runs.
- **Review/worker routing drift:** `indexing-port`, `router-session`, `s3-acceptance`, and `in-daemon-client` still expect active review routes/tokens, while those endpoints now reject. `method-class.test.ts` additionally reports unclassified `daemon.qualificationState` and expects all `codeReview.*` methods to remain shared-state routes. Distinguish the explicit method-class coverage omission from expectations tied to retired review execution.
- **Build/shutdown interference:** `shutdown-bounded.test.ts` and `shutdown-lifecycle-evidence.test.ts` fail in their build hook with `ENOTEMPTY` while `clean-output.mjs` removes the shared `out/`. Several shutdown/store/watchdog/thread-boot checks then observe missing native helpers, no watchdog readiness, `SIGKILL`, or null exit codes rather than a clean exit. They have not demonstrated independent shutdown regressions in an isolated, fully built checkout. `artifact-write-authority` reports `Writer fixture timed out`; the timeout alone does not establish why its fixture failed to respond.
- **Tool schema snapshots:** `approval-class-mapping.test.ts` has old schemas: current `git_diff` adds `objectPair` and `git_cat_file` adds `metadataOnly`. `typecheck-config.test.ts` requires the build string to start `tsc && npm run typecheck:tools &&`, but the actual build now cleans output, builds the memory workspace, and invokes `tsc --inlineSources` before the same typecheck step.
- **Live store content returned by search:** `live-store-file-refusal.test.ts` expects file tools to omit the store and lock files even through a containing-directory search. Its observed grep result includes `graph.lmdb:1: DATA-NEEDLE` (and the lock-file hit) when searching the fixture's `.insrc` directory. This is a failed exclusion assertion with concrete returned content; other file-operation checks in that case may not have run after the first assertion.
- **Detached descendant timing:** `shell-helper-tree-kill.test.ts` expects a call whose descendant retains the pipes to report `timedOut:true`, but receives false. This needs an isolated timing/process-disposal rerun before choosing between a lifecycle defect and load-sensitive fixture timing.
- **Git startup timing and snapshots:** `git-abort.test.ts` expects one command to have started before a 150 ms abort but observes zero; `git-cat-file-tree-kill.test.ts` cannot read the PID file that its stand-in must write before a 300 ms abort. These observations concern fixture startup deadlines, not proof that a started descendant survived. `git-approval.test.ts` has the same stale `git_diff` schema snapshot as the approval mapping test.
- **Installed GitHub CLI differs from coverage tables:** installed `gh` is **2.101.0 (2026-09-15)**. The coverage test finds unlisted commands including `discussion create/list/comment/edit/view`, `pr revert`, `pr update-branch`, `release verify`, and `repo autolink` commands. The input table misses `auth status --active`; the prompt audit also finds `gh_gist.delete` does not always pass the prompt-skipping `--yes` flag. These reproduced in both continuation runs.
- **Nested cleanup matrix:** `session-cleanup.test.ts`'s shared child matrix fails its case `rejected queue drain still closes native resources and ends once with failure` with an unhandled rejection `private-queue-failure` at `fixtures/session-cleanup-child.ts:116`. Both parent EXPIRY and RECONNECT tests reuse the same matrix promise, so both fail. This is distinct from the ambient `DEBUG` prerequisite (that child explicitly clears diagnostic variables).
- **Store-isolation audit lists deleted tests:** `src/db/graph/__tests__/no-live-store-in-tests.test.ts` launches removed `workflow/review/__tests__/probe-source-roots.test.ts` and `daemon/__tests__/code-review-rpc.test.ts`, receiving `Could not find ...`; another case launches the already failing analyze-step fixture with its obsolete checkout path. Those failures do not demonstrate a write to the live store; the prerequisite child suites do not pass.
- **Watcher duplicate reporting:** `watcher-new-directories.test.ts` injects a failing subscription for each newly discovered directory. Its fallback file discovery reports the target file four times instead of once. The assertion at the end fails `4 !== 1`; the precise filesystem-event/interleaving cause was not isolated.
- **MCP prompt path canonicalization:** `mcp-process-e2e.test.ts`'s byte-for-byte pass-through comparison fails because the MCP prompt uses `/private/var/folders/...`, while the direct in-process prompt uses `/var/folders/...` for the same macOS temporary repository. The mismatch starts at the repository path in `userTurn`, not at the user's bugfix focus.
- **Audit timeouts:** file-level cancellations in `git-coverage`, `lance-cross-thread`, `no-live-vector-store-in-tests`, `subsystem-pass`, and worker acceptance files are explicitly bounded-run observations. These include test files with their own longer work/fixture budgets; a 60-second audit cancellation must not be interpreted as an independently verified source defect. The empty peer-state-store file is different: its retained ports and absent tests explain an unbounded hang directly.

The same time-limit classification applies to the `src/shared/__tests__/connection-manager-*` compatibility, Kotlin compilation, packaging, and parity suites when they report only `test timed out after 60000ms`. This backend audit's Kotlin fixture cancellations are distinct from the directly reproduced JetBrains plugin compile errors above.

Additional shared-layer failures have separate immediate causes:

- `connection-manager-release.test.ts` rejects the changed `src/shared/ipc-client.ts` digest against its recorded reviewed source hash, another stale release-evidence check.
- `daemon-process-client.test.ts`'s fake capability helper does not reach readiness within its deadline, so identity/reply/abort cases fail or exercise their early readiness-failure branch. Several messages therefore concern setup, not the later behavior named in their titles.
- `darwin-lifecycle.test.ts` cannot execute its identity observation successfully and reports `Darwin peer observation failed`; `installation-mutation-gate.test.ts` depends on the same compiled observer and fails its prerequisite identity command across its cases. The captured output has no more specific native diagnostic, so the root native-observer cause remains unverified. Do not conflate these silent observer failures with the separate broker's explicit `denied (errno 1)` result.
- `daemon-run-files.test.ts`'s quarantine-collision case expects one suffixed quarantine entry and observes zero. The immediate assertion is a failed collision/timing expectation; this audit has not proved an independent ownership violation.

### Completed-run counts and rerun conclusions

| Run | Passed | Failed | Cancelled | Skipped | Interpretation |
| --- | ---: | ---: | ---: | ---: | --- |
| Release scripts + project-memory package | 190 | 7 | 0 | 0 | Completed; all seven failures are in release-script/evidence checks |
| VS Code bounded sweep | 1,736 | 14 | 1 | 9 | Completed with a 60-second audit limit and direct-test prerequisites described above |
| Early isolated backend rerun | 20 | 2 | 0 | 0 | Review-label and permission-wording failures reproduced; 300 ms search test passed |
| Clean root/PATH VS Code contract rerun | 33 | 7 | 0 | 0 | Privacy test passed; clean compile/bundle reached the genuine catalog-row mismatch |
| `DEBUG`-cleared driver/temporary-service rerun | 26 | 1 | 0 | 0 | Quiet-policy and service-isolation tests passed; DuckDB wording still failed |
| JetBrains, with and without configuration cache | — | — | — | — | Both blocked at test compilation; no test bodies ran |
| Backend primary/recovery sweeps | — | — | — | — | No final totals; partial captured output plus explicit hangs/timeouts |

The inventory below deduplicates observations across backend runs and includes aggregate failing suites where TAP emits them. **Its row count is not a count of independent product defects.** Entries include prerequisites, intermittent failures, cascading fixtures, and audit timeouts; the classifications above are part of the result. No production or test source fixes were applied.

<!-- observed-inventory:start -->

### Backend (deduplicated observations)


#### `src/analyze/context/__tests__/role-router-global-tiers.test.ts`

- **role-router-global-tiers.test.ts: the RoleResolution keeps role, tier, runner, model, effort, clampedByFloor and adds fallback; workflow-rpc and workflow-review-rpc labels unchanged for a CLI and an Ollama tier** (assertion line 110) — testCodeFailure. Evidence: The input did not match the regular expression /const label = ’\$\{resolution\.runner\}:\$\{resolution\.model\}’;/. Input:

#### `src/analyze/explore/__tests__/completeness-all-lookups.test.ts`

- **search.text and config.trace return every hit with its whole line and no limited entry, and a timed-out search is the failed lookup output with its gathered hits** (assertion line 541) — testCodeFailure. Evidence: Expected values to be strictly deep-equal:

#### `src/analyze/explore/__tests__/failed-lookups.test.ts`

- **a text search that throws becomes the failed output (mutation: restore the catch that returns an empty result)** (assertion line 211) — testCodeFailure. Evidence: The input did not match the regular expression /EACCES/. Input:

#### `src/cli/services/__tests__/daemon-ctl-forced-stop.test.ts`

- **Control script retains the original target across run-file removal** (assertion line 57) — testCodeFailure. Evidence: [01:01:30] stopping daemon
- **Control script refuses reused identity and replacement files, and reclaims an orphan guard whose owner died** (assertion line 61) — testCodeFailure. Evidence: The input did not match the regular expression /wrong-target/. Input:
- **Disposable clean and forced script restart paths preserve commands** (assertion line 79) — testCodeFailure. Evidence: [01:01:31] stopping daemon
- **Fresh HOME shell stop and start work without a pre-existing insrc directory** (assertion line 21) — testCodeFailure. Evidence: 'process capability broker refused: denied (errno 1)'

#### `src/cli/services/__tests__/daemon-stop-forced.test.ts`

- **forced stop: a child that ignores the request and SIGTERM is ended by stopDaemon** (assertion line 22) — testCodeFailure. Evidence: 'cannot launch process capability broker: spawn /Users/subhagho/work/projects/insors/insrc/out/bin/insrc-process-broker ENOENT'
- **forced stop, silent daemon: a child that accepts the connection and never replies is ended** (assertion line 81) — testCodeFailure. Evidence: 'stand-in daemon exited early (1)'
- **Retained stop target survives run-file removal and RPC failure** (assertion line 81) — testCodeFailure. Evidence: 'stand-in daemon exited early (1)'
- **Verified forced termination preserves StopOutcome and never targets reused PIDs** (assertion line 81) — testCodeFailure. Evidence: 'stand-in daemon exited early (1)'
- **Real ownership and guard conflicts prevent maintenance restart** (assertion line 81) — testCodeFailure. Evidence: 'stand-in daemon exited early (1)'
- **Real orphaned guard owner death prevents maintenance restart** (assertion line 81) — testCodeFailure. Evidence: 'stand-in daemon exited early (1)'
- **Retained waitForStop verifies run-file ownership and guards before reporting success** (assertion line 81) — testCodeFailure. Evidence: 'stand-in daemon exited early (1)'
- **Retained waitForStop ignores path disappearance until original exit and preserves handle ownership** (assertion line 81) — testCodeFailure. Evidence: 'stand-in daemon exited early (1)'
- **Clean stop has one completion boundary and never cleans a later publication twice** (assertion line 81) — testCodeFailure. Evidence: 'stand-in daemon exited early (1)'
- **Backward wall-clock adjustment cannot postpone CLI forced stop of an unresponsive original** (assertion line 22) — testCodeFailure. Evidence: 'cannot launch process capability broker: spawn /Users/subhagho/work/projects/insors/insrc/out/bin/insrc-process-broker ENOENT'
- **Backward wall-clock adjustment cannot extend CLI readiness timeout** (assertion line 280) — testCodeFailure. Evidence: Expected values to be strictly equal:

#### `src/config/__tests__/retired-roles.test.ts`

- **the scope picker's role is gone from the role taxonomy and from the VS Code extension's declared settings, the two agree in both directions, and the reconcile drops a value stored for the role under `models.tasks` and under a repo's `models.byRepo.<repo>.tasks`, where the key holds dots (mutation: retire it as a dotted path)** (assertion line 52) — testCodeFailure. Evidence: every declared role setting is a live role

#### `src/daemon/__tests__/daemon-doc-repo-table.test.ts`

- **daemon-doc-repo-table.test.ts: docs/daemon.md lists the methods of the table and the refusal codes** (assertion line 20) — testCodeFailure. Evidence: the documented calls are exactly the table

#### `src/daemon/__tests__/handler-runtime.test.ts`

- **the runtime function builds the handler tables with stub indexing dependencies and their key sets equal the recorded single-thread key sets plus the methods added since** (assertion line 99) — testCodeFailure. Evidence: Expected values to be strictly deep-equal:

#### `src/daemon/__tests__/lifecycle-wiring.test.ts`

- **the daemon approve handler, the review-decision step and workflowReviewStart use the repository's durable LifecycleService, refuse a head ahead of its log, use the request's person actor or insrc:approval, and a repository whose registry entry cannot be created is refused** (assertion line 125) — testCodeFailure. Evidence: 'Design review functionality is being rewritten.'

#### `src/daemon/__tests__/model-literal-scan.test.ts`

- **model-literal-scan.test.ts: the scan passes on the tree and fails on an injected literal; exclusions name their owning Story** (assertion line 136) — testCodeFailure. Evidence: Expected values to be strictly deep-equal:

#### `src/daemon/__tests__/repo-call-audit.test.ts`

- **repo-call-audit.test.ts: every method of the handler registry and every step phase has an audit entry marked modifying, read-only or daemon-store** (assertion line 36) — testCodeFailure. Evidence: the audit lists exactly the registered RPC methods

#### `src/daemon/__tests__/repo-call-table.test.ts`

- **repo-call-table.test.ts: every registered RPC method and step phase is a table row or on the reviewed read-only list, and every row names a registered method** (assertion line 43) — testCodeFailure. Evidence: a registered method is in neither the table nor the reviewed list

#### `src/daemon/__tests__/repo-completeness.test.ts`

- **repo.list, repo.stats and daemon.status carry completeness beside the unchanged status: a complete repository reads complete, one whose full index is running reads not complete while its status is indexing; daemon.status carries unattributedUnwritable** (assertion line 54) — testCodeFailure. Evidence: {"complete":false,"reasons":["4 entities have no vector"],"counts":{"pending":{"awaiting-target":0,"ambiguous":0,"no-candidate":0,"external-endpoint":0},"unwritable":0,"unembedded":4,"uncommittedFiles":0},"uncommittedFiles":[],"generation":0}

#### `src/daemon/__tests__/repo-gate-dispatch.test.ts`

- **repo-gate-dispatch.test.ts: each method in the table called with no repo is refused and leaves the file system unchanged** (assertion line 50) — testCodeFailure. Evidence: 'the table has the modifying RPC methods'

#### `src/daemon/__tests__/review-retirement-package.test.ts`

- **clean build and package remove retired runtime and planted stale output** (assertion line 11) — testCodeFailure. Evidence: Command failed: npm run build

#### `src/daemon/__tests__/search-filter.test.ts`

- **search.callers across repositories leaves out the entities of a repository under index** (assertion line 51) — testCodeFailure. Evidence: 'the full index of /private/var/folders/78/fscmgmls2k72q89nnypxxfqm0000gn/T/insrc-seeded-big-bj9f5n was never seen running (last answer: answered)'
- **search.query while one repository is being indexed returns rows from the other repositories only** (assertion line 64) — testCodeFailure. Evidence: 'the full index of /private/var/folders/78/fscmgmls2k72q89nnypxxfqm0000gn/T/insrc-seeded-big-oY1m8n was never seen running (last answer: answered)'
- **entity.closure, entity.unreachable, search.closure, repo.depends_on and repo.search_cross_repo from a ready repository whose closure reaches a repository under index leave that repository's entities out** (assertion line 89) — testCodeFailure. Evidence: 'the full index of /private/var/folders/78/fscmgmls2k72q89nnypxxfqm0000gn/T/insrc-seeded-big-bCRJtU was never seen running (last answer: answered)'

#### `src/daemon/__tests__/search-guard.test.ts`

- **search requests: search.callers / search.callees / search.by_file / search.closure / entity.summary / repo.depends_on / locate.inferParents about a repository being indexed answer 'repo-indexing: ...' with the figures and no result; about another, ready repository they answer as before** (assertion line 50) — testCodeFailure. Evidence: 'the full index of /private/var/folders/78/fscmgmls2k72q89nnypxxfqm0000gn/T/insrc-seeded-big-te8DFb was never seen running (last answer: answered)'
- **entity.closure / entity.unreachable with a root in a repository under index are refused** (assertion line 80) — testCodeFailure. Evidence: 'the full index of /private/var/folders/78/fscmgmls2k72q89nnypxxfqm0000gn/T/insrc-seeded-big-U5FkSU was never seen running (last answer: answered)'

#### `src/daemon/__tests__/shutdown-bounded.test.ts`

- **Watchdog arm failure self-kills before blocked native cleanup** (assertion line 12) — hookFailed. Evidence: Command failed: npm run build
- **Bounded shutdown preserves lock-loss, fatal and normal cleanup behavior** (assertion line 12) — hookFailed. Evidence: Command failed: npm run build
- **Repeated signals and guarded async close preserve ownership** (assertion line 12) — hookFailed. Evidence: Command failed: npm run build

#### `src/daemon/__tests__/shutdown-lifecycle-evidence.test.ts`

- **Guard-owner death reclaims the stale guard so the restart proceeds like the healthy control** (assertion line 17) — hookFailed. Evidence: Command failed: npm run build
- **Compiled helper packaging and affected lifecycle regression suites** (assertion line 17) — hookFailed. Evidence: Command failed: npm run build

#### `src/daemon/__tests__/shutdown-store-failure.test.ts`

- **store failure to stop: exit within 5 seconds, pid file and socket gone, second start succeeds, last log line names the skipped close** (assertion line 99) — testCodeFailure. Evidence: The input did not match the regular expression /ending after shutdown \(daemon\.shutdown RPC\)/. Input:
- **healthy shutdown is unchanged: queue drained, connections closed in order, normal exit** (assertion line 197) — testCodeFailure. Evidence: a normal exit, not a kill
- **Store-child fixture exercises owned publication watchdog readiness and guarded close** (assertion line 291) — testCodeFailure. Evidence: Expected values to be strictly deep-equal:

#### `src/daemon/__tests__/shutdown-watchdog.test.ts`

- **Independent watchdog bounds a disposable blocked parent and disarms after healthy exit** (assertion line 67) — testCodeFailure. Evidence: Expected values to be strictly equal:
- **Watchdog never signals after reparenting and imports only Node built-ins** (assertion line 63) — testCodeFailure. Evidence: 'watchdog undefined remains alive'
- **Watchdog IPC disconnect during readiness releases its shared broker session without signalling the parent** (assertion line 95) — testCodeFailure. Evidence: Expected values to be strictly equal:
- **IPC transport loss never disarms the deadline for a blocked parent or blocked exit hook** (assertion line 32) — testTimeoutFailure. Evidence: 'test timed out after 10000ms'
- **Backward wall-clock adjustment cannot extend the independent monotonic shutdown duration** (assertion line 110) — testCodeFailure. Evidence: Expected values to be strictly equal:

#### `src/daemon/db/__tests__/driver-log-policy.test.ts`

- **CM-S3-DRIVER-LOGS: owner context is immutable lazy quiet and remains quiet after authority expiry** (assertion line 28) — testCodeFailure. Evidence: 'Temporary driver privacy policy is unavailable.'

#### `src/daemon/db/__tests__/duckdb-file-driver.test.ts`

- **rejects file paths that escape the repo root** (assertion line 455) — testCodeFailure. Evidence: The input did not match the regular expression /resolves outside the repo root/. Input:
- **DuckDBFileDriver -- pool path-escape guard** (assertion line 1) — subtestsFailed. Evidence: '1 subtest failed'

#### `src/daemon/db/__tests__/removal-production-affinity.test.ts`

- **CM-S4-AFFINITY: production single-thread daemon advertises default features but refuses unregistered roots and private consumers before use** (assertion line 44) — testCodeFailure. Evidence: Expected values to be strictly equal:
- **CM-S4-AFFINITY: production threaded daemon advertises default features but refuses unregistered roots and private consumers before use** (assertion line 44) — testCodeFailure. Evidence: Expected values to be strictly equal:

#### `src/daemon/db/__tests__/session-cleanup.test.ts`

- **CM-S3-EXPIRY: actual end/exact deadline/restart during use/construction/probe/conversion/close failure; zero leaked handles** (assertion line 22) — testCodeFailure. Evidence: (node:89573) ExperimentalWarning: SQLite is an experimental feature and might change at any time
- **CM-S3-RECONNECT: before-deadline resume preserves entries and cancels revoked-generation work** (assertion line 22) — testCodeFailure. Evidence: (node:89573) ExperimentalWarning: SQLite is an experimental feature and might change at any time

#### `src/daemon/db/__tests__/session-release-gate.test.ts`

- **CM-S3-GATE: stale/missing/mixed source+compiled evidence fails closed and release stays disabled** (assertion line 42) — testCodeFailure. Evidence: a complete current build must be a positive verification control

#### `src/daemon/db/__tests__/session-service-isolation.test.ts`

- **CM-S4-SOURCE: real PostgreSQL and Redis survive both-scope removal failed close retry and same-ID recreation** (assertion line 1) — testCodeFailure. Evidence: 'Invalid connection request.'

#### `src/daemon/db/__tests__/session-source-inventory.test.ts`

- **CM-S3-INVENTORY: production boundaries have explicit reviewed classifications and unchanged baseline** (assertion line 20) — testCodeFailure. Evidence: New/removed file needs explicit classification, never automatic exclusion
- **CM-S4-GATE: reviewed removal sources include pure helpers owner boundaries and pending global affinity** (assertion line 128) — testCodeFailure. Evidence: src/daemon/threads/method-class.ts requires fresh boundary review

#### `src/daemon/steps/__tests__/analyze-step-handler.test.ts`

- **start returns emit_plan with a state blob + a real prompt** (assertion line 89) — testCodeFailure. Evidence: 'Expected "actual" to be strictly unequal to: true'
- **bundle phase with awaiting_plan state returns wrong-stage error** (assertion line 168) — testCodeFailure. Evidence: The input did not match the regular expression /out of order|awaiting_bundle/. Input:

#### `src/daemon/steps/__tests__/analyze-step-narrow.test.ts`

- **handler rejects phase=narrow when state stage is awaiting_plan** (assertion line 154) — testCodeFailure. Evidence: The input did not match the regular expression /awaiting_narrow/. Input:

#### `src/daemon/steps/__tests__/in-daemon-client.test.ts`

- **in-daemon client: a done frame resolves with its data and progress reaches onFrame; grounding, freshness and the cwd lookup are shaped as the socket client shapes them** (assertion line 118) — testCodeFailure. Evidence: 'Design review functionality is being rewritten.'
- **in-daemon client: a stream handler that throws synchronously settles the request as daemon-error and releases its wait** (assertion line 143) — testCodeFailure. Evidence: The validation function is expected to return "true". Received false
- **in-daemon review client: the codeReview.freshness reply keeps inFlight and pendingCodeIndexJobs (ISSUE-1102dc71)** (assertion line 164) — testCodeFailure. Evidence: 'Code review functionality is being rewritten.'

#### `src/daemon/steps/__tests__/peer-state-store-leakfree.test.ts`

- **src/daemon/steps/__tests__/peer-state-store-leakfree.test.ts** (assertion line 1) — testTimeoutFailure. Evidence: 'test timed out after 60000ms'

#### `src/daemon/steps/__tests__/provider-diagnostics.test.ts`

- **CM-S3-PROVIDER: structured retry inner authority guard and nonretryable refusal** (assertion line 18) — testCodeFailure. Evidence: node:internal/modules/run_main:123
- **CM-S3-CONSUMER-LOGS: actual provider prompt/retry/late-stream trace sink and saved control** (assertion line 18) — testCodeFailure. Evidence: node:internal/modules/run_main:123

#### `src/daemon/steps/__tests__/rpc-diagnostics.test.ts`

- **CM-S3-CONSUMER-LOGS: tool/RPC/progress/error/throwing-delivery envelopes and normal sink, saved concurrent marker** (assertion line 18) — testCodeFailure. Evidence: (node:29898) ExperimentalWarning: SQLite is an experimental feature and might change at any time

#### `src/daemon/steps/__tests__/task-persistence.test.ts`

- **CM-S3-CACHE: task/report/checkpoint/history/trace/Lance canaries, error repair, saved positive persistence** (assertion line 12) — testCodeFailure. Evidence: TAP version 13

#### `src/daemon/threads/__tests__/artifact-write-authority.test.ts`

- **artifact writes share the main queue and release only after worker reclamation** (assertion line 11) — testCodeFailure. Evidence: 'Writer fixture timed out'

#### `src/daemon/threads/__tests__/indexing-port.test.ts`

- **codeReview.freshness on the main thread gets the code-indexing worker's codeIndexWorkFor result** (assertion line 102) — testCodeFailure. Evidence: 'Code review functionality is being rewritten.'

#### `src/daemon/threads/__tests__/method-class.test.ts`

- **coverage: the method set equals the keys of the constructed rpcHandlers and streamHandlers after all merges, failing on a missing or a stale entry** (assertion line 78) — testCodeFailure. Evidence: Expected values to be strictly deep-equal:
- **method sets: every served chat.\*, todos.\*, understanding.\*, models.\* and codeReview.\* method is in the shared-state set** (assertion line 98) — testCodeFailure. Evidence: every one runs on the shared-state worker

#### `src/daemon/threads/__tests__/module-state-inventory.test.ts`

- **module-state inventory: every scanned key under src/daemon/ has a valid fixture entry, and the s3 families are one-owner on the shared-state worker or shared-store** (assertion line 127) — testCodeFailure. Evidence: the src/daemon/ slice is classified
- **module-state inventory: every module-scope mutable value the session worker can load is classified (full guard over the repo)** (assertion line 136) — testCodeFailure. Evidence: classify each new value in fixtures/module-state-inventory.json (per-thread, shared-store or one-owner, with a reason):

#### `src/daemon/threads/__tests__/router-session.test.ts`

- **router: two sessions' model checks and code-review turns reach the one shared-state worker; other step tools stay on the session's worker (Story 5d393a4b)** (assertion line 694) — testCodeFailure. Evidence: a check started by one session is decided by another on the same worker; code-review turns from any session share it

#### `src/daemon/threads/__tests__/s3-acceptance.test.ts`

- **ac6: a token of each step kind resumes on a new worker after an idle release** (assertion line 202) — testCodeFailure. Evidence: "Cannot read properties of undefined (reading 'token')"
- **src/daemon/threads/__tests__/s3-acceptance.test.ts** (assertion line 1) — testTimeoutFailure. Evidence: 'test timed out after 60000ms'

#### `src/daemon/threads/__tests__/s4-acceptance.test.ts`

- **s4 ac3: SIGTERM and daemon.shutdown exit 0 after 'bye' with every worker, session-pool workers included, terminated** (assertion line 80) — testCodeFailure. Evidence: SIGTERM: exit 0 (: "ollama"
- **src/daemon/threads/__tests__/s4-acceptance.test.ts** (assertion line 1) — testTimeoutFailure. Evidence: 'test timed out after 60000ms'

#### `src/daemon/threads/__tests__/threads-boot.test.ts`

- **SIGTERM during an indexing pass: workers stop, the queue drains, the main thread closes the stores after the workers exit, 'bye' is logged** (assertion line 96) — testCodeFailure. Evidence: the daemon exited cleanly after SIGTERM
- **daemon.shutdown during maintenance is refused with the activity and reason; SIGTERM during maintenance waits for the compaction and then shuts down** (assertion line 141) — testCodeFailure. Evidence: a clean exit after the compaction
- **boot: threads enabled serves a session method from a session worker over the socket, and SIGTERM drains and exits 0** (assertion line 192) — testCodeFailure. Evidence: the daemon exited cleanly after SIGTERM:
- **boot: threads disabled runs every session method on the main thread as today** (assertion line 215) — testCodeFailure. Evidence: the daemon exited cleanly after SIGTERM:

#### `src/daemon/tools/__tests__/approval-class-mapping.test.ts`

- **approval-class-mapping.test.ts: the tool ids and input schemas match the snapshot taken before the rewrite** (assertion line 143) — testCodeFailure. Evidence: git_diff input schema
- **approval-class-mapping.test.ts: the twelve git tools of Story s4 are registered, ten of them reads and two per-input** (assertion line 181) — testCodeFailure. Evidence: git_cat_file input schema

#### `src/daemon/tools/__tests__/shell-helper-tree-kill.test.ts`

- **shell-helper-tree-kill.test.ts: a descendant that left the group and holds the pipes cannot keep the call open past the bound** (assertion line 74) — testCodeFailure. Evidence: Expected values to be strictly equal:

#### `src/daemon/tools/__tests__/typecheck-config.test.ts`

- **typecheck-config.test.ts: tsconfig.typecheck.json includes the fixtures with noEmit, the script runs it, and the build chain runs the script after tsc** (assertion line 45) — testCodeFailure. Evidence: The input did not match the regular expression /^tsc && npm run typecheck:tools && /. Input:

#### `src/daemon/tools/builtins/file/__tests__/live-store-file-refusal.test.ts`

- **file tools: each tool's own execute refuses the store file and its lock file, by direct path and through a symbolic link** (assertion line 103) — testCodeFailure. Evidence: The input was expected to not match the regular expression /graph\.lmdb/. Input:

#### `src/daemon/tools/builtins/gh/__tests__/gh-coverage.test.ts`

- **gh-coverage.test.ts: every installed gh command has a GH_COVERAGE row, covered rows name registered tools and ops, excluded rows have a reason, and all 69 tools are registered (68 that serve a gh command and gh_tracker)** (assertion line 20) — testCodeFailure. Evidence: commands of the installed gh with no GH_COVERAGE row

#### `src/daemon/tools/builtins/gh/__tests__/gh-inputs.test.ts`

- **gh-inputs.test.ts: every flag and positional has a GH_INPUTS row and every schema field is accounted for by a flag, positional or synthetic row** (assertion line 182) — testCodeFailure. Evidence: 'auth status: the flag --active has a GH_INPUTS row'
- **gh-inputs.test.ts: prompt sweep reads the prompt cases from the installed gh help and requires each argument in the schema or always passed** (assertion line 273) — testCodeFailure. Evidence: no op of the table can reach a gh prompt

#### `src/daemon/tools/builtins/git/__tests__/git-abort.test.ts`

- **git-abort.test.ts: git_show starts no command after an abort between its header, diff and stat commands** (assertion line 91) — testCodeFailure. Evidence: only the header started

#### `src/daemon/tools/builtins/git/__tests__/git-approval.test.ts`

- **every typebox input schema serialises to the same JSON as the schema it replaced** (assertion line 69) — testCodeFailure. Evidence: git_diff
- **git_log limit 0 and 501, git_diff maxBytes 100 and git_diff context 51 are rejected, git_show maxBytes 100 is clamped, and the schemas are unchanged** (assertion line 103) — testCodeFailure. Evidence: git_diff

#### `src/daemon/tools/builtins/git/__tests__/git-cat-file-tree-kill.test.ts`

- **git-cat-file-tree-kill.test.ts: an abort kills the stand-in git and its descendant and returns a rejected failure within the bound** (assertion line 40) — testCodeFailure. Evidence: "ENOENT: no such file or directory, open '/var/folders/78/fscmgmls2k72q89nnypxxfqm0000gn/T/insrc-proc-DFlDHD/git.pid'"

#### `src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts`

- **src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts** (assertion line 1) — testTimeoutFailure. Evidence: 'test timed out after 60000ms'

#### `src/daemon/tools/builtins/git/__tests__/git-shared-deadline.test.ts`

- **git-shared-deadline.test.ts: one deadline signal shared by successive calls kills the running command at the deadline and later calls never spawn** (assertion line 36) — testCodeFailure. Evidence: Expected values to be strictly equal:

#### `src/daemon/tools/builtins/search/__tests__/grep-omitted.test.ts`

- **through the ripgrep backend with complete set, more hits than MAX_LIMIT, a line over MAX_LINE_CHARS and output over RG_MAX_OUTPUT_BYTES are all returned in full, and a search past the 30-second deadline fails with its gathered hits** (assertion line 318) — testCodeFailure. Evidence: The validation function is expected to return "true". Received false

#### `src/db/graph/__tests__/no-live-store-in-tests.test.ts`

- **the review probe test, found by the same search, creates nothing at the default path either** (assertion line 51) — testCodeFailure. Evidence: src/workflow/review/__tests__/probe-source-roots.test.ts passes
- **three daemon request tests, found by the same search, create nothing at the default path** (assertion line 51) — testCodeFailure. Evidence: src/daemon/__tests__/code-review-rpc.test.ts passes
- **the MCP step and review tests, found by the full audit, create nothing at the default path** (assertion line 51) — testCodeFailure. Evidence: src/daemon/steps/__tests__/analyze-step-handler.test.ts passes

#### `src/db/lance/__tests__/lance-cross-thread.test.ts`

- **src/db/lance/__tests__/lance-cross-thread.test.ts** (assertion line 1) — testTimeoutFailure. Evidence: 'test timed out after 60000ms'

#### `src/db/lance/__tests__/no-live-vector-store-in-tests.test.ts`

- **src/db/lance/__tests__/no-live-vector-store-in-tests.test.ts** (assertion line 1) — testTimeoutFailure. Evidence: 'test timed out after 60000ms'

#### `src/indexer/__tests__/cross-file-sql-references.test.ts`

- **src/indexer/__tests__/cross-file-sql-references.test.ts** (assertion line 1) — testTimeoutFailure. Evidence: 'test timed out after 60000ms'

#### `src/indexer/__tests__/doc-relations-measure.test.ts`

- **src/indexer/__tests__/doc-relations-measure.test.ts** (assertion line 1) — testTimeoutFailure. Evidence: 'test timed out after 60000ms'

#### `src/indexer/__tests__/doc-relations-pass.test.ts`

- **src/indexer/__tests__/doc-relations-pass.test.ts** (assertion line 1) — testTimeoutFailure. Evidence: 'test timed out after 60000ms'

#### `src/indexer/__tests__/evidence-extracted.test.ts`

- **src/indexer/__tests__/evidence-extracted.test.ts** (assertion line 1) — testTimeoutFailure. Evidence: 'test timed out after 60000ms'

#### `src/indexer/__tests__/evidence-inferred.test.ts`

- **src/indexer/__tests__/evidence-inferred.test.ts** (assertion line 1) — testTimeoutFailure. Evidence: 'test timed out after 60000ms'

#### `src/indexer/__tests__/external-endpoints.test.ts`

- **src/indexer/__tests__/external-endpoints.test.ts** (assertion line 1) — testTimeoutFailure. Evidence: 'test timed out after 60000ms'

#### `src/indexer/__tests__/subsystem-pass.test.ts`

- **src/indexer/__tests__/subsystem-pass.test.ts** (assertion line 1) — testTimeoutFailure. Evidence: 'test timed out after 60000ms'

#### `src/indexer/__tests__/watcher-new-directories.test.ts`

- **src/indexer/__tests__/watcher-new-directories.test.ts: a per-directory subscribe that throws is logged, does not throw out of the handler, and the files present in the new directory are still reported once** (assertion line 195) — testCodeFailure. Evidence: reported once

#### `src/mcp/__tests__/mcp-process-e2e.test.ts`

- **ac5 pass-through: emit_plan and emit_step prompts, schemas and state are byte-identical to the in-process replies** (assertion line 193) — testCodeFailure. Evidence: ’emit_plan (workflow): 'userTurn' differs from the in-process reply at character 58: via MCP …"Defect (the bugfix focus): add a flag to the cli\\nRepo: /private/var/folders/78/fscmgmls2k72q89nnypxxfqm0000gn/T/insrc-e2e-repo-OnbNAh\\nEmit the plan JSON now."… in-process …"Defect (

#### `src/shared/__tests__/connection-manager-compatibility.test.ts`

- **src/shared/__tests__/connection-manager-compatibility.test.ts** (assertion line 1) — testTimeoutFailure. Evidence: 'test timed out after 60000ms'

#### `src/shared/__tests__/connection-manager-corpus.test.ts`

- **src/shared/__tests__/connection-manager-corpus.test.ts** (assertion line 1) — testTimeoutFailure. Evidence: 'test timed out after 60000ms'

#### `src/shared/__tests__/connection-manager-isolation.test.ts`

- **src/shared/__tests__/connection-manager-isolation.test.ts** (assertion line 1) — testTimeoutFailure. Evidence: 'test timed out after 60000ms'

#### `src/shared/__tests__/connection-manager-kotlin-draft.test.ts`

- **src/shared/__tests__/connection-manager-kotlin-draft.test.ts** (assertion line 1) — testTimeoutFailure. Evidence: 'test timed out after 60000ms'

#### `src/shared/__tests__/connection-manager-kotlin-entry.test.ts`

- **src/shared/__tests__/connection-manager-kotlin-entry.test.ts** (assertion line 1) — testTimeoutFailure. Evidence: 'test timed out after 60000ms'

#### `src/shared/__tests__/connection-manager-kotlin-model.test.ts`

- **src/shared/__tests__/connection-manager-kotlin-model.test.ts** (assertion line 1) — testTimeoutFailure. Evidence: 'test timed out after 60000ms'

#### `src/shared/__tests__/connection-manager-kotlin-mutation.test.ts`

- **src/shared/__tests__/connection-manager-kotlin-mutation.test.ts** (assertion line 1) — testTimeoutFailure. Evidence: 'test timed out after 60000ms'

#### `src/shared/__tests__/connection-manager-kotlin-owner.test.ts`

- **src/shared/__tests__/connection-manager-kotlin-owner.test.ts** (assertion line 1) — testTimeoutFailure. Evidence: 'test timed out after 60000ms'

#### `src/shared/__tests__/connection-manager-kotlin-removal.test.ts`

- **src/shared/__tests__/connection-manager-kotlin-removal.test.ts** (assertion line 1) — testTimeoutFailure. Evidence: 'test timed out after 60000ms'

#### `src/shared/__tests__/connection-manager-kotlin-render.test.ts`

- **src/shared/__tests__/connection-manager-kotlin-render.test.ts** (assertion line 1) — testTimeoutFailure. Evidence: 'test timed out after 60000ms'

#### `src/shared/__tests__/connection-manager-kotlin-test.test.ts`

- **src/shared/__tests__/connection-manager-kotlin-test.test.ts** (assertion line 1) — testTimeoutFailure. Evidence: 'test timed out after 60000ms'

#### `src/shared/__tests__/connection-manager-kotlin-transport.test.ts`

- **src/shared/__tests__/connection-manager-kotlin-transport.test.ts** (assertion line 1) — testTimeoutFailure. Evidence: 'test timed out after 60000ms'

#### `src/shared/__tests__/connection-manager-kotlin-wire.test.ts`

- **src/shared/__tests__/connection-manager-kotlin-wire.test.ts** (assertion line 1) — testTimeoutFailure. Evidence: 'test timed out after 60000ms'

#### `src/shared/__tests__/connection-manager-packaging.test.ts`

- **src/shared/__tests__/connection-manager-packaging.test.ts** (assertion line 1) — testTimeoutFailure. Evidence: 'test timed out after 60000ms'

#### `src/shared/__tests__/connection-manager-parity.test.ts`

- **src/shared/__tests__/connection-manager-parity.test.ts** (assertion line 1) — testTimeoutFailure. Evidence: 'test timed out after 60000ms'

#### `src/shared/__tests__/connection-manager-privacy.test.ts`

- **src/shared/__tests__/connection-manager-privacy.test.ts** (assertion line 1) — testTimeoutFailure. Evidence: 'test timed out after 60000ms'

#### `src/shared/__tests__/connection-manager-release.test.ts`

- **CM-S5-GATE: default runtime policy preserves authorization and independent release-audit evidence** (assertion line 19) — testCodeFailure. Evidence: src/shared/ipc-client.ts

#### `src/shared/__tests__/daemon-process-client.test.ts`

- **chunked readiness and out-of-order replies preserve one immutable identity and request correlation** (assertion line 13) — testCodeFailure. Evidence: 'process capability readiness timed out'
- **spawn, readiness, malformed identity and native permission failures refuse capture and clean helpers** (assertion line 108) — testCodeFailure. Evidence: "emit('ERROR denied 1');"
- **abort before capture and during readiness or a pending request leaves no helper** (assertion line 14) — testCodeFailure. Evidence: 'process capability readiness timed out'
- **unknown reply IDs, operation mismatches and request errors close the capability session** (assertion line 14) — testCodeFailure. Evidence: 'process capability readiness timed out'
- **oversized readiness and partial request replies never become process-exit evidence** (assertion line 153) — testCodeFailure. Evidence: The validation function is expected to return "true". Received false

#### `src/shared/__tests__/daemon-run-files.test.ts`

- **acquireRunFileGuard suffixes the quarantine name on collision; owner.json stays byte-identical and one daemonLog line is keyed by the recorded nonce; a log-write failure is swallowed** (assertion line 517) — testCodeFailure. Evidence: Expected values to be strictly equal:

#### `src/shared/__tests__/darwin-lifecycle.test.ts`

- **Observes exact exit of a disposable child with the read-only Darwin helper** (assertion line 4) — testCodeFailure. Evidence: Command failed: /tmp/insrc-observe-7ZCooH/observer identity 56155
- **Legacy exit observation rejects PID reuse, owner mismatch and timeout without invoking the Mach broker** (assertion line 4) — testCodeFailure. Evidence: Command failed: /tmp/insrc-observe-7ZCooH/observer identity 56186
- **Reads credentials from the connected socket and rejects mismatched PID or UID** (assertion line 4) — testCodeFailure. Evidence: 'Darwin peer observation failed'

#### `src/shared/__tests__/installation-mutation-gate.test.ts`

- **a fresh installation journal read leaves the trust-only state root pristine** (assertion line 1) — hookFailed. Evidence: Command failed: /private/tmp/insrc-mutation-DRu0tE/observer identity 55504
- **production bundle activation retains proof and admission floor on rollback** (assertion line 1) — hookFailed. Evidence: Command failed: /private/tmp/insrc-mutation-DRu0tE/observer identity 55504
- **development bundle activation retains proof and admission floor on rollback** (assertion line 1) — hookFailed. Evidence: Command failed: /private/tmp/insrc-mutation-DRu0tE/observer identity 55504
- **Durable update reservation blocks competing mutations and binds the owner** (assertion line 1) — hookFailed. Evidence: Command failed: /private/tmp/insrc-mutation-DRu0tE/observer identity 55504
- **Admission rejects foreign update IDs, owner PID reuse and connections opened before lease publication** (assertion line 1) — hookFailed. Evidence: Command failed: /private/tmp/insrc-mutation-DRu0tE/observer identity 55504
- **Recovery classification distinguishes uncommitted, committed, rolled-back and fenced transactions** (assertion line 1) — hookFailed. Evidence: Command failed: /private/tmp/insrc-mutation-DRu0tE/observer identity 55504
- **Two independent processes cannot reserve the same installation or clear an unverified orphan reservation** (assertion line 20) — hookFailed. Evidence: Command failed: /private/tmp/insrc-mutation-DRu0tE/observer identity 55504
- **Controller death releases short arbitration but preserves the durable reservation** (assertion line 20) — hookFailed. Evidence: Command failed: /private/tmp/insrc-mutation-DRu0tE/observer identity 55504
- **Public lifecycle admission remains busy while an update owns the installation** (assertion line 20) — hookFailed. Evidence: Command failed: /private/tmp/insrc-mutation-DRu0tE/observer identity 55504

#### `src/shared/__tests__/probe-worker-logger.test.ts`

- **src/shared/__tests__/probe-worker-logger.test.ts** (assertion line 1) — testTimeoutFailure. Evidence: 'test timed out after 60000ms'


### Scripts and project memory


#### `scripts/__tests__/build-script.test.ts`

- **build-script.test.ts: package.json build runs forbidden-spawn-scan.mjs --fail and the scan finds nothing outside the exemptions** (assertion line 24) — testCodeFailure. Evidence: Expected values to be strictly deep-equal:

#### `scripts/__tests__/forbidden-spawn-scan.test.ts`

- **forbidden-spawn-scan.test.ts: a run over src lists the direct gitDiffTool.execute calls in grounding.ts and changed-files.ts and parses every file** (assertion line 87) — testCodeFailure. Evidence: ''

#### `scripts/__tests__/project-memory-qualification.test.ts`

- **manual-linux-ext4-node22-native-and-lifecycle** (assertion line 15) — testCodeFailure. Evidence: qualification must cover the current package implementation and fixtures
- **manual-linux-packed-consumer-and-natural-exit** (assertion line 15) — testCodeFailure. Evidence: qualification must cover the current package implementation and fixtures

#### `scripts/__tests__/project-memory-s2-performance.test.ts`

- **full-current-source-queue-resource-study-evidence** (assertion line 13) — testCodeFailure. Evidence: src/host-node.ts changed after measurement

#### `scripts/__tests__/project-memory-s2-qualification.test.ts`

- **current-source-macos-apfs-node22-crash-qualification** (assertion line 13) — testCodeFailure. Evidence: native qualification must cover current package source/fixtures
- **current-source-linux-ext4-node22-crash-qualification** (assertion line 13) — testCodeFailure. Evidence: native qualification must cover current package source/fixtures


### VS Code bounded sweep


#### `vscode-plugin/src/chat/__tests__/chat-theme.test.ts`

- **chat theme: the chat's own style has no hex, rgb, rgba or hsl value, no radial gradient and no var() with a literal fallback; its only color-mix is the assistant message's ground, declared once; the colour scheme follows the theme kind; a linear gradient is built only from names and transparent** (assertion line 98) — testCodeFailure. Evidence: the shared sheet, then the chat's own style
- **chat theme: every name used in the shell style, the row renderer style and the chat's markdown rules is defined in the named layer** (assertion line 51) — testCodeFailure. Evidence: 'the style has a :root rule'
- **chat theme: every name but the one derived ground holds a theme variable of this design's mapping, and every optional one falls back to another theme variable** (assertion line 51) — testCodeFailure. Evidence: 'the style has a :root rule'
- **chat theme: each component uses the name the mapping gives it (bars, transcript, user and assistant bubbles, tool row, markers, diff lines, approval card and buttons, decided badge, selection card, input, selects, pill, attachment chips, progress, markdown)** (assertion line 64) — testCodeFailure. Evidence: 'the style has a rule for body'
- **chat theme: the history chip is one wrapper around the trigger button with a masked icon in the current text colour; the trigger keeps its id, and every image source the shell declares is allowed by its content security policy** (assertion line 312) — testCodeFailure. Evidence: The input did not match the regular expression /<span class="right"><span class="histchip"><button type="button" id="insrc-history" class="chatbtn [^"]*" aria-haspopup="menu"[^>]*><span class="pico"><\/span><span class="chatlbl">new…<\/span><span class="chev">▾<\/span><\/button><
- **chat theme: every selector and element id of the shell and the row renderer from before the change is still present, the added selectors are exactly the listed ones, and the shell is still one nonce'd inline script under the same policy** (assertion line 333) — testCodeFailure. Evidence: no selector was removed or renamed

#### `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts`

- **src/chat/__tests__/docs-review-panel.test.ts** (assertion line 1) — testTimeoutFailure. Evidence: 'test timed out after 60000ms'

#### `vscode-plugin/src/config/__tests__/manifest-catalog.test.ts`

- **declared global insrc.\* keys EXACTLY cover the global CONFIG_CATALOG paths (no missing, no extra)** (assertion line 51) — testCodeFailure. Evidence: manifest missing keys: insrc.build.resultFormat
- **each declared key's type/enum/default matches its ConfigOption, and scope is 'machine'** (assertion line 66) — testCodeFailure. Evidence: 'no declared schema for insrc.build.resultFormat'

#### `vscode-plugin/src/config/__tests__/per-role.test.ts`

- **each per-role key is a machine-scoped enum with default = the role's defaultTier** (assertion line 92) — testCodeFailure. Evidence: Expected values to be strictly equal:

#### `vscode-plugin/src/config/__tests__/sync-manifest-catalog.test.ts`

- **sync-manifest-catalog.test.ts: the committed manifest is in sync, and the script is idempotent on a stale copy** (assertion line 29) — testCodeFailure. Evidence: [sync-manifest-catalog] the manifest differs from the settings catalog: run npx tsx scripts/sync-manifest-catalog.mjs

#### `vscode-plugin/src/config/__tests__/vscode-bundle-catalog.test.ts`

- **vscode-bundle-catalog.test.ts: the extension type-checks and bundles; its key map, loaded without backend node_modules, maps every settings-catalog row without bundling the catalog or the definitions file** (assertion line 27) — testCodeFailure. Evidence: src/chat/__sc4probe_76173_seqsluthwb__.ts(4,44): error TS2339: Property 'body' does not exist on type '{ readonly state: "absent"; }'.

#### `vscode-plugin/src/connections/__tests__/privacy.test.ts`

- **CM-S5-PRIVACY-TS: actual manager module has no Settings memento file artifact or telemetry capability** (assertion line 1) — testCodeFailure. Evidence: Build failed with 1 error:

#### `vscode-plugin/src/hosts/__tests__/activation.test.ts`

- **sync-assets bundles the canonical steering block so the steering body ships with the extension** (assertion line 51) — testCodeFailure. Evidence: 'assets/steering-block.md byte-matches src/prompts/steering-block.md (run ’npm run sync-assets’)'

#### `vscode-plugin/src/panels/__tests__/repo-config.test.ts`

- **renderRepoConfig: discrete per-repo form fields from models.byRepo[repoPath] tasks and coreFloor (NOT raw JSON); missing entry -> all-global** (assertion line 54) — testCodeFailure. Evidence: 'a missing byRepo entry -> all-global form'

<!-- observed-inventory:end -->


## Batch 01 remediation checkpoint

The original observations above remain the historical audit; they are not a
current full-suite result. Batch 01 implements checkout output ownership, Node
22 child binding, real peer-port coverage and cleanup, per-case fixture disposal,
startup-aware abort tests and isolated asynchronous compiler probes. See the
[build evidence](test-harness-build-2026-11-20.md) and
[supported commands](../testing.md).

Final sequential controls: 19 passed, no failures/cancellations/skips, followed
by eight targeted coordinator checks (seven repeated plus one new live-admission
control), all passing without calling live services. Eight
focused backend files: 28 passed, no failures/cancellations, two existing Linux
platform skips. Complete isolated native consumer diagnostics still report eight
passes, eleven failures, one cancellation and three platform skips across 23
cases; their assertions and [logs](test-harness-consumer-results-2026-11-20.json)
remain intact for Batch 17. Those remaining outcomes do not establish eleven
independent product defects or prove platform-only causality. Qualification
proofs were not refreshed; Batches 15/16 remain pending.

The final capture found no remaining matching test/compiler/owned-fixture
processes, active checkout lease or source-adjacent compiler probe. Broader
backend/IDE failures remain assigned to the other coherent batch issues.

## Batch 02 validation checkpoint

Approved issue `ISSUE-939c138296f56a8f`: temporary provider errors are projected before prototype inspection, and lookup terminal reasons use identity-only WeakMap projection. The original three diagnostic failures reproduced; the final focused run passed 14/14 with no skips/cancellations and confirmed cleanup. Source and compiled provider/RPC fixtures retain privacy, authority and saved-mode controls. A later stale RPC continuation assertion now requires the current `emit_part` response and safe failure payload. See [evidence and limits](temporary-error-sanitization-2026-11-20.md). BUILD human approval was recorded on 2026-11-20 and the Batch 02 story/epic completed; no broader suite or qualification claim.

## Batch 03 validation checkpoint

The approved shared-grep fix excludes live-store reads before backend admission, including directory aliases and independently relocated configured data/lock targets. Final focused run: **29 pass, 1 fail, no cancellations/skips**, complete coverage and confirmed actor closure. The remaining file-tool fixture failure is now a stale `executeTool` call with no dependencies (Batch 11), after the original store-leak assertion passes. The unchanged 300ms fake-rg timing test failed in the baseline and passed in the final run. [Evidence and limits](live-store-search-fix-2026-11-20.md). BUILD approval was recorded on 2026-11-20 and the Batch 03 story/epic completed; no broad-suite or qualification claim.

## Batch 04 partial checkpoint

Tasks t1/t2 passed daemon validation: current unavailable boundaries, generic transport/lifecycle and active role controls, plus supported worker/token behavior. t1 fresh focused run passed12/12; t2 focused run passed4/4 and its later gate passed all three full mapped files. t3 remains non-green: replacing the removed writer import exposed an actual artifact preparation guard-order defect, tracked as `ISSUE-81be53b2b0f003a7` pending approval. Expected temporary refusal, observed hostile-payload getter/private test canary before the write guard. No production fix applied; later persistence assertions and dependent isolation/final tasks remain unverified. [Mapping/evidence](review-test-migration-2026-11-20.md).

## Batch 04 final implementation checkpoint

After separately approved ISSUE-81be53b2b0f003a7 fixed early artifact-persistence admission, the unchanged privacy matrix passed. Tasks t1–t4 passed daemon validation; t5 submits final evidence of **59/59 passing tests across16 files**, no skips/cancellations, complete coverage and confirmed actor closure. The general graph audit still has one failing parent case from two analyze-step fixture assertions (Batch11); it is explicitly outside this green selection. No repository-wide green or qualification claim. Both Batch04 BUILD and blocker BUILD require human approval before completion. [Final mapping, logs and limits](review-test-migration-2026-11-20.md).

## Batch 04 completion

Human approval of both validated BUILDs on 2026-11-20 completed Batch04 and the separately tracked artifact-preparation guard defect (81be53b2b0f003a7). Final focused evidence remains59/59 passes; the unrelated Batch11 analyze-fixture failure is still open. Earlier blocked/pending checkpoints are historical, and GitHub tracker attachment remains unbound.
