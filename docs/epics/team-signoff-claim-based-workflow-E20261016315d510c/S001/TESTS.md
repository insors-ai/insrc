<!-- insrc:artifact TESTS-315d510cb28100e2-s1 -->

# Tests: 315d510cb28100e2 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 56 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-17T10:33:09.798Z on commit `ee753c8f`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/tracker/__tests__/github-adapter.test.ts: runGh classifies ENOENT, authentication failure, timeout and other failures**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | runGh classifies ENOENT, authentication failure, timeout and other failures | `src/workflow/tracker/__tests__/github-adapter.test.ts` |

**unit: src/workflow/tracker/__tests__/github-adapter.test.ts: runGh passes the 10 s timeout option to the exec seam**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | runGh passes the 10 s timeout option to the exec seam | `src/workflow/tracker/__tests__/github-adapter.test.ts` |

**unit: src/workflow/tracker/__tests__/tracker.test.ts: out and silent keep their current options**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | out and silent keep their current options | `src/workflow/tracker/__tests__/tracker.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/tracker/__tests__/github-adapter.test.ts` | 0 | 2 | 0.4 s |  |
| `src/workflow/tracker/__tests__/tracker.test.ts` | 0 | 19 | 0.4 s |  |

## t2

Run at 2026-10-17T10:42:56.056Z on commit `89fc979d`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/tracker/__tests__/github-adapter.test.ts: compatibility exception 1, a failed typed create is not retried untyped unless the type is rejected**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | compatibility exception 1, a failed typed create is not retried untyped unless the type is rejected | `src/workflow/tracker/__tests__/github-adapter.test.ts` |

**unit: src/workflow/tracker/__tests__/github-adapter.test.ts: a typed create rejected as an unknown issue type is retried once untyped and reports typed false**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a typed create rejected as an unknown issue type is retried once untyped and reports typed false | `src/workflow/tracker/__tests__/github-adapter.test.ts` |

**unit: src/workflow/tracker/__tests__/github-adapter.test.ts: compatibility exception 2, a migrated operation passes the 10 s timeout and a timeout is reported as unreachable**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | compatibility exception 2, a migrated operation passes the 10 s timeout and a timeout is reported as unreachable | `src/workflow/tracker/__tests__/github-adapter.test.ts` |

**integration: src/workflow/tracker/__tests__/tasks.test.ts: ghCurrentLogin still throws the returned-no-login Error for empty output**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ghCurrentLogin still throws the returned-no-login Error for empty output | `src/workflow/tracker/__tests__/tasks.test.ts` |

**integration: src/workflow/tracker/__tests__/tracker.test.ts: migrated wrappers run the same argv and keep their failure results**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | migrated wrappers run the same argv and keep their failure results | `src/workflow/tracker/__tests__/tracker.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/tracker/__tests__/github-adapter.test.ts` | 0 | 5 | 0.8 s |  |
| `src/workflow/tracker/__tests__/tasks.test.ts` | 0 | 10 | 0.7 s |  |
| `src/workflow/tracker/__tests__/tracker.test.ts` | 0 | 20 | 0.7 s |  |

## t3

Run at 2026-10-17T10:55:00.748Z on commit `704c7a5f`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/tracker/__tests__/port.test.ts: missingCapabilities names every missing capability**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | missingCapabilities names every capability the tracker does not declare | `src/workflow/tracker/__tests__/port.test.ts` |

**unit: src/workflow/tracker/__tests__/port.test.ts: strict resolver refuses malformed or unsupported configuration**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | strict resolver refuses malformed or unsupported configuration | `src/workflow/tracker/__tests__/port.test.ts` |

**unit: src/workflow/tracker/__tests__/port.test.ts: strict resolver accepts an own entry without a type and falls back to the origin remote for type github**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | strict resolver accepts an own entry without a type and falls back to the origin remote for type github | `src/workflow/tracker/__tests__/port.test.ts` |

**unit: src/workflow/tracker/__tests__/port.test.ts: strict resolver never takes a target from the default entry**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | strict resolver never takes a target from the default entry's owner and repo | `src/workflow/tracker/__tests__/port.test.ts` |

**unit: src/workflow/tracker/__tests__/port.test.ts: TrackerPort type exposes issueOps with the AMD-8 signatures**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | TrackerPort type exposes issueOps with the AMD-8 signatures | `src/workflow/tracker/__tests__/port.test.ts` |

