<!-- insrc:artifact BUILD-d70697dff9f56b4a-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-11-20T19:25:08.691Z  ·  **Updated:** 2026-11-21T04:06:27.634Z

**Commit:** f214b64f8

## Summary

Adds a root-level integer schemaVersion to ~/.insrc/repo-config.json and a boot pass that decides, by the stored value alone (never a commit id), whether the build-defaults migration runs. Store (t1): RepoConfigFile.schemaVersion; readSchemaVersion (null for an absent file, key or null; an invalid value or an unreadable file is returned as data, never taken as 0); writeSchemaVersion on the same queue and verified read-merge-write loop as writeRepoEntryKeys (writeOnce now takes its merge step as a parameter), keeping default, repos and unknown keys and never lowering. Runner (t2): REPO_CONFIG_SCHEMA_VERSION = 1, a static step list whose step 1 runs migrateBuildDefaults one repository at a time, handing the event loop back (setImmediate) before each so a large registry or slow file system does not hold the boot thread (a review finding: the per-repository work is synchronous file I/O, so awaiting alone did not yield; a test with 100 repositories now checks that a timer and an immediate scheduled beforehand run before the pass finishes and that the loop turns at least once per repository, and was seen to fail without the yield), clean when no repo reports write-failed; and runSchemaMigrations, which runs the steps above the stored version in order, stops at the first that is not clean or throws, stamps the highest clean version, returns one of eight statuses and never rejects; repo.buildDefaults.migrate is unchanged and neither reads nor writes the version. Boot (t3): a fire-and-forget pass next to the steering refresh, after the registry loads, never awaited, with a logging catch. Docs (t4): a subsection of docs/daemon.md (including that step 1 yields between repositories) and a doc test that reads the version, every status and each row of the comparison table against a run. Deviations and limits, all disclosed: (1) the step context carries optional configPath and writeKeys beside repos (the LLD's context was repos only) so the pass's own file and writer reach step 1. (2) The gate marks t1 unsatisfied on one check only: it cannot prove 'no inventory test case fails beyond the four that already fail on a clean checkout', because it runs only the mapped files and the two inventory suites already fail on a clean checkout (module-state-inventory 2 cases, session-source-inventory 2 cases, identical before and after); no code of this Story adds module-scope state, and the session-source fixture entries for repo-config-store.ts, repo-config.ts, repo-settings.ts and index.ts were refreshed (sites, counts, digests) after inspecting the sites, which also brings the repo-config-store.ts and index.ts entries up to date with the previous Story's additions. (3) The live daemon was not booted: the pass is proven by a source check of index.ts and by runSchemaMigrations against temporary files and repos, not by a real first boot on an existing ~/.insrc. (4) The yield is between repositories; one repository's own marker check, read and write remain synchronous. Full sweep of every test file (1415, per file) after the last task, before the yield change: 74 files fail, all of them also fail on the commit before this Story (6b1c64504) with the same or more failing cases, so none is caused by this Story; after the yield change the three files it touches (schema-migrations, repo-settings, build-commands-doc) were re-run and pass.

## Tasks validated

- ✗ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/__tests__/schema-migrations.test.ts` — **insrc-build** (2026-11-21T04:06:27.634Z)
- `src/workflow/config/repo-config-store.ts` — **insrc-build** (2026-11-21T04:06:27.634Z)
- `src/workflow/config/repo-config.ts` — **insrc-build** (2026-11-21T04:06:27.634Z)
- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` — **insrc-build** (2026-11-21T04:06:27.634Z)
- `src/daemon/repo-settings.ts` — **insrc-build** (2026-11-21T04:06:27.634Z)
- `src/daemon/index.ts` — **insrc-build** (2026-11-21T04:06:27.634Z)
- `docs/daemon.md` — **insrc-build** (2026-11-21T04:06:27.634Z)
- `src/daemon/__tests__/build-commands-doc.test.ts` — **insrc-build** (2026-11-21T04:06:27.634Z)
