<!-- insrc:artifact TESTS-149283b0d0455a43-s1 -->

# Tests: 149283b0d0455a43 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 31 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

## t1

Run at 2026-11-16T09:44:57.284Z on commit `c04acd560`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: implied-issue-stories.test.ts: impliedIssueStories returns exactly one entry with id IMPLIED_ISSUE_STORY_ID and the ISSUE title**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | impliedIssueStories returns exactly one entry with id IMPLIED_ISSUE_STORY_ID and the ISSUE title | `src/workflow/__tests__/implied-issue-stories.test.ts` |

**unit: implied-issue-stories.test.ts: the tracker resolver answers implied for s1 and null for s2 from the shared constant**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the tracker resolver answers implied for s1 and null for s2 from the shared constant | `src/workflow/__tests__/implied-issue-stories.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/implied-issue-stories.test.ts` | 0 | 2 | 0.9 s |  |

## t2

Run at 2026-11-16T09:50:11.821Z on commit `1266f52bb`. Tests check: **failed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: bugfix-orchestration.test.ts: nextAfterIssue sized route carries epicHash=issueHash and storyId s1**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | nextAfterIssue sized route carries epicHash=issueHash and storyId s1 (ISSUE-149283b0d0455a43) | `src/workflow/__tests__/bugfix-orchestration.test.ts` |

**unit: bugfix-orchestration.test.ts: nextAfterIssue refuses a sized ISSUE with no issueHash**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | nextAfterIssue refuses a sized ISSUE with no issueHash | `src/workflow/__tests__/bugfix-orchestration.test.ts` |

**unit: bugfix-orchestration.test.ts: sized-route fixtures carry an issueHash**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | nextAfterIssue: a sized ISSUE routes to design.story with params.epicHash set to the ISSUE hash | `src/workflow/__tests__/bugfix-orchestration.test.ts` |

**unit: bugfix-orchestration.test.ts: nextAfterIssue small route is unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | nextAfterIssue small route is unchanged | `src/workflow/__tests__/bugfix-orchestration.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/bugfix-orchestration.test.ts` | 1 | 30 | 0.9 s |  |

**Failures outside the named cases**

- `src/workflow/__tests__/bugfix-orchestration.test.ts`: ac3: a bugfix BUILD + enforce + CR pass -> completes via approveWorkflowTarget (reused gate)
- `src/workflow/__tests__/bugfix-orchestration.test.ts`: ac3: a bugfix BUILD + enforce OFF + absent CR -> withheld too (no separate path for a bugfix)

## t3

Run at 2026-11-16T09:54:05.212Z on commit `9e8443473`. Tests check: **failed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: gates.test.ts: readDefineArtifact on an ISSUE-only hash names the ISSUE and does not advise running define**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | readDefineArtifact on an ISSUE-only hash names the ISSUE and does not advise running define | `src/workflow/__tests__/gates.test.ts` |

**unit: gates.test.ts: readDefineArtifact on a hash with neither root keeps the original message**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | readDefineArtifact on a hash with neither root keeps the original message | `src/workflow/__tests__/gates.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/gates.test.ts` | 1 | 28 | 1.4 s |  |

**Failures outside the named cases**

- `src/workflow/__tests__/gates.test.ts`: gates.test.ts: approval goes through LifecycleService and stamps none of the removed fields
- `src/workflow/__tests__/gates.test.ts`: requireApprovedEpic returns the Define artifact after approval
- `src/workflow/__tests__/gates.test.ts`: t5: the GENERIC stamp site is GATED — DEF, HLD, AMD and BUILD each stamp NO rangeBase
- `src/workflow/__tests__/gates.test.ts`: t5: a STANDALONE design.story LLD IS stamped (the only upstream the no-plan route has), an EPIC-route LLD is NOT

## t4

Run at 2026-11-16T10:05:11.788Z on commit `076cc0a66`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: chain-issue-anchored.test.ts: chain report for an ISSUE-anchored item returns the implied s1 with its LLD state**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chain report for an ISSUE-anchored item returns the implied s1 with its LLD state | `src/workflow/__tests__/chain-issue-anchored.test.ts` |

