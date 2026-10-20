<!-- insrc:artifact TESTS-2f27754d4ad00b8e-s2 -->

# Tests: 2f27754d4ad00b8e s2

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 40 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-20T17:19:11.063Z on commit `a63c1d13`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/artifact-core/__tests__/types-contract.test.ts: the exported types accept the sc2, sc3, sc4 and sc6 sketches and the stated anchor extension**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the exported types accept the sc2, sc3, sc4 and sc6 sketches and the stated anchor extension | `src/workflow/artifact-core/__tests__/types-contract.test.ts` |
| pass | collectBuildChangeLog: one file-level entry per changed path (segment omitted), stamped author/timestamp | `src/workflow/runners/build/__tests__/changed-files.test.ts` |
| pass | collectBuildChangeLog: an empty changed set → [] | `src/workflow/runners/build/__tests__/changed-files.test.ts` |
| pass | t1: a BuildRecord carrying changeLog + feedback type-checks and JSON round-trips | `src/workflow/runners/build/__tests__/provenance-build.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifact-core/__tests__/types-contract.test.ts` | 0 | 3 | 3.3 s |  |
| `src/workflow/runners/build/__tests__/changed-files.test.ts` | 0 | 35 | 2.6 s |  |
| `src/workflow/runners/build/__tests__/provenance-build.test.ts` | 0 | 6 | 1.2 s |  |

## t2

Run at 2026-10-20T18:02:48.932Z on commit `78a1ce90`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/__tests__/prepare-artifact-write.test.ts: prepareArtifactWrite returns the bytes and revision writeArtifact writes for content, meta-only, identical and first writes, and writes nothing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | prepareArtifactWrite returns the bytes and revision writeArtifact writes for content, meta-only, identical and first writes, and writes nothing | `src/workflow/__tests__/prepare-artifact-write.test.ts` |
| pass | writeArtifact mints and keeps revisions, carries the whole tracker block, and rejects a value without meta | `src/workflow/__tests__/artifact-writer.test.ts` |
| pass | readRevision reads 0 for bad values; patchTrackerMeta keeps every field, merges units and preserves the tracker kind | `src/workflow/__tests__/artifact-writer.test.ts` |
| pass | writeAtomic creates parent dirs + writes content | `src/workflow/__tests__/storage.test.ts` |
| pass | writeAtomic overwrites existing file | `src/workflow/__tests__/storage.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/artifact-writer.test.ts` | 0 | 2 | 0.9 s |  |
| `src/workflow/__tests__/prepare-artifact-write.test.ts` | 0 | 2 | 0.9 s |  |
| `src/workflow/__tests__/storage.test.ts` | 0 | 46 | 1 s |  |

## t3

Run at 2026-10-20T18:11:02.812Z on commit `25d3f94b`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/__tests__/artifact-write-inventory.test.ts: the detector reports appendFileSync in every form, an unlisted appendSidecarLine and a store write, and every newly flagged file has an entry**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the detector reports appendFileSync in every form, an unlisted appendSidecarLine and a store write, and every newly flagged file has an entry | `src/workflow/__tests__/artifact-write-inventory.test.ts` |
| pass | every writer file is inventoried, annotated and classified as the design says | `src/workflow/__tests__/artifact-write-inventory.test.ts` |
| pass | the detector flags raw, aliased and injected writers and accepts the positive controls | `src/workflow/__tests__/artifact-write-inventory.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/artifact-write-inventory.test.ts` | 0 | 3 | 6.5 s |  |

## t4

Run at 2026-10-20T18:13:24.728Z on commit `c2dd663b`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/artifact-core/__tests__/history.test.ts: History validates feedback and keeps the anchor through a round trip, and openFeedback closes entries by addresses**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | History validates feedback and keeps the anchor through a round trip, and openFeedback closes entries by addresses | `src/workflow/artifact-core/__tests__/history.test.ts` |
| pass | a failing or malformed reader surfaces as HistoryReadError | `src/workflow/artifact-core/__tests__/history.test.ts` |

