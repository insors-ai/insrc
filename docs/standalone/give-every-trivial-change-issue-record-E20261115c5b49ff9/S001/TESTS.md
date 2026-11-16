<!-- insrc:artifact TESTS-c5b49ff953a9a295-s1 -->

# Tests: c5b49ff953a9a295 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 19 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-15T06:48:26.527Z on commit `ff81eef0b`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: finalizeIssue: params.kind change is stored on the ISSUE meta and an unknown kind is refused**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | finalizeIssue: params.kind change is stored on the ISSUE meta and an unknown kind is refused | `src/workflow/__tests__/issue-artifact.test.ts` |

**unit: renderIssueMarkdown: kind change renders What was asked, Why and Change**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | renderIssueMarkdown: kind change renders What was asked, Why and Change | `src/workflow/__tests__/issue-artifact.test.ts` |

**unit: renderIssueMarkdown: an ISSUE with no kind renders byte-identically to before**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | renderIssueMarkdown: an ISSUE with no kind renders byte-identically to before | `src/workflow/__tests__/issue-artifact.test.ts` |

**unit: issue capture prompt: a change run asks what was asked and why, not for a defect**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | issue capture prompt: a change run asks what was asked and why, not for a defect | `src/workflow/__tests__/issue-artifact.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/issue-artifact.test.ts` | 0 | 15 | 2.5 s |  |

## t2

Run at 2026-11-15T06:51:47.527Z on commit `440012778`. Tests check: **failed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: nextAfterIssue: a small ISSUE routes to build with the ISSUE hash as standalone.epicHash**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | nextAfterIssue: a small ISSUE routes to build with the ISSUE hash as standalone.epicHash | `src/workflow/__tests__/bugfix-orchestration.test.ts` |

**unit: nextAfterIssue: a sized ISSUE routes to design.story with params.epicHash set to the ISSUE hash**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | nextAfterIssue: a sized ISSUE routes to design.story with params.epicHash set to the ISSUE hash | `src/workflow/__tests__/bugfix-orchestration.test.ts` |

**unit: nextAfterIssue: an ISSUE without a 16-hex issueHash is refused**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | nextAfterIssue: an ISSUE without a 16-hex issueHash is refused | `src/workflow/__tests__/bugfix-orchestration.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/bugfix-orchestration.test.ts` | 1 | 27 | 3.1 s |  |

**Failures outside the named cases**

- `src/workflow/__tests__/bugfix-orchestration.test.ts`: ac3: a bugfix BUILD + enforce + CR pass -> completes via approveWorkflowTarget (reused gate)
- `src/workflow/__tests__/bugfix-orchestration.test.ts`: ac3: a bugfix BUILD + enforce OFF + absent CR -> withheld too (no separate path for a bugfix)

## t3

Run at 2026-11-15T07:08:59.019Z on commit `01679bad9`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: build implement: a no-LLD standalone call without epicHash is refused with no-identity and writes nothing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | build implement: a no-LLD standalone call without epicHash is refused with no-identity and writes nothing | `src/daemon/steps/build-step/__tests__/standalone-implement.test.ts` |

**integration: build implement: a no-LLD standalone call whose epicHash has no approved ISSUE is refused**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | build implement: a no-LLD standalone call whose epicHash has no approved ISSUE is refused | `src/daemon/steps/build-step/__tests__/standalone-implement.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/steps/build-step/__tests__/standalone-implement.test.ts` | 0 | 7 | 2.9 s |  |

## t4

Run at 2026-11-15T07:19:17.832Z on commit `2f419637e`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: routeForSizeClass: trivial routes to the issue stage with no LLD**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | routeForSizeClass: trivial routes to the issue stage with no LLD | `src/workflow/triage/__tests__/classify.test.ts` |

**unit: routeForSizeClass: no tier starts at build**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | routeForSizeClass: no tier starts at build | `src/workflow/triage/__tests__/classify.test.ts` |

**unit: triage nextCall: trivial starts the issue workflow with sizeClass trivial, magnitude small and kind change**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | triage nextCall: trivial starts the issue workflow with sizeClass trivial, magnitude small and kind change | `src/daemon/steps/triage-step/__tests__/handler.test.ts` |

**integration: a trivial change: ISSUE approved, build under its hash, BUILD approved completes STORY and EPIC**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a trivial change: ISSUE approved, build under its hash, BUILD approved completes STORY and EPIC | `src/daemon/steps/build-step/__tests__/trivial-change-e2e.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/steps/build-step/__tests__/trivial-change-e2e.test.ts` | 0 | 1 | 4.2 s |  |
| `src/daemon/steps/triage-step/__tests__/handler.test.ts` | 0 | 17 | 1.8 s |  |
| `src/workflow/triage/__tests__/classify.test.ts` | 0 | 26 | 1.4 s |  |

## t5

Run at 2026-11-15T07:31:42.037Z on commit `f89add1c5`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: the steering text routes trivial work through the issue stage and no longer calls a BUILD record a ledger entry**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the steering text routes trivial work through the issue stage and no longer calls a BUILD record a ledger entry | `src/mcp/__tests__/review-rule-text.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/mcp/__tests__/review-rule-text.test.ts` | 0 | 16 | 5.6 s |  |

## t6

Run at 2026-11-15T07:47:51.022Z on commit `8c8f59a1b`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: repair-preview lists one backfill-issue change per headless standalone trivial BUILD and writes nothing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | repair-preview lists one backfill-issue change per headless standalone trivial BUILD and writes nothing | `src/workflow/convert/__tests__/repair-backfill-issue.test.ts` |

**integration: repair writes a kind change ISSUE for each headless BUILD, approved by the migration actor, and a second repair lists none**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | repair writes a kind change ISSUE for each headless BUILD, approved by the migration actor, and a second repair lists none | `src/workflow/convert/__tests__/repair-backfill-issue.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/convert/__tests__/repair-backfill-issue.test.ts` | 0 | 2 | 6.8 s |  |

## t7

Run at 2026-11-15T08:08:16.889Z on commit `52fea3d7d`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: repair settles a backfilled Story by the completion rule: one completes, one approved before the cutoff without an override is held, and a draft BUILD is not settled**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | repair settles a backfilled Story by the completion rule: one approved before the cutoff completes, one approved after it with no code review is held, and a draft BUILD is not settled | `src/workflow/convert/__tests__/repair-backfill-issue.test.ts` |

**integration: a failure injected during the backfill lists the ISSUEs written and the next repair writes only the rest**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a failure injected during the backfill lists the ISSUEs written and the next repair writes only the rest | `src/workflow/convert/__tests__/repair-backfill-issue.test.ts` |
| pass | a backfilled ISSUE whose approval did not happen is approved by the next run, and is not written again | `src/workflow/convert/__tests__/repair-backfill-issue.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/convert/__tests__/repair-backfill-issue.test.ts` | 0 | 6 | 6.2 s |  |