**unit: chain-issue-anchored.test.ts: chain report story path for an ISSUE-anchored item is the standalone folder**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chain report story path for an ISSUE-anchored item is the standalone folder | `src/workflow/__tests__/chain-issue-anchored.test.ts` |

**unit: chain-issue-anchored.test.ts: chain report prefers a DEF when a DEF and an ISSUE share a hash**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chain report prefers a DEF when a DEF and an ISSUE share a hash | `src/workflow/__tests__/chain-issue-anchored.test.ts` |

**unit: chain-issue-anchored.test.ts: definitionKind is issue for an ISSUE head and def for a DEF head**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | definitionKind is issue for an ISSUE head and def for a DEF head | `src/workflow/__tests__/chain-issue-anchored.test.ts` |

**unit: chain-issue-anchored.test.ts: formatChainReport labels an ISSUE head and leaves DEF output unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | formatChainReport labels an ISSUE head and leaves DEF output unchanged | `src/workflow/__tests__/chain-issue-anchored.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/chain-issue-anchored.test.ts` | 0 | 5 | 0.9 s |  |

## t5

Run at 2026-11-16T10:10:51.191Z on commit `24dadaa3a`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: chain-issue-anchored.test.ts: unapproved ISSUE yields approve-define naming the ISSUE document**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | unapproved ISSUE yields approve-define naming the ISSUE document | `src/workflow/__tests__/chain-issue-anchored.test.ts` |

**unit: chain-issue-anchored.test.ts: rejected ISSUE yields run-define that reruns the issue stage**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | rejected ISSUE yields run-define that reruns the issue stage | `src/workflow/__tests__/chain-issue-anchored.test.ts` |

**unit: chain-issue-anchored.test.ts: next actions follow run-lld, approve-lld, chain-complete and never name an HLD, amendment, stale or tracker step**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | next actions follow run-lld, approve-lld, chain-complete and never name an HLD, amendment, stale or tracker step | `src/workflow/__tests__/chain-issue-anchored.test.ts` |

**unit: chain-issue-anchored.test.ts: the DEF-anchored next-action sequence is unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the DEF-anchored next-action sequence is unchanged | `src/workflow/__tests__/chain-issue-anchored.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/chain-issue-anchored.test.ts` | 0 | 9 | 0.9 s |  |

## t6

Run at 2026-11-16T10:26:39.954Z on commit `2b4fd6ce1`. Tests check: **passed**. 10 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: issue-anchored-route.test.ts: sized ISSUE start writes LLD-<issueHash>-s1 and no second root**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | issue-anchored-route.test.ts: sized ISSUE start writes LLD-<issueHash>-s1 and no second root | `src/workflow/__tests__/issue-anchored-route.test.ts` |

**integration: issue-anchored-route.test.ts: the LLD inherits the ISSUE label, epicCreatedAt and folder**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | issue-anchored-route.test.ts: the LLD inherits the ISSUE label, epicCreatedAt and folder | `src/workflow/__tests__/issue-anchored-route.test.ts` |

**integration: issue-anchored-route.test.ts: design review classifies the LLD as kind issue with the ISSUE as originating_issue**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | issue-anchored-route.test.ts: design review classifies the LLD as kind issue with the ISSUE as originating_issue | `src/workflow/__tests__/issue-anchored-route.test.ts` |

**integration: issue-anchored-route.test.ts: PLAN and BUILD placement helpers keep the ISSUE epicHash, anchor and folder**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | issue-anchored-route.test.ts: PLAN and BUILD placement helpers keep the ISSUE epicHash, anchor and folder | `src/workflow/__tests__/issue-anchored-route.test.ts` |

**integration: issue-anchored-route.test.ts: a second design.story start revises the same LLD and creates no duplicate**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | issue-anchored-route.test.ts: a second design.story start revises the same LLD and creates no duplicate | `src/workflow/__tests__/issue-anchored-route.test.ts` |

**integration: issue-anchored-route.test.ts: a genuine standalone feature still mints its own root**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | issue-anchored-route.test.ts: a genuine standalone feature still mints its own root | `src/workflow/__tests__/issue-anchored-route.test.ts` |

