# Merging origin/main into v2: the conflicts, second round (2026-10-26)

Nothing has been merged. This is a dry run (`git merge-tree --write-tree HEAD origin/main`, which touches no file), the same
way as the first round in [`main-merge-conflicts.md`](main-merge-conflicts.md) (2026-10-25, merged as `ba438d1b3`).

- `v2` is at `65bb1568f` (pushed). The merge base is `ce8ae84ab`, the `origin/main` state the first round merged.
  `origin/main` (`6378146c7`) is **228 commits** ahead of it (405 files, +88,414 / -2,207; 287 of them under `src/`); `v2` is 788 commits ahead.
- **8 files conflict** (the first round had 29). Two of them (`package.json`, `config-catalog.ts`) are small decisions; four are one-hunk
  unions; `daemon/index.ts` is no longer the hard file it was.
- 22 files were changed by both sides and merge cleanly; they are listed under "Clean merges that need a check".

## What main did

Three Epics of the main line landed since the first merge:

| Epic stories | What | Where |
| --- | --- | --- |
| model definitions (Epic ce99b720, s1 to s3) | one three-family **model definitions file** with a validating loader, a per-thread `ModelRegistry`, tier resolution and the role router on it, `models.definitions` / `providers.listModels` / `models.resolveRole`, boot reconcile from the definitions, the installers, the VS Code manifest and a JetBrains fixture generated from them; `models.shaper.ollamaNumCtx` retired (the context window is each model's `inputLimit`); `scripts/check-model-definitions.mjs` joins the build | `config/`, `daemon/model-registry.ts`, `analyze/context/`, `cli/`, `workflow/attribution.ts` |
| connection management (s2, s3) | readonly database probes behind a bounded supervisor, connection sessions with signed tickets, `ConnectionExecutionContext` carried by every tool call (`ToolDeps.connectionExecution`), `assertAnalysisConnectionExecution`, private MCP bootstrap, `connection-session-rpc`, trusted step context | `daemon/db/**` (79 files), `daemon/steps/**`, `daemon/tools/executor.ts`, `mcp/*`, `shared/*` |
| the codex review fixes the first round named | more review-path work around schemas and stalls | `workflow/review*` (merge clean) |

## The 8 files, one by one

"Resolution" is what I propose; none of it is done. Effort: S = a minute, M = a careful read, L = a design decision.

1. **`package.json`** (1 hunk). *S.* The `build` script: `v2` `tsc && node build-process-broker.mjs && node build-shutdown-watchdog.mjs && node copy-assets.mjs`; `main` `tsc && node scripts/check-model-definitions.mjs && node copy-assets.mjs`.
   Keep all: `tsc && node build-process-broker.mjs && node build-shutdown-watchdog.mjs && node scripts/check-model-definitions.mjs && node copy-assets.mjs`. The lock file is not touched by `main`, so no `npm install` is needed unless the merged tree says otherwise (the first round's lesson: run it after any `package.json` dependency change; the dependencies merge clean here).
2. **`src/config/config-catalog.ts`** (2 hunks). *M.* `main` turned `CONFIG_CATALOG` into `buildConfigCatalog(defs)`, a function over the model definitions (the model rows take their defaults and enums from them); `v2` still has the old constant array and three edits to it:
   it adds `daemonUpdate.repoUrl` and `daemonUpdate.branch`, it replaces `permissions.mode` by `tools.commonApproval`, and a retired-path entry `{ path: 'permissions', prefix: true }` (hunk 2) where `main` retires `models.shaper.ollamaNumCtx`.
   Resolution: take `main`'s function and re-apply `v2`'s three row edits inside it; keep **both** retired paths (`permissions` prefix and `models.shaper.ollamaNumCtx`).
3. **`src/config/__tests__/config-catalog-contract.test.ts`** (3 hunks). *S, after 2.* Row counts (`v2` says 50, `main` 47) and the retired-path list (both entries); `main` also adds `'ultra'` to the effort enum.
   The count is recomputed by running the test after 2, not guessed.
4. **`src/daemon/index.ts`** (1 hunk). *M.* `v2`: `new IpcServer(router?.forward ?? local); startupServer = server;` (the startup guard that cleans up a failed publication). `main`: `new IpcServer(connectionSessionRuntime.forward(router?.forward ?? local))`, `server.onConnectionClose(...)`, and the session runtime added to `connectionOwners` so shutdown closes it.
   Union: `main`'s three lines, then `v2`'s `startupServer = server;`. Check the shutdown order afterwards (line ~553 `connectionSessionRuntime.stopAdmission()` and ~588 the owners' close) against `v2`'s close-with-ownership sequence, and run the shutdown suites.
5. **`src/daemon/server.ts`** (1 hunk). *S.* Imports only: `main` adds `RequestLifetime` and `rmSync`; `v2` has neither at that place. Take both if both are used (`tsc` finds an unused one).
6. **`src/daemon/tools/executor.ts`** (1 hunk). *M.* After `tool.execute`: `v2` validates the result against the tool's output schema (`schema-mismatch`, my typed-tool work); `main` calls `assertAnalysisConnectionExecution(deps.connectionExecution)` and returns the result.
   Keep both, `main`'s call first (it throws and is caught below), then `v2`'s checks. The `catch` already has `main`'s `connectionExecution` branch (it merged clean). Re-run `executor` and the typed-tool tests of s2.
7. **`src/mcp/server.ts`** (1 hunk). *S.* `v2` adds a refusal for an unconverted repository (`repoSchemaRefusalOfInput`) and builds the client with `stepClientOf(detectClientProvider(...))`; `main` uses `detectClient(...)` (defined further down the file, returning `StepClient`).
   Keep `v2`'s refusal lines and `main`'s client line; remove `stepClientOf`/`detectClientProvider` imports if nothing else uses them; check line ~932 (the other `detectClient` call) is consistent.
8. **`src/daemon/code-review-rpc.ts`** (1 hunk). *S.* Imports: `v2` `resolveShaperKind` and `repoSchemaRefusal`; `main` `shaperModelLabel` and `familyForClient`. The file's later code (merged clean) uses `familyForClient` and `shaperModelLabel` (main's) and `repoSchemaRefusal` (v2's), so: `buildShaperProvider, shaperModelLabel` + `familyForClient` + `repoSchemaRefusal`; drop `resolveShaperKind` if `tsc` says it is unused.

## Clean merges that need a check

- **Typed tool framework vs `ToolDeps.connectionExecution`** (`daemon/tools/types.ts`, `executor.ts`, `call-tool.ts`): the new optional field is in `ToolDeps`; my typed `callTool` and the gh/Jira op-table tools build `ToolDeps` objects in their tests. `tsc` and the s2/s5/s6 suites (`src/daemon/tools/**`) decide.
- **`main`'s source-literal and policy scans** (s3/t10 "source-literal scan", s3/t1 "connect policy guards and identify backend sites", "isolate concrete SDK diagnostics"): they scan production files for backend call sites and literals. My new `builtins/gh/**` and `builtins/jira/**` spawn `gh`/`acli` through `ghExec`/`acliExec`; if a scan treats a spawn as a backend site it will flag them. Run those scans first.
- **`src/workflow/artifact-write-inventory.ts`**: main's new writers (connection management, model definitions, installers) need entries; the inventory test names each file.
- **`src/workflow/attribution.ts`, `workflow/types.ts`, `cli/services/workflow.ts`** (main rewrote run labels and the client identity): v2 added `authoredBy` and the lifecycle on the same types. `tsc` plus the attribution and review-gate suites.
- **`src/daemon/steps/**`** (`host.ts`, `analyze-step/handler.ts`, `build-step/phases/validate.ts`): main made the host accept the client identity and trusted step context; v2 carries the review/build state through the lifecycle. Run the step suites.
- **`src/daemon/handler-runtime.ts`**, **`lifecycle.ts`**, **`threads/method-class.ts`**: both sides edited; the method classes and handler key sets are asserted by tests that must list the union of the methods (new `models.*`, `connection.*` on main; `repo.convert`, `approval.*`, `team.*` on v2).
- **`src/daemon/db/**`** (79 files, +15k lines on main): v2 touched only `rdbms-common.ts` last round; take as is and run the db suites. `tools/builtins/db/index.ts` and `data/schema-drift.ts` changed on both sides.
- **`vscode-plugin/package.json`**, **`scripts/insrc-daemon-install.sh`**, **`tsconfig.json`**: generated from the definitions on main; v2 has not touched the install script. Take main's, and check the build script above runs.
- **`.insrc/artifacts/` and `docs/`** from main are other Epics' records and merge as additions (94 docs commits).
- **`permissions.mode`**: v2 removed it; any new main code reading it breaks silently. Search for it after the merge.

## Order of work (proposed)

1. `git merge --no-ff --no-commit origin/main`; resolve 1, 2, 5, 7, 8 (the small ones), run `tsc`.
2. 6 (executor), 4 (daemon index), then 3 (recompute the catalog counts with the test); `tsc` again.
3. `npm run build` (the new model-definitions check runs in it), then the suites in this order: config, daemon (shutdown, server, handler-runtime, method classes), tools, steps, workflow, mcp, cli, db, indexer, analyze.
4. Full sweep once; compare with the last sweep (workflow 0 failures; db 0; the other chunks as of 2026-10-26, recorded in `docs/plans/workflow-gate-test-fixes.md`).
5. Re-run the code review of a small Story to check the codex reviewer path against main's review fixes.
6. Commit `merge: origin/main into v2` with the conflicts and decisions in the body, push, `daemon-ctl.sh update` then `restart` (and `npm install` first if the lock file changed).

## How to reproduce

```bash
git fetch origin
git merge-tree --write-tree --name-only --messages HEAD origin/main      # the list; the first line is the merged tree
git show <tree>:<path>                                                   # a file with its conflict markers
git log --oneline $(git merge-base HEAD origin/main)..origin/main -- <path>   # what main did to it
git log --oneline $(git merge-base HEAD origin/main)..HEAD -- <path>          # what v2 did to it
```
