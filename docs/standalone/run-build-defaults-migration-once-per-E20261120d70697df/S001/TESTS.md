<!-- insrc:artifact TESTS-d70697dff9f56b4a-s1 -->

# Tests: d70697dff9f56b4a s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 23 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-20T19:29:25.795Z on commit `ae70fb14a`. Tests check: **passed**. 12 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: schema-migrations.test.ts: readSchemaVersion returns null for an absent file, an absent key and a null value, the integer for a valid one, and ok:false for an unreadable file or a value that is not a non-negative integer, without changing the file**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | schema-migrations.test.ts: readSchemaVersion returns null for an absent file, an absent key and a null value, the integer for a valid one, and ok:false for an unreadable file or a value that is not a non-negative integer, without changing the file | `src/daemon/__tests__/schema-migrations.test.ts` |

**unit: schema-migrations.test.ts: writeSchemaVersion creates the file when absent, keeps default, repos and unknown root keys, reports changed false when the version is already stored, never lowers a stored version, and returns write-failed or file-changed as data**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | schema-migrations.test.ts: writeSchemaVersion creates the file when absent, keeps default, repos and unknown root keys, reports changed false when the version is already stored, never lowers a stored version, and returns write-failed or file-changed as data | `src/daemon/__tests__/schema-migrations.test.ts` |

**integration: schema-migrations.test.ts: a repo write through writeRepoEntryKeys after the stamp keeps the root schemaVersion**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | schema-migrations.test.ts: a repo write through writeRepoEntryKeys after the stamp keeps the root schemaVersion | `src/daemon/__tests__/schema-migrations.test.ts` |
| pass | readRepoEntry rejects each malformed level and accepts missing parts | `src/workflow/config/__tests__/repo-config-store.test.ts` |
| pass | mergeRepoEntryKeys changes only the named keys | `src/workflow/config/__tests__/repo-config-store.test.ts` |
| pass | concurrent writes all land one at a time and a failure does not stall the queue | `src/workflow/config/__tests__/repo-config-store.test.ts` |
| pass | write-failed leaves the file and temp file as they were | `src/workflow/config/__tests__/repo-config-store.test.ts` |
| pass | verify step re-merges after an outside change and returns file-changed after the bounded attempts | `src/workflow/config/__tests__/repo-config-store.test.ts` |
| pass | an unwritable directory returns write-failed with the operating-system message | `src/workflow/config/__tests__/repo-config-store.test.ts` |
| pass | get returns what set wrote and shows an outside write | `src/daemon/__tests__/repo-settings.test.ts` |
| pass | malformed files return repo-config-unreadable and keep their bytes | `src/daemon/__tests__/repo-settings.test.ts` |
| pass | ensure writes the five keys once and concurrent sets both land | `src/daemon/__tests__/repo-settings.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/repo-settings.test.ts` | 0 | 17 | 0.8 s |  |
| `src/daemon/__tests__/schema-migrations.test.ts` | 0 | 3 | 0.7 s |  |
| `src/workflow/config/__tests__/repo-config-store.test.ts` | 0 | 6 | 0.6 s |  |

## t2

Run at 2026-11-21T04:04:58.695Z on commit `f214b64f8`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: schema-migrations.test.ts: runSchemaMigrations runs the pending steps in ascending order and stamps the highest clean version for a version that is absent, null or below the expected one, runs nothing for an equal or higher one, stops at the first step that throws or reports write-failed and stamps only the earlier clean version, runs nothing on an unreadable file or an invalid version, reports registry-unreadable when the registry cannot be listed, and never rejects**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | schema-migrations.test.ts: runSchemaMigrations runs the pending steps in ascending order and stamps the highest clean version for a version that is absent, null or below the expected one, runs nothing for an equal or higher one, stops at the first step that throws or reports write-failed and stamps only the earlier clean version, runs nothing on an unreadable file or an invalid version, reports registry-unreadable when the registry cannot be listed, and never rejects | `src/daemon/__tests__/schema-migrations.test.ts` |

**unit: schema-migrations.test.ts: the version-1 step runs migrateBuildDefaults over the listed repos and is clean only when no repo reports write-failed**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | schema-migrations.test.ts: the version-1 step runs migrateBuildDefaults over the listed repos and is clean only when no repo reports write-failed | `src/daemon/__tests__/schema-migrations.test.ts` |

**integration: schema-migrations.test.ts: two successive runs over a temporary Python repo with no commands and no schemaVersion (the first writes the three keys and stamps 1, the second runs nothing), with no commit id read anywhere**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | schema-migrations.test.ts: two successive runs over a temporary Python repo with no commands and no schemaVersion (the first writes the three keys and stamps 1, the second runs nothing), with no commit id read anywhere | `src/daemon/__tests__/schema-migrations.test.ts` |
| pass | schema-migrations.test.ts: the boot pass over 100 repositories lets timers and I/O callbacks run before it finishes, and still migrates every repository and stamps the version | `src/daemon/__tests__/schema-migrations.test.ts` |

**integration: schema-migrations.test.ts: a command cleared after the stamp is not re-applied by the second run, while the manual repo.buildDefaults.migrate handler still re-applies it and leaves schemaVersion unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | schema-migrations.test.ts: a command cleared after the stamp is not re-applied by the second run, while the manual repo.buildDefaults.migrate handler still re-applies it and leaves schemaVersion unchanged | `src/daemon/__tests__/schema-migrations.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/schema-migrations.test.ts` | 0 | 9 | 0.8 s |  |

## t3

Run at 2026-11-20T19:37:16.176Z on commit `1c9cf6f45`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: schema-migrations.test.ts: a source check that src/daemon/index.ts calls runSchemaMigrations as a fire-and-forget pass after the registry loads, with a catch, and not awaited**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | schema-migrations.test.ts: a source check that src/daemon/index.ts calls runSchemaMigrations as a fire-and-forget pass after the registry loads, with a catch, and not awaited | `src/daemon/__tests__/schema-migrations.test.ts` |
| pass | repo-config.test.ts: a source check that src/daemon/index.ts calls moveLegacyRepoConfig after the directories are ensured and before the database is opened, inside a try/catch and only when INSRC_REPO_CONFIG is unset | `src/workflow/config/__tests__/repo-config.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/schema-migrations.test.ts` | 0 | 8 | 0.8 s |  |
| `src/workflow/config/__tests__/repo-config.test.ts` | 0 | 11 | 0.8 s |  |

## t4

Run at 2026-11-21T04:06:27.634Z on commit `f214b64f8`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: build-commands-doc.test.ts: docs/daemon.md describes the schemaVersion at the root of repo-config.json and the boot migration in line with the code**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | build-commands-doc.test.ts: docs/daemon.md describes the schemaVersion at the root of repo-config.json and the boot migration in line with the code | `src/daemon/__tests__/build-commands-doc.test.ts` |
| pass | docs/daemon.md: the Build commands section is read against the shipped behaviour and states the add-time defaults, buildSetup and the Build section | `src/daemon/__tests__/build-commands-doc.test.ts` |
| pass | src/daemon/__tests__/build-commands-doc.test.ts: the Build commands section of docs/daemon.md names repo.buildDefaults.migrate, its report fields and its outcome counts, and says a cleared command is applied again when it is run | `src/daemon/__tests__/build-commands-doc.test.ts` |
| pass | build-commands-doc.test.ts: docs/daemon.md and the other live docs name repo-config.json and INSRC_REPO_CONFIG in line with the code | `src/daemon/__tests__/build-commands-doc.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/build-commands-doc.test.ts` | 0 | 4 | 0.8 s |  |
