<!-- insrc:artifact TESTS-315d510cb28100e2-s2 -->

# Tests: 315d510cb28100e2 s2

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 43 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-17T06:22:44.508Z on commit `e5e884c8`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/team/__tests__/policy-parser.test.ts: a valid policy file parses with the fixed claimUnits and forceTaskIssues true**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a valid policy file parses with the fixed claimUnits and forceTaskIssues true | `src/workflow/team/__tests__/policy-parser.test.ts` |

**unit: src/workflow/team/__tests__/policy-parser.test.ts: bad JSON, an unknown field, a wrong type and a file carrying claimUnits, forceTaskIssues or source are rejected with a reason**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | bad JSON, an unknown field, a wrong type and a file carrying claimUnits, forceTaskIssues or source are rejected with a reason | `src/workflow/team/__tests__/policy-parser.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/team/__tests__/policy-parser.test.ts` | 0 | 4 | 0.8 s |  |

## t2

Run at 2026-10-17T06:29:45.369Z on commit `e032608a`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/team/__tests__/sighting-store.test.ts: the sighting key comes from the real path so repositories and symlinks are distinct**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the sighting key comes from the real path so repositories and symlinks are distinct | `src/workflow/team/__tests__/sighting-store.test.ts` |

**unit: src/workflow/team/__tests__/sighting-store.test.ts: a damaged sighting reads as damaged evidence, branchSource remote or user is validated**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a damaged sighting reads as damaged evidence, branchSource remote or user is validated | `src/workflow/team/__tests__/sighting-store.test.ts` |

**unit: src/workflow/team/__tests__/sighting-store.test.ts: create-only publish never overwrites an existing or damaged sighting**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | create-only publish never overwrites an existing or damaged sighting | `src/workflow/team/__tests__/sighting-store.test.ts` |

**unit: src/workflow/team/__tests__/sighting-store.test.ts: a known anchor is never replaced by an unknown one and an unknown one is replaced by a known one**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a known anchor is never replaced by an unknown one and an unknown one is replaced by a known one | `src/workflow/team/__tests__/sighting-store.test.ts` |

**unit: src/workflow/team/__tests__/sighting-store.test.ts: the lock refuses a second holder and takes over a lock older than 30 seconds**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the lock refuses a second holder and takes over a lock older than 30 seconds | `src/workflow/team/__tests__/sighting-store.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/team/__tests__/sighting-store.test.ts` | 0 | 5 | 2.5 s |  |

## t3

Run at 2026-10-17T06:31:41.880Z on commit `7a1072bc`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/team/__tests__/anchor-finder.test.ts: parsing git log output picks the oldest add even after a later delete and re-add**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | parsing git log output picks the oldest add even after a later delete and re-add | `src/workflow/team/__tests__/anchor-finder.test.ts` |

**integration: src/workflow/team/__tests__/anchor-finder.test.ts: adoption, approval, deletion and reintroduction keeps the adoption commit on real history**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | adoption, approval, deletion and reintroduction keeps the adoption commit on real history | `src/workflow/team/__tests__/anchor-finder.test.ts` |

**integration: src/workflow/team/__tests__/anchor-finder.test.ts: a depth-1 shallow clone gives known false and deepening gives a known anchor**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a depth-1 shallow clone gives known false and deepening gives a known anchor | `src/workflow/team/__tests__/anchor-finder.test.ts` |

**unit: src/workflow/team/__tests__/anchor-finder.test.ts: a failing git log gives known false without throwing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a failing git log gives known false without throwing | `src/workflow/team/__tests__/anchor-finder.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/team/__tests__/anchor-finder.test.ts` | 0 | 4 | 2.1 s |  |

## t4

Run at 2026-10-17T06:36:07.984Z on commit `4b7fbe34`. Tests check: **passed**. 13 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/team/__tests__/policy-reader.test.ts: reads the policy from the remote default branch's tracking ref**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | reads the policy from the remote default branch's tracking ref | `src/workflow/team/__tests__/policy-reader.test.ts` |

**integration: src/workflow/team/__tests__/policy-reader.test.ts: a working-tree edit has no effect**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a working-tree edit has no effect | `src/workflow/team/__tests__/policy-reader.test.ts` |

