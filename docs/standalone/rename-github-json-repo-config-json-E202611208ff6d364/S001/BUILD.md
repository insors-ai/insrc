<!-- insrc:artifact BUILD-8ff6d364012cff02-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-11-20T17:18:15.377Z  ·  **Updated:** 2026-11-20T19:00:22.595Z

**Commit:** 74629bfa2

## Summary

Renamed the per-repository settings file ~/.insrc/github.json to repo-config.json: new src/workflow/config/repo-config.ts (repoConfigPath/INSRC_REPO_CONFIG, RepoConfigFile, RepoConfigEntry, loadRepoConfigFile, TrackerAdapter), github-store.ts is now repo-config-store.ts with the error code repo-config-unreadable, github.ts keeps only the GitHub-tracker resolution, and every importer, message and test follows (t1); an existing github.json is moved once at the first boot of the updated daemon, before anything reads it, in a try/catch, skipped when INSRC_REPO_CONFIG is set (t2). The new name is published by a hard link (the file system refuses it when the destination exists; NTFS and ReFS support hard links, so Windows is covered) or a recreated symbolic link; nothing is copied and the code never deletes repo-config.json. The old name is removed by claiming it: github.json is atomically renamed to a unique name only the daemon knows and only that name is ever deleted, so no check can be interleaved with the delete; if the claimed file is not the one that was published an editor had replaced it, and it is linked back under github.json so both files are kept (and if that is refused too it stays under the claimed name, which the result names); github.json is absent for the length of two calls while claimed. With both names present, whatever they hold, neither is touched (both-exist); on a volume without hard links (FAT, exFAT, some shares) the move is failed with a note to rename by hand and retried at every boot. Tests for the path function, the real repo.settings round trip after a move and two source scans (t3); the JetBrains test fixtures and comments (t4, 13 tests pass under JDK 21, reported); the live docs and the doc test, which pins the text around each of the 34 mentions of repo-config.json in the thirteen edited docs, records the .json names each may mention, rejects any other override variable and checks the tree listings and shell example (t5). Deviations from the approved text and one pre-existing failure, all disclosed: (1) GithubConfigError is kept: the LLD called it a file-layer error and renamed it to RepoConfigError, but loadGithubConfigFile never throws and the tracker resolution is its only thrower, so it is a tracker name; no RepoConfigError exists, the old-identifier scan omits it for the whole of src and checks only that the file layer does not name it, so the gate marks t1 and t3 unsatisfied on that point. (2) The LLD said the move is one atomic rename; rename replaces its destination on every platform including Windows, so it is an exclusive hard link plus a claim-and-delete, which keeps the LLD's guarantee that an existing repo-config.json is never overwritten; a crash or a refused rename between the steps leaves both files with the same content, reported as both-exist or failed, harmless and deletable by hand. (3) A copy fallback for volumes without hard links was built and then removed after review: a copy cannot be published both completely and without replacing an existing file with Node's calls. (4) The move was tested on Linux, not on Windows itself. (5) The module-state and session-source inventory tests fail on a clean checkout at 46fe59d92 and on origin/v2 5e76b50d8 for unrelated stale entries (module-state: 'every scanned key under src/daemon/' and 'every module-scope mutable value'; session-source: CM-S3-INVENTORY and CM-S4-GATE); the fixtures were edited only for the renamed store, the new repo-config.ts entry, github.ts's moved sites and the digests of files changed only by the rename, so the gate fails t1 on those four cases. Full sweep of src (every test file, per file) against a clean checkout of 46fe59d92: no failure caused by this Story remains; the differences were flaky (keystore-consumers, MCPSection pass alone) or an untracked out/bin/insrc-process-broker in the main tree that fails daemon-ctl-node-path.test.ts regardless of source.

## Tasks validated

