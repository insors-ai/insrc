<!-- insrc:artifact TESTS-2f27754d4ad00b8e-s1 -->

# Tests: 2f27754d4ad00b8e s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 93 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-20T09:06:05.932Z on commit `5bde94cc`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/__tests__/artifact-ids.test.ts: make produces the stored text for every existing kind and parse returns the same key**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | make produces the stored text for every existing kind and parse returns the same key | `src/workflow/__tests__/artifact-ids.test.ts` |

**unit: src/workflow/__tests__/artifact-ids.test.ts: the per-kind required and forbidden fields and the uppercase story and task form throw InvalidArtifactKeyError**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the per-kind required and forbidden fields and the uppercase story and task form throw InvalidArtifactKeyError | `src/workflow/__tests__/artifact-ids.test.ts` |

**unit: src/workflow/__tests__/artifact-ids.test.ts: stored requirement ids in the canonical and slug forms parse to date, hash8, story as a number and fr**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | stored requirement ids in the canonical and slug forms parse to date, hash8, story as a number and fr | `src/workflow/__tests__/artifact-ids.test.ts` |

**unit: src/workflow/__tests__/artifact-ids.test.ts: a folder name is not parsed as an artifact id**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a folder name is not parsed as an artifact id | `src/workflow/__tests__/artifact-ids.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/artifact-ids.test.ts` | 0 | 6 | 2.1 s |  |

## t2

Run at 2026-10-20T10:11:19.575Z on commit `89b4e362`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/__tests__/storage.test.ts: lowercase-story artifacts keep their id and file name and resolve through the storage lookups and gates**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | lowercase-story artifacts keep their id and file name and resolve through the storage lookups and gates | `src/workflow/__tests__/storage.test.ts` |
| pass | requireApprovedEpic returns the Define artifact after approval | `src/workflow/__tests__/gates.test.ts` |
| pass | t5: a STANDALONE design.story LLD IS stamped (the only upstream the no-plan route has), an EPIC-route LLD is NOT | `src/workflow/__tests__/gates.test.ts` |

**integration: src/workflow/__tests__/storage.test.ts: an artifact stored with an uppercase story fails with an error that points to the conversion**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an artifact stored with an uppercase story fails with an error that points to the conversion | `src/workflow/__tests__/storage.test.ts` |

**unit: src/workflow/amendments/__tests__/next-amendment-id.test.ts: nextAmendmentId returns the same AMD text for existing amendment files and the next counter**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | nextAmendmentId returns the same AMD text for existing amendment files and the next counter | `src/workflow/amendments/__tests__/next-amendment-id.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/gates.test.ts` | 0 | 26 | 2.2 s |  |
| `src/workflow/__tests__/storage.test.ts` | 0 | 46 | 1.1 s |  |
| `src/workflow/amendments/__tests__/next-amendment-id.test.ts` | 0 | 1 | 0.8 s |  |

## t3

Run at 2026-10-20T10:36:24.028Z on commit `206f7d56`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/__tests__/standalone-story.test.ts: a new standalone workflow with no storyId produces s1 and passes the strict id check**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a new standalone workflow with no storyId produces s1 and passes the strict id check | `src/workflow/__tests__/standalone-story.test.ts` |
| pass | augmentStandaloneParams: standalone mints a 16-char self-hash + default storyId | `src/daemon/steps/workflow-step/__tests__/standalone-keying.test.ts` |
| pass | epicKeyFor: a standalone design.story keys by the minted (augmented) epicHash | `src/daemon/steps/workflow-step/__tests__/standalone-keying.test.ts` |
| pass | trivial standalone build: admits, renders a scope-driven prompt, and persists a BUILD record | `src/daemon/steps/build-step/__tests__/standalone-implement.test.ts` |
| pass | c00559b7 — implement + validate admit t1 of a standalone LLD+PLAN (was unresolved-target) | `src/daemon/steps/build-step/__tests__/build-step.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/steps/build-step/__tests__/build-step.test.ts` | 0 | 63 | 44.1 s |  |
| `src/daemon/steps/build-step/__tests__/standalone-implement.test.ts` | 0 | 5 | 3.2 s |  |
| `src/daemon/steps/workflow-step/__tests__/standalone-keying.test.ts` | 0 | 5 | 3.2 s |  |
| `src/workflow/__tests__/standalone-story.test.ts` | 0 | 1 | 3.5 s |  |

