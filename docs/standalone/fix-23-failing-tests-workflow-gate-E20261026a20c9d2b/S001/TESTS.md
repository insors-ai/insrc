<!-- insrc:artifact TESTS-a20c9d2b51002bec-s1 -->

# Tests: a20c9d2b51002bec s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 97 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-26T08:09:00.838Z on commit `0d38388a8`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: review-record-builder.test.ts: the builder's record passes reviewBuildGap for a BUILD with a two-file changeLog**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | review-record-builder.test.ts: the builder's record passes reviewBuildGap for a BUILD with a two-file changeLog | `src/workflow/__tests__/review-record-builder.test.ts` |

**unit: review-record-builder.test.ts: reviewBuildGap still refuses a review with no verdict, no changedFiles, no buildFingerprint, a stale fingerprint or an uncovered changeLog file**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | review-record-builder.test.ts: reviewBuildGap still refuses a review with no verdict, no changedFiles, no buildFingerprint, a stale fingerprint or an uncovered changeLog file | `src/workflow/__tests__/review-record-builder.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/review-record-builder.test.ts` | 0 | 2 | 0.4 s |  |

## t2

Run at 2026-10-26T08:21:14.172Z on commit `bea53b892`. Tests check: **passed**. 10 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: approve-codereview-gate.test.ts: all ten tests pass through the real approve path**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ac1: enforce on + CR block + no override → skipped, not approved, codeReview[] blocked | `src/workflow/__tests__/approve-codereview-gate.test.ts` |
| pass | ac2: enforce on + CR block + overrideReview → approved, codeReview[] overridden + overrideReason | `src/workflow/__tests__/approve-codereview-gate.test.ts` |
| pass | ac3: CR warn → approved, codeReview[] warn + counts | `src/workflow/__tests__/approve-codereview-gate.test.ts` |
| pass | ac3: CR pass → approved, codeReview[] pass + counts | `src/workflow/__tests__/approve-codereview-gate.test.ts` |
| pass | ac5: absent CR record (non-BUILD) → approved byte-identical, codeReview[] no-review | `src/workflow/__tests__/approve-codereview-gate.test.ts` |
| pass | ac5: DEF/HLD artifact (no storyId) → gate never runs, codeReview empty, approved | `src/workflow/__tests__/approve-codereview-gate.test.ts` |
| pass | ac5: enforce OFF + CR block → approved (demoted advisory), codeReview[] warn/advisory | `src/workflow/__tests__/approve-codereview-gate.test.ts` |
| pass | batch: story A CR block + story B CR pass (enforce on) → A skipped, B approved | `src/workflow/__tests__/approve-codereview-gate.test.ts` |
| pass | ac6: clean meta.review + CR block → withheld ONLY by the code-review gate | `src/workflow/__tests__/approve-codereview-gate.test.ts` |
| pass | ac6: corrupt CR record (non-BUILD) → no-review fail-open, approved | `src/workflow/__tests__/approve-codereview-gate.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/approve-codereview-gate.test.ts` | 0 | 10 | 0.7 s |  |

## t3