**integration: src/workflow/artifact-core/__tests__/sidecar.test.ts: appendSidecarLine appends one JSON line per call to the path it is given**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | appendSidecarLine appends one JSON line per call to the path it is given | `src/workflow/artifact-core/__tests__/sidecar.test.ts` |
| pass | every writer file is inventoried, annotated and classified as the design says | `src/workflow/__tests__/artifact-write-inventory.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/artifact-write-inventory.test.ts` | 0 | 3 | 9.2 s |  |
| `src/workflow/artifact-core/__tests__/history.test.ts` | 0 | 3 | 2.5 s |  |
| `src/workflow/artifact-core/__tests__/sidecar.test.ts` | 0 | 2 | 2.2 s |  |

## t5

Run at 2026-10-20T18:21:52.256Z on commit `e871ea09`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/artifact-core/__tests__/decode.test.ts: decodeArtifactHead fills every envelope part, returns empty parts for a head without them, and refuses a malformed head, an unknown kind and a flat amendment**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | decodeArtifactHead fills every envelope part, returns empty parts for a head without them, and refuses a malformed head, an unknown kind and a flat amendment | `src/workflow/artifact-core/__tests__/decode.test.ts` |

**integration: src/workflow/artifact-core/__tests__/codec-create.test.ts: a create without a prior head builds identity meta that workItemAnchorCreatedAt and the Define renderer accept**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a create without a prior head builds identity meta that workItemAnchorCreatedAt and the Define renderer accept | `src/workflow/artifact-core/__tests__/codec-create.test.ts` |
| pass | kinds with no stored head yet have no codec | `src/workflow/artifact-core/__tests__/codec-create.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifact-core/__tests__/codec-create.test.ts` | 0 | 3 | 1.1 s |  |
| `src/workflow/artifact-core/__tests__/decode.test.ts` | 0 | 2 | 0.9 s |  |

## t6

Run at 2026-10-20T18:26:32.462Z on commit `e5333449`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/artifact-core/__tests__/gates-delegation.test.ts: the four gates readers return the same artifact and the same missing-file error as before, synchronously**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the four gates readers return the same artifact and the same missing-file error as before, synchronously | `src/workflow/artifact-core/__tests__/gates-delegation.test.ts` |
| pass | requireApprovedLld: returns the LLD when approved + non-stale | `src/workflow/__tests__/plan-gate.test.ts` |
| pass | lowercase-story artifacts keep their id and file name and resolve through the storage lookups and gates | `src/workflow/__tests__/storage.test.ts` |
| pass | jsonPathForMd resolves a nested epic DEF md → its hash-named json via the marker | `src/workflow/__tests__/gates.test.ts` |
| pass | implement: approved+fresh plan returns a prompt carrying acceptance checks + issue ref | `src/daemon/steps/build-step/__tests__/build-step.test.ts` |
| pass | build implement and validate on a stage held by someone else are refused naming the holder | `src/daemon/steps/build-step/__tests__/gate-call-sites.test.ts` |
| pass | nextAfterIssue: magnitude='small' -> standalone insrc_build_step (issue->build) | `src/workflow/__tests__/bugfix-orchestration.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/steps/build-step/__tests__/build-step.test.ts` | 0 | 63 | 18.6 s |  |
| `src/daemon/steps/build-step/__tests__/gate-call-sites.test.ts` | 0 | 3 | 2.1 s |  |
| `src/workflow/__tests__/bugfix-orchestration.test.ts` | 0 | 23 | 1.4 s |  |
| `src/workflow/__tests__/gates.test.ts` | 0 | 26 | 2.2 s |  |
| `src/workflow/__tests__/plan-gate.test.ts` | 0 | 9 | 1.2 s |  |
| `src/workflow/__tests__/storage.test.ts` | 0 | 46 | 1.1 s |  |
| `src/workflow/artifact-core/__tests__/gates-delegation.test.ts` | 0 | 2 | 1 s |  |

## t7

Run at 2026-10-20T18:31:58.232Z on commit `c5798b26`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/artifact-core/__tests__/store-read.test.ts: readWithHistory exposes identity, description, parent, references, change log, feedback and lifecycle in one shape for an artifact with non-empty history and feedback**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | readWithHistory exposes identity, description, parent, references, change log, feedback and lifecycle in one shape for an artifact with non-empty history and feedback | `src/workflow/artifact-core/__tests__/store-read.test.ts` |
| pass | every writer file is inventoried, annotated and classified as the design says | `src/workflow/__tests__/artifact-write-inventory.test.ts` |