## t4

Run at 2026-10-20T10:49:16.364Z on commit `cb672146`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/__tests__/path-scheme.test.ts: paths over a WorkItemKey equal the paths built before and a story-scoped kind without a story is rejected**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | paths over a WorkItemKey equal the paths built before and a story-scoped kind without a story is rejected | `src/workflow/__tests__/path-scheme.test.ts` |
| pass | lldArtifactPaths — story-scoped nested md, json in .insrc/artifacts/ | `src/workflow/__tests__/storage.test.ts` |

**unit: src/workflow/__tests__/path-scheme.test.ts: two artifacts of one Epic written on different days land in the same folder**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | two artifacts of one Epic written on different days land in the same folder | `src/workflow/__tests__/path-scheme.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/path-scheme.test.ts` | 0 | 19 | 0.9 s |  |
| `src/workflow/__tests__/storage.test.ts` | 0 | 46 | 1.1 s |  |

## t5

Run at 2026-10-20T11:26:15.506Z on commit `ff212ccd`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/__tests__/anchor-resolver.test.ts: resolveEpicAnchor by head kind, an unstamped standalone LLD head yields undefined, and workItemAnchorCreatedAt raises MissingAnchorError without a stamp**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | resolveEpicAnchor by head kind, an unstamped standalone LLD head yields undefined, and workItemAnchorCreatedAt raises MissingAnchorError without a stamp | `src/workflow/__tests__/anchor-resolver.test.ts` |
| pass | t2 — signature and return meaning unchanged for a DEF-bearing epic | `src/workflow/__tests__/storage.test.ts` |

**integration: src/workflow/__tests__/anchor-producers.test.ts: every root producer stamps epicCreatedAt and later records read it**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | every root producer stamps epicCreatedAt and later records read it | `src/workflow/__tests__/anchor-producers.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/anchor-producers.test.ts` | 0 | 1 | 3.1 s |  |
| `src/workflow/__tests__/anchor-resolver.test.ts` | 0 | 1 | 2.2 s |  |
| `src/workflow/__tests__/storage.test.ts` | 0 | 46 | 2.7 s |  |

## t6

Run at 2026-10-20T12:02:42.267Z on commit `861e12f7`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/runners/build/__tests__/record-intent.test.ts: read intent raises MissingAnchorError and write intent uses the root, preferring a persisted stamp or a head**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | read intent raises MissingAnchorError and write intent uses the root, preferring a persisted stamp or a head | `src/workflow/runners/build/__tests__/record-intent.test.ts` |