**unit: src/workflow/config/__tests__/github.test.ts: lenient resolver behaviour is unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | lenient resolver behaviour is unchanged | `src/workflow/config/__tests__/github.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/config/__tests__/github.test.ts` | 0 | 19 | 0.6 s |  |
| `src/workflow/tracker/__tests__/port.test.ts` | 0 | 5 | 4.2 s |  |

## t4

Run at 2026-10-17T11:00:14.334Z on commit `8771898f`. Tests check: **passed**. 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/tracker/__tests__/port.test.ts: loadTracker succeeds when every needed capability is declared**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | loadTracker succeeds when every needed capability is declared | `src/workflow/tracker/__tests__/port.test.ts` |

**integration: src/workflow/tracker/__tests__/port.test.ts: loadTracker with an empty needed set validates configuration and sign-in**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | loadTracker with an empty needed set validates configuration and sign-in | `src/workflow/tracker/__tests__/port.test.ts` |

**integration: src/workflow/tracker/__tests__/port.test.ts: loadTracker refuses a needed signoff-request capability naming it**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | loadTracker refuses a needed signoff-request capability naming it | `src/workflow/tracker/__tests__/port.test.ts` |

**integration: src/workflow/tracker/__tests__/port.test.ts: loadTracker names gh as the missing tool**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | loadTracker names gh as the missing tool | `src/workflow/tracker/__tests__/port.test.ts` |

**integration: src/workflow/tracker/__tests__/port.test.ts: loadTracker names the missing sign-in**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | loadTracker names the missing sign-in | `src/workflow/tracker/__tests__/port.test.ts` |

**unit: src/workflow/tracker/__tests__/github-adapter.test.ts: whoAmI success, empty login converted to missing-signin, missing tool, missing sign-in and unreachable**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | whoAmI success, empty login converted to missing-signin, missing tool, missing sign-in and unreachable | `src/workflow/tracker/__tests__/github-adapter.test.ts` |

**unit: src/workflow/tracker/__tests__/github-adapter.test.ts: findIssue returns the first of several matches and separates failure from not found**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | findIssue returns the first of several matches and separates failure from not found | `src/workflow/tracker/__tests__/github-adapter.test.ts` |

**unit: src/workflow/tracker/__tests__/github-adapter.test.ts: signoff methods return rejected without running gh**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | signoff methods return rejected without running gh | `src/workflow/tracker/__tests__/github-adapter.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/tracker/__tests__/github-adapter.test.ts` | 0 | 8 | 1 s |  |
| `src/workflow/tracker/__tests__/port.test.ts` | 0 | 10 | 4.1 s |  |

## t5

Run at 2026-10-17T11:05:58.635Z on commit `b46a655a`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/tracker/__tests__/github-adapter.test.ts: readAssignee returns the single login, null when unassigned and rejected for several or a malformed reference**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | readAssignee returns the single login, null when unassigned and rejected for several or a malformed reference | `src/workflow/tracker/__tests__/github-adapter.test.ts` |

**unit: src/workflow/tracker/__tests__/github-adapter.test.ts: setAssignee from zero, one and several assignees ends with exactly the requested user**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | setAssignee from zero, one and several assignees ends with exactly the requested user | `src/workflow/tracker/__tests__/github-adapter.test.ts` |

**unit: src/workflow/tracker/__tests__/github-adapter.test.ts: setAssignee makes no change call when already right and clears for null**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | setAssignee makes no change call when already right and clears for null | `src/workflow/tracker/__tests__/github-adapter.test.ts` |

**unit: src/workflow/tracker/__tests__/github-adapter.test.ts: setAssignee reports rejected or unreachable without a retry when the re-read differs or a step times out**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | setAssignee reports rejected or unreachable without a retry when the re-read differs or a step times out | `src/workflow/tracker/__tests__/github-adapter.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/tracker/__tests__/github-adapter.test.ts` | 0 | 12 | 1.4 s |  |

## t6

Run at 2026-10-17T11:08:23.877Z on commit `01cf3b27`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/tracker/__tests__/github-adapter.test.ts: Epic create parity with ghCreateIssueTyped**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Epic create parity with ghCreateIssueTyped | `src/workflow/tracker/__tests__/github-adapter.test.ts` |

