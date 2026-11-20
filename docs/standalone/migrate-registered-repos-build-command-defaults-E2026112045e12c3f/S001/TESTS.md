<!-- insrc:artifact TESTS-45e12c3f47cefb2b-s1 -->

# Tests: 45e12c3f47cefb2b s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## s1

Run at 2026-11-20T11:40:53.822Z on commit `e3b6c2bdf`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/__tests__/repo-settings.test.ts: migrateBuildDefaults writes the typecheck and test commands and resultFormat exit-code together for each Python, Go, Rust and JVM repo with none of them, and writes nothing for a Node repo, an unknown repo, a repo whose directory is gone and an entry that sets any one of the three keys**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | migrateBuildDefaults writes the typecheck and test commands and resultFormat exit-code together for each Python, Go, Rust and JVM repo with none of them, and writes nothing for a Node repo, an unknown repo, a repo whose directory is gone and an entry that sets any one of the three keys | `src/daemon/__tests__/repo-settings.test.ts` |

**unit: src/daemon/__tests__/repo-settings.test.ts: migrateBuildDefaults run twice changes nothing the second time and reports already-set for the repos the first run set, and a user's own value set between the runs is kept**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | migrateBuildDefaults run twice changes nothing the second time and reports already-set for the repos the first run set, and a user's own value set between the runs is kept | `src/daemon/__tests__/repo-settings.test.ts` |

**unit: src/daemon/__tests__/repo-settings.test.ts: migrateBuildDefaults keeps going when one repo's write is refused or throws, reports write-failed with its note for that repo only, and reports write-failed for every repo, leaving the file as it was, when github.json is malformed**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | migrateBuildDefaults keeps going when one repo's write is refused or throws, reports write-failed with its note for that repo only, and reports write-failed for every repo, leaving the file as it was, when github.json is malformed | `src/daemon/__tests__/repo-settings.test.ts` |

**unit: src/daemon/__tests__/repo-settings.test.ts: the repo.buildDefaults.migrate handler returns ok, one entry per registered repo in registry order and counts with a key for every outcome that add up to the number of repos, returns zero counts for no repos, and returns registry-unreadable as data when the registry cannot be listed, writing nothing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the repo.buildDefaults.migrate handler returns ok, one entry per registered repo in registry order and counts with a key for every outcome that add up to the number of repos, returns zero counts for no repos, and returns registry-unreadable as data when the registry cannot be listed, writing nothing | `src/daemon/__tests__/repo-settings.test.ts` |

**integration: src/daemon/__tests__/handler-runtime.test.ts: the handler tables hold repo.buildDefaults.migrate beside the recorded methods and repo.buildDefaults.migrate answers through the runtime**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/daemon/__tests__/handler-runtime.test.ts: the handler tables hold repo.buildDefaults.migrate beside the recorded methods and repo.buildDefaults.migrate answers through the runtime | `src/daemon/__tests__/handler-runtime.test.ts` |

**integration: src/daemon/__tests__/build-commands-doc.test.ts: the Build commands section of docs/daemon.md names repo.buildDefaults.migrate, its report fields and its outcome counts, and says a cleared command is applied again when it is run**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/daemon/__tests__/build-commands-doc.test.ts: the Build commands section of docs/daemon.md names repo.buildDefaults.migrate, its report fields and its outcome counts, and says a cleared command is applied again when it is run | `src/daemon/__tests__/build-commands-doc.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/build-commands-doc.test.ts` | 0 | 2 | 0.7 s |  |
| `src/daemon/__tests__/handler-runtime.test.ts` | 0 | 11 | 0.9 s |  |
| `src/daemon/__tests__/repo-settings.test.ts` | 0 | 17 | 0.7 s |  |