**integration: src/workflow/team/__tests__/policy-reader.test.ts: a feature-branch edit has no effect**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a feature-branch edit has no effect | `src/workflow/team/__tests__/policy-reader.test.ts` |

**integration: src/workflow/team/__tests__/policy-reader.test.ts: a policy on an unlabelled tracking ref is never applied**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a policy on an unlabelled tracking ref is never applied | `src/workflow/team/__tests__/policy-reader.test.ts` |

**integration: src/workflow/team/__tests__/policy-reader.test.ts: an unknown default branch with a fetched policy is refused with the --branch instruction**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an unknown default branch with a fetched policy is refused with the --branch instruction | `src/workflow/team/__tests__/policy-reader.test.ts` |

**integration: src/workflow/team/__tests__/policy-reader.test.ts: a remote without a remote HEAD and with no policy on any fetched ref reads as none**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a remote without a remote HEAD and with no policy on any fetched ref reads as none | `src/workflow/team/__tests__/policy-reader.test.ts` |

**integration: src/workflow/team/__tests__/policy-reader.test.ts: a repo with no policy and no sighting reads as none and writes nothing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a repo with no policy and no sighting reads as none and writes nothing | `src/workflow/team/__tests__/policy-reader.test.ts` |

**integration: src/workflow/team/__tests__/policy-reader.test.ts: non-git, no-commit and no-remote directories without a sighting read as none**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | non-git, no-commit and no-remote directories without a sighting read as none | `src/workflow/team/__tests__/policy-reader.test.ts` |

**integration: src/workflow/team/__tests__/policy-reader.test.ts: a never-fetched repo with no sighting reads as none**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a never-fetched repo with no sighting reads as none | `src/workflow/team/__tests__/policy-reader.test.ts` |

**integration: src/workflow/team/__tests__/policy-reader.test.ts: a known team repo with no fetched policy is refused with the reason**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a known team repo with no fetched policy is refused with the reason | `src/workflow/team/__tests__/policy-reader.test.ts` |

**integration: src/workflow/team/__tests__/policy-reader.test.ts: a known team repo whose remote was removed is refused or read from the recorded commit, never none**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a known team repo whose remote was removed is refused or read from the recorded commit, never none | `src/workflow/team/__tests__/policy-reader.test.ts` |

**unit: src/workflow/team/__tests__/policy-reader.test.ts: the remote is origin, else the sole remote, never guessed, and a sighting's remote stays authoritative**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the remote is origin, else the sole remote, never guessed, and a sighting's remote stays authoritative | `src/workflow/team/__tests__/policy-reader.test.ts` |

**unit: src/workflow/team/__tests__/policy-reader.test.ts: first observation creates the sighting create-only and a failed write does not change the result**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | first observation creates the sighting create-only and a failed write does not change the result | `src/workflow/team/__tests__/policy-reader.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/team/__tests__/policy-reader.test.ts` | 0 | 13 | 1.5 s |  |

## t5

Run at 2026-10-17T06:40:25.693Z on commit `82fe6b38`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/team/__tests__/branch-resolution.test.ts: the remote's answer wins over a supplied branch, then the sighting's branch, then the supplied branch after verification**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the remote's answer wins over a supplied branch, then the sighting's branch, then the supplied branch after verification | `src/workflow/team/__tests__/branch-resolution.test.ts` |

**integration: src/workflow/team/__tests__/branch-resolution.test.ts: a dangling remote HEAD is refused without --branch and a real branch is recorded with source user**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a dangling remote HEAD is refused without --branch and a real branch is recorded with source user | `src/workflow/team/__tests__/branch-resolution.test.ts` |

**integration: src/workflow/team/__tests__/branch-resolution.test.ts: a missing branch name or an unreachable remote records nothing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a missing branch name or an unreachable remote records nothing | `src/workflow/team/__tests__/branch-resolution.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/team/__tests__/branch-resolution.test.ts` | 0 | 3 | 0.9 s |  |

## t6

Run at 2026-10-17T07:01:46.302Z on commit `df4249a1`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/team/__tests__/policy-refresh.test.ts: refresh brings a changed policy into the tracking ref and the reader applies it**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | refresh brings a changed policy into the tracking ref and the reader applies it | `src/workflow/team/__tests__/policy-refresh.test.ts` |