Run at 2026-10-26T08:22:45.122Z on commit `100305e6f`. Tests check: **passed**. 11 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: approve-build-completion.test.ts: every test of the file passes through the real approve path**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ac1: epic-batch sweep includes a pending BUILD; excludes an already-approved BUILD | `src/workflow/__tests__/approve-build-completion.test.ts` |
| pass | ac2: single BUILD + enforce ON + CR pass => completes, codeReview[] pass | `src/workflow/__tests__/approve-build-completion.test.ts` |
| pass | ac3: BUILD + enforce ON + absent CR => withheld into skipped[], not approved, codeReview[] no-review | `src/workflow/__tests__/approve-build-completion.test.ts` |
| pass | ac4: BUILD + enforce ON + absent CR + overrideReview => completes, override recorded | `src/workflow/__tests__/approve-build-completion.test.ts` |
| pass | ac5: BUILD + enforce ON + CR block => withheld into skipped[], codeReview[] blocked | `src/workflow/__tests__/approve-build-completion.test.ts` |
| pass | ac6: BUILD + enforce OFF + absent CR => withheld (completion requires a code review, whatever the setting) | `src/workflow/__tests__/approve-build-completion.test.ts` |
| pass | ac6: BUILD + enforce OFF + a BLOCKING CR => completes: enforcement off still demotes a blocking verdict to advisory | `src/workflow/__tests__/approve-build-completion.test.ts` |
| pass | ac6: non-BUILD LLD + enforce ON + absent CR => completes (the withhold is BUILD-scoped) | `src/workflow/__tests__/approve-build-completion.test.ts` |
| pass | ac6: a story-scoped artifact whose basename is NOT BUILD- is not withheld even under enforce (basename predicate) | `src/workflow/__tests__/approve-build-completion.test.ts` |
| pass | ac7: clean meta.review + BUILD withheld ONLY by the code-review gate (distinct from meta.review) | `src/workflow/__tests__/approve-build-completion.test.ts` |
| pass | ac7: epic batch withheld-BUILD + clean-LLD => BUILD skipped, LLD approved (non-lossy) | `src/workflow/__tests__/approve-build-completion.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/approve-build-completion.test.ts` | 0 | 11 | 0.8 s |  |

## t4

Run at 2026-10-26T08:27:25.008Z on commit `edbc44ef0`. Tests check: **passed**. 24 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: bugfix-orchestration.test.ts: every test of the file passes, including the two ac3 completion tests**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | nextAfterIssue: magnitude='small' -> standalone insrc_build_step (issue->build) | `src/workflow/__tests__/bugfix-orchestration.test.ts` |
| pass | nextAfterIssue: magnitude='sized' -> standalone insrc_workflow_step design.story (START) | `src/workflow/__tests__/bugfix-orchestration.test.ts` |
| pass | nextAfterIssue: the small build routes through the build-step NO-LLD path (sizeClass=trivial, consumable) | `src/workflow/__tests__/bugfix-orchestration.test.ts` |
| pass | nextAfterIssue: the sized design.story spec carries the full defect body, not just the title | `src/workflow/__tests__/bugfix-orchestration.test.ts` |
| pass | nextAfterIssue: emitted stage matches routeForSizeClass (small->build has no design.story) | `src/workflow/__tests__/bugfix-orchestration.test.ts` |
| pass | nextAfterIssue: magnitude absent/invalid -> throws invalid-magnitude | `src/workflow/__tests__/bugfix-orchestration.test.ts` |
| pass | admitBugfixAdvance: approved + parentRef WorkItemRef -> admitted | `src/workflow/__tests__/bugfix-orchestration.test.ts` |
| pass | admitBugfixAdvance: approved + parentRef===null (standalone) -> admitted | `src/workflow/__tests__/bugfix-orchestration.test.ts` |
| pass | admitBugfixAdvance: approved + parentRef ABSENT -> not admitted | `src/workflow/__tests__/bugfix-orchestration.test.ts` |
| pass | bugfix-orchestration.test.ts: the bugfix chain advances from a lifecycle approval | `src/workflow/__tests__/bugfix-orchestration.test.ts` |
| pass | admitBugfixAdvance: not approved -> not admitted | `src/workflow/__tests__/bugfix-orchestration.test.ts` |
| pass | locateAndStampParent: WorkItemRef -> writeParentRef(ref); returns the ParentLocation | `src/workflow/__tests__/bugfix-orchestration.test.ts` |
| pass | locateAndStampParent: standalone (null) -> writeParentRef(null) | `src/workflow/__tests__/bugfix-orchestration.test.ts` |
| pass | locateAndStampParent: readIssue null -> throws issue-not-found, no write | `src/workflow/__tests__/bugfix-orchestration.test.ts` |
| pass | locateAndStampParent: not approved -> throws not-approved, no write | `src/workflow/__tests__/bugfix-orchestration.test.ts` |
| pass | locateAndStampParent: locateParent rejects -> propagates, no write | `src/workflow/__tests__/bugfix-orchestration.test.ts` |
| pass | locateAndStampParent: defectDescription is built from the issue body; touchedPaths empty | `src/workflow/__tests__/bugfix-orchestration.test.ts` |
| pass | defaultStampDeps: writeParentRef patches meta.parentRef only, body byte-unchanged (k4) | `src/workflow/__tests__/bugfix-orchestration.test.ts` |
| pass | advanceBugfixAfterIssue: bugfix issue -> stamps, admits, returns nextCall | `src/workflow/__tests__/bugfix-orchestration.test.ts` |
| pass | advanceBugfixAfterIssue: non-issue artifact -> skipped, nothing routed | `src/workflow/__tests__/bugfix-orchestration.test.ts` |
| pass | advanceBugfixAfterIssue: bugfixCategory flag off -> skipped | `src/workflow/__tests__/bugfix-orchestration.test.ts` |
| pass | ac3: a bugfix BUILD + enforce + CR pass -> completes via approveWorkflowTarget (reused gate) | `src/workflow/__tests__/bugfix-orchestration.test.ts` |
| pass | ac3: a bugfix BUILD + enforce + absent CR -> withheld into skipped[], not approved | `src/workflow/__tests__/bugfix-orchestration.test.ts` |
| pass | ac3: a bugfix BUILD + enforce OFF + absent CR -> withheld too (no separate path for a bugfix) | `src/workflow/__tests__/bugfix-orchestration.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/bugfix-orchestration.test.ts` | 0 | 24 | 0.6 s |  |