**integration: issue-anchored-route.test.ts: an Epic story still requires its DEF and HLD**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | issue-anchored-route.test.ts: an Epic story still requires its DEF and HLD | `src/workflow/__tests__/issue-anchored-route.test.ts` |

**integration: issue-anchored-route.test.ts: requireApprovedEpic still refuses an ISSUE root with a message naming the ISSUE**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | issue-anchored-route.test.ts: requireApprovedEpic still refuses an ISSUE root with a message naming the ISSUE | `src/workflow/__tests__/issue-anchored-route.test.ts` |

**integration: issue-anchored-route.test.ts: a bugfix LLD with no ISSUE provenance is still rejected by design review**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | issue-anchored-route.test.ts: a bugfix LLD with no ISSUE provenance is still rejected by design review | `src/workflow/__tests__/issue-anchored-route.test.ts` |

**integration: issue-anchored-route.test.ts: chain report for the seeded ISSUE repo returns the implied s1 and reaches chain-complete**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | issue-anchored-route.test.ts: chain report for the seeded ISSUE repo returns the implied s1 and reaches chain-complete | `src/workflow/__tests__/issue-anchored-route.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/issue-anchored-route.test.ts` | 0 | 10 | 0.9 s |  |

## t7

Run at 2026-11-16T10:52:51.408Z on commit `85ce943c1`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: WorkflowChainReaderTest.kt: readAll lists an ISSUE-anchored hash with the implied story s1 and no HLD**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | WorkflowChainReaderTest: readAll lists an ISSUE-anchored hash with the implied story s1 and no HLD | `jetbrains-plugin/__tests__/issue-anchored-gradle.test.ts` |

**unit: WorkflowChainReaderTest.kt: nextActionHint for an ISSUE-anchored entry follows approve issue, design story, approve LLD, chain complete**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | WorkflowChainReaderTest: nextActionHint for an ISSUE-anchored entry follows approve issue, design story, approve LLD, chain complete | `jetbrains-plugin/__tests__/issue-anchored-gradle.test.ts` |

**unit: WorkflowChainReaderTest.kt: readAll lists a hash with both a DEF and an ISSUE once, as the DEF**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | WorkflowChainReaderTest: readAll lists a hash with both a DEF and an ISSUE once, as the DEF | `jetbrains-plugin/__tests__/issue-anchored-gradle.test.ts` |

**unit: WorkflowChainReaderTest.kt: readAll swallows a malformed ISSUE file without throwing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | WorkflowChainReaderTest: readAll swallows a malformed ISSUE file without throwing | `jetbrains-plugin/__tests__/issue-anchored-gradle.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `jetbrains-plugin/__tests__/issue-anchored-gradle.test.ts` | 0 | 4 | 10.8 s |  |

## t8

Run at 2026-11-16T11:27:43.641Z on commit `072965b06`. Tests check: **passed**. 0 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

the gate ran no test: every named test of this Task was reported by the builder

**smoke: workflow and MCP test subsets, the type check and the JetBrains reader tests match the t1 baseline with no new failures**

Reported by the builder, not run by the gate: **pass**. Evidence: Chunked runs recorded in the t8 commit 072965b06 and this summary: workflow chunks (40+20+20+41 files) failure sets diff-identical to HEAD baselines captured via git stash (36/10/11/16 failsboth sides; chunk3 file-warning line is a flaky interruption notice, same 16 test failures and 238 passes on both runs); MCP chunks mcp1/mcp2 failure sets diff-identical to HEAD (6 and 26); tsc --noEmit exit 0; jetbrains-plugin/__tests__/issue-anchored-gradle.test.ts 4/4 pass, driving WorkflowChainReaderTest 15/15 through the JUnit 5 launcher under Temurin JDK 21 (Gradle unusable here: Kotlin 2.0.21 JavaVersion.parse rejects JDK 25.0.5.0.3, and compileTestKotlin at HEAD fails on 5 pre-existing broken settings test files); git diff across the 8 story commits shows no tracker runner file changed (resolve.ts one-line import only) and gates.test.ts's ISSUE-refusal test passes.