**unit: src/workflow/tracker/__tests__/github-adapter.test.ts: Story create and Epic parent link parity**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Story create and Epic parent link parity | `src/workflow/tracker/__tests__/github-adapter.test.ts` |

**unit: src/workflow/tracker/__tests__/github-adapter.test.ts: Task create and Story parent link parity**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Task create and Story parent link parity | `src/workflow/tracker/__tests__/github-adapter.test.ts` |

**unit: src/workflow/tracker/__tests__/github-adapter.test.ts: each issueOps operation runs the same gh argv and keeps the same failure result as its wrapper**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | each issueOps operation runs the same gh argv and keeps the same failure result as its wrapper | `src/workflow/tracker/__tests__/github-adapter.test.ts` |

**unit: src/workflow/tracker/__tests__/github-adapter.test.ts: ensureLabel returns false on failure, ensureMilestone swallows a failed create, closing a closed issue succeeds**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ensureLabel returns false on failure, ensureMilestone swallows a failed create, closing a closed issue succeeds | `src/workflow/tracker/__tests__/github-adapter.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/tracker/__tests__/github-adapter.test.ts` | 0 | 17 | 1.2 s |  |

## t7

Run at 2026-10-17T11:22:57.740Z on commit `75edd222`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/__tests__/tracker-auto.test.ts: the three push functions keep their gh sequence, best-effort behaviour and TrackerMeta through the adapter**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the three push functions keep their gh sequence, best-effort behaviour and TrackerMeta through the adapter | `src/workflow/__tests__/tracker-auto.test.ts` |

**integration: src/workflow/__tests__/tracker-auto.test.ts: a failing adoption lookup still leads to a create and does not throw**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a failing adoption lookup still leads to a create and does not throw | `src/workflow/__tests__/tracker-auto.test.ts` |

**integration: src/workflow/__tests__/tracker-auto.test.ts: a failing create is reported as a failed result, not thrown**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a failing create is reported as a failed result, not thrown | `src/workflow/__tests__/tracker-auto.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/tracker-auto.test.ts` | 0 | 10 | 0.7 s |  |

## t8

Run at 2026-10-17T11:26:46.140Z on commit `e4d1e7fa`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/__tests__/bugfix-tracker.test.ts: bugfix create keeps CreatedIssue, readonly labels and the parent link through the adapter**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | bugfix create keeps CreatedIssue, readonly labels and the parent link through the adapter | `src/workflow/__tests__/bugfix-tracker.test.ts` |

**integration: src/workflow/__tests__/bugfix-tracker.test.ts: a failed link makes linkToParent return false and a failed close propagates instead of reporting closed**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a failed link makes linkToParent return false and a failed close propagates instead of reporting closed | `src/workflow/__tests__/bugfix-tracker.test.ts` |

**integration: src/workflow/__tests__/bugfix-tracker.test.ts: relink-by-label match is recorded, closed and returned as closed**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | relink-by-label match is recorded, closed and returned as closed | `src/workflow/__tests__/bugfix-tracker.test.ts` |

**integration: src/workflow/__tests__/bugfix-tracker.test.ts: relink-by-label with no labels, no match and a failed lookup returns skipped and never creates an issue**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | relink-by-label with no labels, no match and a failed lookup returns skipped and never creates an issue | `src/workflow/__tests__/bugfix-tracker.test.ts` |

**integration: src/workflow/__tests__/bugfix-tracker.test.ts: both default deps factories keep their optional opts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | both default deps factories keep their optional opts | `src/workflow/__tests__/bugfix-tracker.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/bugfix-tracker.test.ts` | 0 | 28 | 1 s |  |

## t9

Run at 2026-10-17T11:30:31.305Z on commit `7ecd6621`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/__tests__/questions.test.ts: the comment goes through the adapter with the same argv and a failure is logged in the existing catch**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the comment goes through the adapter with the same argv and a failure is logged in the existing catch | `src/workflow/__tests__/questions.test.ts` |

**integration: src/workflow/tracker/__tests__/setup.test.ts: ensureLabels with a timing-out label create records the label as failed and continues**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ensureLabels with a timing-out label create records the label as failed and continues | `src/workflow/tracker/__tests__/setup.test.ts` |