## t5

Run at 2026-10-26T08:31:54.185Z on commit `cbb27dd24`. Tests check: **passed**. 45 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: other-party-review-gate.test.ts: every test of the file passes, including the eight T7 tests**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | T5 a DEF with no review is withheld; an override reason approves it and is written on the artifact | `src/workflow/__tests__/other-party-review-gate.test.ts` |
| pass | T5 a HLD with no review is withheld; an override reason approves it and is written on the artifact | `src/workflow/__tests__/other-party-review-gate.test.ts` |
| pass | T5 a LLD with no review is withheld; an override reason approves it and is written on the artifact | `src/workflow/__tests__/other-party-review-gate.test.ts` |
| pass | T5 the message names the reviewer that is needed: a controller review for daemon-authored work | `src/workflow/__tests__/other-party-review-gate.test.ts` |
| pass | T5 an ISSUE with no review is approved on the approval alone | `src/workflow/__tests__/other-party-review-gate.test.ts` |
| pass | T5 an SPEC with no review is approved on the approval alone | `src/workflow/__tests__/other-party-review-gate.test.ts` |
| pass | T5 an PLAN with no review is approved on the approval alone | `src/workflow/__tests__/other-party-review-gate.test.ts` |
| pass | T6 a DEF authored AND reviewed by the controller is withheld; an override approves it and is recorded | `src/workflow/__tests__/other-party-review-gate.test.ts` |
| pass | T6 a DEF authored by the controller and reviewed by the daemon with nothing blocking is approved | `src/workflow/__tests__/other-party-review-gate.test.ts` |
| pass | T6 a DEF authored AND reviewed by the daemon is withheld; an override approves it and is recorded | `src/workflow/__tests__/other-party-review-gate.test.ts` |
| pass | T6 a DEF authored by the daemon and reviewed by the controller with nothing blocking is approved | `src/workflow/__tests__/other-party-review-gate.test.ts` |
| pass | T6 a HLD authored AND reviewed by the controller is withheld; an override approves it and is recorded | `src/workflow/__tests__/other-party-review-gate.test.ts` |
| pass | T6 a HLD authored by the controller and reviewed by the daemon with nothing blocking is approved | `src/workflow/__tests__/other-party-review-gate.test.ts` |
| pass | T6 a HLD authored AND reviewed by the daemon is withheld; an override approves it and is recorded | `src/workflow/__tests__/other-party-review-gate.test.ts` |
| pass | T6 a HLD authored by the daemon and reviewed by the controller with nothing blocking is approved | `src/workflow/__tests__/other-party-review-gate.test.ts` |
| pass | T6 a LLD authored AND reviewed by the controller is withheld; an override approves it and is recorded | `src/workflow/__tests__/other-party-review-gate.test.ts` |
| pass | T6 a LLD authored by the controller and reviewed by the daemon with nothing blocking is approved | `src/workflow/__tests__/other-party-review-gate.test.ts` |
| pass | T6 a LLD authored AND reviewed by the daemon is withheld; an override approves it and is recorded | `src/workflow/__tests__/other-party-review-gate.test.ts` |
| pass | T6 a LLD authored by the daemon and reviewed by the controller with nothing blocking is approved | `src/workflow/__tests__/other-party-review-gate.test.ts` |
| pass | T6 an other-party review whose verdict BLOCKS still withholds without an override | `src/workflow/__tests__/other-party-review-gate.test.ts` |
| pass | T6 an unknown author never withholds by itself | `src/workflow/__tests__/other-party-review-gate.test.ts` |
| pass | T6 the same-party rule applies to any artifact that carries a review, also one that needs none | `src/workflow/__tests__/other-party-review-gate.test.ts` |
| pass | T7 a BUILD record whose Story has no code review is withheld (enforcement off) | `src/workflow/__tests__/other-party-review-gate.test.ts` |
| pass | T7 a BUILD record written AND code-reviewed by the controller is withheld; reviewed by the daemon it completes (enforcement off) | `src/workflow/__tests__/other-party-review-gate.test.ts` |
| pass | T7 a BUILD record written AND code-reviewed by the daemon is withheld; reviewed by the controller it completes (enforcement off) | `src/workflow/__tests__/other-party-review-gate.test.ts` |
| pass | T7 a BUILD record whose Story has no code review is withheld (enforcement on) | `src/workflow/__tests__/other-party-review-gate.test.ts` |
| pass | T7 a BUILD record written AND code-reviewed by the controller is withheld; reviewed by the daemon it completes (enforcement on) | `src/workflow/__tests__/other-party-review-gate.test.ts` |
| pass | T7 a BUILD record written AND code-reviewed by the daemon is withheld; reviewed by the controller it completes (enforcement on) | `src/workflow/__tests__/other-party-review-gate.test.ts` |
| pass | T7 for a BUILD record too, an unknown author or reviewer does not withhold, and an older code review is read by its model label | `src/workflow/__tests__/other-party-review-gate.test.ts` |
| pass | T7 the party of a code review is its lifecycle review's when it has one | `src/workflow/__tests__/other-party-review-gate.test.ts` |
| pass | T7 a code review that cannot be read is no code review | `src/workflow/__tests__/other-party-review-gate.test.ts` |
| pass | T7 the TUI approve service applies the same rules: it calls the same function | `src/workflow/__tests__/other-party-review-gate.test.ts` |
| pass | T8 a batch approval lists every withheld artifact in skipped[] with its reason, and approves the rest | `src/workflow/__tests__/other-party-review-gate.test.ts` |
| pass | T18 a DEF fixture (author: controller) stamped with the shared helper is approved with no override | `src/workflow/__tests__/other-party-review-gate.test.ts` |
| pass | T18 a DEF fixture (author: daemon) stamped with the shared helper is approved with no override | `src/workflow/__tests__/other-party-review-gate.test.ts` |
| pass | T18 a DEF fixture (author: none) stamped with the shared helper is approved with no override | `src/workflow/__tests__/other-party-review-gate.test.ts` |
| pass | T18 a HLD fixture (author: controller) stamped with the shared helper is approved with no override | `src/workflow/__tests__/other-party-review-gate.test.ts` |
| pass | T18 a HLD fixture (author: daemon) stamped with the shared helper is approved with no override | `src/workflow/__tests__/other-party-review-gate.test.ts` |
| pass | T18 a HLD fixture (author: none) stamped with the shared helper is approved with no override | `src/workflow/__tests__/other-party-review-gate.test.ts` |
| pass | T18 a LLD fixture (author: controller) stamped with the shared helper is approved with no override | `src/workflow/__tests__/other-party-review-gate.test.ts` |
| pass | T18 a LLD fixture (author: daemon) stamped with the shared helper is approved with no override | `src/workflow/__tests__/other-party-review-gate.test.ts` |
| pass | T18 a LLD fixture (author: none) stamped with the shared helper is approved with no override | `src/workflow/__tests__/other-party-review-gate.test.ts` |
| pass | T18 a BUILD fixture (author: controller) stamped with the shared helper is approved with no override | `src/workflow/__tests__/other-party-review-gate.test.ts` |
| pass | T18 a BUILD fixture (author: daemon) stamped with the shared helper is approved with no override | `src/workflow/__tests__/other-party-review-gate.test.ts` |
| pass | T18 a BUILD fixture (author: none) stamped with the shared helper is approved with no override | `src/workflow/__tests__/other-party-review-gate.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/other-party-review-gate.test.ts` | 0 | 45 | 1.5 s |  |

