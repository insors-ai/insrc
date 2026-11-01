<!-- insrc:artifact TESTS-64703b708590bd68-s1 -->

# Tests: 64703b708590bd68 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 11 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-01T19:44:06.175Z on commit `91846d958`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: repo-call-audit.test.ts: every method of the handler registry and every step phase has an audit entry marked modifying, read-only or daemon-store**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | repo-call-audit.test.ts: every method of the handler registry and every step phase has an audit entry marked modifying, read-only or daemon-store | `src/daemon/__tests__/repo-call-audit.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/repo-call-audit.test.ts` | 0 | 1 | 0.4 s |  |

## t2

Run at 2026-11-01T19:47:14.740Z on commit `611e51b8c`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: repo-call-gate.test.ts: a missing, empty, relative, non-directory and unregistered repo are each refused with their code and nothing is touched**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | repo-call-gate.test.ts: a missing, empty, relative, non-directory and unregistered repo are each refused with their code and nothing is touched | `src/daemon/__tests__/repo-call-gate.test.ts` |

**unit: repo-call-gate.test.ts: a relative path is joined to the repo, and a path with .., an absolute path elsewhere and a symlink that leaves the repo are refused**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | repo-call-gate.test.ts: a relative path is joined to the repo, and a path with .., an absolute path elsewhere and a symlink that leaves the repo are refused | `src/daemon/__tests__/repo-call-gate.test.ts` |

**unit: repo-call-gate.test.ts: the gate never reads the daemon's INSRC_REPO or working directory, a run-token phase takes the recorded repo and a registry failure refuses**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | repo-call-gate.test.ts: the gate never reads the daemon's INSRC_REPO or working directory, a run-token phase takes the recorded repo and a registry failure refuses | `src/daemon/__tests__/repo-call-gate.test.ts` |

**unit: repo-call-table.test.ts: every registered RPC method and step phase is a table row or on the reviewed read-only list, and every row names a registered method**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | repo-call-table.test.ts: every registered RPC method and step phase is a table row or on the reviewed read-only list, and every row names a registered method | `src/daemon/__tests__/repo-call-table.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/repo-call-gate.test.ts` | 0 | 3 | 0.4 s |  |
| `src/daemon/__tests__/repo-call-table.test.ts` | 0 | 1 | 0.4 s |  |

## t3

Run at 2026-11-01T19:53:40.629Z on commit `5428eb902`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: approve-absolute-repo.test.ts: insrc_workflow_approve sends an absolute repo and an absolute artifactPath, and refuses when it cannot resolve an absolute repo**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | approve-absolute-repo.test.ts: insrc_workflow_approve sends an absolute repo and an absolute artifactPath, and refuses when it cannot resolve an absolute repo | `src/mcp/__tests__/approve-absolute-repo.test.ts` |

**integration: cli-sends-repo.test.ts: the terminal client's approve, tracker sync and attach calls send repo**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | cli-sends-repo.test.ts: the terminal client's approve, tracker sync and attach calls send repo | `src/cli/__tests__/cli-sends-repo.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/cli/__tests__/cli-sends-repo.test.ts` | 0 | 1 | 0.6 s |  |
| `src/mcp/__tests__/approve-absolute-repo.test.ts` | 0 | 2 | 0.6 s |  |

## t4

Run at 2026-11-01T20:01:35.060Z on commit `d74818b25`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: approve-repo-gate.test.ts: a daemon started with INSRC_REPO set and its working directory inside a registered repo refuses workflow.approve with a relative artifactPath and no repo and writes nothing in either repository**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | approve-repo-gate.test.ts: a daemon started with INSRC_REPO set and its working directory inside a registered repo refuses workflow.approve with a relative artifactPath and no repo and writes nothing in either repository | `src/daemon/__tests__/approve-repo-gate.test.ts` |

**integration: approve-repo-gate.test.ts: workflow.approve with an absolute registered repo and a relative path approves the artifact in that repo's store only**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | approve-repo-gate.test.ts: workflow.approve with an absolute registered repo and a relative path approves the artifact in that repo's store only | `src/daemon/__tests__/approve-repo-gate.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/approve-repo-gate.test.ts` | 0 | 2 | 0.8 s |  |

## t5

Run at 2026-11-01T20:17:16.318Z on commit `58d797949`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: repo-gate-dispatch.test.ts: each method in the table called with no repo is refused and leaves the file system unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | repo-gate-dispatch.test.ts: each method in the table called with no repo is refused and leaves the file system unchanged | `src/daemon/__tests__/repo-gate-dispatch.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/repo-gate-dispatch.test.ts` | 0 | 2 | 0.9 s |  |

## t6

Run at 2026-11-01T20:27:56.076Z on commit `73d8de72d`. Tests check: **passed**. 0 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: step-repo-gate.test.ts: a modifying step phase with no repo and no token is refused, and a later phase cannot be redirected to another repository by a different repo**

Run by file: the name begins with its test file's name, and no cases were named.

| Result | File | Titles |
| :--- | :--- | :--- |
| pass | `src/daemon/__tests__/step-repo-gate.test.ts` | 1 |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/step-repo-gate.test.ts` | 0 | 1 | 0.9 s |  |

## t7

Run at 2026-11-01T20:31:20.604Z on commit `43cfcb07b`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: daemon-doc-repo-table.test.ts: docs/daemon.md lists the methods of the table and the refusal codes**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | daemon-doc-repo-table.test.ts: docs/daemon.md lists the methods of the table and the refusal codes | `src/daemon/__tests__/daemon-doc-repo-table.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/daemon-doc-repo-table.test.ts` | 0 | 1 | 0.4 s |  |

## t8

Run at 2026-11-01T20:49:15.075Z on commit `832d2c690`. Tests check: **passed**. 0 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: repo-gate-sweep-record.test.ts: the full sweep compared by test name with the tree before the fix shows no new failure and no new skipped test, and the outcome section is written**

Run by file: the name begins with its test file's name, and no cases were named.

| Result | File | Titles |
| :--- | :--- | :--- |
| pass | `src/daemon/__tests__/repo-gate-sweep-record.test.ts` | 1 |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/repo-gate-sweep-record.test.ts` | 0 | 1 | 0.4 s |  |