**unit: src/workflow/artifact-core/__tests__/store-read.test.ts: a head with no envelope or lifecycle part reads an empty part and does not fail**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a head with no envelope or lifecycle part reads an empty part and does not fail | `src/workflow/artifact-core/__tests__/store-read.test.ts` |

**unit: src/workflow/artifact-core/__tests__/store-read.test.ts: a reference names its target, type and relation, external targets are accepted, and the parent chain is given by the parent link**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a reference names its target, type and relation, external targets are accepted, and the parent chain is given by the parent link | `src/workflow/artifact-core/__tests__/store-read.test.ts` |

**integration: src/workflow/artifact-core/__tests__/store-children.test.ts: children are derived from the parent link and are never stored on the parent**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | children are derived from the parent link and are never stored on the parent | `src/workflow/artifact-core/__tests__/store-children.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/artifact-write-inventory.test.ts` | 0 | 3 | 2.9 s |  |
| `src/workflow/artifact-core/__tests__/store-children.test.ts` | 0 | 2 | 1.1 s |  |
| `src/workflow/artifact-core/__tests__/store-read.test.ts` | 0 | 4 | 1.1 s |  |

## t8

Run at 2026-10-20T18:38:19.197Z on commit `4fd964f4`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/artifact-core/__tests__/store-write.test.ts: write then read round trip keeps the revision rule for every registered kind**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | write then read round trip keeps the revision rule for every registered kind | `src/workflow/artifact-core/__tests__/store-write.test.ts` |

**unit: src/workflow/artifact-core/__tests__/store-write.test.ts: only a content change moves the revision, and a description change is content**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | only a content change moves the revision, and a description change is content | `src/workflow/artifact-core/__tests__/store-write.test.ts` |

**unit: src/workflow/artifact-core/__tests__/store-write.test.ts: a bad parent or artifact-typed reference is refused and external references are accepted**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a bad parent or artifact-typed reference is refused and external references are accepted | `src/workflow/artifact-core/__tests__/store-write.test.ts` |

**integration: src/workflow/artifact-core/__tests__/journal.test.ts: a failure at stage, log append, head replace and clear each leaves the documented state and the next write completes the staged operation once**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a failure at stage, log append, head replace and clear each leaves the documented state and the next write completes the staged operation once | `src/workflow/artifact-core/__tests__/journal.test.ts` |

**integration: src/workflow/artifact-core/__tests__/journal.test.ts: a restart before the append, a retry by a different actor and an identical-head append failure all recover the original entry**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a restart before the append, a retry by a different actor and an identical-head append failure all recover the original entry | `src/workflow/artifact-core/__tests__/journal.test.ts` |

**integration: src/workflow/artifact-core/__tests__/store-write.test.ts: a store write keeps the prior meta so workItemAnchorCreatedAt and the Define renderer give the same results**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a store write keeps the prior meta so workItemAnchorCreatedAt and the Define renderer give the same results | `src/workflow/artifact-core/__tests__/store-write.test.ts` |
| pass | every writer file is inventoried, annotated and classified as the design says | `src/workflow/__tests__/artifact-write-inventory.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/artifact-write-inventory.test.ts` | 0 | 3 | 2.3 s |  |
| `src/workflow/artifact-core/__tests__/journal.test.ts` | 0 | 3 | 1.3 s |  |
| `src/workflow/artifact-core/__tests__/store-write.test.ts` | 0 | 5 | 1.2 s |  |

## t9

Run at 2026-10-20T18:40:06.210Z on commit `517df755`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/artifact-core/__tests__/repo-schema.test.ts: RepoSchemaGate reads version 1 with no marker, requires a version and throws on an invalid marker**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | RepoSchemaGate reads version 1 with no marker, requires a version and throws on an invalid marker | `src/workflow/artifact-core/__tests__/repo-schema.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifact-core/__tests__/repo-schema.test.ts` | 0 | 2 | 0.5 s |  |

## t10

Run at 2026-10-20T18:43:36.424Z on commit `b26165d0`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/artifact-core/__tests__/feedback-convert.test.ts: the legacy feedback conversion maps every field and reports what it cannot map**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the legacy feedback conversion maps every field and reports what it cannot map | `src/workflow/artifact-core/__tests__/feedback-convert.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifact-core/__tests__/feedback-convert.test.ts` | 0 | 2 | 0.8 s |  |