## t6

Run at 2026-10-26T08:33:08.897Z on commit `470aa245b`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: artifact-write-inventory.test.ts: every writer file is inventoried, annotated and classified as the design says**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | every writer file is inventoried, annotated and classified as the design says | `src/workflow/__tests__/artifact-write-inventory.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/artifact-write-inventory.test.ts` | 0 | 8 | 1.7 s |  |

## t7

Run at 2026-10-26T08:34:16.665Z on commit `941c3d258`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: convert-repeat.test.ts: a second apply and an apply crashed at each step then rerun write nothing more**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | convert-repeat.test.ts: a second apply and an apply crashed at each step then rerun write nothing more | `src/workflow/convert/__tests__/convert-repeat.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/convert/__tests__/convert-repeat.test.ts` | 0 | 2 | 1.2 s |  |

## t8

Run at 2026-10-26T08:35:30.518Z on commit `f806f8c33`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: call-limits.test.ts: REVIEW_CALL_LIMITS holds the five call-type rows and every silence limit is below its call's limit**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | REVIEW_CALL_LIMITS holds the five call-type rows, every silence limit is below its call's total limit, and VERIFY_CALL_TIMEOUT_MS and VERIFY_CALL_STALL_MS come from the design-verify row | `src/workflow/review/__tests__/call-limits.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review/__tests__/call-limits.test.ts` | 0 | 4 | 0.7 s |  |