- ✗ `t1`
- ✓ `t2`
- ✗ `t3`
- ✓ `t4`
- ✓ `t5`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/cli/__tests__/settings-modal.test.ts` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `src/cli/__tests__/tracker-setup-service.test.ts` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `src/cli/services/config.ts` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `src/cli/services/workflow.ts` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `src/config/__tests__/repo-fields.test.ts` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `src/config/repo-fields.ts` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `src/daemon/__tests__/build-commands-doc.test.ts` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `src/daemon/__tests__/git-hooks-methods.test.ts` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `src/daemon/__tests__/handler-runtime.test.ts` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `src/daemon/__tests__/repo-settings.test.ts` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `src/daemon/__tests__/tracker-sync-method.test.ts` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `src/daemon/git-hooks-methods.ts` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `src/daemon/handler-runtime.ts` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `src/daemon/repo-call-audit.ts` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `src/daemon/repo-settings.ts` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `src/daemon/steps/build-step/__tests__/comment-sync-callers.test.ts` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `src/daemon/steps/build-step/__tests__/validate-task-round.test.ts` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `src/daemon/steps/build-step/__tests__/validation-checks.test.ts` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `src/daemon/steps/build-step/command-setting.ts` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `src/daemon/steps/build-step/validation-checks.ts` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `src/daemon/steps/workflow-step/__tests__/tracker-e2e.test.ts` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `src/daemon/steps/workflow-step/__tests__/tracker-tasks-coarse.test.ts` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `src/daemon/threads/__tests__/fixtures/module-state-inventory.json` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `src/daemon/tracker-setup-handlers.ts` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `src/workflow/__tests__/anchor-missing-producers.test.ts` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `src/workflow/__tests__/approve-attach.test.ts` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `src/workflow/__tests__/approve-fallback-kit.ts` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `src/workflow/__tests__/commit-denial-callers.test.ts` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `src/workflow/__tests__/draft-issues.test.ts` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `src/workflow/__tests__/questions.test.ts` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `src/workflow/__tests__/redraft-preserves-tracker.test.ts` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `src/workflow/__tests__/tracker-auto.test.ts` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `src/workflow/__tests__/tracker-push-modes.test.ts` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `src/workflow/__tests__/tracker-tasks.test.ts` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `src/workflow/artifact-write-inventory.ts` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `src/workflow/config/__tests__/github-split.test.ts` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `src/workflow/config/__tests__/github.test.ts` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `src/workflow/config/__tests__/repo-config-store.test.ts` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `src/workflow/config/github.ts` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `src/workflow/config/repo-config-store.ts` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `src/workflow/config/repo-config.ts` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `src/workflow/runners/tracker/context.ts` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `src/workflow/tracker-auto.ts` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `src/workflow/tracker/__tests__/github-signoff.test.ts` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `src/workflow/tracker/__tests__/issue-title-guard.test.ts` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `src/workflow/tracker/__tests__/issue-title.test.ts` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `src/workflow/tracker/__tests__/port.test.ts` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `src/workflow/tracker/__tests__/refresh.test.ts` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `src/workflow/tracker/__tests__/setup-plan.test.ts` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `src/workflow/tracker/__tests__/setup.test.ts` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `src/workflow/tracker/__tests__/tracker-denial.test.ts` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `src/workflow/tracker/__tests__/tracker-push-registry.test.ts` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `src/workflow/tracker/__tests__/unit-issue.test.ts` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `src/workflow/tracker/setup.ts` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `src/daemon/index.ts` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `src/workflow/config/__tests__/repo-config.test.ts` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsTrackerTest.kt` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/PerRepoSectionTest.kt` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `docs/daemon.md` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `docs/index.html` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `docs/installation.md` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `docs/plans/meta-workflow-framework.md` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `docs/plans/repo-call-audit.md` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `docs/plans/team-workflow.md` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `docs/plans/workflow-define.md` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `docs/plans/workflow-implementation.md` — **insrc-build** (2026-11-20T19:00:22.595Z)
- `docs/workflow.md` — **insrc-build** (2026-11-20T19:00:22.595Z)
