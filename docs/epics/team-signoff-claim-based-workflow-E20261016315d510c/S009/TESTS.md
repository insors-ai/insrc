<!-- insrc:artifact TESTS-315d510cb28100e2-s9 -->

# Tests: 315d510cb28100e2 s9

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 20 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

## t1

Run at 2026-11-02T06:08:57.571Z on commit `cac74c19d`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/tracker/__tests__/port.test.ts: missingCapabilities reports status-read for a declared set without it**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | missingCapabilities reports status-read for a declared set without it | `src/workflow/tracker/__tests__/port.test.ts` |

**unit: src/workflow/tracker/__tests__/github-adapter.test.ts: readIssueStatus maps the gh issue view output to state and labels and the adapter declares status-read**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | readIssueStatus maps the gh issue view output to state and labels and the adapter declares status-read | `src/workflow/tracker/__tests__/github-adapter.test.ts` |

**unit: src/workflow/tracker/__tests__/github-adapter.test.ts: readIssueStatus maps a gh timeout to unreachable, a missing gh to missing-tool and a signed-out gh to missing-signin, and is cancelled by the Deadline signal**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | readIssueStatus maps a gh timeout to unreachable, a missing gh to missing-tool and a signed-out gh to missing-signin, and is cancelled by the Deadline signal | `src/workflow/tracker/__tests__/github-adapter.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/tracker/__tests__/github-adapter.test.ts` | 0 | 19 | 3.5 s |  |
| `src/workflow/tracker/__tests__/port.test.ts` | 0 | 12 | 8.6 s |  |

## t2

Run at 2026-11-02T06:14:45.124Z on commit `57330ee35`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/tracker/__tests__/refresh.test.ts: refreshTrackerStatus writes epicStatus, storyStatus and lastSyncedAt only**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | refreshTrackerStatus writes epicStatus, storyStatus and lastSyncedAt only | `src/workflow/tracker/__tests__/refresh.test.ts` |

**unit: src/workflow/tracker/__tests__/refresh.test.ts: a port without status-read fails naming the capability and a read that fails is a failed result**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a port without status-read fails naming the capability and a read that fails is a failed result | `src/workflow/tracker/__tests__/refresh.test.ts` |

**unit: src/workflow/tracker/__tests__/refresh.test.ts: a slow port hits the budget with an injected Deadline and the unread Epics and Stories are skipped with time limit reached**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a slow port hits the budget with an injected Deadline and the unread Epics and Stories are skipped with time limit reached | `src/workflow/tracker/__tests__/refresh.test.ts` |

**unit: src/workflow/tracker/__tests__/refresh.test.ts: a ToolDenied is rethrown and a non-GitHub fake port gets the same fields**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a ToolDenied is rethrown and a non-GitHub fake port gets the same fields | `src/workflow/tracker/__tests__/refresh.test.ts` |
| pass | the default GitHub path hands the Deadline signal to gh, so a call that never answers is cancelled and the sync is skipped | `src/workflow/tracker/__tests__/refresh.test.ts` |

**integration: src/daemon/__tests__/tracker-sync-method.test.ts: tracker.sync runs refreshTrackerStatus for the one Epic and returns its SyncResult**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | tracker.sync runs refreshTrackerStatus for the one Epic and returns its SyncResult | `src/daemon/__tests__/tracker-sync-method.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/tracker-sync-method.test.ts` | 0 | 1 | 0.7 s |  |
| `src/workflow/tracker/__tests__/refresh.test.ts` | 0 | 5 | 1.2 s |  |

## t3

Run at 2026-11-02T06:18:14.730Z on commit `1e91c7bcd`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/tracker/__tests__/refresh-hooks.test.ts: git_pull and git_push through callTool with the hooks registered refresh the status after success**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git_pull and git_push through callTool with the hooks registered refresh the status after success | `src/workflow/tracker/__tests__/refresh-hooks.test.ts` |

**integration: src/workflow/tracker/__tests__/refresh-hooks.test.ts: a failing, denied or slow tracker leaves success true and adds hookFailures and a line of output**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a failing, denied or slow tracker leaves success true and adds hookFailures and a line of output | `src/workflow/tracker/__tests__/refresh-hooks.test.ts` |

