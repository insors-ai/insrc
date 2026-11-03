<!-- insrc:artifact TESTS-9ac84abac177b399-s1 -->

# Tests: 9ac84abac177b399 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 10 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-03T14:13:12.532Z on commit `62e30ff08`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/daemon/__tests__/tracker-sync-method.test.ts: tracker.sync without an epicHash refreshes every Epic once, a second call while one runs is skipped, and a call with an epicHash is unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | tracker.sync without an epicHash refreshes every Epic once, a second call while one runs is skipped, and a call with an epicHash is unchanged | `src/daemon/__tests__/tracker-sync-method.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/tracker-sync-method.test.ts` | 0 | 2 | 1.2 s |  |

## t2

Run at 2026-11-03T14:17:29.094Z on commit `e6d9b40d7`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/__tests__/repo-settings.test.ts: the gitHooks setting reads false when absent, is validated as a boolean and round-trips through github.json**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the gitHooks setting reads false when absent, is validated as a boolean and round-trips through github.json | `src/daemon/__tests__/repo-settings.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/repo-settings.test.ts` | 0 | 10 | 0.7 s |  |

## t3

Run at 2026-11-03T14:21:14.409Z on commit `21e4a78f3`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/bin/__tests__/insrc-git-hook.test.ts: the hook entry exits 0 when the daemon is not running, times out, answers an error or names an unregistered repository**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/bin/__tests__/insrc-git-hook.test.ts: the hook entry exits 0 when the daemon is not running, times out, answers an error or names an unregistered repository | `src/bin/__tests__/insrc-git-hook.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/bin/__tests__/insrc-git-hook.test.ts` | 0 | 1 | 0.5 s |  |

## t4

Run at 2026-11-03T14:25:39.591Z on commit `e6e71257f`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/git-hooks/__tests__/hook-block.test.ts: the hook block is written into an absent, an empty, a husky-style and a user-written hook file and the existing content is kept byte for byte**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/daemon/git-hooks/__tests__/hook-block.test.ts: the hook block is written into an absent, an empty, a husky-style and a user-written hook file and the existing content is kept byte for byte | `src/daemon/git-hooks/__tests__/hook-block.test.ts` |

**unit: src/daemon/git-hooks/__tests__/hook-block.test.ts: applying is idempotent and removing takes only the marked block and deletes a file that held nothing else**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/daemon/git-hooks/__tests__/hook-block.test.ts: applying is idempotent and removing takes only the marked block and deletes a file that held nothing else | `src/daemon/git-hooks/__tests__/hook-block.test.ts` |

**unit: src/daemon/git-hooks/__tests__/hook-block.test.ts: a hook file that cannot be written is reported with its reason and left unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/daemon/git-hooks/__tests__/hook-block.test.ts: a hook file that cannot be written is reported with its reason and left unchanged | `src/daemon/git-hooks/__tests__/hook-block.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/git-hooks/__tests__/hook-block.test.ts` | 0 | 3 | 0.5 s |  |

## t5

Run at 2026-11-03T14:26:59.144Z on commit `a8b015b2c`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/git-hooks/__tests__/hook-inspect.test.ts: inspection reports present, absent, foreign, early-exit and stale-entry files**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/daemon/git-hooks/__tests__/hook-inspect.test.ts: inspection reports present, absent, foreign, early-exit and stale-entry files | `src/daemon/git-hooks/__tests__/hook-inspect.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/git-hooks/__tests__/hook-inspect.test.ts` | 0 | 1 | 0.4 s |  |

## t6

Run at 2026-11-03T14:34:13.832Z on commit `f176f357b`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/daemon/__tests__/git-hooks-methods.test.ts: repo.gitHooks.install, uninstall and status refuse an unregistered repository, write only through the daemon, and keep the gitHooks setting equal to what is installed**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/daemon/__tests__/git-hooks-methods.test.ts: repo.gitHooks.install, uninstall and status refuse an unregistered repository, write only through the daemon, and keep the gitHooks setting equal to what is installed | `src/daemon/__tests__/git-hooks-methods.test.ts` |

**integration: src/daemon/__tests__/git-hooks-methods.test.ts: a failing hook file leaves the other hook installed and is reported with its reason**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/daemon/__tests__/git-hooks-methods.test.ts: a failing hook file leaves the other hook installed and is reported with its reason | `src/daemon/__tests__/git-hooks-methods.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/git-hooks-methods.test.ts` | 0 | 2 | 0.7 s |  |

## t7

Run at 2026-11-03T14:53:10.577Z on commit `616eb489b`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/daemon/__tests__/git-hooks-real-git.test.ts: a real git pull and a real git pull --rebase run the installed hooks and git exits 0 even when the hook entry is missing or the daemon is down**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/daemon/__tests__/git-hooks-real-git.test.ts: a real git pull and a real git pull --rebase run the installed hooks and git exits 0 even when the hook entry is missing or the daemon is down | `src/daemon/__tests__/git-hooks-real-git.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/git-hooks-real-git.test.ts` | 0 | 1 | 0.9 s |  |