**integration: src/workflow/tracker/__tests__/tasks.test.ts: listMyOpenTasks propagates a classified or empty login failure before any search call**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | listMyOpenTasks propagates a classified or empty login failure before any search call | `src/workflow/tracker/__tests__/tasks.test.ts` |

**integration: src/workflow/tracker/__tests__/tasks.test.ts: queryTasks keeps its current execution path and results**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | queryTasks keeps its current execution path and results | `src/workflow/tracker/__tests__/tasks.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/questions.test.ts` | 0 | 7 | 1.1 s |  |
| `src/workflow/tracker/__tests__/setup.test.ts` | 0 | 5 | 1 s |  |
| `src/workflow/tracker/__tests__/tasks.test.ts` | 0 | 12 | 0.7 s |  |

## t10

Run at 2026-10-17T11:34:50.846Z on commit `b14bd83a`. Tests check: **passed**. 13 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: npx tsx --test over src/workflow/**/*.test.ts and src/mcp/**/*.test.ts passes, with tsc --noEmit clean**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | only the expected functions still use the legacy exec path | `src/workflow/tracker/__tests__/legacy-exec.test.ts` |
| pass | parseGithubRemoteUrl handles ssh + https + .git suffix | `src/workflow/tracker/__tests__/tracker.test.ts` |
| pass | queryTasks: projects a GitHub issue into a TrackerTask (epic/story from labels) | `src/workflow/tracker/__tests__/tasks.test.ts` |
| pass | all-green: auth ok, scopes present, config exists, labels/types already, project skipped → manualRemaining 0 | `src/workflow/tracker/__tests__/setup.test.ts` |
| pass | missingCapabilities names every capability the tracker does not declare | `src/workflow/tracker/__tests__/port.test.ts` |
| pass | runGh classifies ENOENT, authentication failure, timeout and other failures | `src/workflow/tracker/__tests__/github-adapter.test.ts` |
| pass | HLD approve creates the Epic issue, links docs, and writes nested meta.tracker | `src/workflow/__tests__/tracker-auto.test.ts` |
| pass | task push is opt-out by default (pushTasks unset) → skipped, no issues | `src/workflow/__tests__/tracker-tasks.test.ts` |
| pass | createBugfixTrackerIssue: configured + parent resolves -> created+linked, k4 body verbatim, ref recorded | `src/workflow/__tests__/bugfix-tracker.test.ts` |
| pass | questionId: parses a leading [id / verdict] tag; falls back to a stable sha | `src/workflow/__tests__/questions.test.ts` |
| pass | lenient resolver behaviour is unchanged | `src/workflow/config/__tests__/github.test.ts` |
| pass | handleInsrcGuide({workflow}) forwards to guide.get and wraps Ok (ac1) | `src/mcp/__tests__/guide-handler.test.ts` |
| pass | insrc_present answers presented and notPending against the daemon's pending list and rejects an empty or oversized list | `src/mcp/__tests__/present-dispatch.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/mcp/__tests__/guide-handler.test.ts` | 0 | 5 | 1.3 s |  |
| `src/mcp/__tests__/present-dispatch.test.ts` | 0 | 5 | 1.8 s |  |
| `src/workflow/__tests__/bugfix-tracker.test.ts` | 0 | 28 | 1.4 s |  |
| `src/workflow/__tests__/questions.test.ts` | 0 | 7 | 1.6 s |  |
| `src/workflow/__tests__/tracker-auto.test.ts` | 0 | 10 | 1.7 s |  |
| `src/workflow/__tests__/tracker-tasks.test.ts` | 0 | 5 | 1.7 s |  |
| `src/workflow/config/__tests__/github.test.ts` | 0 | 19 | 1.2 s |  |
| `src/workflow/tracker/__tests__/github-adapter.test.ts` | 0 | 17 | 1.4 s |  |
| `src/workflow/tracker/__tests__/legacy-exec.test.ts` | 0 | 1 | 1.1 s |  |
| `src/workflow/tracker/__tests__/port.test.ts` | 0 | 10 | 5.1 s |  |
| `src/workflow/tracker/__tests__/setup.test.ts` | 0 | 5 | 0.6 s |  |
| `src/workflow/tracker/__tests__/tasks.test.ts` | 0 | 12 | 0.4 s |  |
| `src/workflow/tracker/__tests__/tracker.test.ts` | 0 | 20 | 0.4 s |  |
