<!-- insrc:artifact PLAN-d70697dff9f56b4a-s1 -->

# Plan: STORY-d70697dff9f56b4a-s1

## Summary

**Epic:** `run-build-defaults-migration-once-per`
**LLD run:** `wf-1795201895877-mprbnt`
**LLD effective hash:** `fce7d54edacd...`

The build is four tasks in dependency order: the settings store gains a root schemaVersion with a strict reader and a writer on the existing verified write loop; a runner with a numbered step list (step 1 is the existing build-defaults migration) decides by the stored version and stamps after a clean run; the daemon boot starts that runner as a fire-and-forget pass after the registry loads; and docs/daemon.md plus its doc test describe the rule. The existing manual migration method and every repo write stay unchanged.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Root schemaVersion in the settings store: field, strict reader and verified writer | M | — | — | unit: schema-migrations.test.ts: readSchemaVersion returns null for an absent file, an absent key and a null value, the integer for a valid one, and ok:false for an unreadable file or a value that is not a non-negative integer, without changing the file; unit: schema-migrations.test.ts: writeSchemaVersion creates the file when absent, keeps default, repos and unknown root keys, reports changed false when the version is already stored, never lowers a stored version, and returns write-failed or file-changed as data; integration: schema-migrations.test.ts: a repo write through writeRepoEntryKeys after the stamp keeps the root schemaVersion | [[c3]] [[c1]] |
| 2 | **`t2`** Runner, step list and expected version | M | — | `t1` | unit: schema-migrations.test.ts: runSchemaMigrations runs the pending steps in ascending order and stamps the highest clean version for a version that is absent, null or below the expected one, runs nothing for an equal or higher one, stops at the first step that throws or reports write-failed and stamps only the earlier clean version, runs nothing on an unreadable file or an invalid version, reports registry-unreadable when the registry cannot be listed, and never rejects; unit: schema-migrations.test.ts: the version-1 step runs migrateBuildDefaults over the listed repos and is clean only when no repo reports write-failed; integration: schema-migrations.test.ts: two successive runs over a temporary Python repo with no commands and no schemaVersion (the first writes the three keys and stamps 1, the second runs nothing), with no commit id read anywhere; integration: schema-migrations.test.ts: a command cleared after the stamp is not re-applied by the second run, while the manual repo.buildDefaults.migrate handler still re-applies it and leaves schemaVersion unchanged | [[c1]] [[c4]] |
| 3 | **`t3`** Boot hook after the registry loads | S | — | `t2` | integration: schema-migrations.test.ts: a source check that src/daemon/index.ts calls runSchemaMigrations as a fire-and-forget pass after the registry loads, with a catch, and not awaited | [[c2]] |
| 4 | **`t4`** docs/daemon.md and the documentation test | S | — | `t3` | integration: build-commands-doc.test.ts: docs/daemon.md describes the schemaVersion at the root of repo-config.json and the boot migration in line with the code | [[c1]] [[c2]] [[c3]] |

### 1.1 TASK-d70697dff9f56b4a-s1-t1 — Root schemaVersion in the settings store: field, strict reader and verified writer

Add the optional schemaVersion (number | null) to RepoConfigFile in src/workflow/config/repo-config.ts. In src/workflow/config/repo-config-store.ts add readSchemaVersion (strict reader, null for an absent file/key/null, ok:false with schema-version-invalid for a value that is not a non-negative integer, never changing the file) and writeSchemaVersion, by making writeOnce take its merge step as a parameter so the queue, fingerprint check, temp file and rename loop are shared with writeRepoEntryKeys unchanged; the root merge keeps default, repos and unknown keys, reports changed:false when the version is already stored and never lowers a stored version. Update the module-state and session-source inventory fixtures only for what this task adds. Tests for both in src/daemon/__tests__/schema-migrations.test.ts (new file, unit part).

**Acceptance checks:**
- readSchemaVersion returns null for an absent file, an absent key and a null value, the integer for a valid one, and ok:false for an unreadable file or a value that is not a non-negative integer, without changing the file
- writeSchemaVersion creates the file when absent, keeps default, repos and unknown root keys, reports changed:false when the version is already stored, never lowers a stored version, and returns write-failed or file-changed as data
- writeRepoEntryKeys behaves exactly as before: the existing repo-config and repo-settings tests still pass
- a repo write through writeRepoEntryKeys after the stamp keeps the root schemaVersion
- no inventory test case fails beyond the four that already fail on a clean checkout

### 1.2 TASK-d70697dff9f56b4a-s1-t2 — Runner, step list and expected version

In src/daemon/repo-settings.ts add REPO_CONFIG_SCHEMA_VERSION (1), the SchemaMigrationStep and SchemaMigrationResult types, the static step list whose version-1 step runs migrateBuildDefaults over the listed repos and is clean only when counts['write-failed'] is 0, and runSchemaMigrations(deps): read the version, run each pending step in ascending order, stop at the first that is not clean or throws, stamp the highest clean version through writeSchemaVersion, return a status (applied, up-to-date, newer-schema, not-clean, registry-unreadable, file-unreadable, schema-version-invalid, failed) and never reject. migrateBuildDefaults and the repo.buildDefaults.migrate handler are consumed unchanged. Update inventory fixtures only for what this task adds. Tests in schema-migrations.test.ts.