**integration: src/workflow/runners/build/__tests__/record-intent.test.ts: the first TESTS write stamps the anchor and a later BUILD files in the same folder**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the first TESTS write stamps the anchor and a later BUILD files in the same folder | `src/workflow/runners/build/__tests__/record-intent.test.ts` |
| pass | the json is TESTS-<epicHash>-<storyId>.json and the document is TESTS.md in the same folder as the Story's BUILD.md, for an Epic's Story and for a standalone one (mutation: derive the folder from the record's own time) | `src/workflow/runners/build/__tests__/test-record.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/runners/build/__tests__/record-intent.test.ts` | 0 | 2 | 1 s |  |
| `src/workflow/runners/build/__tests__/test-record.test.ts` | 0 | 6 | 1.2 s |  |

## t7

Run at 2026-10-20T12:07:23.284Z on commit `f33e6bb8`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/daemon/steps/build-step/__tests__/validate-anchor.test.ts: the first headless validate call writes TESTS first, a failing judge leaves the evidence, and a retry on a later day files BUILD in the same folder**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the first headless validate call writes TESTS first, a failing judge leaves the evidence, and a retry on a later day files BUILD in the same folder | `src/daemon/steps/build-step/__tests__/validate-anchor.test.ts` |

**integration: src/daemon/steps/build-step/__tests__/validate-anchor.test.ts: the first headless validate call with an injected TESTS write failure and a successful judge returns the verdict and writes a stamped BUILD**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the first headless validate call with an injected TESTS write failure and a successful judge returns the verdict and writes a stamped BUILD | `src/daemon/steps/build-step/__tests__/validate-anchor.test.ts` |

**integration: src/daemon/steps/build-step/__tests__/validate-anchor.test.ts: a read-intent MissingAnchorError returns the missing-anchor error and an ordinary ledger write failure still returns the verdict**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a read-intent MissingAnchorError returns the missing-anchor error and an ordinary ledger write failure still returns the verdict | `src/daemon/steps/build-step/__tests__/validate-anchor.test.ts` |

**integration: src/workflow/runners/build/__tests__/completion-anchor.test.ts: ensureBuildRecordOnCompletion on a headless work item writes the BUILD record through write intent**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ensureBuildRecordOnCompletion on a headless work item writes the BUILD record through write intent | `src/workflow/runners/build/__tests__/completion-anchor.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/steps/build-step/__tests__/validate-anchor.test.ts` | 0 | 3 | 2.9 s |  |
| `src/workflow/runners/build/__tests__/completion-anchor.test.ts` | 0 | 1 | 0.7 s |  |

## t8

Run at 2026-10-20T12:45:24.765Z on commit `6343a74b`. Tests check: **passed**. 10 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/__tests__/anchor-folders.test.ts: HLD, LLD, PLAN, BUILD, TESTS and CR written on different days land in one folder on the epic route and on the standalone route, including delivery grouping**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | HLD, LLD, PLAN, BUILD, TESTS and CR written on different days land in one folder on the epic route and on the standalone route, including delivery grouping | `src/workflow/__tests__/anchor-folders.test.ts` |
| pass | a story with LLD, PLAN, BUILD and CR is one item with all four as evidence | `src/workflow/delivery/__tests__/graph.test.ts` |
| pass | a standalone story with no head is a root with no invented epic, dated from its own LLD | `src/workflow/delivery/__tests__/graph.test.ts` |
| pass | epic, standalone and issue ids equal deriveWorkItemIdentity over the anchor inputs and pinned folder segments, including a sized-bugfix LLD dated a different day from its ISSUE | `src/workflow/delivery/__tests__/identity-contract.test.ts` |
| pass | runCodeReview: the record is written at CR-<epic>-<story> and carries kind:code-review (ac3) | `src/workflow/code-review/__tests__/runner.test.ts` |
| pass | 0855311b — an LLD-only Small story: the review lands beside the LLD | `src/workflow/code-review/__tests__/subject-paths.test.ts` |

**integration: src/workflow/__tests__/anchor-folders.test.ts: an unstamped standalone LLD head does not yield its own createdAt as the anchor**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an unstamped standalone LLD head does not yield its own createdAt as the anchor | `src/workflow/__tests__/anchor-folders.test.ts` |

**integration: src/workflow/__tests__/anchor-missing-read.test.ts: subject-paths, questions and the helper callers each fail before any file is created when no anchor exists**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | subject-paths, questions and the helper callers each fail before any file is created when no anchor exists | `src/workflow/__tests__/anchor-missing-read.test.ts` |
| pass | implement and validate on a standalone story whose LLD no anchor can place fail with missing-anchor and create nothing | `src/workflow/__tests__/anchor-missing-read.test.ts` |
| pass | pending and delivery do not date a record by its own day: an unstamped record gets no path and no dated id, and nothing is created | `src/workflow/__tests__/anchor-missing-read.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/anchor-folders.test.ts` | 0 | 2 | 0.9 s |  |
| `src/workflow/__tests__/anchor-missing-read.test.ts` | 0 | 4 | 2.4 s |  |
| `src/workflow/code-review/__tests__/runner.test.ts` | 0 | 18 | 2.9 s |  |
| `src/workflow/code-review/__tests__/subject-paths.test.ts` | 0 | 5 | 2 s |  |
| `src/workflow/delivery/__tests__/graph.test.ts` | 0 | 29 | 2.4 s |  |
| `src/workflow/delivery/__tests__/identity-contract.test.ts` | 0 | 1 | 2.8 s |  |

## t9

Run at 2026-10-20T13:29:50.086Z on commit `79775653`. Tests check: **passed**. 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/__tests__/anchor-missing-producers.test.ts: the finalizers, tracker-auto, tracker/link, workflow-rpc and synthesize each fail before any file is created when no anchor exists**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the finalizers, tracker-auto, tracker/link, workflow-rpc and synthesize each fail before any file is created when no anchor exists | `src/workflow/__tests__/anchor-missing-producers.test.ts` |
| pass | design.epic: synthesize with a Define that carries no creation time fails with missing-anchor and writes nothing | `src/daemon/steps/workflow-step/__tests__/design-epic-e2e.test.ts` |
| pass | define EXTEND: a Define that carries a stamp but no creation time fails with no Epic anchor and appends nothing | `src/daemon/steps/workflow-step/__tests__/define-extend-e2e.test.ts` |
| pass | plan: synthesize with a Define that carries no creation time fails with no Epic anchor and writes no PLAN | `src/daemon/steps/workflow-step/__tests__/plan-e2e.test.ts` |
| pass | define workflow: happy path writes artifact to docs/epics/<slug>-E.../DEF.md | `src/daemon/steps/workflow-step/__tests__/define-e2e.test.ts` |
| pass | define EXTEND: scope=extend → skip frame/compose → append Story + pending amendment + ExtendArtifact | `src/daemon/steps/workflow-step/__tests__/define-extend-e2e.test.ts` |
| pass | design.story enhancement: happy path writes LLD under docs/epics/<slug>-E.../S<nnn>/LLD.md | `src/daemon/steps/workflow-step/__tests__/design-story-e2e.test.ts` |
| pass | runWorkflowServerSide drives stub end-to-end + stamps per-output attribution (sc5), not the retired scalar model | `src/daemon/__tests__/workflow-rpc.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/workflow-rpc.test.ts` | 0 | 8 | 1.2 s |  |
| `src/daemon/steps/workflow-step/__tests__/define-e2e.test.ts` | 0 | 3 | 1 s |  |
| `src/daemon/steps/workflow-step/__tests__/define-extend-e2e.test.ts` | 0 | 3 | 4.1 s |  |
| `src/daemon/steps/workflow-step/__tests__/design-epic-e2e.test.ts` | 0 | 7 | 5.3 s |  |
| `src/daemon/steps/workflow-step/__tests__/design-story-e2e.test.ts` | 0 | 7 | 4.9 s |  |
| `src/daemon/steps/workflow-step/__tests__/plan-e2e.test.ts` | 0 | 6 | 5.5 s |  |
| `src/workflow/__tests__/anchor-missing-producers.test.ts` | 0 | 1 | 4.9 s |  |

## t10

Run at 2026-10-20T13:33:18.617Z on commit `15baa00b`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/tracker/__tests__/title-token.test.ts: the exact-token matcher accepts the token and the token followed by an em dash and not a longer id**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the exact-token matcher accepts the token and the token followed by an em dash and not a longer id | `src/workflow/tracker/__tests__/title-token.test.ts` |

**integration: src/workflow/tracker/__tests__/title-token.test.ts: findIssuesByTitleToken in the GitHub adapter over a stubbed gh boundary and in the fake agree and a failed call is a failed result**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | findIssuesByTitleToken in the GitHub adapter over a stubbed gh boundary and in the fake agree and a failed call is a failed result | `src/workflow/tracker/__tests__/title-token.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/tracker/__tests__/title-token.test.ts` | 0 | 2 | 2.8 s |  |

## t11

Run at 2026-10-20T13:39:49.600Z on commit `2ccaf2c9`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/tracker/__tests__/issue-title.test.ts: unit-issue and the conventions bodies write an Epic, Story and Task title and marker that start with the artifact id**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | unit-issue and the conventions bodies write an Epic, Story and Task title and marker that start with the artifact id | `src/workflow/tracker/__tests__/issue-title.test.ts` |
| pass | id marker embeds as the first body line and round-trips out | `src/workflow/__tests__/id-resolve.test.ts` |
| pass | ensureUnitIssue takes a unit and a port and returns a PortResult without a phase | `src/workflow/tracker/__tests__/unit-issue.test.ts` |
| pass | a legacy LLD with only storyRef creates no second Story issue | `src/workflow/tracker/__tests__/unit-issue.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/id-resolve.test.ts` | 0 | 52 | 1.2 s |  |
| `src/workflow/tracker/__tests__/issue-title.test.ts` | 0 | 1 | 1.1 s |  |
| `src/workflow/tracker/__tests__/unit-issue.test.ts` | 0 | 12 | 1.1 s |  |

## t12

Run at 2026-10-20T14:19:01.484Z on commit `a2c56b46`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/tracker/__tests__/issue-title-guard.test.ts: tracker-auto on the team and legacy paths writes artifact-id titles and markers**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | tracker-auto on the team and legacy paths writes artifact-id titles and markers | `src/workflow/tracker/__tests__/issue-title-guard.test.ts` |

**integration: src/workflow/tracker/__tests__/issue-title-guard.test.ts: an issue created earlier is adopted by its unit label or an exact artifact-id title**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an issue created earlier is adopted by its unit label or an exact artifact-id title | `src/workflow/tracker/__tests__/issue-title-guard.test.ts` |
| pass | a Task issue found by its title alone is adopted, and a Story with two unit-label matches creates nothing | `src/workflow/tracker/__tests__/issue-title-guard.test.ts` |

**integration: src/workflow/tracker/__tests__/issue-title-guard.test.ts: s10 is never matched for s1 and t10 never for t1, several matches and a failed lookup create nothing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s10 is never matched for s1 and t10 never for t1, several matches and a failed lookup create nothing | `src/workflow/tracker/__tests__/issue-title-guard.test.ts` |
| pass | two Epic issues carrying the Epic labels are refused on both paths and nothing is created | `src/workflow/tracker/__tests__/issue-title-guard.test.ts` |
| pass | a failed Epic label lookup on the legacy path creates no Epic issue | `src/workflow/tracker/__tests__/issue-title-guard.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/tracker/__tests__/issue-title-guard.test.ts` | 0 | 6 | 1.4 s |  |

## t13

Run at 2026-10-20T14:25:03.694Z on commit `3858e03e`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/__tests__/id-resolve.test.ts: resolveWorkflowRef accepts an artifact id, owner/repo#N, #N and an s<n> label and refuses a work-item id and an uppercase label**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | resolveWorkflowRef accepts an artifact id, owner/repo#N, #N and an s<n> label and refuses a work-item id and an uppercase label | `src/workflow/__tests__/id-resolve.test.ts` |
| pass | resolveWorkflowRef reports each ResolvedRef output as the artifact id of its level, for several epics | `src/workflow/__tests__/id-resolve.test.ts` |
| pass | c00559b7 — s1/t1 scoped by epicHash, and the artifact id, reach the standalone task | `src/workflow/__tests__/lld-head-resolve.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/id-resolve.test.ts` | 0 | 54 | 1.2 s |  |
| `src/workflow/__tests__/lld-head-resolve.test.ts` | 0 | 10 | 1.3 s |  |

## t14

Run at 2026-10-20T14:43:18.317Z on commit `6b83d9ef`. Tests check: **passed**. 10 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/locate/__tests__/locate-parent-ids.test.ts: a parent is located and linked correctly in a repository with several epics and no code parses a folder name into an id**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a parent is located and linked correctly in a repository with several epics and no code parses a folder name into an id | `src/workflow/locate/__tests__/locate-parent-ids.test.ts` |
| pass | no locate code parses a folder name into an id | `src/workflow/locate/__tests__/locate-parent-ids.test.ts` |
| pass | refFromDocPath returns the work item a stored artifact renders to, and null for any other path | `src/workflow/__tests__/locate-infer.test.ts` |
| pass | mapSemanticHits maps artifact hits to work items, rank-decayed, de-duped | `src/workflow/__tests__/locate-infer.test.ts` |
| pass | end-to-end: defect description matching a story → semantic attach (ac2) | `src/workflow/__tests__/locate-infer.test.ts` |
| pass | tier-1 explicit-ref hit → deterministic, short-circuits (inferCandidates never called) | `src/workflow/__tests__/locate-parent.test.ts` |
| pass | nothing clears threshold → promptForRef; a resolvable ref attaches (prompt tier) | `src/workflow/__tests__/locate-parent.test.ts` |
| pass | parentRefIdentifiers: an artifact-id slug first, a stored old slug converted from epicHash, then storyId | `src/workflow/__tests__/bugfix-tracker.test.ts` |
| pass | createBugfixTrackerIssue: configured + parent resolves -> created+linked, k4 body verbatim, ref recorded | `src/workflow/__tests__/bugfix-tracker.test.ts` |
| pass | bugfix create keeps CreatedIssue, readonly labels and the parent link through the adapter | `src/workflow/__tests__/bugfix-tracker.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/bugfix-tracker.test.ts` | 0 | 28 | 0.9 s |  |
| `src/workflow/__tests__/locate-infer.test.ts` | 0 | 15 | 1.2 s |  |
| `src/workflow/__tests__/locate-parent.test.ts` | 0 | 14 | 0.8 s |  |
| `src/workflow/locate/__tests__/locate-parent-ids.test.ts` | 0 | 2 | 1.2 s |  |

## t15

Run at 2026-10-20T14:55:31.161Z on commit `bae73a28`. Tests check: **passed**. 9 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/delivery/__tests__/identity-contract.test.ts: the delivery reader loads a lowercase repository with ordinals from the identity module**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the delivery reader loads a lowercase repository with ordinals from the identity module | `src/workflow/delivery/__tests__/identity-contract.test.ts` |
| pass | epic, standalone and issue ids equal the path scheme board id over the anchor inputs and pinned folder segments, including a sized-bugfix LLD dated a different day from its ISSUE | `src/workflow/delivery/__tests__/identity-contract.test.ts` |
| pass | the ordinal readers parse story and task ids and return null for anything else, never throwing | `src/workflow/delivery/__tests__/read.test.ts` |
| pass | an artifact-id slug parentRef resolves through ArtifactIds.parse | `src/workflow/delivery/__tests__/graph.test.ts` |
| pass | d9f85b3c t4 — a well-formed source gets the story or epic artifact id | `src/workflow/artifacts/companion/__tests__/header.test.ts` |
| pass | renderPlanMarkdown: leads with the PLAN- marker, renders the ordered task table + [[cN]] | `src/workflow/__tests__/plan-artifact.test.ts` |
| pass | listPendingArtifacts maps each descriptor field (kind/title/mdPath/workItemId/openQuestionCount/state) | `src/workflow/__tests__/pending.test.ts` |
| pass | finalize[design.epic]: HLD companions name the HLD as the source doc and the Epic as the work item | `src/workflow/__tests__/companion-context-finalize.test.ts` |
| pass | c00559b7 — compareStoryOrdinal uses the strict story-id parse: a non-story id, including an uppercase one, sorts last | `src/workflow/__tests__/lld-head.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/companion-context-finalize.test.ts` | 0 | 4 | 1.6 s |  |
| `src/workflow/__tests__/lld-head.test.ts` | 0 | 11 | 1 s |  |
| `src/workflow/__tests__/pending.test.ts` | 0 | 13 | 1.1 s |  |
| `src/workflow/__tests__/plan-artifact.test.ts` | 0 | 19 | 1.1 s |  |
| `src/workflow/artifacts/companion/__tests__/header.test.ts` | 0 | 14 | 1 s |  |
| `src/workflow/delivery/__tests__/graph.test.ts` | 0 | 30 | 1 s |  |
| `src/workflow/delivery/__tests__/identity-contract.test.ts` | 0 | 2 | 1 s |  |
| `src/workflow/delivery/__tests__/read.test.ts` | 0 | 2 | 0.8 s |  |

## t16

Run at 2026-10-20T15:02:23.450Z on commit `78682825`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/__tests__/fr-id.test.ts: stored ids parse to date, hash8, story as a number and fr, uppercase mint is rejected and a miss returns undefined**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | stored ids parse to date, hash8, story as a number and fr, uppercase mint is rejected and a miss returns undefined | `src/workflow/__tests__/fr-id.test.ts` |
| pass | assembles doc-level + per-story FRs with minted ids, correct scope/itemRef | `src/workflow/__tests__/define-fr-assembly.test.ts` |
| pass | validateFunctionalDefinition treats undefined and empty requirements as absent | `src/workflow/__tests__/functional-definition.test.ts` |
| pass | judgeFunctionalCoverage: an unrealized FR is a HIGH finding bound to its FR id | `src/workflow/code-review/dimensions/__tests__/functional-coverage.test.ts` |
| pass | every writer file is inventoried, annotated and classified as the design says | `src/workflow/__tests__/artifact-write-inventory.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/artifact-write-inventory.test.ts` | 0 | 2 | 4.1 s |  |
| `src/workflow/__tests__/define-fr-assembly.test.ts` | 0 | 5 | 1.1 s |  |
| `src/workflow/__tests__/fr-id.test.ts` | 0 | 11 | 0.8 s |  |
| `src/workflow/__tests__/functional-definition.test.ts` | 0 | 8 | 0.8 s |  |
| `src/workflow/code-review/dimensions/__tests__/functional-coverage.test.ts` | 0 | 5 | 1.1 s |  |

## t17

Run at 2026-10-20T15:10:41.790Z on commit `0fbafcf8`. Tests check: **passed**. 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/__tests__/id-removal.test.ts: no source file, bin entry or write-inventory row refers to src/workflow/id.ts or the migration tool**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | no source file, bin entry or write-inventory row refers to src/workflow/id.ts or the migration tool | `src/workflow/__tests__/id-removal.test.ts` |
| pass | every writer file is inventoried, annotated and classified as the design says | `src/workflow/__tests__/artifact-write-inventory.test.ts` |
| pass | writeAtomic creates parent dirs + writes content | `src/workflow/__tests__/storage.test.ts` |
| pass | a story with LLD, PLAN, BUILD and CR is one item with all four as evidence | `src/workflow/delivery/__tests__/graph.test.ts` |
| pass | HLD approve creates the Epic issue, links docs, and writes nested meta.tracker | `src/workflow/__tests__/tracker-auto.test.ts` |
| pass | handleInsrcGuide({workflow}) forwards to guide.get and wraps Ok (ac1) | `src/mcp/__tests__/guide-handler.test.ts` |
| pass | import graph (ac4): the MCP server reaches nothing under src/db, src/analyze or src/daemon/steps; a fixture import makes it fail | `src/mcp/__tests__/import-graph.test.ts` |
| pass | implement: approved+fresh plan returns a prompt carrying acceptance checks + issue ref | `src/daemon/steps/build-step/__tests__/build-step.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/steps/build-step/__tests__/build-step.test.ts` | 0 | 63 | 17.6 s |  |
| `src/mcp/__tests__/guide-handler.test.ts` | 0 | 5 | 1.4 s |  |
| `src/mcp/__tests__/import-graph.test.ts` | 0 | 1 | 1.2 s |  |
| `src/workflow/__tests__/artifact-write-inventory.test.ts` | 0 | 2 | 5.4 s |  |
| `src/workflow/__tests__/id-removal.test.ts` | 0 | 1 | 2.8 s |  |
| `src/workflow/__tests__/storage.test.ts` | 0 | 46 | 1.5 s |  |
| `src/workflow/__tests__/tracker-auto.test.ts` | 0 | 10 | 2 s |  |
| `src/workflow/delivery/__tests__/graph.test.ts` | 0 | 30 | 1 s |  |

## t18

Run at 2026-10-20T15:14:16.710Z on commit `6fb260ee`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/__tests__/docs-ids.test.ts: the docs name the lowercase story form and the anchor rule and do not mention the removed command**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the docs name the lowercase story form and the anchor rule and do not mention the removed command | `src/workflow/__tests__/docs-ids.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/docs-ids.test.ts` | 0 | 1 | 2.3 s |  |