## t9

Run at 2026-10-26T08:39:58.120Z on commit `66ef2c1fc`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: build-record.test.ts: t7 the three hand-filled records prove the gap was real**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | t7: the three hand-filled records prove the gap was real — and are now what the producer writes automatically | `src/workflow/runners/build/__tests__/build-record.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/runners/build/__tests__/build-record.test.ts` | 0 | 44 | 1.1 s |  |

## t10

Run at 2026-10-26T08:43:46.363Z on commit `fc37dab1f`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: lock-loss-reproduction.test.ts: reproduction against the real library**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | reproduction against the real library: read throws (-30775 on macOS, 22 on Linux), synchronous transaction throws 22, asynchronous transaction does not settle | `src/db/graph/__tests__/lock-loss-reproduction.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/db/graph/__tests__/lock-loss-reproduction.test.ts` | 0 | 4 | 7.4 s |  |

## t11

Run at 2026-10-26T08:45:28.686Z on commit `fc37dab1f`. Tests check: **failed**. 0 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

named tests matched no test file: the workflow and db sweeps report no failing test and no new skipped test (pass a `tests` mapping at the validate turn: for each named test, the file and title of the test cases that carry it)

**integration: the workflow and db sweeps report no failing test and no new skipped test**

Not mapped: no test case was named for this test, and nothing was run for it.