**Acceptance checks:**
- runSchemaMigrations runs the pending steps in ascending order and stamps the highest clean version for a version that is absent, null or below the expected one, runs nothing for an equal or higher one, stops at the first step that throws or reports write-failed and stamps only the earlier clean version, runs nothing on an unreadable file or an invalid version, reports registry-unreadable when the registry cannot be listed, and never rejects
- the version-1 step runs migrateBuildDefaults over the listed repos and is clean only when no repo reports write-failed
- two successive runs over a temporary Python repo with no commands and no schemaVersion write the three keys and stamp 1 the first time and run nothing the second time, with no commit id read anywhere
- a command cleared after the stamp is not re-applied by the second run while the manual repo.buildDefaults.migrate handler still re-applies it and leaves schemaVersion unchanged

### 1.3 TASK-d70697dff9f56b4a-s1-t3 — Boot hook after the registry loads

In src/daemon/index.ts add the fire-and-forget pass next to the steering refresh (step 5b), far from the earlier guarded legacy-file move and leaving its anchors untouched: void runSchemaMigrations({ registeredRepos: async () => (await listRepos(db)).map(r => r.path) }).then(log the result).catch(log), never awaited, after the registry is loaded. A source-check test in schema-migrations.test.ts anchored the way the existing boot checks in repo-config.test.ts are.

**Acceptance checks:**
- a source check shows src/daemon/index.ts calls runSchemaMigrations as a fire-and-forget pass after the registry loads, with a catch, and not awaited
- the existing boot source checks in repo-config.test.ts still pass and daemon startup still logs ready

### 1.4 TASK-d70697dff9f56b4a-s1-t4 — docs/daemon.md and the documentation test

Document the root schemaVersion, the boot migration and the comparison rule (absent, null or below applies, equal or above does nothing, an invalid value runs nothing, a failed step is retried next boot, a manual repo.buildDefaults.migrate does not touch the version and a deliberate clear is not re-applied at boot once stamped, lowering or removing the value re-runs the pending steps) in docs/daemon.md, and extend build-commands-doc.test.ts with a test that reads the constant and statuses from the code and fails when the doc names a different file or rule. The paragraph must keep the existing DOC_JSON_NAMES and FILE_MENTION_CONTEXT pins passing.

**Acceptance checks:**
- docs/daemon.md describes the schemaVersion at the root of repo-config.json and the boot migration in line with the code
- build-commands-doc.test.ts passes, including the three existing tests, and fails when the doc names a different file or an invalid rule

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| schema-migrations.test.ts: readSchemaVersion returns null for an absent file, an absent key and a null value, the integer for a valid one, and ok:false for an unreadable file or a value that is not a non-negative integer, without changing the file | `t1` |
| schema-migrations.test.ts: writeSchemaVersion creates the file when absent, keeps default, repos and unknown root keys, reports changed false when the version is already stored, never lowers a stored version, and returns write-failed or file-changed as data | `t1` |
| schema-migrations.test.ts: runSchemaMigrations runs the pending steps in ascending order and stamps the highest clean version for a version that is absent, null or below the expected one, runs nothing for an equal or higher one, stops at the first step that throws or reports write-failed and stamps only the earlier clean version, runs nothing on an unreadable file or an invalid version, reports registry-unreadable when the registry cannot be listed, and never rejects | `t2` |
| schema-migrations.test.ts: the version-1 step runs migrateBuildDefaults over the listed repos and is clean only when no repo reports write-failed | `t2` |
| schema-migrations.test.ts: two successive runs over a temporary Python repo with no commands and no schemaVersion (the first writes the three keys and stamps 1, the second runs nothing), with no commit id read anywhere | `t2` |
| schema-migrations.test.ts: a command cleared after the stamp is not re-applied by the second run, while the manual repo.buildDefaults.migrate handler still re-applies it and leaves schemaVersion unchanged | `t2` |
| schema-migrations.test.ts: a repo write through writeRepoEntryKeys after the stamp keeps the root schemaVersion | `t1` |
| schema-migrations.test.ts: a source check that src/daemon/index.ts calls runSchemaMigrations as a fire-and-forget pass after the registry loads, with a catch, and not awaited | `t3` |
| build-commands-doc.test.ts: docs/daemon.md describes the schemaVersion at the root of repo-config.json and the boot migration in line with the code | `t4` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD-d70697dff9f56b4a-s1 migrateBuildDefaults and the repo.buildDefaults.migrate handler (src/daemon/repo-settings.ts:247-275, 340-356)`
- **[[c2]]** `prior-artifact` `LLD-d70697dff9f56b4a-s1 boot order and the fire-and-forget steering refresh (src/daemon/index.ts:400-418)`
- **[[c3]]** `prior-artifact` `LLD-d70697dff9f56b4a-s1 the repo-config.json store, strict reader and verified writer (src/workflow/config/repo-config-store.ts:78-135)`
- **[[c4]]** `prior-artifact` `LLD-d70697dff9f56b4a-s1 method registries unchanged: no new RPC (src/daemon/threads/method-class.ts)`