**integration: src/workflow/team/__tests__/policy-refresh.test.ts: only the default branch's tracking ref changes with no tag, other branch, FETCH_HEAD or prune effect**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | only the default branch's tracking ref changes with no tag, other branch, FETCH_HEAD or prune effect | `src/workflow/team/__tests__/policy-refresh.test.ts` |

**integration: src/workflow/team/__tests__/policy-refresh.test.ts: unreachable remote reports failure and the last fetched policy stays in use**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | unreachable remote reports failure and the last fetched policy stays in use | `src/workflow/team/__tests__/policy-refresh.test.ts` |

**integration: src/workflow/team/__tests__/policy-refresh.test.ts: a supplied branch is refused when the remote is unreachable and nothing is recorded**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a supplied branch is refused when the remote is unreachable and nothing is recorded | `src/workflow/team/__tests__/policy-refresh.test.ts` |

**integration: src/workflow/team/__tests__/policy-refresh.test.ts: sighting write failure reports failure and cosmetic HEAD failure is a warning only**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | sighting write failure reports failure and cosmetic HEAD failure is a warning only | `src/workflow/team/__tests__/policy-refresh.test.ts` |

**integration: src/workflow/team/__tests__/policy-refresh.test.ts: a second refresh is refused while the lock is held and a stale lock is taken over**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a second refresh is refused while the lock is held and a stale lock is taken over | `src/workflow/team/__tests__/policy-refresh.test.ts` |

**integration: src/workflow/team/__tests__/policy-refresh.test.ts: default-branch rename and policy file removal**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | default-branch rename and policy file removal | `src/workflow/team/__tests__/policy-refresh.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/team/__tests__/policy-refresh.test.ts` | 0 | 14 | 10.6 s |  |

## t7

Run at 2026-10-17T07:03:52.521Z on commit `2fbf6b9d`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/team/__tests__/starter-policy.test.ts: writes a starter with signoff for DEF, HLD, LLD and BUILD and claims enforced**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | writes a starter with signoff for DEF, HLD, LLD and BUILD and claims enforced | `src/workflow/team/__tests__/starter-policy.test.ts` |

**unit: src/workflow/team/__tests__/starter-policy.test.ts: refuses to overwrite an existing file**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | refuses to overwrite an existing file | `src/workflow/team/__tests__/starter-policy.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/team/__tests__/starter-policy.test.ts` | 0 | 2 | 0.8 s |  |

## t8

Run at 2026-10-17T07:07:34.262Z on commit `9fdc7452`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/cli/__tests__/command.test.ts: team init writes the starter and reports its path**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | team init writes the starter and reports its path | `src/cli/__tests__/command.test.ts` |
| pass | team init writes a starter that the reader accepts once it is on the default branch | `src/cli/__tests__/team-service.test.ts` |

**integration: src/cli/__tests__/command.test.ts: team refresh runs the refresh and reports the outcome**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | team refresh runs the refresh and reports the outcome | `src/cli/__tests__/command.test.ts` |
| pass | team refresh followed by a reader call in a temp clone returns the policy end to end | `src/cli/__tests__/team-service.test.ts` |

**integration: src/cli/__tests__/command.test.ts: team refresh --branch passes the name through and renders the refusal that asks for it**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | team refresh --branch passes the name through and renders the refusal that asks for it | `src/cli/__tests__/command.test.ts` |

**integration: src/cli/__tests__/command.test.ts: a thrown error from either team command renders as a cross-prefixed line**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a thrown error from either team command renders as a cross-prefixed line | `src/cli/__tests__/command.test.ts` |

**integration: src/cli/__tests__/tui.test.ts: the TUI tests run with fakeServices carrying the team entry**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the TUI tests run with fakeServices carrying the team entry | `src/cli/__tests__/tui.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/cli/__tests__/command.test.ts` | 0 | 26 | 0.9 s |  |
| `src/cli/__tests__/team-service.test.ts` | 0 | 2 | 2 s |  |
| `src/cli/__tests__/tui.test.ts` | 0 | 22 | 3.2 s |  |