**integration: src/workflow/tracker/__tests__/refresh-hooks.test.ts: a dry-run pull, a push with pushed false, a failed git command, a missing cwd and a push from a temporary worktree run no refresh**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a dry-run pull, a push with pushed false, a failed git command, a missing cwd and a push from a temporary worktree run no refresh | `src/workflow/tracker/__tests__/refresh-hooks.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/tracker/__tests__/refresh-hooks.test.ts` | 0 | 3 | 1 s |  |

## t4

Run at 2026-11-02T06:23:58.703Z on commit `51784e82b`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/team/__tests__/draft-issues.test.ts: a team repo creates the stage's issue as before**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a team repo creates the stage's issue as before | `src/workflow/__tests__/draft-issues.test.ts` |

**unit: src/workflow/team/__tests__/draft-issues.test.ts: a repo with no team policy and a tracker that is on creates the Epic and Story issues**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a repo with no team policy and a tracker that is on creates the Epic and Story issues | `src/workflow/__tests__/draft-issues.test.ts` |

**unit: src/workflow/team/__tests__/draft-issues.test.ts: tracker type none makes no tracker call, a malformed github.json is not-ready, an entry with no type agrees with the lenient port, and a declined call is rethrown**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | tracker type none makes no tracker call, a malformed github.json is not-ready, an entry with no type agrees with the lenient port, and a declined call is rethrown | `src/workflow/__tests__/draft-issues.test.ts` |

**integration: src/workflow/team/__tests__/draft-issues.test.ts: the terminal approve over issues the daemon already created creates nothing and no duplicate**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the terminal approve over issues the daemon already created creates nothing and no duplicate | `src/workflow/__tests__/draft-issues.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/draft-issues.test.ts` | 0 | 8 | 0.7 s |  |

## t5

Run at 2026-11-02T06:27:26.152Z on commit `8bd3df380`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/__tests__/chain-report-tracker.test.ts: the tracker record carries artifactId and revision for the Epic and each Story with an issue, 0 when absent**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the tracker record carries artifactId and revision for the Epic and each Story with an issue, 0 when absent | `src/workflow/__tests__/chain-report-tracker.test.ts` |

**unit: src/workflow/__tests__/chain-report-tracker.test.ts: the stored TrackerMeta gains no field and the sync-tracker next action names the explicit refresh**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the stored TrackerMeta gains no field and the sync-tracker next action names the explicit refresh | `src/workflow/__tests__/chain-report-tracker.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/chain-report-tracker.test.ts` | 0 | 2 | 0.7 s |  |

## t6

Run at 2026-11-02T06:29:26.737Z on commit `0f48dc974`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/team/__tests__/s9-docs-record.test.ts: team-workflow.md records the amendment and the s9 decisions and workflow.md describes the automatic refresh**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | team-workflow.md records the amendment and the s9 decisions and workflow.md describes the automatic refresh | `src/workflow/team/__tests__/s9-docs-record.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/team/__tests__/s9-docs-record.test.ts` | 0 | 1 | 0.4 s |  |

## t7

Run at 2026-11-02T09:01:17.206Z on commit `62640e413`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

**unit: src/workflow/team/__tests__/s9-sweep-record.test.ts: the outcome section of team-workflow.md lists the sweep result and the open items**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the outcome section of team-workflow.md lists the sweep result and the open items | `src/workflow/team/__tests__/s9-sweep-record.test.ts` |

**smoke: On a sandbox GitHub repo: write a draft in a repo with no team policy and see the Epic issue created, change the issue state on GitHub, run git_pull through the daemon tool and see the status in meta.tracker**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/plans/team-workflow.md section 's9 outcome', Open items: sandbox repo subhagho/insors-test run of 2026-11-02 (Epic issue subhagho/insrc-test#1 created at first draft, closed on GitHub, git_pull through tools.call, meta.tracker epicStatus closed, lastSyncedAt 2026-11-02T08:57:50Z, no hookFailures)

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/team/__tests__/s9-sweep-record.test.ts` | 0 | 1 | 0.4 s |  |
